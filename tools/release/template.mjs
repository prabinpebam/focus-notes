#!/usr/bin/env node
/**
 * The workspace template, pinned to a release's web app bundle (DST-06 groundwork, D-126):
 *
 *   node tools/release/template.mjs --version <x.y.z> --bundle dist/focus-notes-web-<x.y.z>.tgz --out dist
 *
 * writes focus-notes-workspace-<version>.tgz, a copy of templates/workspace/ whose Deploy app
 * workflow pins FOCUS_NOTES_VERSION and FOCUS_NOTES_SHA256 to that bundle, and whose
 * .focus-notes/workspace.json names the same templateVersion. The release attaches it, so an
 * instance finds its next pin on the latest release, checks it the same way its workflow checks the
 * bundle (SHA256SUMS and the attestation), and updates by taking its pages.yml. Pushing it to the
 * template repository and opening update pull requests in instances are WP-5.6.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..", "..");
const template = join(root, "templates", "workspace");

export const templateName = (version) => `focus-notes-workspace-${version}.tgz`;

/**
 * The Deploy app workflow's text with the bundle's version and SHA-256 pinned, and the placeholder's
 * comment replaced by where the pin came from. Throws unless exactly one of each pin is there.
 */
export function pinWorkflow(text, { version, sha256 }) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Not a version: ${version}`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`Not a SHA-256: ${sha256}`);
  const pins = [
    [/^( {2}FOCUS_NOTES_VERSION: )"[^"\n]*"$/m, `$1"${version}"`],
    [/^( {2}FOCUS_NOTES_SHA256: )"[0-9a-f]{64}"$/m, `$1"${sha256}"`],
    [/^ {2}# PLACEHOLDER PIN:[^\n]*\n(?: {2}#[^\n]*\n)*/m, `  # Pinned by the Focus Notes ${version} release (focus-notes-web-${version}.tgz). Updates arrive\n  # as pull requests that change both values together (DST-06).\n`],
  ];
  let out = text;
  for (const [re, by] of pins) {
    if ((out.match(new RegExp(re.source, "gm")) ?? []).length !== 1) throw new Error(`The template's workflow doesn't have exactly one ${re.source}`);
    out = out.replace(re, by);
  }
  return out;
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
    const wf = join(stage, ".github", "workflows", "pages.yml");
    writeFileSync(wf, pinWorkflow(readFileSync(wf, "utf8"), { version, sha256 }));
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rest = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    const version = arg("version"), bundle = arg("bundle");
    if (!version || !bundle) throw new Error("Usage: template.mjs --version <x.y.z> --bundle <archive> [--out dist]");
    const { file, sha256 } = packTemplate({ version, bundle, out: arg("out") ?? "dist" });
    console.log(`Packed ${relative(process.cwd(), file)}, pinned to focus-notes-web-${version}.tgz (${sha256}).`);
  } catch (e) {
    console.error(`template: ${e.message}`);
    process.exit(1);
  }
}
