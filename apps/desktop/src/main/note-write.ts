/**
 * Writing notes (Performance and quality → Reliability; D-92, FIL-12, DEF-24). Writes to one path run
 * one after another, so an older write never lands after a newer one, and each is atomic: a
 * temporary file next to the note, then a rename. A write may say what it expects on disk (the text
 * the window last read or wrote there): the file is read again once the write's turn has come and
 * any Git pull has finished (inside the queue, right before the temporary file), and once more right
 * before the rename; if it holds anything else (not that text, nor the text being written), nothing
 * is written and the text found is returned, so another program's change, a pull, or a write queued
 * before this one is never written over. A missing file is written: nothing is lost by making it.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Locks Windows sync clients and antivirus take briefly on a file they just saw. */
const BRIEF_LOCKS = new Set(["EPERM", "EBUSY", "EACCES"]);
const pause = (attempt: number) => new Promise((r) => setTimeout(r, 50 * 2 ** attempt));

/** Retries while the file is briefly locked (as renames do), up to five tries. */
export async function retrying<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || !BRIEF_LOCKS.has(code ?? "")) throw error;
      await pause(attempt);
    }
  }
}

/** A note's text now, read through brief locks; undefined if it isn't there. */
export const readNow = (path: string) =>
  retrying(() => readFile(path, "utf8")).catch((e: NodeJS.ErrnoException) => (e?.code === "ENOENT" ? undefined : Promise.reject(e)));

/** The text found when the file holds neither what's expected nor what's being written; else undefined. */
export async function changedOutside(path: string, content: string, expected: string | undefined): Promise<string | undefined> {
  if (typeof expected !== "string") return undefined;
  const now = await readNow(path);
  return now !== undefined && now !== expected && now !== content ? now : undefined;
}

export interface NoteWriterHooks {
  /** Waits until the path may be written: a writable workspace, no Git pull rewriting files. */
  ready?(path: string): Promise<void>;
  /** After a write landed (the parsed-note snapshot, PRF-10). */
  written?(path: string, content: string): Promise<void> | void;
}

export class NoteWriter {
  /** The write running or waiting per path. */
  readonly queues = new Map<string, Promise<unknown>>();
  #tmp = 0;
  readonly #hooks: NoteWriterHooks;

  constructor(hooks: NoteWriterHooks = {}) {
    this.#hooks = hooks;
  }

  /** Writes after the writes to the path before it; with `expected`, never over a change. */
  write(path: string, content: string, expected?: string): Promise<{ outside: string } | undefined> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.#now(path, content, expected));
    this.queues.set(path, next);
    void next.finally(() => { if (this.queues.get(path) === next) this.queues.delete(path); }).catch(() => {});
    return next;
  }

  async #now(path: string, content: string, expected: string | undefined): Promise<{ outside: string } | undefined> {
    await this.#hooks.ready?.(path);
    await mkdir(dirname(path), { recursive: true });
    // Checked now that it's this write's turn: what a pull or an earlier write left is what counts.
    const found = await changedOutside(path, content, expected);
    if (found !== undefined) return { outside: found };
    const tmp = `${path}.${process.pid}.${Date.now()}.${this.#tmp++}.tmp`;
    await writeFile(tmp, content, "utf8");
    try {
      // And again right before the rename: a change while the temporary file was written.
      const late = await changedOutside(path, content, expected);
      if (late !== undefined) {
        await rm(tmp, { force: true });
        return { outside: late };
      }
      await retrying(() => rename(tmp, path));
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    await this.#hooks.written?.(path, content);
    return undefined;
  }
}

export interface NoteSaveDeps {
  /** The note's absolute path; throws for anything but a Markdown file. */
  path(p: unknown): string;
  write(path: string, content: string, expected?: string): Promise<{ outside: string } | undefined>;
  /** The text last written here, or on disk, to measure how much changed (D-133). */
  before(path: string): Promise<string>;
  /** The journal's mark: this save supersedes every text it was sent before (QLT-03). */
  mark?(): unknown;
  saved?(path: string, content: string, upTo: unknown): void;
  /** A save landed: remembered, and counted toward the next backup. */
  written(path: string, before: string, content: string): void;
}

/** The main process's `note:write`: the window's text, written only over what it expects there (DEF-24). */
export function noteSave(d: NoteSaveDeps) {
  return async (p: unknown, content: unknown, expected: unknown): Promise<{ outside: string } | undefined> => {
    if (typeof content !== "string") throw new Error("Content must be text");
    if (expected !== undefined && typeof expected !== "string") throw new Error("Expected text must be text");
    const path = d.path(p);
    const upTo = d.mark?.();
    const before = await d.before(path);
    // Never over another program's change: checked when the write's turn comes (D-92, DEF-24).
    const outside = await d.write(path, content, expected);
    if (outside) return outside;
    d.saved?.(path, content, upTo);
    d.written(path, before, content);
    return undefined;
  };
}
