import { readFile, stat } from "node:fs/promises";
import { importImages } from "./image-import.ts";

/** Derived assets are retained even if the source/target changes while the copy is being prepared. */
export async function createImageCopy(note: string, root: string | undefined, source: string, expected: string, data: string, decode: (path: string, size: { width: number; height: number }) => Promise<void>, publicCopy: boolean) {
  if (!data.startsWith("data:image/png;base64,")) throw new Error("invalid-image");
  const info = await stat(source);
  if (!info.isFile() || info.size > 20 * 1024 * 1024 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(expected) || expected.length > 28 * 1024 * 1024) throw new Error("invalid-image");
  const bytes = Buffer.from(expected.slice(expected.indexOf(",") + 1), "base64");
  if (!bytes.equals(await readFile(source))) throw new Error("image-changed");
  const result = await importImages(note, root, [{ data }], decode, publicCopy);
  if (!bytes.equals(await readFile(source))) throw new Error("image-changed");
  return { image: result.images[0]!, paths: result.paths };
}
