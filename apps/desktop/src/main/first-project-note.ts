import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

export type FirstNoteCertificate = { roots: string; file: string; slot?: number };
export type FirstNoteAdmission = <T>(roots: readonly string[], work: (
  certificate: FirstNoteCertificate | undefined,
  certify: (certificate: FirstNoteCertificate) => void,
) => Promise<T>) => Promise<T>;

async function identity(path: string): Promise<string> {
  const info = await lstat(path, { bigint: true });
  if (info.isSymbolicLink()) throw new Error("The first note or its root was redirected");
  return createHash("sha256").update(`${info.dev}:${info.ino}:${info.birthtimeNs}`).digest("hex");
}

export async function prepareProjectNoteRoots(project: string, roots: readonly string[], writable: (path: string) => Promise<void>): Promise<void> {
  const canonicalProject = await realpath(project);
  const projectIdentity = await identity(canonicalProject);
  const missing: { root: string; parent: string; canonicalParent: string; parentIdentity: string }[] = [];
  for (const root of roots) {
    const within = relative(project, root);
    if (within !== "" && within !== "notes" && within !== join("private", "notes")) {
      throw new Error("The first note has an untrusted root");
    }
    try {
      const info = await lstat(root);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("The first note's root is not a directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(root);
      const canonicalParent = await realpath(parent);
      if (canonicalParent !== join(canonicalProject, relative(project, parent))) {
        throw new Error("The first note's root was redirected");
      }
      const parentIdentity = await identity(canonicalParent);
      missing.push({ root, parent, canonicalParent, parentIdentity });
    }
  }
  for (const entry of missing) {
    await writable(join(entry.root, "Untitled.md"));
    if (await realpath(project) !== canonicalProject || await identity(canonicalProject) !== projectIdentity
      || await realpath(entry.parent) !== entry.canonicalParent || await identity(entry.canonicalParent) !== entry.parentIdentity) {
      throw new Error("The project changed while preparing its note roots");
    }
    // Never recreate a removed project or private repository with recursive mkdir.
    try { await mkdir(entry.root); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(entry.root);
    if (!info.isDirectory() || info.isSymbolicLink()
      || await realpath(project) !== canonicalProject || await identity(canonicalProject) !== projectIdentity
      || await realpath(entry.parent) !== entry.canonicalParent || await identity(entry.canonicalParent) !== entry.parentIdentity
      || await realpath(entry.root) !== join(canonicalProject, relative(project, entry.root))) {
      throw new Error("The project changed while preparing its note roots");
    }
  }
}

export function firstProjectNote(options: {
  roots: () => Promise<readonly string[] | undefined>;
  prepareRoots?: (roots: readonly string[]) => Promise<void>;
  writable: (path: string) => Promise<void>;
  admit: FirstNoteAdmission;
  /** Missing launch history still admits writing without replacing existing content. */
  allowNonempty?: boolean;
}) {
  let admission: Promise<string | undefined> | undefined;
  async function create(): Promise<string | undefined> {
    const roots = await options.roots();
    if (!roots) return undefined;
    if (!roots.length) throw new Error("The project has no trusted note root");
    await options.prepareRoots?.(roots);
    const canonical = await Promise.all(roots.map(root => realpath(root)));
    const rootIdentity = JSON.stringify(await Promise.all(roots.map(identity)));
    const notePath = (slot: number) => join(roots[0]!, slot === 1 ? "Untitled.md" : `Untitled ${slot}.md`);
    let slot = 1;
    let path = notePath(slot);
    let existingBlank: string | undefined;
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
    if (!initiallyEmpty && options.allowNonempty) {
      for (; slot <= 10_000; slot++) {
        path = notePath(slot);
        try {
          const info = await lstat(path);
          if (info.isFile() && info.size === 0) {
            existingBlank = await identity(path);
            break;
          }
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
          throw error;
        }
      }
      if (slot > 10_000) throw new Error("The project has too many Untitled notes");
    }
    if (initiallyEmpty || options.allowNonempty) {
      await options.writable(path);
      await current();
    }
    async function readVerified(expected: string, blankOnly = false): Promise<string | undefined> {
      let file;
      try { file = await open(path, "r"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && !options.allowNonempty) return undefined;
        throw error;
      }
      try {
        const info = await file.stat({ bigint: true });
        const opened = createHash("sha256").update(`${info.dev}:${info.ino}:${info.birthtimeNs}`).digest("hex");
        const present = await identity(path);
        if (!info.isFile() || opened !== expected || present !== expected) {
          if (options.allowNonempty) throw new Error("The admitted project note changed");
          return undefined;
        }
        const { bytesRead } = await file.read(Buffer.alloc(1), 0, 1, 0);
        if (blankOnly && bytesRead !== 0) throw new Error("The existing empty project note changed");
        await current();
        if (await identity(path) !== expected) {
          if (options.allowNonempty) throw new Error("The admitted project note changed during its read");
          return undefined;
        }
        return path;
      } finally { await file.close(); }
    }
    // Scan and writable/Git preparation happen before the shared SQLite writer is acquired.
    // Only the final root check/exclusive create (or one-byte winner read) holds admission.
    return options.admit(canonical, async (certificate, certify) => {
      if (certificate) {
        slot = certificate.slot ?? 1;
        if (!Number.isSafeInteger(slot) || slot < 1 || slot > 10_000) throw new Error("The first note's slot is invalid");
        path = notePath(slot);
        await current();
        if (certificate.roots !== rootIdentity) throw new Error("The certified first note's project root changed");
        if (!initiallyEmpty) await options.writable(path);
        await current();
        return readVerified(certificate.file);
      }
      if (!initiallyEmpty && !options.allowNonempty) return undefined;
      await current();
      // Reopen an ordinary blank note, including a pre-commit crash survivor, without certifying it.
      if (existingBlank) return readVerified(existingBlank, true);
      visited = 0;
      if (!options.allowNonempty && !(await Promise.all(roots.map(root => empty(root)))).every(Boolean)) return undefined;
      let file;
      try { file = await open(path, "wx"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST" && !options.allowNonempty) return undefined;
        throw error;
      }
      let created: string;
      try {
        const info = await file.stat({ bigint: true });
        created = createHash("sha256").update(`${info.dev}:${info.ino}:${info.birthtimeNs}`).digest("hex");
      } finally { await file.close(); }
      await current();
      visited = 0;
      if (!options.allowNonempty && !(await Promise.all(roots.map(root => empty(root, 0, true)))).every(Boolean)) throw new Error("The project gained other content during first-note creation");
      await current();
      if (await identity(path) !== created) throw new Error("The first note changed during creation");
      // Commit only after exclusive creation closes. A crash before this transaction commits
      // leaves an ordinary uncertified blank note for read-only reuse, never a retry write.
      certify({ roots: rootIdentity, file: created, slot });
      return path;
    });
  }
  const start = () => admission ??= create().finally(() => { admission = undefined; });
  // The ordinary atomic save replaces the inode. Advance only an already-certified identity,
  // in the same admission lane; arbitrary external replacements never acquire a certificate.
  async function write<T>(path: string, save: () => Promise<T>): Promise<T> {
    const name = /^Untitled(?: ([1-9]\d*))?\.md$/.exec(basename(path));
    if (!name) return save();
    const slot = name[1] ? Number(name[1]) : 1;
    const roots = await options.roots();
    if (!roots || path !== join(roots[0]!, basename(path))) return save();
    const canonical = await Promise.all(roots.map(root => realpath(root)));
    const rootIdentity = JSON.stringify(await Promise.all(roots.map(identity)));
    return options.admit(canonical, async (certificate, certify) => {
      if (!certificate || certificate.roots !== rootIdentity || (certificate.slot ?? 1) !== slot) return save();
      let previous: string;
      try { previous = await identity(path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return save();
        throw error;
      }
      if (previous !== certificate.file) return save();
      const result = await save();
      if (JSON.stringify(await Promise.all(roots.map(identity))) !== rootIdentity) throw new Error("The project changed during its first note's save");
      certify({ roots: rootIdentity, file: await identity(path), slot });
      return result;
    });
  }
  return Object.assign(start, { write });
}
