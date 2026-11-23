import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** What the person confirmed in Publish: note paths relative to the notes root, and the folders they chose. */
export interface ConfirmedSelection { notes: readonly string[]; folders?: readonly string[] }

const fail = (code: string) => new Error(`sharing:${code}`);
const safe = (path: string) => path.length > 0 && !path.startsWith("/") && !/[\\:]/.test(path) &&
  path.split("/").every(part => part && part !== "." && part !== ".." && !part.startsWith("."));
const NOTE = /\.(md|markdown)$/i;
/** Local images and other embedded files; a public page must never drop them or expose the originals. */
const LOCAL_MEDIA = /!\[[^\]]*\]\(\s*<?(?!https?:|data:|#)[^)\s>]+|<img\b[^>]*\bsrc\s*=\s*["']?(?!https?:|data:)[^"'\s>]/i;

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
 * Copies exactly the confirmed notes, as they are on disk now, into `staging` for sealing as public
 * notes (G3.1, G3.3). Never widens: a note added to a confirmed folder since confirmation stops with
 * `sharing:scope` (reconfirm), as does a missing or linked note. A note embedding local media stops with
 * `sharing:media` until the image export strips and copies it (WP-9.9). Nothing is staged on a stop.
 */
export async function stagePublicSelection(o: { notesRoot: string; selection: ConfirmedSelection; staging: string }): Promise<string[]> {
  const notes = [...new Set(o.selection.notes)];
  if (!notes.length || notes.some(p => !safe(p) || !NOTE.test(p)) || (o.selection.folders ?? []).some(f => !safe(f))) throw fail("scope");
  const confirmed = new Set(notes);
  for (const folder of o.selection.folders ?? []) {
    let current: string[];
    try { current = await notesIn(o.notesRoot, folder); } catch { throw fail("scope"); }
    if (current.some(p => !confirmed.has(p))) throw fail("scope");
  }
  const staged: [string, Buffer][] = [];
  for (const path of notes) {
    const file = join(o.notesRoot, ...path.split("/"));
    const info = await lstat(file).catch(() => undefined);
    if (!info?.isFile()) throw fail("scope");
    const bytes = await readFile(file);
    if (LOCAL_MEDIA.test(bytes.toString("utf8"))) throw fail("media");
    staged.push([path, bytes]);
  }
  // The exact bytes checked above, so an edit in between can't slip media past the check.
  for (const [path, bytes] of staged) {
    const to = join(o.staging, ...path.split("/"));
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, bytes, { flag: "wx" });
  }
  return notes.sort();
}
