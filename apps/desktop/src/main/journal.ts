/**
 * The recovery journal on disk (QLT-03, Performance and quality → Reliability): the renderer hands
 * over each note's unsaved text at least every second, and it's appended here, in the app's data
 * folder, off the typing path. Saves, renames, and deletes are appended too, so the journal always
 * knows what isn't on disk yet. After a crash, the next launch puts that text back into its note
 * before anything reads it, or beside the note when the note changed since; then the journal is
 * empty. It's emptied whenever nothing is unsaved, rewritten smaller once it grows, and deleted on
 * a clean quit. Each append is flushed to the disk, so a power cut keeps it too.
 */
import { open, readFile, rename, rm, truncate, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { applyRecord, atOrUnder, compactJournal, encodeRecord, parseJournal, replay, textHash, type JournalEntry, type JournalRecord } from "@focus-notes/core/journal";
import { titleOfMarkdown } from "@focus-notes/core/workspace";
import type { RestoredNote } from "@focus-notes/core";

export interface JournalOptions {
  /** Once the file is bigger than this, it's rewritten with only what's unsaved. */
  compactBytes?: number;
  /** The hash of a note's text on disk now, or undefined if it isn't there. */
  baseOf?: (path: string) => Promise<string | undefined>;
  now?: () => number;
  /** Counts and problem codes only: note names and text are private. */
  log?: (line: string) => void;
}

export const COMPACT_BYTES = 4 * 1024 * 1024;

export class RecoveryJournal {
  #live: Map<string, JournalEntry>;
  #bytes: number;
  #queue: Promise<void> = Promise.resolve();
  /** The file ends in a torn line (a crash mid-append): the next record starts on a line of its own. */
  #torn: boolean;
  readonly #compactBytes: number;
  readonly #now: () => number;

  readonly file: string;
  readonly #opts: JournalOptions;

  private constructor(file: string, live: Map<string, JournalEntry>, bytes: number, torn: boolean, opts: JournalOptions) {
    this.#torn = torn;
    this.file = file;
    this.#opts = opts;
    this.#live = live;
    this.#bytes = bytes;
    this.#compactBytes = opts.compactBytes ?? COMPACT_BYTES;
    this.#now = opts.now ?? (() => Date.now());
  }

  /** Reads what the last session left: a torn or damaged line is skipped, never fatal. */
  static async open(file: string, opts: JournalOptions = {}): Promise<RecoveryJournal> {
    const content = await readFile(file, "utf8").catch(() => "");
    const { records, skipped } = parseJournal(content);
    if (skipped) opts.log?.(`journal: skipped ${skipped} damaged line(s)`);
    return new RecoveryJournal(file, replay(records), Buffer.byteLength(content), content !== "" && !content.endsWith("\n"), opts);
  }

  /** What isn't on disk yet, oldest first. */
  entries(): JournalEntry[] {
    return [...this.#live.values()].map((e) => ({ ...e }));
  }

  /** A note's unsaved text. The first since its last save records what's on disk under it. */
  text(path: string, text: string): Promise<void> {
    return this.#run(async () => {
      const known = this.#live.get(path);
      const base = known ? known.base : await this.#opts.baseOf?.(path).catch(() => undefined);
      return [{ v: 1, op: "text", path, at: this.#now(), hash: textHash(text), ...(base !== undefined ? { base } : {}), text }];
    });
  }

  /** A note was written with this text. */
  saved(path: string, text: string): Promise<void> {
    return this.#run(() => (this.#live.has(path) ? [{ v: 1, op: "saved", path, at: this.#now(), hash: textHash(text) }] : []));
  }

  /** A note or folder was renamed or moved. */
  moved(from: string, to: string): Promise<void> {
    return this.#run(() => ([...this.#live.keys()].some((p) => atOrUnder(p, from)) ? [{ v: 1, op: "moved", path: from, to, at: this.#now() }] : []));
  }

  /** A note or folder is gone, or its text was restored elsewhere. */
  gone(path: string): Promise<void> {
    return this.#run(() => ([...this.#live.keys()].some((p) => atOrUnder(p, path)) ? [{ v: 1, op: "gone", path, at: this.#now() }] : []));
  }

  /** Forgets everything: the person chose to close without saving, or signed out. */
  clear(): Promise<void> {
    return this.#run(async () => {
      this.#live.clear();
      await rm(this.file, { force: true });
      this.#bytes = 0;
      this.#torn = false;
      return [];
    });
  }

  /** On a clean quit: the file goes when nothing is unsaved. */
  close(): Promise<void> {
    return this.#run(async () => {
      if (this.#live.size === 0) {
        await rm(this.file, { force: true });
        this.#bytes = 0;
      }
      return [];
    });
  }

  /** Resolves once everything asked so far is on disk. */
  settled(): Promise<void> {
    return this.#queue;
  }

  get bytes(): number {
    return this.#bytes;
  }

  /** One change at a time, in the order asked: the file is only ever appended to by one writer. */
  #run(make: () => JournalRecord[] | Promise<JournalRecord[]>): Promise<void> {
    const next = this.#queue.then(async () => {
      const records = await make();
      if (!records.length) return;
      for (const r of records) applyRecord(this.#live, r);
      await this.#write(records);
    }).catch((e: unknown) => {
      // The journal is a safety net: if it can't be written, saving still goes on.
      this.#opts.log?.(`journal: write failed (${(e as NodeJS.ErrnoException)?.code ?? "error"})`);
    });
    this.#queue = next;
    return next;
  }

  async #write(records: JournalRecord[]): Promise<void> {
    if (this.#live.size === 0) {
      // Nothing is unsaved: the file is emptied, not deleted, so it's never re-created mid-session.
      if (this.#bytes > 0) await truncate(this.file, 0).catch(() => writeFile(this.file, ""));
      this.#bytes = 0;
      this.#torn = false;
      return;
    }
    const add = (this.#torn ? "\n" : "") + records.map(encodeRecord).join("");
    const addBytes = Buffer.byteLength(add);
    if (this.#bytes + addBytes > this.#compactBytes) {
      const all = compactJournal(this.#live);
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeAndSync(tmp, all, "w");
      await renameRetrying(tmp, this.file);
      this.#bytes = Buffer.byteLength(all);
      this.#torn = false;
      return;
    }
    await writeAndSync(this.file, add, "a");
    this.#bytes += addBytes;
    this.#torn = false;
  }
}

async function writeAndSync(path: string, text: string, flags: "a" | "w"): Promise<void> {
  const h = await open(path, flags);
  try {
    await h.writeFile(text, "utf8");
    await h.datasync();
  } finally {
    await h.close();
  }
}

/** Renames, retrying while Windows antivirus briefly holds a file it just saw. */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
    }
  }
}

const stem = (p: string) => basename(p, extname(p));
const titleOf = (path: string, text: string) => titleOfMarkdown(text) ?? stem(path);

/** A free name beside a note for its recovered text: `Name (recovered).md`, then `(recovered 2)`. */
export function recoveredCopyPath(path: string, exists: (p: string) => boolean = existsSync): string {
  for (let i = 1; ; i++) {
    const p = join(dirname(path), `${stem(path)} (recovered${i === 1 ? "" : ` ${i}`})${extname(path)}`);
    if (!exists(p)) return p;
  }
}

export interface RestoreIo {
  /** The note's text on disk, or undefined if it isn't there. */
  read(path: string): Promise<string | undefined>;
  /** Writes a note the way the app saves one (atomically, and committed later). */
  write(path: string, text: string): Promise<void>;
  exists?(path: string): boolean;
}

/**
 * Puts what the last session left unsaved back (QLT-03). Into its note when the note is as it was
 * under the text (or gone); beside it, as a copy, when it changed since, so neither version is
 * lost. A note that can't be written now (a read-only workspace) stays in the journal for next time.
 */
export async function restoreJournal(journal: RecoveryJournal, io: RestoreIo): Promise<RestoredNote[]> {
  const out: RestoredNote[] = [];
  for (const e of journal.entries()) {
    try {
      const disk = await io.read(e.path);
      if (disk === e.text) {
        await journal.gone(e.path);
        continue;
      }
      if (disk === undefined || (e.base !== undefined && textHash(disk) === e.base)) {
        await io.write(e.path, e.text);
        await journal.saved(e.path, e.text);
        out.push({ path: e.path, title: titleOf(e.path, e.text) });
      } else {
        const copy = recoveredCopyPath(e.path, io.exists);
        await io.write(copy, e.text);
        await journal.gone(e.path);
        out.push({ path: e.path, title: titleOf(e.path, disk), copy: { path: copy, title: stem(copy) } });
      }
    } catch {
      // Kept for the next launch.
    }
  }
  return out;
}
