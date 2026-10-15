/**
 * Where a note comes from, and the export bundle (D-90, PKG-08, PKG-11).
 *
 * Notes written in the browser have plain paths. The instance's notes, which the browser only reads,
 * are addressed as `public:<path>` and `private:<path>`, so nothing can write to them by mistake.
 */

import { RESERVED_WINDOWS } from "./text.ts";
import { trimWhere } from "./scan.ts";

export type NoteSource = "local" | "public" | "private";
const PREFIX = /^(public|private):/;

export function sourceOf(path: string | undefined): NoteSource {
  const m = path ? PREFIX.exec(path) : null;
  return (m?.[1] as NoteSource | undefined) ?? "local";
}
export const isReadOnlyPath = (path: string | undefined) => sourceOf(path) !== "local";
/** The path inside its source, without the prefix. */
export const innerPath = (path: string) => path.replace(PREFIX, "");
export const titleOfPath = (path: string) => innerPath(path).split("/").at(-1)!.replace(/\.(md|markdown)$/i, "");

/** A free path for `wanted` among `taken`: the same name, else "Name 2.md", "Name 3.md", and so on. */
export function freePath(wanted: string, taken: { has(path: string): boolean }, next?: Map<string, number>): string {
  if (!taken.has(wanted)) return wanted;
  const m = /^(.*?)(\.(?:md|markdown))?$/i.exec(wanted)!;
  // `next` remembers where each name's numbering got to, so many copies of one name stay fast.
  for (let i = next?.get(wanted) ?? 2; ; i++) {
    const p = `${m[1]} ${i}${m[2] ?? ".md"}`;
    if (!taken.has(p)) {
      next?.set(wanted, i + 1);
      return p;
    }
  }
}

/** A path someone could give us (an import, a copy) made safe for the browser's own notes. */
export function safeLocalPath(path: string): string {
  const parts = innerPath(path).replace(/\\/g, "/").split("/")
    .map((s) => s.replace(/[\u0000-\u001f:*?"<>|]/g, "").trim())
    .filter((s) => s && s !== "." && s !== "..");
  let p = parts.join("/") || "Untitled.md";
  if (!/\.(md|markdown)$/i.test(p)) p += ".md";
  return p;
}

/**
 * A path from a bundle made safe for a workspace folder on the desktop (FRE-10): as for the
 * browser, and no hidden (dot) segments, no names Windows reserves or trims, so every imported
 * note shows in Files and nothing lands outside the root.
 */
export function safeWorkspacePath(path: string): string {
  const parts = safeLocalPath(path).split("/").map((s) => trimWhere(s, (c) => c === "." || /\s/.test(c))).filter(Boolean);
  if (!parts.length || !/\.(md|markdown)$/i.test(parts.at(-1)!)) parts.push("Untitled.md");
  return parts.map((s) => {
    const dot = s.indexOf(".");
    const first = dot < 0 ? s : s.slice(0, dot);
    return RESERVED_WINDOWS.test(first) ? `${first}-note${s.slice(first.length)}` : s;
  }).join("/");
}

// ---- the export bundle (schemas/export-bundle.schema.json) ----

export const BUNDLE_FORMAT = "focus-notes/export/v1";
export interface BundleNote { path: string; text: string; updated: string }
export interface Bundle { format: typeof BUNDLE_FORMAT; exported: string; notes: BundleNote[] }
/** Bigger files are refused before parsing, so a wrong file can't freeze the page. */
export const BUNDLE_MAX_BYTES = 64 * 1024 * 1024;
export const BUNDLE_MAX_NOTES = 20_000;

export function makeBundle(notes: { path: string; text: string; updated: number }[], now = new Date()): Bundle {
  return {
    format: BUNDLE_FORMAT,
    exported: now.toISOString(),
    notes: notes.map((n) => ({ path: n.path, text: n.text, updated: new Date(n.updated).toISOString() })).sort((a, b) => a.path.localeCompare(b.path)),
  };
}
export const bundleFileName = (now = new Date()) => `focus-notes-export-${now.toISOString().slice(0, 10)}.json`;

export class BundleError extends Error {}

export function parseBundle(text: string): Bundle {
  if (text.length > BUNDLE_MAX_BYTES) throw new BundleError("too large");
  let b: Bundle;
  try { b = JSON.parse(text) as Bundle; } catch { throw new BundleError("not JSON"); }
  if (b?.format !== BUNDLE_FORMAT || !Array.isArray(b.notes)) throw new BundleError("not a Focus Notes export");
  if (b.notes.length > BUNDLE_MAX_NOTES) throw new BundleError("too many notes");
  for (const n of b.notes) {
    if (typeof n?.path !== "string" || typeof n.text !== "string" || typeof n.updated !== "string" || Number.isNaN(Date.parse(n.updated))) {
      throw new BundleError("malformed note");
    }
  }
  return b;
}

/**
 * Where each imported note goes: its own path if that's free, else a numbered copy. Nothing that's
 * already here is ever replaced (PKG-11, FRE-10). A note identical to the one at its path is
 * skipped; a path whose text wasn't read (`undefined`) is only taken. On the desktop (`foldCase`)
 * names that differ only in case or Unicode form are the same file, and paths are made safe for a
 * workspace folder.
 */
export function planImport(bundle: Bundle, existing: ReadonlyMap<string, string | undefined>, opts: { foldCase?: boolean } = {}): { path: string; text: string; updated: number; renamed: boolean }[] {
  const key = (p: string) => (opts.foldCase ? p.normalize("NFC").toLowerCase() : p);
  const keys = new Set([...existing.keys()].map(key));
  const texts = new Map([...existing].map(([p, t]) => [key(p), t]));
  const taken = { has: (p: string) => keys.has(key(p)) };
  const next = new Map<string, number>();
  const out: { path: string; text: string; updated: number; renamed: boolean }[] = [];
  for (const n of bundle.notes) {
    const wanted = opts.foldCase ? safeWorkspacePath(n.path) : safeLocalPath(n.path);
    const same = texts.get(key(wanted));
    if (same !== undefined && same === n.text) continue;
    const path = freePath(wanted, taken, next);
    keys.add(key(path));
    out.push({ path, text: n.text, updated: Date.parse(n.updated), renamed: path !== wanted });
  }
  return out;
}
