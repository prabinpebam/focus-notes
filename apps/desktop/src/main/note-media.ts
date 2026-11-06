import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { IMAGE_BYTE_LIMIT, rasterInfo } from "./image-import.ts";
import { publicImageBytes } from "./image-metadata.ts";
import { localNoteImages } from "./note-move.ts";

const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const destinationPath = (path: string) => path.split(sep).map(part => encodeURIComponent(part)).join("/");

/**
 * Copy only the note's authorized local media, before any destination note is published. Failure
 * retains original bytes and any already-created safe copies; it never deletes or rewrites assets.
 */
export async function copyNoteMedia(text: string, from: string, to: string, sourceBoundary: string, destinationRoot: string | undefined, publicCopy: boolean): Promise<{ text: string; paths: string[] }> {
  const images = await localNoteImages(text, from, sourceBoundary);
  if (!images.length) return { text, paths: [] };
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
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally { await file.close(); }
    copied.set(identity, destinationPath(relative(dirname(to), path)));
    paths.push(path);
  }
  let rewritten = "", at = 0;
  for (const image of images) {
    const identity = image.canonicalPath;
    rewritten += text.slice(at, image.start) + copied.get(identity)! + image.suffix;
    at = image.end;
  }
  return { text: rewritten + text.slice(at), paths };
}
