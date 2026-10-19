/**
 * The workspace template the app carries (DST-08, D-201): a new instance's first commit is made from
 * it on this computer, so setup never asks GitHub to copy a template repository. It's one JSON file
 * beside the main process (`out/main/workspace-template.json`, inside the package): a release's
 * pinned template byte for byte, or templates/workspace/ in a development build
 * (tools/release/template.mjs → `templateResource`).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface BundledTemplate {
  /** The template version (`.focus-notes/workspace.json`'s templateVersion; 0.0.0 in a development build). */
  version: string;
  files: { path: string; bytes: Buffer }[];
}

export const TEMPLATE_RESOURCE = "workspace-template.json";

/** A plain relative path: no `..`, `.git`, drive, backslash, or empty segment. */
const plain = (p: string) => /^[A-Za-z0-9._ -]+(\/[A-Za-z0-9._ -]+)*$/.test(p) && !p.split("/").some((s) => s === "." || s === ".." || s.toLowerCase() === ".git");

/** Reads and checks the template; anything unexpected throws (setup says the starter notes are missing). */
export function parseTemplate(raw: unknown): BundledTemplate {
  const t = raw as { version?: unknown; files?: unknown } | undefined;
  if (!t || typeof t.version !== "string" || !Array.isArray(t.files) || t.files.length === 0) throw new Error("Not a workspace template");
  const seen = new Set<string>();
  const files = t.files.map((f: { path?: unknown; data?: unknown }) => {
    if (typeof f?.path !== "string" || typeof f.data !== "string" || !plain(f.path) || seen.has(f.path.toLowerCase())) throw new Error("A template file isn't plain");
    seen.add(f.path.toLowerCase());
    return { path: f.path, bytes: Buffer.from(f.data, "base64") };
  });
  if (!seen.has(".focus-notes/workspace.json")) throw new Error("The template has no workspace file");
  return { version: t.version, files };
}

export async function readTemplate(file: string): Promise<BundledTemplate> {
  return parseTemplate(JSON.parse(await readFile(file, "utf8")));
}

/** Writes the template's files into a folder. */
export async function writeTemplate(dir: string, t: BundledTemplate): Promise<void> {
  for (const f of t.files) {
    const target = join(dir, ...f.path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.bytes);
  }
}
