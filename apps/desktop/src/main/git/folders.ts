/**
 * Folders with nothing in them (FIL-14, D-191): Git keeps a folder only through a file, so a folder
 * made outside the app, or emptied, isn't backed up until it gets a `.gitkeep`.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Every folder under `root` (not `root` itself) with nothing in it. Hidden folders are skipped. */
export async function emptyFolders(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, top: boolean): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => undefined);
    if (!entries) return;
    if (!entries.length && !top) out.push(dir);
    for (const e of entries) if (e.isDirectory() && !e.name.startsWith(".")) await walk(join(dir, e.name), false);
  };
  await walk(root, true);
  return out;
}
