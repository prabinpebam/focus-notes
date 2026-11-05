import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { exifOrientation, publicImageBytes } from "./image-metadata.ts";

export const IMAGE_BYTE_LIMIT = 20 * 1024 * 1024;
const PIXEL_LIMIT = 40_000_000;
export interface ImageInput { data: string }
export interface ImportedImage { src: string; width: number; height: number }
const invalid = () => new Error("invalid-image");

/** Read raster headers before decoding, so a decompression bomb never reaches the decoder. */
export function rasterInfo(b: Buffer): { ext: string; width: number; height: number } {
  let ext = "", width = 0, height = 0, orientation = 1;
  if (b.length >= 33 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    ext = "png"; width = b.readUInt32BE(16); height = b.readUInt32BE(20);
    for (let at = 8; at + 12 <= b.length;) {
      const length = b.readUInt32BE(at);
      if (at + 12 + length > b.length) throw invalid();
      if (b.toString("ascii", at + 4, at + 8) === "acTL") throw new Error("animated-image");
      if (b.toString("ascii", at + 4, at + 8) === "eXIf") orientation = exifOrientation(b.subarray(at + 8, at + 8 + length));
      at += length + 12;
    }
  } else if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    ext = "webp";
    for (let at = 12; at + 8 <= b.length;) {
      const kind = b.toString("ascii", at, at + 4), length = b.readUInt32LE(at + 4), p = at + 8;
      if (p + length > b.length) throw invalid();
      if (kind === "ANIM" || kind === "ANMF") throw new Error("animated-image");
      if (kind === "EXIF") {
        const data = b.subarray(p, p + length);
        orientation = exifOrientation(data.subarray(data.subarray(0, 6).equals(Buffer.from("Exif\0\0")) ? 6 : 0));
      }
      if (kind === "VP8X" && length >= 10) {
        if (b[p]! & 2) throw new Error("animated-image");
        width = b.readUIntLE(p + 4, 3) + 1; height = b.readUIntLE(p + 7, 3) + 1;
      } else if (kind === "VP8 " && length >= 10 && !width) {
        width = b.readUInt16LE(p + 6) & 0x3fff; height = b.readUInt16LE(p + 8) & 0x3fff;
      } else if (kind === "VP8L" && length >= 5 && b[p] === 0x2f && !width) {
        const bits = b.readUInt32LE(p + 1);
        width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      }
      at = p + length + (length % 2);
    }
  } else if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    ext = "jpg";
    for (let at = 2; at + 4 <= b.length;) {
      if (b[at] !== 0xff) throw invalid();
      while (b[at] === 0xff) at++;
      const marker = b[at++]!;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) continue;
      const length = b.readUInt16BE(at);
      if (length < 2 || at + length > b.length) throw invalid();
      if (marker === 0xe1 && b.subarray(at + 2, at + 8).equals(Buffer.from("Exif\0\0"))) orientation = exifOrientation(b.subarray(at + 8, at + length));
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        height = b.readUInt16BE(at + 3); width = b.readUInt16BE(at + 5);
      }
      at += length;
    }
  }
  if (!width || !height || !ext) throw invalid();
  if (width * height > PIXEL_LIMIT) throw new Error("image-pixels");
  // Chromium applies JPEG EXIF rotation; WebP retains the tag but renders its raster dimensions.
  return orientation >= 5 && ext !== "webp" ? { ext, width: height, height: width } : { ext, width, height };
}

const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** All validation finishes in temporary storage before a single managed asset is written. */
export async function importImages(note: string, root: string | undefined, inputs: readonly ImageInput[], decode: (path: string) => Promise<void>, publicCopy = false): Promise<{ images: ImportedImage[]; paths: string[] }> {
  if (!inputs.length || inputs.length > 20) throw new Error("image-count");
  const buffers = inputs.map((input) => {
    if (!input || typeof input.data !== "string") throw invalid();
    const match = /^data:[a-z\d.+/-]*;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(input.data);
    if (!match) throw invalid();
    if (match[1]!.length > Math.ceil(IMAGE_BYTE_LIMIT / 3) * 4) throw new Error("image-too-large");
    const b = Buffer.from(match[1]!, "base64");
    if (b.length > IMAGE_BYTE_LIMIT) throw new Error("image-too-large");
    const info = rasterInfo(b);
    return { b: publicCopy ? publicImageBytes(b, info.ext) : b, ...info };
  });
  const parent = await realpath(dirname(note));
  const boundary = await realpath(root ?? parent);
  if (!inside(boundary, parent)) throw invalid();
  const folder = root ? join(boundary, "assets", "images") : join(parent, `${basename(note)}.assets`, "images");
  const temporary = await mkdtemp(join(tmpdir(), "focus-notes-image-"));
  const paths: string[] = [];
  try {
    for (const [i, image] of buffers.entries()) {
      const path = join(temporary, `${i}.${image.ext}`);
      await writeFile(path, image.b, { flag: "wx" });
      await decode(path);
    }
    // Check each existing ancestor, not just the final folder, before following any symlink.
    const parts = relative(boundary, folder).split(sep);
    let current = boundary;
    for (const part of parts) {
      current = join(current, part);
      await mkdir(current).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      if (!inside(boundary, await realpath(current))) throw invalid();
    }
    const images: ImportedImage[] = [];
    for (const image of buffers) {
      const path = join(folder, `${randomUUID()}.${image.ext}`);
      await writeFile(path, image.b, { flag: "wx" });
      // Git tracks the caller's root spelling (which may be a Windows short path or junction).
      paths.push(root ? join(root, relative(boundary, path)) : path);
      images.push({ src: relative(parent, path).split(sep).join("/"), width: image.width, height: image.height });
    }
    return { images, paths };
  } catch (error) {
    for (const path of paths) await rm(path, { force: true });
    throw error;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function imageInputsFromPaths(paths: readonly string[]): Promise<ImageInput[]> {
  if (!paths.length || paths.length > 20) throw new Error("image-count");
  const out: ImageInput[] = [];
  for (const path of paths) {
    const info = await stat(path);
    if (!info.isFile() || info.size > IMAGE_BYTE_LIMIT) throw new Error("image-too-large");
    const b = await readFile(path);
    const { ext } = rasterInfo(b);
    out.push({ data: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${b.toString("base64")}` });
  }
  return out;
}
