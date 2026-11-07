import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/** A verified private recovery copy. The caller must hold the public-source write lane until removal completes. */
export async function preservePublicSource(publicRoot: string, privateRoot: string): Promise<string> {
  const [source, privateFolder] = await Promise.all([realpath(publicRoot), realpath(privateRoot)]);
  const inside = (root: string, path: string) => {
    const rel = relative(root, path);
    return !rel || rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel);
  };
  if (inside(source, privateFolder) || inside(privateFolder, source)) throw new Error("sharing:preservation");
  const list = async (): Promise<string[]> => {
    const files: string[] = [];
    const walk = async (dir: string, prefix: string) => {
      let entries;
      try {
        if ((await lstat(dir)).isSymbolicLink() || !inside(source, await realpath(dir))) throw new Error("sharing:preservation");
        entries = await readdir(dir, { withFileTypes: true });
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" && (prefix === "notes" || prefix === "assets")) return; throw error; }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) throw new Error("sharing:preservation");
        const path = join(prefix, entry.name);
        if (entry.isDirectory()) await walk(join(source, path), path);
        else if (entry.isFile()) files.push(path);
        else throw new Error("sharing:preservation");
      }
    };
    await walk(join(source, "notes"), "notes");
    await walk(join(source, "assets"), "assets");
    return files.sort();
  };
  const paths = await list();
  const notes = join(privateFolder, "notes");
  await mkdir(notes, { recursive: true });
  if ((await lstat(notes)).isSymbolicLink() || !inside(privateFolder, await realpath(notes))) throw new Error("sharing:preservation");
  const parent = join(notes, "Recovered public");
  await mkdir(parent, { recursive: true });
  if ((await lstat(parent)).isSymbolicLink() || !inside(privateFolder, await realpath(parent))) throw new Error("sharing:preservation");
  const destination = await mkdtemp(join(parent, "copy-"));
  for (const path of paths) {
    const original = await readFile(join(source, path));
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, original, { flag: "wx" });
    if (!(await readFile(target)).equals(original) || !(await readFile(join(source, path))).equals(original)) throw new Error("sharing:preservation");
  }
  if (JSON.stringify(await list()) !== JSON.stringify(paths)) throw new Error("sharing:preservation");
  // Recheck every source after the entire copy, not only immediately after its own write.
  for (const path of paths) {
    if (!(await readFile(join(source, path))).equals(await readFile(join(destination, path)))) throw new Error("sharing:preservation");
  }
  return destination;
}
