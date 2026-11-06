import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { imageDestinations } from "@focus-notes/core";
import { IMAGE_BYTE_LIMIT, rasterInfo } from "./image-import.ts";
import { publicImageBytes } from "./image-metadata.ts";
import { localNoteImages } from "./note-move.ts";

const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const destinationPath = (path: string) => path.split(sep).map(part => encodeURIComponent(part)).join("/");

/** Media only this note owns: in a `….assets` folder beside it (a standalone note's sidecar), never a shared root's. */
export const ownSidecar = (note: string) => (path: string): boolean => {
  const first = relative(dirname(note), path).split(sep)[0] ?? "";
  return /\.assets$/i.test(first) && first !== ".." && inside(dirname(note), path);
};

/**
 * Copy only the note's authorized local media (those `select` picks), before any destination note
 * is published. Failure never deletes or rewrites originals; it removes only the fresh copies this call made.
 * `source` is the note's text where it is now, when `text` is that text with other links already
 * rewritten for the destination: images resolve from `source` and are replaced in `text` in order.
 */
export async function copyNoteMedia(text: string, from: string, to: string, sourceBoundary: string, destinationRoot: string | undefined, publicCopy: boolean, source = text, select?: (path: string) => boolean): Promise<{ text: string; paths: string[] }> {
  const images = await localNoteImages(source, from, sourceBoundary, select);
  if (!images.length) return { text, paths: [] };
  const targets = source === text ? undefined : imageDestinations(text);
  if (targets && targets.length !== imageDestinations(source).length) throw new Error("changed");
  const boundary = destinationRoot ?? dirname(to);
  const canonical = await realpath(boundary);
  if (!inside(canonical, await realpath(dirname(to)))) throw new Error("invalid");
  const folder = destinationRoot ? join(boundary, "assets", "images") : join(boundary, `${basename(to)}.assets`, "images");
  let ancestor = boundary;
  for (const part of relative(boundary, folder).split(sep)) {
    ancestor = join(ancestor, part);
    await mkdir(ancestor).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    if (!inside(canonical, await realpath(ancestor))) throw new Error("invalid");
  }
  const copied = new Map<string, string>();
  const paths: string[] = [];
  try {
    for (const image of images) {
      const identity = image.canonicalPath;
      if (copied.has(identity)) continue;
      if ((await stat(identity)).size > IMAGE_BYTE_LIMIT) throw new Error("invalid");
      const original = await readFile(identity);
      if (original.length > IMAGE_BYTE_LIMIT) throw new Error("invalid");
      const { ext } = rasterInfo(original);
      const bytes = publicCopy ? publicImageBytes(original, ext) : original;
      const path = join(folder, `${randomUUID()}.${ext}`);
      const file = await open(path, "wx").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") throw new Error("taken");
        throw error;
      });
      paths.push(path);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally { await file.close(); }
      copied.set(identity, destinationPath(relative(dirname(to), path)));
    }
  } catch (error) {
    // Only this call's fresh copies go: an unreferenced copy must never reach a later commit.
    await removeCopies(paths);
    throw error;
  }
  let rewritten = "", at = 0;
  for (const image of images) {
    const identity = image.canonicalPath;
    const target = targets?.[image.index] ?? image;
    const destination = copied.get(identity)! + image.suffix;
    rewritten += text.slice(at, target.start) + (target.encoding === "component" ? encodeURIComponent(destination) : destination);
    at = target.end;
  }
  return { text: rewritten + text.slice(at), paths };
}

/** Removes copies this app just made for a note that was not published; never an original. */
export async function removeCopies(paths: readonly string[]): Promise<void> {
  for (const path of paths) await rm(path, { force: true }).catch(() => {
    console.error("A copied image could not be removed after a refused note change.");
  });
}
