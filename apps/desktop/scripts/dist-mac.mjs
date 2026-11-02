// The Mac review build (D-268): one architecture's DMG from package.json's build, to try the app on a
// Mac before any signed release. Ad-hoc signed (no Apple account or certificate), never notarized,
// never published, and without the Copilot SDK's native and FFI payload, as every package.
//
//   pnpm --filter @focus-notes/desktop run build
//   node scripts/dist-mac.mjs --arm64 | --x64      (on a Mac of that architecture)
//
// Ad-hoc signing seals the whole app with one signature, so macOS offers Open Anyway for it rather
// than calling it damaged. The hardened runtime is off: it would refuse the ad-hoc signed frameworks.
//
// electron-builder drops Electron's LICENSE and LICENSES.chromium.html from a Mac app, so they're
// carried into Contents/Resources here, as the Windows package carries them (D-269).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { COPILOT_NATIVE_EXCLUDES } from "./dist-store.mjs";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const electronDist = () => join(dirname(createRequire(join(root, "package.json")).resolve("electron/package.json")), "dist");

/** The build configuration for a Mac review DMG: package.json's, ad-hoc signed, with no Copilot native payload. */
export function macReviewConfig(build = pkg.build, electron = electronDist()) {
  return {
    ...build,
    files: [...(build.files ?? []), ...COPILOT_NATIVE_EXCLUDES],
    extraResources: [
      ...(build.extraResources ?? []),
      { from: join(electron, "LICENSE"), to: "LICENSE.electron.txt" },
      { from: join(electron, "LICENSES.chromium.html"), to: "LICENSES.chromium.html" },
    ],
    // "Focus Notes.app", run by Contents/MacOS/Focus Notes, as the command-line launcher expects.
    mac: { ...build.mac, executableName: build.productName, target: ["dmg"], identity: "-", hardenedRuntime: false, notarize: false },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arch = process.argv.slice(2).find((a) => a === "--arm64" || a === "--x64");
  if (!arch || process.platform !== "darwin") {
    console.error("Usage, on a Mac: node scripts/dist-mac.mjs --arm64 | --x64");
    process.exit(2);
  }
  const configDir = mkdtempSync(join(tmpdir(), "fn-mac-config-"));
  const config = join(configDir, "electron-builder.json");
  let status = 1;
  try {
    // Electron's own notices come from its downloaded runtime; fetch it the usual way if it's missing.
    const electron = electronDist();
    if (!existsSync(join(electron, "LICENSES.chromium.html"))) spawnSync(process.execPath, [join(electron, "..", "install.js")], { cwd: join(electron, ".."), stdio: "inherit" });
    for (const f of ["LICENSE", "LICENSES.chromium.html"]) {
      if (!existsSync(join(electron, f))) throw new Error(`Electron's ${f} is missing from ${electron}.`);
    }
    writeFileSync(config, JSON.stringify(macReviewConfig(pkg.build, electron), null, 2));
    const cli = createRequire(join(root, "package.json")).resolve("electron-builder/cli.js");
    status = spawnSync(process.execPath, [cli, "--mac", "dmg", arch, "--publish", "never", "--config", config], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    }).status ?? 1;
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
  process.exit(status);
}
