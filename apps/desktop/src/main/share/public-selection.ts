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
 * notes (G3.1, G3.3). Never widens: a note added to a confirmed folder since confirmation stops with
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
    const bytes = await readFile(file);
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
