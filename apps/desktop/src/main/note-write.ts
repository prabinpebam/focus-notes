/**
 * A note's save never writes over another program's change (D-92, FIL-12, DEF-24). The window says
 * what it knows is on disk (the text it last read or wrote there); right before writing, the file
 * is read again, and if it holds something else (not that text, nor the text being saved), nothing
 * is written and the window gets the text found, for the conflict resolver. A missing file is
 * written: nothing is lost by making it again. Without `expected` (a new note's empty file) the
 * write goes ahead as before.
 */
import { readFile } from "node:fs/promises";

export async function writeUnlessChanged(
  path: string, content: string, expected: string | undefined, write: (path: string, content: string) => Promise<void>,
): Promise<{ outside: string } | undefined> {
  if (typeof expected === "string") {
    const now = await readFile(path, "utf8").catch((e: NodeJS.ErrnoException) => (e?.code === "ENOENT" ? undefined : Promise.reject(e)));
    if (now !== undefined && now !== expected && now !== content) return { outside: now };
  }
  await write(path, content);
  return undefined;
}
