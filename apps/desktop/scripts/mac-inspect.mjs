// Inspects a Mac review build's app (D-268), on a Mac, and writes inspect.json to the evidence folder:
// the bundle's version and minimum macOS, every Mach-O file's architectures, the notices it must
// carry (D-269), no Copilot native or FFI payload and no other codec library, the Electron fuses
// read back (SEC-01), and its signature. Exits 1 when a required check fails.
//
//   node scripts/mac-inspect.mjs "<mount>/Focus Notes.app" arm64|x64 <evidence folder>
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import fuses from "@electron/fuses";
import { copilotPayloadProblems } from "../../../tools/release/store-manifest.mjs";

const [appArg, arch, evidenceArg] = process.argv.slice(2);
if (!appArg || !["arm64", "x64"].includes(arch) || !evidenceArg) {
  console.error('Usage: node scripts/mac-inspect.mjs "<…>/Focus Notes.app" arm64|x64 <evidence folder>');
  process.exit(2);
}
const app = resolve(appArg);
const evidence = resolve(evidenceArg);
mkdirSync(evidence, { recursive: true });
const machoArch = arch === "x64" ? "x86_64" : "arm64";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};
const checks = {};
const problems = [];
const check = (name, ok, problem) => {
  checks[name] = Boolean(ok);
  if (!ok) problems.push(problem);
};

const plist = JSON.parse(run("plutil", ["-convert", "json", "-o", "-", join(app, "Contents", "Info.plist")]).out);
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
const executable = join(app, "Contents", "MacOS", plist.CFBundleExecutable);
check("version", plist.CFBundleShortVersionString === pkg.version, `The bundle's version is ${plist.CFBundleShortVersionString}, not ${pkg.version}.`);
check("executable", existsSync(executable), `The bundle has no executable ${plist.CFBundleExecutable}.`);

// Every file in the bundle, and which of them are Mach-O (thin or universal).
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(app);
const MAGIC = new Set(["feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe", "bebafeca"]);
const isMacho = (path) => {
  const fd = openSync(path, "r");
  try {
    const b = Buffer.alloc(4);
    return readSync(fd, b, 0, 4, 0) === 4 && MAGIC.has(b.toString("hex"));
  } finally {
    closeSync(fd);
  }
};
const macho = files.filter(isMacho).map((path) => ({ path: relative(app, path), archs: run("lipo", ["-archs", path]).out }));
const wrongArch = macho.filter((m) => m.archs !== machoArch);
check("machoArchitectures", macho.length > 0 && wrongArch.length === 0, `Mach-O files not ${machoArch} only: ${wrongArch.map((m) => `${m.path} (${m.archs})`).join(", ")}`);

// The lowest macOS it runs on: the bundle's declared minimum, and the executable's own build minimum.
const build = run("vtool", ["-show-build", executable]).out;
const minos = /minos\s+([\d.]+)/.exec(build)?.[1] ?? /minos\s+([\d.]+)/.exec(run("otool", ["-l", executable]).out)?.[1] ?? null;
const minimumMacos = plist.LSMinimumSystemVersion ?? minos;
check("minimumMacos", Boolean(minimumMacos), "No minimum macOS could be read from the bundle.");

// The notices and resources a package must carry (D-269, PKG-…): Electron's and Chromium's licenses,
// the third-party notices, the app's license, the command-line launcher, and the app archive.
const resources = join(app, "Contents", "Resources");
const REQUIRED = ["LICENSE.electron.txt", "LICENSES.chromium.html", "THIRD_PARTY_NOTICES.md", "LICENSE.txt", "bin/focus-notes", "app.asar"];
const missing = REQUIRED.filter((f) => !existsSync(join(resources, f)) || statSync(join(resources, f)).size === 0);
check("notices", missing.length === 0, `Missing from Contents/Resources: ${missing.join(", ")}`);
const notices = readFileSync(join(resources, "THIRD_PARTY_NOTICES.md"), "utf8");
const chromium = readFileSync(join(resources, "LICENSES.chromium.html"), "utf8");
check("noticeContent", /Electron/.test(notices) && /FFmpeg/i.test(chromium) && /Mozilla Public License/i.test(chromium), "The notices don't name Electron, FFmpeg and the MPL.");

// No Copilot native or FFI payload, in the archive or anywhere in the bundle; the app's own code is there.
const asar = readFileSync(join(resources, "app.asar"));
const asarProblems = copilotPayloadProblems(asar);
const headerLength = asar.readUInt32LE(12);
const header = JSON.parse(asar.toString("utf8", 16, 16 + headerLength));
const asarFiles = [];
const walkAsar = (entries, prefix) => {
  for (const [name, entry] of Object.entries(entries)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.files) walkAsar(entry.files, path);
    else asarFiles.push(path);
  }
};
walkAsar(header.files, "");
const APP_FILES = ["out/main/main.mjs", "out/main/preload.cjs", "out/main/cli.mjs", "out/main/mcp.mjs", "out/main/workspace-template.json", "out/renderer/index.html", "package.json"];
const asarMissing = APP_FILES.filter((f) => !asarFiles.includes(f));
check("appArchive", asarProblems.length === 0 && asarMissing.length === 0, [...asarProblems, ...asarMissing.map((f) => `The archive has no ${f}.`)].join(" "));
const FORBIDDEN = /(?:oneauth|koffi|@koromix|copilot-sdk-(?:darwin|win32|linux)|browser-use\/|computer-use\/)/i;
const forbidden = [...files.map((f) => relative(app, f)), ...asarFiles.map((f) => `app.asar/${f}`)].filter((f) => FORBIDDEN.test(f.replace(/\\/g, "/")));
check("noForbiddenPayload", forbidden.length === 0, `Forbidden payload: ${forbidden.join(", ")}`);
// Informational: Node native add-ons and unpacked archive files, none expected.
const nativeAddons = [...files.map((f) => relative(app, f)), ...asarFiles].filter((f) => f.endsWith(".node"));
// D-269 covers only Electron's own FFmpeg library, unmodified, in its framework.
const codecs = files.map((f) => relative(app, f)).filter((f) => /(?:^|\/)(?:lib)?(?:ffmpeg|avcodec|avformat|avutil|avfilter|avdevice|swresample|swscale|postproc)[^/]*\.(?:dylib|so|a|node)$/i.test(f));
check("codecLibraries", codecs.length === 1 && /^Contents\/Frameworks\/Electron Framework\.framework\/Versions\/A\/Libraries\/libffmpeg\.dylib$/.test(codecs[0]), `Codec libraries other than Electron's own: ${codecs.join(", ")}`);

// SEC-01's fuses, read back from the packaged framework.
const { FuseState, FuseV1Options, getCurrentFuseWire } = fuses;
const wire = await getCurrentFuseWire(app);
const fuseStates = Object.fromEntries(Object.entries(FuseV1Options).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, wire[v] === FuseState.ENABLE ? "on" : wire[v] === FuseState.DISABLE ? "off" : String(wire[v])]));
check("fuses", fuseStates.RunAsNode === "off" && fuseStates.EnableNodeCliInspectArguments === "off" && fuseStates.EnableNodeOptionsEnvironmentVariable === "off" && fuseStates.OnlyLoadAppFromAsar === "on" && fuseStates.EnableEmbeddedAsarIntegrityValidation === "on", `Unexpected fuses: ${JSON.stringify(fuseStates)}`);

// The signature: ad-hoc (no Apple identity), and the whole bundle's seal intact.
const signature = run("codesign", ["-dv", "--verbose=2", app]).out;
const verify = run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
const gatekeeper = run("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
check("adhocSignature", /Signature=adhoc/.test(signature), "The app isn't ad-hoc signed.");
check("signatureVerifies", verify.status === 0, `codesign --verify failed: ${verify.out}`);

const result = {
  app,
  architecture: arch,
  bundle: { id: plist.CFBundleIdentifier, name: plist.CFBundleName, version: plist.CFBundleShortVersionString, build: plist.CFBundleVersion, executable: plist.CFBundleExecutable },
  minimumMacos: { LSMinimumSystemVersion: plist.LSMinimumSystemVersion ?? null, executableMinos: minos, effective: minimumMacos },
  machoFiles: macho,
  fuses: fuseStates,
  signature: { codesign: signature, verify: verify.out, verifyStatus: verify.status },
  // Informational: an ad-hoc app is expected to be rejected here; a downloaded copy asks on first open.
  gatekeeperAssessment: { status: gatekeeper.status, output: gatekeeper.out },
  codecLibraries: codecs,
  nativeAddons,
  asarUnpacked: existsSync(join(resources, "app.asar.unpacked")),
  fileCount: files.length,
  checks,
  problems,
  passed: problems.length === 0,
};
writeFileSync(join(evidence, "inspect.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(join(evidence, "files.txt"), `${files.map((f) => relative(app, f)).sort().join("\n")}\n`);
console.log(JSON.stringify({ ...result, machoFiles: `${macho.length} files, ${[...new Set(macho.map((m) => m.archs))].join(" / ")}` }, null, 2));
process.exit(result.passed ? 0 : 1);
