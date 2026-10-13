/**
 * The status cache (PRF-07, Desktop and Git → The cache). One answer per repository, kept under a
 * key of the content generation and the times and sizes of Git's own files, for at most 30 s.
 * Only stable answers are stored, calls in flight are shared, failures are never stored, and a
 * commit asks fresh.
 */
import { stat } from "node:fs/promises";
import { join } from "node:path";

export const STATUS_MAX_AGE_MS = 30_000;

export interface StatusCacheOptions<T> {
  /** Runs `git status` (through the repository's queue). */
  ask(): Promise<T>;
  /** The key: changes whenever the answer might (content generation and Git's own files). */
  key(): Promise<string>;
  now?: () => number;
  maxAgeMs?: number;
}

export class StatusCache<T> {
  readonly #o: StatusCacheOptions<T>;
  #entry: { key: string; at: number; value: T } | undefined;
  #inflight: Promise<T> | undefined;
  /** Bumped by clear(), so an answer asked before a commit is never stored after it. */
  #epoch = 0;
  /** Git processes started, for the benchmark (PRF-07: count the work, not only the time). */
  asked = 0;

  constructor(options: StatusCacheOptions<T>) {
    this.#o = options;
  }

  #now(): number {
    return this.#o.now ? this.#o.now() : Date.now();
  }

  /** The cached answer if its key still matches and it's younger than the maximum age; otherwise asks Git, sharing a call already in flight. */
  async get(): Promise<T> {
    if (this.#inflight) return this.#inflight;
    const key = await this.#o.key();
    const e = this.#entry;
    if (e && e.key === key && this.#now() - e.at < (this.#o.maxAgeMs ?? STATUS_MAX_AGE_MS)) return e.value;
    if (this.#inflight) return this.#inflight;
    const run = this.#ask(key);
    this.#inflight = run;
    void run.then(() => {}, () => {}).finally(() => {
      if (this.#inflight === run) this.#inflight = undefined;
    });
    return run;
  }

  /** Always asks Git, never sharing a call that may have started before the latest change (commits use this). */
  fresh(): Promise<T> {
    return this.#o.key().then((key) => this.#ask(key));
  }

  /** Forgets the answer: after the app commits, pushes, pulls, or discards. */
  clear(): void {
    this.#entry = undefined;
    this.#inflight = undefined;
    this.#epoch++;
  }

  async #ask(before: string): Promise<T> {
    const epoch = this.#epoch;
    const at = this.#now();
    this.asked++;
    // A failure is thrown to the caller and never stored.
    const value = await this.#o.ask();
    const after = await this.#o.key();
    // Only a stable answer is stored: nothing changed while Git was answering.
    if (before === after && epoch === this.#epoch) this.#entry = { key: after, at, value };
    return value;
  }
}

/** Git's own files whose times and sizes change with commits, fetches, checkouts, and staging, from any tool. */
export function gitFiles(branch?: string, upstream?: string): string[] {
  const files = ["index", "HEAD", join("logs", "HEAD"), "packed-refs", "FETCH_HEAD"];
  if (branch) files.push(join("refs", "heads", ...branch.split("/")));
  if (upstream) files.push(join("refs", "remotes", ...upstream.split("/")));
  return files;
}

/** The modification time and size of each file in each folder (the worktree's Git folder and the common one). */
export async function filesKey(dirs: string[], files: string[], statFile: (p: string) => Promise<{ mtimeMs: number; size: number }> = stat): Promise<string> {
  const paths = [...new Set(dirs)].flatMap((d) => files.map((f) => join(d, f)));
  const parts = await Promise.all(paths.map((p) => statFile(p).then((s) => `${s.mtimeMs}:${s.size}`, () => "-")));
  return parts.join("|");
}
