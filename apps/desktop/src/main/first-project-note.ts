import { open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

export function firstProjectNote(options: {
  roots: () => Promise<readonly string[] | undefined>;
  writable: (path: string) => Promise<void>;
}) {
  let admission: Promise<string | undefined> | undefined;
  async function create(): Promise<string | undefined> {
    const roots = await options.roots();
    if (!roots) return undefined;
    if (!roots.length) throw new Error("The project has no trusted note root");
    const canonical = await Promise.all(roots.map(root => realpath(root)));
    const path = join(roots[0]!, "Untitled.md");
    let visited = 0;
    async function empty(dir: string, depth = 0): Promise<boolean> {
      if (++visited > 10_000 || depth > 64) throw new Error("The project is too large to verify as empty");
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) return false;
        if (entry.name === ".git" || entry.name === ".focus-notes") continue;
        if (!(await empty(join(dir, entry.name), depth + 1))) return false;
      }
      return true;
    }
    const current = async () => {
      const now = await options.roots();
      if (!now || now.length !== roots!.length || now.some((root, i) => root !== roots![i])
        || (await Promise.all(now.map(root => realpath(root)))).some((root, i) => root !== canonical[i])) {
        throw new Error("The project changed while preparing its first note");
      }
    };
    if (!(await Promise.all(roots.map(root => empty(root)))).every(Boolean)) return undefined;
    visited = 0;
    await options.writable(path);
    await current();
    if (!(await Promise.all(roots.map(root => empty(root)))).every(Boolean)) return undefined;
    await options.writable(path);
    await current();
    visited = 0;
    if (!(await Promise.all(roots.map(root => empty(root)))).every(Boolean)) return undefined;
    let file;
    try { file = await open(path, "wx"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
      throw error;
    }
    await file.close();
    return path;
  }
  return () => admission ??= create().finally(() => { admission = undefined; });
}
