// The Microsoft Store package (PKG-12, D-202): electron-builder's appx target, never in place of the
// NSIS installer, which stays the direct download. The package's identity comes from Partner Center
// (Product identity); it isn't secret. The ONE place it's set:
//   - build.appx in package.json holds obvious placeholders (identityName Placeholder.FocusNotes,
//     publisher CN=00000000-…), good for checking the package builds;
//   - the environment overrides them: MSSTORE_IDENTITY_NAME, MSSTORE_PUBLISHER and
//     MSSTORE_PUBLISHER_DISPLAY_NAME, the release workflow's repository variables of the same names.
//
//   pnpm --filter @focus-notes/desktop run dist:store [-- <electron-builder options>]
//   node scripts/dist-store.mjs --require-identity …   refuse to build with the placeholders, or with
//                                                      a version the Store refuses (0.x.y)
//
// Unsigned unless WIN_CSC_LINK names a certificate: the Store signs what it publishes, so the
// package uploaded to Partner Center needs none (a local test may sign with a throwaway one).
//
// The package carries Git (PKG-13, D-228): GitHub Desktop's dugite-native build, pinned by
// build/git-bundle.json, fetched and checked against its SHA-256 into vendor/git, and packed at
// resources\git. The installer and portable don't carry it and keep using the system's Git.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { ensureGitBundle, VENDOR_DIR } from "../../../tools/release/git-bundle.mjs";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const placeholders = pkg.build.appx;

/**
 * Why the Store would refuse this version, or undefined. A package's version is Major.Minor.Build.0:
 * the Store keeps the last section, and the first can't be 0, so 0.x.y releases aren't submitted.
 */
export function storeVersionProblem(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version ?? "");
  if (!m) return `${version} isn't a version.`;
  if (Number(m[1]) === 0) return `The Microsoft Store refuses version ${version}: a package's version can't start with 0. Store releases start at 1.0.0.`;
  if (m.slice(1).some((n) => Number(n) > 65535)) return `${version} has a section over 65535.`;
  return undefined;
}

/** The build configuration for the Store package: package.json's, with the bundled Git as a resource at `git`. */
export function storeConfig(build = pkg.build, gitDir = VENDOR_DIR) {
  return { ...build, extraResources: [...(build.extraResources ?? []), { from: relative(root, gitDir).replaceAll("\\", "/"), to: "git" }] };
}

/** The `-c.appx.*` overrides the environment asks for, and whether the identity is still a placeholder. */
export function identityArgs(env) {
  const values = { identityName: env.MSSTORE_IDENTITY_NAME, publisher: env.MSSTORE_PUBLISHER, publisherDisplayName: env.MSSTORE_PUBLISHER_DISPLAY_NAME };
  const set = Object.entries(values).filter(([, v]) => typeof v === "string" && v.trim() !== "");
  const identity = { ...placeholders, ...Object.fromEntries(set.map(([k, v]) => [k, v.trim()])) };
  return {
    args: set.map(([k, v]) => `-c.appx.${k}=${v.trim()}`),
    placeholder: identity.identityName === placeholders.identityName || identity.publisher === placeholders.publisher,
    identity,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const { args, placeholder, identity } = identityArgs(process.env);
  if (placeholder && argv.includes("--require-identity")) {
    console.error("The Store package still has the placeholder identity: set MSSTORE_IDENTITY_NAME and MSSTORE_PUBLISHER (Partner Center → Product identity).");
    process.exit(2);
  }
  const version = argv.find((a) => a.startsWith("-c.extraMetadata.version="))?.split("=")[1] ?? pkg.version;
  const versionProblem = storeVersionProblem(version);
  if (versionProblem && argv.includes("--require-identity")) {
    console.error(versionProblem);
    process.exit(2);
  }
  console.log(`Store package identity: ${identity.identityName}, ${identity.publisher}${placeholder ? " (placeholder: only for checking the build)" : ""}.`);
  const gitDir = await ensureGitBundle();
  const configDir = mkdtempSync(join(tmpdir(), "fn-store-config-"));
  const config = join(configDir, "electron-builder.json");
  let status = 1;
  try {
    writeFileSync(config, JSON.stringify(storeConfig(pkg.build, gitDir), null, 2));
    const cli = createRequire(join(root, "package.json")).resolve("electron-builder/cli.js");
    status = spawnSync(process.execPath, [cli, "--win", "appx", "--publish", "never", "--config", config, ...args, ...argv.filter((a) => a !== "--require-identity")], { cwd: root, stdio: "inherit" }).status ?? 1;
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
  process.exit(status);
}
