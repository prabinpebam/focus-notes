// The Microsoft Store package (PKG-12, D-202): electron-builder's appx target, never in place of the
// NSIS installer, which stays the direct download. The package's identity comes from Partner Center
// (Product identity); it isn't secret. The ONE place it's set:
//   - build.appx in package.json holds obvious placeholders (identityName Placeholder.FocusNotes,
//     publisher CN=00000000-…), good for checking the package builds;
//   - the environment overrides them: MSSTORE_IDENTITY_NAME, MSSTORE_PUBLISHER and
//     MSSTORE_PUBLISHER_DISPLAY_NAME, the release workflow's repository variables of the same names.
//
//   pnpm --filter @focus-notes/desktop run dist:store [-- <electron-builder options>]
//   node scripts/dist-store.mjs --require-identity …   refuse to build with the placeholders
//
// Unsigned unless WIN_CSC_LINK names a certificate: the Store signs what it publishes, so the
// package uploaded to Partner Center needs none (a local test may sign with a throwaway one).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const placeholders = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).build.appx;

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
  console.log(`Store package identity: ${identity.identityName}, ${identity.publisher}${placeholder ? " (placeholder: only for checking the build)" : ""}.`);
  const cli = createRequire(join(root, "package.json")).resolve("electron-builder/cli.js");
  const r = spawnSync(process.execPath, [cli, "--win", "appx", "--publish", "never", ...args, ...argv.filter((a) => a !== "--require-identity")], { cwd: root, stdio: "inherit" });
  process.exit(r.status ?? 1);
}
