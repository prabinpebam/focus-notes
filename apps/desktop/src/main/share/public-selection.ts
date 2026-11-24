import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, sep } from "node:path";
import { PUBLISHABLE_IMAGE, stripImageMetadata } from "./public-media.ts";

/** What the person confirmed in Publish: note paths relative to the notes root, and the folders they chose. */
export interface ConfirmedSelection { notes: readonly string[]; folders?: readonly string[] }
/** Staged notes, and the images they embed, both relative to the notes root. */
export interface StagedSelection { notes: string[]; media: string[] }

const fail = (code: string) => new Error(`sharing:${code}`);
const safe = (path: string) => path.length > 0 && !path.startsWith("/") && !/[\\:]/.test(path) &&
  path.split("/").every(part => part && part !== "." && part !== ".." && !part.startsWith("."));
const NOTE = /\.(md|markdown)$/i;
/** Markdown images (`![alt](src "title")`) and HTML images (`<img src>`). */
const IMAGE_REFS = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi;

/** Inline links (`[text](target "title")`, never images) and reference definitions (`[id]: target`). */
const INLINE_LINK = /(?<!!)\[((?:[^[\]\\]|\\.|\[[^\]]*\])*)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const REFERENCE = /^ {0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/gm;
const HTML_LINK = /<a\b[^>]*\bhref\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * A public note never links to a private one (AGENTS.md, D-419): a local link whose target isn't a note
 * on the site becomes its plain text, so neither the private note's name nor its path is published.
 * Web, mail and in-page links stay. Fenced code is left as written.
 */
export function unlinkPrivate(text: string, note: string, published: ReadonlySet<string>): string {
  const keep = (target: string) => {
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return true;
    let decoded: string;
    try { decoded = decodeURI(target.split(/[?#]/)[0]!); } catch { return false; }
    if (decoded.startsWith("/")) return false;
    return published.has(posix.normalize(posix.join(posix.dirname(note), decoded)));
  };
  const parts = text.split(/(^ {0,3}(?:```|~~~)[\s\S]*?(?:^ {0,3}(?:```|~~~)[^\n]*$|(?![\s\S])))/m);
  const dropped = new Set<string>();
  for (let i = 0; i < parts.length; i += 2) parts[i] = parts[i]!.replace(REFERENCE, (line, id: string, target: string) => keep(target) ? line : (dropped.add(id.toLowerCase()), ""));
  return parts.map((part, i) => {
    if (i % 2) return part;
    let out = part.replace(INLINE_LINK, (link, label: string, target: string) => keep(target) ? link : label);
    out = out.replace(HTML_LINK, (link, target: string, label: string) => keep(target) ? link : label);
    if (dropped.size) out = out.replace(/(?<!!)\[([^\]]+)\](?:\[([^\]]*)\])?/g, (ref, label: string, id?: string) =>
      dropped.has((id || label).toLowerCase()) ? label : ref);
    return out;
  }).join("");
}

async function notesIn(root: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string) => {
    for (const entry of await readdir(join(root, ...rel.split("/")), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (NOTE.test(entry.name)) out.push(path);
    }
  };
  await walk(folder);
  return out;
}

/**
 * A note's local image as a project-relative path, which is also where it sits on the site; undefined
 * for a web or in-page reference. Only images under the notes or the project's managed `assets/images`
 * (D-365) may publish; anything else, embedded or unsafe is refused.
 */
function localImage(notesPrefix: string, note: string, src: string): string | undefined {
  if (/^(https?:|#)/i.test(src)) return undefined;
  // An embedded image carries its metadata inside the note's own text.
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")) throw fail("media");
  let decoded: string;
  try { decoded = decodeURI(src.split(/[?#]/)[0]!); } catch { throw fail("media"); }
  const path = posix.normalize(posix.join(posix.dirname(posix.join(notesPrefix, note)), decoded));
  const allowed = path.startsWith(notesPrefix ? `${notesPrefix}/` : "") || path.startsWith("assets/images/");
  if (!safe(path) || !allowed || !PUBLISHABLE_IMAGE.test(path)) throw fail("media");
  return path;
}

/**
 * Copies exactly the confirmed notes, as they are on disk now, into `staging` for sealing as public
 * notes (G3.1, G3.3), with links to notes that aren't on the site reduced to their text (`unlinkPrivate`).
 * Never widens: a note added to a confirmed folder since confirmation stops with
 * `sharing:scope` (reconfirm), as does a missing or linked note. Each local JPEG or PNG a note shows is
 * staged in `staging/.media/<site path>` with its location, camera and other metadata removed (WP-9.9);
 * its site path mirrors its project path (notes at `notes/`), so the published note's links resolve.
 * Any other, missing, linked or outside image stops with `sharing:media` rather than being dropped or
 * exposed. The originals are never changed, and nothing is staged on a stop.
 */
export async function stagePublicSelection(o: { notesRoot: string; projectRoot?: string; selection: ConfirmedSelection; staging: string }): Promise<StagedSelection> {
  const notes = [...new Set(o.selection.notes)];
  if (!notes.length || notes.some(p => !safe(p) || !NOTE.test(p)) || (o.selection.folders ?? []).some(f => !safe(f))) throw fail("scope");
  const projectRoot = o.projectRoot ?? o.notesRoot;
  const notesPrefix = relative(projectRoot, o.notesRoot).split(sep).join("/");
  if (notesPrefix && !safe(notesPrefix)) throw fail("scope");
  const confirmed = new Set(notes);
  for (const folder of o.selection.folders ?? []) {
    let current: string[];
    try { current = await notesIn(o.notesRoot, folder); } catch { throw fail("scope"); }
    if (current.some(p => !confirmed.has(p))) throw fail("scope");
  }
  const staged = new Map<string, Buffer>(), media = new Map<string, Buffer>();
  for (const path of notes) {
    const file = join(o.notesRoot, ...path.split("/"));
    const info = await lstat(file).catch(() => undefined);
    if (!info?.isFile()) throw fail("scope");
    const original = await readFile(file);
    const text = original.toString("utf8");
    const scrubbed = unlinkPrivate(text, path, confirmed);
    const bytes = scrubbed === text ? original : Buffer.from(scrubbed, "utf8");
    staged.set(path, bytes);
    for (const match of bytes.toString("utf8").matchAll(IMAGE_REFS)) {
      const image = localImage(notesPrefix, path, (match[1] ?? match[2])!);
      if (!image) continue;
      const site = notesPrefix ? image : `notes/${image}`;
      if (media.has(site)) continue;
      const source = join(projectRoot, ...image.split("/"));
      if (!(await lstat(source).catch(() => undefined))?.isFile()) throw fail("media");
      const stripped = stripImageMetadata(await readFile(source), image);
      if (!stripped) throw fail("media");
      media.set(site, stripped);
    }
  }
  // The exact bytes checked above, so an edit in between can't slip an image past the check.
  for (const [path, bytes] of [...staged, ...[...media].map(([p, b]) => [`.media/${p}`, b] as const)]) {
    const to = join(o.staging, ...path.split("/"));
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, bytes, { flag: "wx" });
  }
  return { notes: notes.sort(), media: [...media.keys()].sort() };
}
