#!/usr/bin/env node
/**
 * The released web app bundle (DST-03, D-98, D-128): focus-notes-web-<version>.tgz, which template
 * instances' Deploy app workflows download at their pinned version and check before running.
 *
 *   node tools/release/web-bundle.mjs pack --version <x.y.z> --out dist
 *   node tools/release/web-bundle.mjs smoke dist/focus-notes-web-<x.y.z>.tgz
 *
 * `pack` needs the web app, the page renderer and the publisher's command line built first
 * (`pnpm --filter @focus-notes/web run build` and `run build:publish`). The archive holds:
 *
 *   app/       the static web app (apps/web/dist), deployed at the site's root
 *   publish/   cli.mjs (packages/seal's command line), render.mjs and assets/ (the page renderer)
 *   bundle.json, LICENSE, THIRD_PARTY_NOTICES.md
 *
 * `smoke` unpacks an archive into a temporary folder and runs its publisher on a sample note with
 * nothing else installed, the way a template instance's workflow does.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..", "..");

/** The archive's file name for a version. */
export const bundleName = (version) => `focus-notes-web-${version}.tgz`;

/** Where each part of the bundle comes from, relative to the repository. */
export const LAYOUT = [
  { from: "apps/web/dist", to: "app" },
  { from: "apps/web/dist-publish/cli.mjs", to: "publish/cli.mjs" },
  { from: "apps/web/dist-reader/render.mjs", to: "publish/render.mjs" },
  { from: "apps/web/dist-reader/assets", to: "publish/assets" },
  { from: "LICENSE", to: "LICENSE" },
  { from: "THIRD_PARTY_NOTICES.md", to: "THIRD_PARTY_NOTICES.md" },
];

/** Runs `tar` with relative paths only, so neither bsdtar (Windows) nor GNU tar reads a drive letter as a host. */
function tar(cwd, args) {
  execFileSync("tar", args, { cwd, stdio: ["ignore", "ignore", "inherit"] });
}

/** Packs the bundle from the built parts under `base` (the repository by default); returns the archive's path. */
export function pack({ version, out, base = root, commit = "" }) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Not a version: ${version}`);
  const missing = LAYOUT.filter((p) => !existsSync(join(base, p.from))).map((p) => p.from);
  if (missing.length) throw new Error(`Build these first: ${missing.join(", ")}`);
  const stage = mkdtempSync(join(tmpdir(), "fn-bundle-"));
  try {
    for (const p of LAYOUT) {
      mkdirSync(dirname(join(stage, p.to)), { recursive: true });
      cpSync(join(base, p.from), join(stage, p.to), { recursive: true });
    }
    writeFileSync(join(stage, "bundle.json"), JSON.stringify({ name: "focus-notes-web", version, ...(commit ? { commit } : {}) }, null, 2) + "\n");
    mkdirSync(out, { recursive: true });
    const file = join(out, bundleName(version));
    rmSync(file, { force: true });
    tar(stage, ["-czf", relative(stage, file), "bundle.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "app", "publish"]);
    return file;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** Every file under a folder, as forward-slash paths relative to it. */
const files = (dir, at = dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f), at) : [relative(at, join(dir, f)).split("\\").join("/")]));

/** Unpacks an archive and publishes a sample note with its own publisher; throws if anything is missing. */
export function smoke(archive) {
  const dir = mkdtempSync(join(tmpdir(), "fn-smoke-"));
  try {
    const bundle = join(dir, "bundle");
    mkdirSync(bundle);
    tar(bundle, ["-xzf", relative(bundle, archive)]);
    const manifest = JSON.parse(readFileSync(join(bundle, "bundle.json"), "utf8"));
    if (!existsSync(join(bundle, "app", "index.html"))) throw new Error("The bundle has no app/index.html.");
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "notes", "hello.md"), "# Hello\n\nA public note.\n");
    const cli = join(bundle, "publish", "cli.mjs");
    execFileSync(process.execPath, [cli, "publish", "--site", "site", "--notes", "notes", "--owner", "smoke", "--reader", join(bundle, "publish"), "--site-url", "https://smoke.example/"], { cwd: dir, stdio: ["ignore", "pipe", "inherit"] });
    const index = JSON.parse(readFileSync(join(dir, "site", "notes", "index.json"), "utf8"));
    if (index.notes?.[0]?.path !== "hello.md") throw new Error("The publisher didn't index the sample note.");
    const pages = files(join(dir, "site")).filter((f) => f.endsWith(".html"));
    if (!pages.length) throw new Error("The publisher didn't render the sample note's page.");
    return { version: manifest.version, files: files(bundle), pages };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    if (command === "pack") {
      const file = pack({ version: arg("version") ?? "", out: arg("out") ?? "dist", commit: process.env.GITHUB_SHA ?? "" });
      console.log(`Packed ${relative(process.cwd(), file)}.`);
    } else if (command === "smoke" && rest[0]) {
      const { version, pages } = smoke(rest[0]);
      console.log(`Smoke test passed: bundle ${version} published a sample note (${pages.length} page${pages.length === 1 ? "" : "s"}).`);
    } else {
      throw new Error("Usage: web-bundle.mjs pack --version <x.y.z> [--out dist] | smoke <archive>");
    }
  } catch (e) {
    console.error(`web-bundle: ${e.message}`);
    process.exit(1);
  }
}
