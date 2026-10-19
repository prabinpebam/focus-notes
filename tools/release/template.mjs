#!/usr/bin/env node
/**
 * The workspace template, pinned to a release's web app bundle (DST-06 groundwork, D-128):
 *
 *   node tools/release/template.mjs --version <x.y.z> --bundle dist/focus-notes-web-<x.y.z>.tgz --out dist
 *
 * writes focus-notes-workspace-<version>.tgz, a copy of templates/workspace/ whose
 * .focus-notes/app.json pins that bundle's version and SHA-256 for the Deploy app workflow, and whose
 * .focus-notes/workspace.json names the same templateVersion. The release attaches it; an
 * instance's Update app workflow finds it on the latest release, checks it (SHA256SUMS and the
 * attestation) and proposes its template-managed files as a pull request, and
 * tools/release/publish-template.mjs pushes it to the template repository (WP-5.6, D-137).
 *
 *   node tools/release/template.mjs --resource <file.json> [--archive <that .tgz>]
 *
 * writes the template the desktop app carries (DST-08, D-201): the release's archive, or
 * templates/workspace/ as it is in a development build (apps/desktop/scripts/build-main.mjs).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { readTgz } from "../../templates/workspace/.github/focus-notes/update.mjs";

const root = join(import.meta.dirname, "..", "..");
const template = join(root, "templates", "workspace");

export const templateName = (version) => `focus-notes-workspace-${version}.tgz`;

/**
 * The pin file `.focus-notes/app.json` that Deploy app reads, for the bundle's version and SHA-256.
 * The pin is a file, not the workflow's text, so an instance's Update app workflow can move it with
 * its own token, which may not edit workflows (D-137). `workflows` records each template workflow's
 * SHA-256, so a copy can tell when the files an update asked to copy by hand weren't.
 */
export function pinApp(text, { version, sha256, workflows }) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Not a version: ${version}`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`Not a SHA-256: ${sha256}`);
  const pin = JSON.parse(text);
  if (Object.keys(pin).sort().join() !== "sha256,version") throw new Error("app.json must hold exactly version and sha256");
  for (const [p, h] of Object.entries(workflows ?? {})) {
    if (!/^\.github\/workflows\/[a-z]+\.yml$/.test(p)) throw new Error(`Not a template workflow: ${p}`);
    if (!/^[0-9a-f]{64}$/.test(h)) throw new Error(`Not a SHA-256 for ${p}: ${h}`);
  }
  return `${JSON.stringify(workflows ? { version, sha256, workflows } : { version, sha256 })}\n`;
}

/** The workspace format file with the template version it came from. */
export function pinFormat(text, version) {
  if (typeof JSON.parse(text).templateVersion !== "string") throw new Error("workspace.json has no templateVersion");
  return text.replace(/("templateVersion":\s*)"[^"]*"/, `$1"${version}"`);
}

export const sha256Of = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Writes the pinned template archive into `out`; returns its path. */
export function packTemplate({ version, bundle, out }) {
  const sha256 = sha256Of(bundle);
  const stage = mkdtempSync(join(tmpdir(), "fn-template-"));
  try {
    cpSync(template, stage, { recursive: true });
    const pin = join(stage, ".focus-notes", "app.json");
    const wfDir = join(stage, ".github", "workflows");
    const workflows = Object.fromEntries(readdirSync(wfDir).sort().map((w) => [`.github/workflows/${w}`, sha256Of(join(wfDir, w))]));
    writeFileSync(pin, pinApp(readFileSync(pin, "utf8"), { version, sha256, workflows }));
    const format = join(stage, ".focus-notes", "workspace.json");
    writeFileSync(format, pinFormat(readFileSync(format, "utf8"), version));
    mkdirSync(out, { recursive: true });
    const file = join(out, templateName(version));
    rmSync(file, { force: true });
    execFileSync("tar", ["-czf", relative(stage, file), "."], { cwd: stage, stdio: ["ignore", "ignore", "inherit"] });
    return { file, sha256 };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** A folder's regular files, path (with `/`) -> bytes. */
function filesOf(dir, base = "") {
  const out = new Map();
  for (const e of readdirSync(join(dir, base), { withFileTypes: true })) {
    const p = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of filesOf(dir, p)) out.set(k, v);
    else if (e.isFile()) out.set(p, readFileSync(join(dir, p)));
  }
  return out;
}

/**
 * The workspace template the desktop app carries (DST-08, D-201): every file as base64, with the
 * template version, as one JSON file the app reads to make a new instance without GitHub's
 * template repository. From a release's pinned archive (`archive`, byte for byte what the release
 * attaches), or, in a development build, templates/workspace/ as it is (its 0.0.0 pin, which the
 * Deploy app workflow refuses).
 */
export function templateResource({ archive } = {}) {
  const files = archive ? readTgz(readFileSync(archive)) : filesOf(template);
  const format = files.get(".focus-notes/workspace.json");
  if (!format) throw new Error("The template has no .focus-notes/workspace.json");
  const version = JSON.parse(format.toString("utf8")).templateVersion;
  if (typeof version !== "string") throw new Error("workspace.json has no templateVersion");
  return { version, files: [...files.keys()].sort().map((path) => ({ path, data: files.get(path).toString("base64") })) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rest = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    const resource = arg("resource");
    if (resource) {
      // node tools/release/template.mjs --resource <file.json> [--archive dist/focus-notes-workspace-<x.y.z>.tgz]
      const r = templateResource({ archive: arg("archive") });
      writeFileSync(resource, `${JSON.stringify(r)}\n`);
      console.log(`Wrote ${relative(process.cwd(), resource)}: the workspace template ${r.version}, ${r.files.length} files.`);
      process.exit(0);
    }
    const version = arg("version"), bundle = arg("bundle");
    if (!version || !bundle) throw new Error("Usage: template.mjs --version <x.y.z> --bundle <archive> [--out dist] | --resource <file> [--archive <template archive>]");
    const { file, sha256 } = packTemplate({ version, bundle, out: arg("out") ?? "dist" });
    console.log(`Packed ${relative(process.cwd(), file)}, pinned to focus-notes-web-${version}.tgz (${sha256}).`);
  } catch (e) {
    console.error(`template: ${e.message}`);
    process.exit(1);
  }
}
