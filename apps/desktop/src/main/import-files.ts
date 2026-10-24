/**
 * Import files (FIL-15, D-210): only the shell reads the files a person picks. Markdown and text
 * come back as they are; HTML as it is, and a Word document as HTML (mammoth, BSD-2-Clause), which
 * the renderer turns into Markdown with the paste pipeline's sanitizer and reader. Images are left
 * out (EXT-03 isn't built), so a document never arrives as a page of data addresses.
 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import mammoth from "mammoth";
import type { ImportedFile } from "@focus-notes/core";

/** What the open dialog offers. */
export const IMPORT_EXTENSIONS = ["md", "markdown", "txt", "docx", "html", "htm"] as const;
/** A file larger than this is left out unread. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
/** At most this many files in one import; the rest are left out. */
export const IMPORT_MAX_FILES = 200;

/** Text as the file holds it: UTF-8 (a byte order mark dropped), or UTF-16 when it starts with one, as Notepad's "Unicode" does. */
export function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

const nameOf = (file: string) => basename(file, extname(file));

/** One picked file, read; undefined when it can't be (too large, not a file, not readable). */
export async function readImportFile(file: string): Promise<ImportedFile | undefined> {
  const ext = extname(file).slice(1).toLowerCase();
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) return undefined;
  const st = await stat(file).catch(() => undefined);
  if (!st?.isFile() || st.size > IMPORT_MAX_BYTES) return undefined;
  try {
    if (ext === "docx") {
      const res = await mammoth.convertToHtml({ path: file }, { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) });
      return { name: nameOf(file), kind: "html", text: res.value };
    }
    const text = decodeText(await readFile(file)).replace(/\r\n?/g, "\n");
    return { name: nameOf(file), kind: ext === "html" || ext === "htm" ? "html" : ext === "txt" ? "text" : "markdown", text };
  } catch {
    return undefined;
  }
}

/** The picked files, read in order: what could be read, and the names of those left out. */
export async function readImportFiles(files: readonly string[]): Promise<{ files: ImportedFile[]; skipped: string[] }> {
  const out: ImportedFile[] = [];
  const skipped: string[] = [];
  for (const [i, file] of files.entries()) {
    const read = i < IMPORT_MAX_FILES ? await readImportFile(file) : undefined;
    if (read) out.push(read);
    else skipped.push(basename(file));
  }
  return { files: out, skipped };
}
