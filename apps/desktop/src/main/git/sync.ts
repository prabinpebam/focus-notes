/**
 * Save and sync (EDT-11, FIL-05, PRF-07; Desktop and Git → Save and sync). The workspace folder's
 * repository and its `private/` submodule, each with one queue and one cached status. Notes are
 * committed by path on the cadence of D-23, each Files batch is one commit (D-94, D-95), private
 * changes are committed and pushed before the notes repository's pointer moves (D-07 as amended by
 * D-90), and pulls rebase only when they can apply cleanly; otherwise nothing is touched and the
 * problem is reported (conflicts are WP-3.5).
 */
import { realpathSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { StatusCache, filesKey, gitFiles } from "./cache.ts";
import { Cadence, FETCH_EVERY_MS, POINTER_GAP_MS, pointerDelay, retryDelay, systemClock, type Clock, type SyncReason } from "./cadence.ts";
import { releaseLock, takeLock } from "./lock.ts";
import { batchMessage, changesOf, pointerMessage, saveMessage, type BatchOp, type Change } from "./message.ts";
import type { SyncProblem, SyncReport } from "@focus-notes/core";
import { Queue, commitProblem, createRunner, networkProblem, type GitRunner } from "./run.ts";
import { STATUS_ARGS, covers, parseStatus, pointerMoved, trackedChanges, type RepoStatus } from "./status.ts";

export const NO_GIT: SyncReport = { git: false, state: "idle", waiting: 0 };

/** A Files batch with absolute paths, as the main process applied it. */
export type AbsoluteOp = BatchOp;

interface Repo {
  name: "notes" | "private";
  dir: string;
  gitDir: string;
  commonDir: string;
  queue: Queue;
  cache: StatusCache<RepoStatus>;
  /** Repository-relative paths the app changed since they were last committed, with the generation of the change. */
  pending: Map<string, number>;
  /** Renames the app made (a file name following its title), so the commit says Rename. */
  moves: [string, string][];
  last?: RepoStatus;
}

export interface GitSyncOptions {
  /** The workspace folder: the notes repository's own folder (a folder inside another repository isn't one). */
  folder: string;
  run?: GitRunner;
  clock?: Clock;
  idleMs?: number;
  pointerGapMs?: number;
  fetchEveryMs?: number;
  onReport?: (r: SyncReport) => void;
  /** Logs counts and problems, never paths or note text. */
  log?: (line: string) => void;
}

const MIN_GIT: [number, number] = [2, 31];
const PRIVATE = "private";
const posix = (p: string) => p.split(sep).join("/");
const inside = (base: string, p: string) => {
  const r = relative(base, p);
  return r !== "" && !r.startsWith("..") && !isAbsolute(r);
};
const realOf = (p: string) => {
  try {
    const r = realpathSync.native(p);
    return process.platform === "win32" || process.platform === "darwin" ? r.toLowerCase() : r;
  } catch {
    return undefined;
  }
};

export class GitSync {
  readonly notes: Repo;
  readonly privateRepo: Repo | undefined;
  readonly #run: GitRunner;
  readonly #clock: Clock;
  readonly #o: GitSyncOptions;
  readonly #cadence: Cadence;
  /** Syncs and batches run one at a time; each repository's commands also have their own queue. */
  readonly #ops = new Queue();
  #queued: { reasons: Set<SyncReason>; done: Promise<SyncReport> } | undefined;
  #generation = 0;
  #locked = false;
  #report: SyncReport = { git: true, state: "idle", waiting: 0 };
  #lastPointerAt: number | undefined;
  #pointerTimer: unknown;
  #retryTimer: unknown;
  #retries = 0;
  #fetchTimer: unknown;
  #lastFetchAt = -Infinity;
  #rebasing: Promise<void> | undefined;
  #disposed = false;
  #quitting = false;

  private constructor(o: GitSyncOptions, run: GitRunner, notes: Omit<Repo, "cache" | "queue" | "pending" | "moves" | "name">, priv: Omit<Repo, "cache" | "queue" | "pending" | "moves" | "name"> | undefined) {
    this.#o = o;
    this.#run = run;
    this.#clock = o.clock ?? systemClock;
    this.notes = this.#repo("notes", notes);
    this.privateRepo = priv ? this.#repo("private", priv) : undefined;
    this.#cadence = new Cadence({ clock: this.#clock, ...(o.idleMs !== undefined ? { idleMs: o.idleMs } : {}), sync: (r) => void this.sync(r) });
  }

  /** Opens the workspace's repositories, or resolves undefined when it isn't one (or Git is missing or too old). */
  static async open(o: GitSyncOptions): Promise<GitSync | undefined> {
    const run = o.run ?? createRunner();
    const probe = async (dir: string) => {
      const r = await run({ cwd: dir, args: ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"], read: true });
      if (r.code !== 0) return undefined;
      const [top, gitDir, commonDir] = r.stdout.split(/\r?\n/);
      // Only the folder's own repository: never a parent repository the folder happens to sit in.
      if (!top || !gitDir || !commonDir || realOf(top) !== realOf(dir)) return undefined;
      return { dir, gitDir: resolve(gitDir), commonDir: resolve(commonDir) };
    };
    const privateDir = join(o.folder, PRIVATE);
    const [version, notes, priv] = await Promise.all([run({ cwd: o.folder, args: ["version"], read: true }), probe(o.folder), probe(privateDir)]);
    const v = /git version (\d+)\.(\d+)/.exec(version.stdout);
    if (!notes || !v || Number(v[1]) < MIN_GIT[0] || (Number(v[1]) === MIN_GIT[0] && Number(v[2]) < MIN_GIT[1])) return undefined;
    const sync = new GitSync(o, run, notes, priv);
    // A pointer must never reference a private commit that hasn't been pushed (D-07).
    if (priv) await run({ cwd: o.folder, args: ["config", "push.recurseSubmodules", "check"] });
    sync.#locked = await takeLock(notes.commonDir).catch(() => false);
    // The first answer names each branch and upstream, whose ref files key the cache from then on.
    await Promise.all([sync.notes.cache.fresh(), sync.privateRepo?.cache.fresh()]).catch(() => {});
    sync.#scheduleFetch();
    sync.#emit(sync.#locked ? { state: "idle" } : { state: "problem", problem: "locked" });
    // The app learns there's a repository even when nothing went wrong.
    sync.#o.onReport?.(sync.#report);
    return sync;
  }

  #repo(name: Repo["name"], r: Omit<Repo, "cache" | "queue" | "pending" | "moves" | "name">): Repo {
    const queue = new Queue();
    const repo: Repo = {
      ...r, name, queue, pending: new Map(), moves: [],
      cache: new StatusCache<RepoStatus>({
        now: () => this.#clock.now(),
        key: async () => `${this.#generation}|${await filesKey([r.gitDir, r.commonDir], gitFiles(repo.last?.branch, repo.last?.upstream))}`,
        ask: () => queue.run(async () => {
          const res = await this.#run({ cwd: r.dir, args: [...STATUS_ARGS], read: true });
          if (res.code !== 0) throw new Error(`git status failed (${res.code})`);
          repo.last = parseStatus(res.stdout);
          return repo.last;
        }),
      }),
    };
    return repo;
  }

  get report(): SyncReport {
    return this.#report;
  }

  /**
   * Where a path belongs: the private repository, or the notes repository. Nothing under `private/`
   * ever belongs to the notes repository: without a private repository, private notes stay
   * uncommitted rather than public (SHR-02).
   */
  #locate(abs: string): { repo: Repo; rel: string } | undefined {
    if (this.privateRepo && inside(this.privateRepo.dir, abs)) return { repo: this.privateRepo, rel: posix(relative(this.privateRepo.dir, abs)) };
    if (!inside(this.notes.dir, abs)) return undefined;
    const rel = posix(relative(this.notes.dir, abs));
    return rel === PRIVATE || rel.startsWith(`${PRIVATE}/`) ? undefined : { repo: this.notes, rel };
  }
  /** Whether a path is private: under `private/`, whether or not that's a repository. */
  #isPrivate(abs: string): boolean {
    const r = relative(this.notes.dir, abs);
    return inside(join(this.notes.dir, PRIVATE), abs) || posix(r) === PRIVATE;
  }

  /** Any change to the workspace's files: the status cache's key changes at once. */
  changed(): void {
    this.#generation++;
  }

  /** The app wrote a note: it's committed on the cadence (D-23). */
  written(abs: string): void {
    this.#touch(abs);
    this.#cadence.edited();
  }

  /** The app renamed a note (a file name following its title): committed with the next save, as a rename. */
  renamed(from: string, to: string): void {
    const a = this.#locate(from);
    const b = this.#locate(to);
    this.#touch(from);
    this.#touch(to);
    if (a && b && a.repo === b.repo) a.repo.moves.push([a.rel, b.rel]);
  }

  #touch(abs: string): void {
    this.#generation++;
    const at = this.#locate(abs);
    if (at) at.repo.pending.set(at.rel, this.#generation);
  }

  /** Commit and push now: Mod+S, switching or closing a note, quitting (D-23). The idle commit isn't needed then. */
  request(reason: SyncReason): Promise<SyncReport> {
    this.#cadence.cancel();
    return this.sync(reason);
  }

  /** The window became active: fetch, at most every 30 s (Desktop and Git → Save and sync, step 5). */
  focused(): void {
    if (this.#clock.now() - this.#lastFetchAt >= 30_000) void this.sync("fetch");
  }

  /** Writes wait while a pull rewrites files, so a pull never mixes with a save. */
  writable(): Promise<void> {
    return this.#rebasing ?? Promise.resolve();
  }

  /** What changed, from the cache (PRF-07): never makes a view wait for a commit. */
  async status(): Promise<SyncReport> {
    const all = await Promise.all([this.notes, this.privateRepo].filter((r): r is Repo => !!r).map((r) => r.cache.get().catch(() => undefined)));
    this.#emit({ waiting: this.#waiting(all) });
    return this.#report;
  }

  #waiting(statuses: (RepoStatus | undefined)[]): number {
    return [this.notes, this.privateRepo].reduce((n, r) => n + (r?.pending.size ?? 0), 0) + statuses.reduce((n, s) => n + (s?.upstream ? s.ahead : 0), 0);
  }

  /** Commits and pushes (or only pushes and pulls, for the app's own reasons). Calls made while one runs share the next run. */
  sync(reason: SyncReason): Promise<SyncReport> {
    if (this.#queued) {
      this.#queued.reasons.add(reason);
      return this.#queued.done;
    }
    const reasons = new Set<SyncReason>([reason]);
    const done = this.#ops.run(() => {
      this.#queued = undefined;
      return this.#syncNow(reasons);
    });
    this.#queued = { reasons, done };
    return done;
  }

  /**
   * One Files batch, one commit in each repository it touches (FIL-05, D-94), the private one first.
   * A move between the roots is the delete in one repository and the add in the other (FIL-06).
   * Resolves after the commits; pushing, and then the pointer, follow in the background (D-97).
   */
  commitBatch(ops: AbsoluteOp[]): Promise<SyncProblem | undefined> {
    for (const op of ops) for (const p of op.op === "move" ? [op.from, op.to] : [op.path]) this.#touch(p);
    const done = this.#ops.run(async () => {
      if (!(await this.#lock())) return this.#fail("locked");
      let problem: SyncProblem | undefined;
      for (const repo of [this.privateRepo, this.notes]) {
        if (!repo) continue;
        const rel: BatchOp[] = [];
        for (const op of ops) {
          if (op.op === "move") {
            const a = this.#locate(op.from);
            const b = this.#locate(op.to);
            if (a?.repo === repo && b?.repo === repo) rel.push({ op: "move", from: a.rel, to: b.rel });
            else if (a?.repo === repo || b?.repo === repo) {
              // Across repositories: what left this one, or what arrived in it.
              rel.push({ op: "visibility", path: (a?.repo === repo ? a : b)!.rel, to: this.#isPrivate(op.to) ? "private" : "public" });
            }
          } else {
            const a = this.#locate(op.path);
            if (a?.repo === repo) rel.push({ ...op, path: a.rel });
          }
        }
        if (!rel.length) continue;
        const paths = rel.flatMap((o) => (o.op === "move" ? [o.from, o.to] : [o.path]));
        const moves = rel.flatMap((o): [string, string][] => (o.op === "move" ? [[o.from, o.to]] : []));
        const st = await repo.cache.fresh().catch(() => undefined);
        if (!st) {
          problem ??= "failed";
          continue;
        }
        problem ??= await this.#commit(repo, st, paths, (changes) => batchMessage(rel, changes), moves);
      }
      this.#emit(problem ? { state: "problem", problem } : { state: "idle" });
      return problem;
    });
    // Pushing (and the pointer) follows, without making the Files panel wait for the network.
    void done.then(() => this.sync("batch"));
    return done;
  }

  /** The final sync when the app quits: commit, push, and move the pointer whatever the gap. Then the lock is released. */
  async quit(): Promise<SyncReport> {
    this.#quitting = true;
    const r = await this.request("quit");
    await this.dispose();
    return r;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cadence.dispose();
    for (const t of [this.#pointerTimer, this.#retryTimer, this.#fetchTimer]) if (t !== undefined) this.#clock.clearTimeout(t);
    if (this.#locked) await releaseLock(this.notes.commonDir).catch(() => {});
  }

  async #lock(): Promise<boolean> {
    if (!this.#locked) this.#locked = await takeLock(this.notes.commonDir).catch(() => false);
    return this.#locked;
  }

  #emit(patch: Partial<SyncReport>): void {
    const next: SyncReport = { ...this.#report, ...patch };
    if (next.state !== "problem") delete next.problem;
    const same = next.state === this.#report.state && next.problem === this.#report.problem && next.waiting === this.#report.waiting;
    this.#report = next;
    if (same) return;
    try {
      this.#o.onReport?.(next);
    } catch {
      // Whoever listens can't stop a sync.
    }
  }

  #fail(problem: SyncProblem): SyncProblem {
    this.#o.log?.(`git-problem ${problem}`);
    return problem;
  }

  async #syncNow(reasons: Set<SyncReason>): Promise<SyncReport> {
    if (this.#disposed) return this.#report;
    if (!(await this.#lock())) {
      this.#emit({ state: "problem", problem: this.#fail("locked") });
      return this.#report;
    }
    this.#emit({ state: "syncing" });
    const commitSaves = ["save", "switch", "idle", "quit"].some((r) => reasons.has(r as SyncReason));
    const fetch = reasons.has("fetch");
    if (fetch) this.#lastFetchAt = this.#clock.now();
    const problems: SyncProblem[] = [];
    const note = (p: SyncProblem | undefined) => void (p && problems.push(p));
    try {
      const [privSt, notesSt] = await Promise.all([this.privateRepo?.cache.fresh(), this.notes.cache.fresh()]);
      // Private first: committed and pushed before the notes repository's pointer may move (D-07).
      let privateChanged = false;
      if (this.privateRepo && privSt) {
        let st: RepoStatus | undefined = privSt;
        if (commitSaves && this.privateRepo.pending.size) {
          const before = st.oid;
          note(await this.#commit(this.privateRepo, st, [...this.privateRepo.pending.keys()], saveMessage, this.privateRepo.moves));
          st = await this.privateRepo.cache.fresh();
          privateChanged = st.oid !== before;
        }
        const ex = await this.#exchange(this.privateRepo, st, fetch);
        note(ex.problem);
        privateChanged ||= ex.moved;
      }
      let st = privateChanged ? await this.notes.cache.fresh() : notesSt;
      const extra: string[] = [];
      let pointerOid: string | undefined;
      if (this.privateRepo && pointerMoved(st, PRIVATE)) {
        const p = await this.privateRepo.cache.fresh();
        // Only a pushed private commit (or a workspace with no remotes at all) may be pointed to.
        const pushed = p.upstream ? p.ahead === 0 : !st.upstream;
        const wait = pointerDelay(this.#lastPointerAt, this.#clock.now(), this.#o.pointerGapMs ?? POINTER_GAP_MS);
        if (pushed && p.oid && (wait === 0 || reasons.has("quit"))) {
          extra.push(PRIVATE);
          pointerOid = p.oid;
        } else if (pushed && this.#pointerTimer === undefined && !this.#disposed) {
          this.#pointerTimer = this.#clock.setTimeout(() => {
            this.#pointerTimer = undefined;
            void this.sync("pointer");
          }, wait);
        }
      }
      const saves = commitSaves ? [...this.notes.pending.keys()] : [];
      if (saves.length || extra.length) {
        const before = st.oid;
        note(await this.#commit(this.notes, st, [...saves, ...extra], (changes) => {
          const own = changes.filter((c) => c.path !== PRIVATE);
          const pointer = pointerOid ? pointerMessage(pointerOid) : "";
          if (!own.length) return pointer;
          const msg = saveMessage(own);
          return pointer ? `${msg}${msg.includes("\n\n") ? "\n" : "\n\n"}${pointer}` : msg;
        }, this.notes.moves));
        st = await this.notes.cache.fresh();
        if (pointerOid && st.oid !== before) this.#lastPointerAt = this.#clock.now();
      }
      note((await this.#exchange(this.notes, st, fetch)).problem);
    } catch {
      note("failed");
    }
    const problem = problems[0];
    this.#o.log?.(`git-sync reasons=${[...reasons].join(",")} problem=${problem ?? "none"}`);
    if (problem === "offline") this.#retry();
    else this.#retries = 0;
    this.#emit({ ...(problem ? { state: "problem", problem: this.#fail(problem) } : { state: "idle" }), waiting: this.#waiting([this.notes.last, this.privateRepo?.last]) });
    return this.#report;
  }

  #retry(): void {
    if (this.#retryTimer !== undefined || this.#disposed) return;
    this.#retryTimer = this.#clock.setTimeout(() => {
      this.#retryTimer = undefined;
      void this.sync("retry");
    }, retryDelay(this.#retries++));
  }

  #scheduleFetch(): void {
    if (this.#disposed) return;
    this.#fetchTimer = this.#clock.setTimeout(() => {
      void this.sync("fetch").finally(() => this.#scheduleFetch());
    }, this.#o.fetchEveryMs ?? FETCH_EVERY_MS);
  }

  #git(repo: Repo, args: string[], input?: string, timeoutMs?: number) {
    return repo.queue.run(() => this.#run({ cwd: repo.dir, args, ...(input !== undefined ? { input } : {}), ...(timeoutMs ? { timeoutMs } : {}) }));
  }

  /**
   * Stages exactly the entries under the given paths (never `git add -A` on the whole tree), and
   * commits only them, with a readable message. Pathspecs and the message go through standard
   * input and a file in the Git folder, so note names never appear in process arguments.
   */
  async #commit(repo: Repo, st: RepoStatus, paths: string[], message: (changes: Change[]) => string, moves: [string, string][]): Promise<SyncProblem | undefined> {
    const snapshot = new Map([...repo.pending].filter(([p]) => paths.some((c) => covers(c, p) || covers(p, c))));
    const entries = st.entries.filter((e) => e.kind !== "ignored" && paths.some((c) => covers(c, e.path) || (e.from !== undefined && covers(c, e.from))));
    const settle = () => {
      for (const [p, g] of snapshot) if (repo.pending.get(p) === g) repo.pending.delete(p);
      repo.moves = repo.moves.filter((m) => !paths.includes(m[1]));
    };
    if (!entries.length) {
      settle();
      return undefined;
    }
    const specs = [...new Set(entries.flatMap((e) => (e.from !== undefined ? [e.path, e.from] : [e.path])))].join("\0");
    const add = await this.#git(repo, ["add", "--all", "--pathspec-from-file=-", "--pathspec-file-nul"], specs);
    if (add.code !== 0) return commitProblem(add.stderr);
    const file = join(repo.gitDir, "FOCUS_NOTES_COMMIT_MSG");
    await writeFile(file, `${message(changesOf(entries, moves))}\n`, "utf8");
    try {
      const commit = await this.#git(repo, ["commit", "--quiet", "--cleanup=strip", `--file=${file}`, "--pathspec-from-file=-", "--pathspec-file-nul"], specs);
      repo.cache.clear();
      if (commit.code !== 0) return commitProblem(commit.stderr);
    } finally {
      await rm(file, { force: true });
    }
    settle();
    this.#o.log?.(`git-commit repo=${repo.name} files=${entries.length}`);
    return undefined;
  }

  /**
   * Pushes the app's commits, and pulls when the branch is behind and its tracked files are clean.
   * A rejected push fetches, rebases the app's own commits, and retries once; a rebase that can't
   * apply cleanly is aborted, so the repository is never left mid-rebase and no text is lost.
   */
  async #exchange(repo: Repo, st: RepoStatus, fetch: boolean): Promise<{ problem?: SyncProblem; moved: boolean }> {
    if (!st.upstream) return { moved: false };
    // Quitting doesn't wait long for the network: unpushed commits stay safe and push next time.
    const timeout = this.#quitting ? 15_000 : undefined;
    let moved = false;
    const pull = async (): Promise<SyncProblem | undefined> => {
      const f = await this.#git(repo, ["fetch", "--quiet", "--no-recurse-submodules"], undefined, timeout);
      repo.cache.clear();
      if (f.code !== 0) return networkProblem(f.stderr);
      st = await repo.cache.fresh();
      if (st.behind === 0) return undefined;
      if (trackedChanges(st).length) return st.ahead > 0 ? "conflict" : undefined;
      const p = await this.#rebase(repo);
      st = await repo.cache.fresh();
      if (!p) moved = true;
      return p;
    };
    if (fetch || st.behind > 0) {
      const p = await pull();
      // Offline while fetching only matters if there's something to push.
      if (p && (p !== "offline" || st.ahead > 0)) return { problem: p, moved };
    }
    if (st.ahead === 0) return { moved };
    const push = () => this.#git(repo, ["-c", "push.default=upstream", "push", "--quiet"], undefined, timeout);
    let r = await push();
    repo.cache.clear();
    if (r.code === 0) return { moved };
    const problem = networkProblem(r.stderr);
    if (problem !== "conflict") return { problem, moved };
    const p = await pull();
    if (p) return { problem: p, moved };
    r = await push();
    repo.cache.clear();
    return r.code === 0 ? { moved } : { problem: networkProblem(r.stderr), moved };
  }

  async #rebase(repo: Repo): Promise<SyncProblem | undefined> {
    let done!: () => void;
    this.#rebasing = new Promise((r) => (done = r));
    try {
      const r = await this.#git(repo, ["-c", "rebase.autoStash=false", "rebase", "--quiet", "@{upstream}"]);
      if (r.code === 0) return undefined;
      // Never left mid-rebase: the app's commits and the working tree go back to how they were.
      await this.#git(repo, ["rebase", "--abort"]);
      return "conflict";
    } finally {
      repo.cache.clear();
      this.#rebasing = undefined;
      done();
    }
  }
}
