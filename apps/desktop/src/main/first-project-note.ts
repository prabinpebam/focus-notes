import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";

export type FirstNoteCertificate = { roots: string; file: string };
export type FirstNoteAdmission = <T>(roots: readonly string[], work: (
  certificate: FirstNoteCertificate | undefined,
  certify: (certificate: FirstNoteCertificate) => void,
) => Promise<T>) => Promise<T>;

async function identity(path: string): Promise<string> {
  const info = await lstat(path, { bigint: true });
  if (info.isSymbolicLink()) throw new Error("The first note or its root was redirected");
  return createHash("sha256").update(`${info.dev}:${info.ino}:${info.birthtimeNs}`).digest("hex");
}

export function firstProjectNote(options: {
  roots: () => Promise<readonly string[] | undefined>;
  writable: (path: string) => Promise<void>;
  admit: FirstNoteAdmission;
}) {
  let admission: Promise<string | undefined> | undefined;
  async function create(): Promise<string | undefined> {
    const roots = await options.roots();
    if (!roots) return undefined;
    if (!roots.length) throw new Error("The project has no trusted note root");
    const canonical = await Promise.all(roots.map(root => realpath(root)));
    const rootIdentity = JSON.stringify(await Promise.all(roots.map(identity)));
    const path = join(roots[0]!, "Untitled.md");
    let visited = 0;
    async function empty(dir: string, depth = 0, winner = false): Promise<boolean> {
      if (++visited > 10_000 || depth > 64) throw new Error("The project is too large to verify as empty");
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (winner && entry.isFile() && join(dir, entry.name) === path) continue;
        if (!entry.isDirectory()) return false;
        if (entry.name === ".git" || entry.name === ".focus-notes") continue;
        if (!(await empty(join(dir, entry.name), depth + 1, winner))) return false;
      }
      return true;
    }
    const current = async () => {
      const now = await options.roots();
      if (!now || now.length !== roots!.length || now.some((root, i) => root !== roots![i])
        || (await Promise.all(now.map(root => realpath(root)))).some((root, i) => root !== canonical[i])
        || JSON.stringify(await Promise.all(now.map(identity))) !== rootIdentity) {
        throw new Error("The project changed while preparing its first note");
      }
    };
    const initiallyEmpty = (await Promise.all(roots.map(root => empty(root)))).every(Boolean);
    if (initiallyEmpty) {
      await options.writable(path);
      await current();
    }
    // Scan and writable/Git preparation happen before the shared SQLite writer is acquired.
    // Only the final root check/exclusive create (or one-byte winner read) holds admission.
    return options.admit(canonical, async (certificate, certify) => {
      if (certificate) {
        await current();
        if (certificate.roots !== rootIdentity) throw new Error("The certified first note's project root changed");
        if (!initiallyEmpty) await options.writable(path);
        await current();
        let file;
        try { file = await open(path, "r"); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
          throw error;
        }
        try {
          const info = await file.stat({ bigint: true });
          const opened = createHash("sha256").update(`${info.dev}:${info.ino}:${info.birthtimeNs}`).digest("hex");
          const present = await identity(path);
          if (!info.isFile() || opened !== certificate.file || present !== certificate.file) return undefined;
          await file.read(Buffer.alloc(1), 0, 1, 0);
          await current();
          if (await identity(path) !== certificate.file) return undefined;
          return path;
        } finally { await file.close(); }
      }
      if (!initiallyEmpty) return undefined;
      await current();
      visited = 0;
      if (!(await Promise.all(roots.map(root => empty(root)))).every(Boolean)) return undefined;
      let file;
      try { file = await open(path, "wx"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
        throw error;
      }
      let created: string;
      try {
        const info = await file.stat({ bigint: true });
        created = createHash("sha256").update(`${info.dev}:${info.ino}:${info.birthtimeNs}`).digest("hex");
      } finally { await file.close(); }
      await current();
      visited = 0;
      if (!(await Promise.all(roots.map(root => empty(root, 0, true)))).every(Boolean)) throw new Error("The project gained other content during first-note creation");
      await current();
      if (await identity(path) !== created) throw new Error("The first note changed during creation");
      // Commit only after exclusive creation closes. A crash before this transaction commits
      // leaves an ordinary uncertified note for the existing Open/recovery flow, never a retry write.
      certify({ roots: rootIdentity, file: created });
      return path;
    });
  }
  const start = () => admission ??= create().finally(() => { admission = undefined; });
  // The ordinary atomic save replaces the inode. Advance only an already-certified identity,
  // in the same admission lane; arbitrary external replacements never acquire a certificate.
  async function write<T>(path: string, save: () => Promise<T>): Promise<T> {
    if (basename(path) !== "Untitled.md") return save();
    const roots = await options.roots();
    if (!roots || path !== join(roots[0]!, "Untitled.md")) return save();
    const canonical = await Promise.all(roots.map(root => realpath(root)));
    const rootIdentity = JSON.stringify(await Promise.all(roots.map(identity)));
    return options.admit(canonical, async (certificate, certify) => {
      if (!certificate || certificate.roots !== rootIdentity) return save();
      let previous: string;
      try { previous = await identity(path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return save();
        throw error;
      }
      if (previous !== certificate.file) return save();
      const result = await save();
      if (JSON.stringify(await Promise.all(roots.map(identity))) !== rootIdentity) throw new Error("The project changed during its first note's save");
      certify({ roots: rootIdentity, file: await identity(path) });
      return result;
    });
  }
  return Object.assign(start, { write });
}
