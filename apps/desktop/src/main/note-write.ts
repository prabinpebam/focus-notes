/**
 * Writing notes (Performance and quality → Reliability; D-92, FIL-12, DEF-26). Writes to one path run
 * one after another, so an older write never lands after a newer one, and each is atomic: a
 * temporary file next to the note, then a rename. A write may say what it expects on disk (the text
 * the window last read or wrote there): the file is read again once the write's turn has come and
 * any Git pull has finished (inside the queue, right before the temporary file), and once more right
 * before the rename; if it holds anything else (not that text, nor the text being written), nothing
 * is written and the text found is returned, so another program's change, a pull, or a write queued
 * before this one is never written over. A missing file is written: nothing is lost by making it.
 */
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

/**
 * A note's temporary file: hidden beside it and named for it, so a crash between writing and the
 * rename leaves no file that looks like a note (DEF-38); the note's next save clears it.
 */
const tempName = (path: string, n: number) => join(dirname(path), `.${basename(path)}.${process.pid}.${n}.focus-notes.tmp`);
const TEMP_TAIL = /^\.(\d+)\.\d+\.focus-notes\.tmp$/;

/** Removes the temporary files a crashed instance left beside a note; never this instance's. */
async function clearLeftTemps(path: string): Promise<void> {
  const head = `.${basename(path)}`;
  const names = await readdir(dirname(path)).catch(() => [] as string[]);
  for (const name of names) {
    const m = name.startsWith(head) ? TEMP_TAIL.exec(name.slice(head.length)) : null;
    if (m && Number(m[1]) !== process.pid) await rm(join(dirname(path), name), { force: true }).catch(() => {});
  }
}

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
  /**
   * Main-owned identity/conflict authority, never a renderer-supplied resolver. Absent until the
   * desktop lifecycle owns these facts: preparation then fails closed, not a guessed identity.
   */
  rewriteIdentity?(path: string): Promise<{ domain: RewriteDomain; noteKey: string; conflict: boolean }>;
}

type RewriteDomain = "public" | "private" | "local";
const REWRITE_REFUSALS = new Set(["rewrite-identity", "rewrite-unavailable", "rewrite-busy", "rewrite-cancelled", "rewrite-conflict", "rewrite-stale", "read-only"]);
export interface RewritePreparation {
  domain: RewriteDomain;
  noteKey: string;
  baselineHash: string;
  signal?: AbortSignal;
}
export interface RewriteSaveLease {
  readonly leaseId: string;
  readonly identity: Readonly<{ path: string; domain: RewriteDomain; noteKey: string; fileId: string }>;
  readonly baselineHash: string;
  /** This is a save hold, NOT an original checkpoint acknowledgement or permission to generate. */
  readonly generation: "blocked-durable-history-unavailable";
  release(): void;
}
interface RewriteHold {
  gate: Promise<void>;
  baseline?: string;
  fileId?: string;
}

export class NoteWriter {
  /** The write running or waiting per path. */
  readonly queues = new Map<string, Promise<unknown>>();
  #tmp = 0;
  /** The notes written this session: a note's left temporary files are cleared at its first save. */
  readonly #cleared = new Set<string>();
  readonly #hooks: NoteWriterHooks;
  readonly #rewriteHolds = new Map<string, RewriteHold>();

  constructor(hooks: NoteWriterHooks = {}) {
    this.#hooks = hooks;
  }

  /** Writes after the writes to the path before it; with `expected`, never over a change. */
  write(path: string, content: string, expected?: string): Promise<{ outside: string } | undefined> {
    const hold = this.#rewriteHolds.get(path);
    return this.#enqueue(path, async () => {
      await hold?.gate;
      // Even an otherwise unguarded writer cannot overwrite an outside edit across a rewrite hold.
      const result = await this.#now(path, content, expected ?? hold?.baseline, hold);
      if (hold?.baseline !== undefined && !result) {
        const now = await stat(path, { bigint: true });
        hold.fileId = `${now.dev}:${now.ino}:${now.birthtimeNs}`;
        hold.baseline = content;
      }
      return result;
    });
  }

  /** The same per-path lane used by every ordinary save; no second rewrite write queue. */
  #enqueue<T>(path: string, run: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    this.queues.set(path, next);
    void next.finally(() => { if (this.queues.get(path) === next) this.queues.delete(path); }).catch(() => {});
    return next;
  }

  /**
   * Reserve synchronously, inspect only after earlier writes/Git work, and hold subsequent saves.
   * No history storage is installed here. In particular this lease must never be passed as the
   * storage.original acknowledgement to RewriteSession. IPC/generation stay unavailable.
   */
  async prepareRewrite(path: string, request: RewritePreparation): Promise<RewriteSaveLease> {
    const { domain, noteKey, baselineHash, signal } = request;
    if (path !== resolve(path) || !/^[a-f0-9]{64}$/.test(baselineHash) || !noteKey) throw new Error("rewrite-identity");
    if (!this.#hooks.rewriteIdentity) throw new Error("rewrite-unavailable");
    if (this.#rewriteHolds.has(path)) throw new Error("rewrite-busy");
    if (signal?.aborted) throw new Error("rewrite-cancelled");
    let resume!: () => void;
    const gate = new Promise<void>((r) => { resume = r; });
    const release = () => {
      signal?.removeEventListener("abort", release);
      if (this.#rewriteHolds.get(path) === hold) this.#rewriteHolds.delete(path);
      resume();
    };
    const hold: RewriteHold = { gate };
    this.#rewriteHolds.set(path, hold);
    signal?.addEventListener("abort", release, { once: true });
    try {
      const preparing = this.#enqueue(path, async () => {
        await this.#hooks.ready?.(path);
        if (signal?.aborted) throw new Error("rewrite-cancelled");
        // Do not let a symlink/alias acquire a separate lease for the same note.
        if (await realpath(path) !== path) throw new Error("rewrite-identity");
        const identity = await this.#hooks.rewriteIdentity!(path);
        if (identity.domain !== domain || identity.noteKey !== noteKey) throw new Error("rewrite-identity");
        if (identity.conflict) throw new Error("rewrite-conflict");
        const before = await stat(path, { bigint: true });
        const bytes = await readFile(path);
        const after = await stat(path, { bigint: true });
        const foundHash = createHash("sha256").update(bytes).digest("hex");
        const source = bytes.toString("utf8");
        if (!before.isFile() || before.nlink !== 1n || before.dev !== after.dev || before.ino !== after.ino ||
            before.birthtimeNs !== after.birthtimeNs || before.mtimeNs !== after.mtimeNs || before.size !== after.size ||
            foundHash !== baselineHash || !Buffer.from(source, "utf8").equals(bytes)) throw new Error("rewrite-stale");
        if (signal?.aborted) throw new Error("rewrite-cancelled");
        hold.baseline = source;
        hold.fileId = `${after.dev}:${after.ino}:${after.birthtimeNs}`;
        return Object.freeze({
          leaseId: randomUUID(),
          identity: Object.freeze({ path, domain, noteKey, fileId: hold.fileId }),
          baselineHash: foundHash,
          generation: "blocked-durable-history-unavailable" as const,
          release,
        });
      });
      // Existing main file operations also await writeQueues, even if no save followed the hold.
      // Publish that barrier immediately; resolving preparation itself must not open the lane.
      void this.#enqueue(path, () => gate);
      return await preparing;
    } catch (error) {
      release();
      // No source/path-bearing filesystem errors cross the future preparation boundary.
      if (error instanceof Error && REWRITE_REFUSALS.has(error.message)) throw new Error(error.message);
      throw new Error("rewrite-unavailable");
    }
  }

  async #heldIdentity(path: string, hold: RewriteHold | undefined): Promise<void> {
    if (!hold?.fileId) return;
    const now = await stat(path, { bigint: true }).catch(() => undefined);
    if (!now || `${now.dev}:${now.ino}:${now.birthtimeNs}` !== hold.fileId) throw new Error("rewrite-stale");
  }

  async #now(path: string, content: string, expected: string | undefined, hold?: RewriteHold): Promise<{ outside: string } | undefined> {
    await this.#hooks.ready?.(path);
    await this.#heldIdentity(path, hold);
    await mkdir(dirname(path), { recursive: true });
    // Checked now that it's this write's turn: what a pull or an earlier write left is what counts.
    const found = await changedOutside(path, content, expected);
    if (found !== undefined) return { outside: found };
    const tmp = tempName(path, this.#tmp++);
    await writeFile(tmp, content, "utf8");
    try {
      // And again right before the rename: a change while the temporary file was written.
      const late = await changedOutside(path, content, expected);
      if (late !== undefined) {
        await rm(tmp, { force: true });
        return { outside: late };
      }
      await this.#heldIdentity(path, hold);
      await retrying(() => rename(tmp, path));
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    await this.#hooks.written?.(path, content);
    if (!this.#cleared.has(path)) {
      this.#cleared.add(path);
      void clearLeftTemps(path);
    }
    return undefined;
  }
}

export interface NoteSaveDeps {
  /** The note's absolute path; throws for anything but a Markdown file. */
  path(p: unknown): string;
  write(path: string, content: string, expected?: string): Promise<{ outside: string } | undefined>;
  /** The text last written here, or on disk, to measure how much changed (D-133). */
  before(path: string): Promise<string>;
  /** A save landed: remembered, and counted toward the next backup. */
  written(path: string, before: string, content: string): void;
  /** Waited for before the save is answered: crash recovery learns the note's new file (DEF-36). */
  landed?(path: string): Promise<void>;
}

/** The main process's `note:write`: the window's text, written only over what it expects there (DEF-26). */
export function noteSave(d: NoteSaveDeps) {
  return async (p: unknown, content: unknown, expected: unknown): Promise<{ outside: string } | undefined> => {
    if (typeof content !== "string") throw new Error("Content must be text");
    if (expected !== undefined && typeof expected !== "string") throw new Error("Expected text must be text");
    const path = d.path(p);
    const before = await d.before(path);
    // Never over another program's change: checked when the write's turn comes (D-92, DEF-26).
    const outside = await d.write(path, content, expected);
    if (outside) return outside;
    d.written(path, before, content);
    // The window renames the file to follow its title only after this answer, so the draft's file ID is right first.
    await d.landed?.(path).catch(() => {});
    return undefined;
  };
}

/**
 * A refused batch puts a note's text back (Files, D-94): only over the text the batch wrote, so a
 * change made since (another program, a pull) is never written over by the rollback (DEF-26).
 */
export const writeBack = (write: (path: string, content: string, expected?: string) => Promise<{ outside: string } | undefined>, path: string, old: string, written: string) =>
  write(path, old, written).then(() => {});
