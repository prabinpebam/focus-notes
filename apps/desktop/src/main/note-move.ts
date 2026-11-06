import { randomUUID } from "node:crypto";
import { link, open, readFile, realpath, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { imageDestinations } from "@focus-notes/core";

const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** Validate referenced local media before making a destination note visible. */
export async function validateNoteImages(text: string, note: string, boundary: string): Promise<void> {
  await localNoteImages(text, note, boundary);
}

export async function localNoteImages(text: string, note: string, boundary: string, select?: (path: string) => boolean): Promise<{
  start: number; end: number; path: string; canonicalPath: string; suffix: string; index: number;
}[]> {
  const canonical = await realpath(boundary);
  const images: { start: number; end: number; path: string; canonicalPath: string; suffix: string; index: number }[] = [];
  for (const [index, destination] of imageDestinations(text).entries()) {
    const raw = text.slice(destination.start, destination.end);
    const written = (destination.encoding === "component" ? decodeURIComponent(raw) : raw).replace(/\\([!-/:-@[-`{-~])/g, "$1");
    if (/^(?:[/#?]|[a-z][a-z0-9+.-]*:)/i.test(written)) continue;
    const cut = written.search(/[?#]/);
    const path = resolve(dirname(note), decodeURIComponent(cut < 0 ? written : written.slice(0, cut)));
    if (select && !select(path)) continue;
    if (!inside(boundary, path)) throw new Error("invalid");
    const actual = await realpath(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw new Error("missingImage");
      throw error;
    });
    if (!inside(canonical, actual) || !(await stat(actual)).isFile()) throw new Error("invalid");
    images.push({ start: destination.start, end: destination.end, path, canonicalPath: actual, suffix: cut < 0 ? "" : written.slice(cut), index });
  }
  return images;
}

async function textAt(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

/** Publish a complete, flushed file without replacing an existing destination. */
async function publish(path: string, text: string): Promise<void> {
  const temporary = join(dirname(path), `.focus-notes-move-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx");
  try {
    try {
      await file.writeFile(text, "utf8");
      await file.sync();
    } finally { await file.close(); }
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {
      console.error("A temporary note-move file could not be removed; the original note was not overwritten.");
    });
  }
}

/**
 * The old note stays valid until every batch write succeeds. An interruption leaves either the
 * original, or both complete notes; never a moved file whose relative images still name its old folder.
 */
export async function stageNoteMove(from: string, to: string, text: string, before: string): Promise<{
  finish(): Promise<void>;
  undo(): Promise<void>;
}> {
  if (await textAt(from) !== before) throw new Error("changed");
  await publish(to, text).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error("taken");
    throw error;
  });
  return {
    async finish() {
      if (await textAt(from) !== before || await textAt(to) !== text) throw new Error("changed");
      await unlink(from);
    },
    async undo() {
      const source = await textAt(from);
      if (source !== undefined && source !== before) throw new Error("changed");
      if (await textAt(to) !== text) throw new Error("changed");
      if (source === undefined) await publish(from, before);
      await unlink(to);
    },
  };
}
