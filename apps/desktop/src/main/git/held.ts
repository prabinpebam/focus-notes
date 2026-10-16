/**
 * New notes without a private repository (D-158, SHR-01; Desktop and Git → New notes without a
 * private repository): the app's block in the notes repository's `info/exclude`. A new public note's
 * path goes in before its file is first written, so Git never lists or stages it until the writer
 * answers; the line follows the note's renames, moves, and deletes. Reads and writes are queued, so
 * two changes never write over each other. The block's text is `@focus-notes/core`'s.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { answerHeld, dropHeld, holdNote, moveHeld, NO_HELD, readHeld, writeHeld, type HeldNotes } from "@focus-notes/core/held";

/**
 * The exclude file of the repository whose top is `top`: in `.git/info/`, or, for a linked worktree
 * or a submodule's `.git` file, in its common folder. Undefined when the folder isn't a repository.
 */
export async function excludeFileOf(top: string): Promise<string | undefined> {
  const dotGit = join(top, ".git");
  const st = await stat(dotGit).catch(() => undefined);
  if (!st) return undefined;
  if (st.isDirectory()) return join(dotGit, "info", "exclude");
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(await readFile(dotGit, "utf8").catch(() => ""));
  if (!m) return undefined;
  const gitDir = resolve(top, m[1]!);
  const common = (await readFile(join(gitDir, "commondir"), "utf8").catch(() => "")).trim();
  return join(common ? resolve(gitDir, common) : gitDir, "info", "exclude");
}

const posix = (p: string) => p.split(sep).join("/");

export class HeldFile {
  #queue: Promise<unknown> = Promise.resolve();
  constructor(readonly top: string, readonly file: string) {}

  /** A path inside the repository, as the block spells it; undefined outside it. */
  #rel(abs: string): string | undefined {
    const r = relative(this.top, abs);
    return !r || r.startsWith("..") || isAbsolute(r) ? undefined : posix(r);
  }
  #abs = (rel: string) => join(this.top, ...rel.split("/"));
  async #read(): Promise<{ text: string; held: HeldNotes }> {
    const text = await readFile(this.file, "utf8").catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return "";
      throw e;
    });
    return { text, held: readHeld(text) };
  }
  /** One read-change-write at a time. */
  #update(change: (h: HeldNotes) => HeldNotes): Promise<void> {
    const run = this.#queue.then(async () => {
      const { text, held } = await this.#read();
      const next = change(held);
      if (next === held) return;
      const out = writeHeld(text, next);
      if (out === text) return;
      await mkdir(dirname(this.file), { recursive: true });
      // Whole or not at all: a temporary file beside it, then a rename.
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, out, "utf8");
      await rename(tmp, this.file);
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  /** The held notes, as absolute paths. */
  async list(): Promise<HeldNotes> {
    await this.#queue;
    const { held } = await this.#read().catch(() => ({ held: NO_HELD }));
    return { waiting: held.waiting.map(this.#abs), local: held.local.map(this.#abs) };
  }
  /** A new note waits for an answer. Throws when it can't be held, so it's never written unheld. */
  hold(abs: string): Promise<void> {
    const rel = this.#rel(abs);
    if (rel === undefined || /[\r\n]/.test(rel)) return Promise.reject(new Error("Can't hold that path"));
    return this.#update((h) => holdNote(h, rel));
  }
  answer(abs: string, choice: "public" | "local"): Promise<void> {
    const rel = this.#rel(abs);
    return rel === undefined ? Promise.resolve() : this.#update((h) => answerHeld(h, rel, choice));
  }
  /** A note or folder is about to move: its holds go with it. */
  moved(from: string, to: string): Promise<void> {
    const a = this.#rel(from);
    const b = this.#rel(to);
    return a === undefined || b === undefined ? Promise.resolve() : this.#update((h) => {
      const next = moveHeld(h, a, b);
      return next.waiting.every((p, i) => p === h.waiting[i]) && next.local.every((p, i) => p === h.local[i]) ? h : next;
    });
  }
  removed(abs: string): Promise<void> {
    const rel = this.#rel(abs);
    return rel === undefined ? Promise.resolve() : this.#update((h) => {
      const next = dropHeld(h, rel);
      return next.waiting.length === h.waiting.length && next.local.length === h.local.length ? h : next;
    });
  }
}
