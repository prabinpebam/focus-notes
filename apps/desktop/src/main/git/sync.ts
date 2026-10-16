/**
 * Save and sync (EDT-11, FIL-05, PRF-07; Desktop and Git → Save and sync). The workspace folder's
 * repository and its `private/` submodule, each with one queue and one cached status. Notes are
 * committed by path when the backup policy says (D-133), each Files batch is one commit (D-94, D-95), private
 * changes are committed and pushed before the notes repository's pointer moves (D-07 as amended by
 * D-90), and pulls rebase only when they can apply cleanly; otherwise nothing is touched and the
 * problem is reported (conflicts are WP-3.5).
 */
import { existsSync, realpathSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { conflictCopy, deletedId, DELETED_LOG_ARGS, parseDeletedId, parseDeletedLog, isVersionFile, parseVersionLog, recentDeletions, RECENTLY_DELETED_DAYS, titleOrName, VERSION_LOG_ARGS, type DeletedNote, type NoteVersion } from "@focus-notes/core/history";
import { StatusCache, filesKey, gitFiles } from "./cache.ts";
import { Cadence, FETCH_EVERY_MS, type BackupPolicy, POINTER_GAP_MS, pointerDelay, retryDelay, systemClock, type Clock, type SyncReason } from "./cadence.ts";
import { releaseLock, takeLock } from "./lock.ts";
import { AGENT_TRAILER, agentMessage, agentMovesOf, agentNoteOf, agentOf, batchMessage, changesOf, pointerMessage, resolveMessage, saveMessage, undoAgentMessage, type BatchOp, type Change } from "./message.ts";
import type { ConflictChoice, NoteConflict, SyncProblem, SyncReport } from "@focus-notes/core";
import type { RepoHealth } from "@focus-notes/core/diagnostics";
import { bothChanged, changedAt, divergence, GitFailed, readBlobs, settle, treeNames, type Exec, type Settle } from "./resolve.ts";
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
  /** The backup policy's thresholds (D-133): the journeys shorten them. */
  policy?: Partial<BackupPolicy>;
  pointerGapMs?: number;
  fetchEveryMs?: number;
  onReport?: (r: SyncReport) => void;
  /**
   * Whether a push may go to a remote's URL (D-157): to a template it's refused with `template`, and
   * to a URL that can't be read as owner/name with `unreadableRemote`; the commits stay here. Every
   * push URL of the remote is checked, before the push and again before a retry.
   */
  checkRemote?: (url: string) => Promise<"ok" | "template" | "unreadable">;
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
    this.#cadence = new Cadence({ clock: this.#clock, ...(o.policy ? { policy: o.policy } : {}), sync: (r) => void this.sync(r) });
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

  /**
   * The app wrote a note, changing this many characters (unknown counts as a meaningful change):
   * it's backed up when the policy says (D-133), and the app hears at once that changes wait (D-132).
   */
  written(abs: string, chars?: number): void {
    this.#touch(abs);
    this.#cadence.edited(chars);
    this.#emit({ waiting: this.#waiting([this.notes.last, this.privateRepo?.last]) });
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

  /**
   * Back up now: Save to cloud and quitting always; switching or closing a note only when the
   * policy's thresholds are met (D-133). The timer isn't needed then.
   */
  request(reason: SyncReason): Promise<SyncReport> {
    if (reason === "switch" && !this.#cadence.meets()) return Promise.resolve(this.#report);
    this.#cadence.taken();
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

  // ---- agents (AGT-04, D-145) ----

  /**
   * One agent write as its own commit, `Agent edit: <note>` with the `Focus-Notes-Agent` trailer.
   * The writer's own uncommitted changes to these paths are committed first, so the agent's commit
   * holds only the agent's change and Undo restores the note exactly. All paths must be in one
   * repository; otherwise nothing is applied. Pushing follows in the background.
   */
  agentChange(c: { client: string; note: string; paths: string[]; moves?: [string, string][]; apply: () => Promise<void> }): Promise<{ problem?: SyncProblem; commit?: string }> {
    const done = this.#ops.run(async (): Promise<{ problem?: SyncProblem; commit?: string }> => {
      if (!(await this.#lock())) return { problem: this.#fail("locked") };
      const at = [c.note, ...c.paths].map((p) => this.#locate(p));
      const repo = at[0]?.repo;
      if (!repo || at.some((a) => a?.repo !== repo)) return { problem: this.#fail("failed") };
      const rel = at.slice(1).map((a) => a!.rel);
      const moves = (c.moves ?? []).map(([f, t]): [string, string] => [this.#locate(f)?.rel ?? "", this.#locate(t)?.rel ?? ""]);
      const head = async () => (await this.#git(repo, ["rev-parse", "--verify", "-q", "HEAD"])).stdout.trim();
      const st = await repo.cache.fresh().catch(() => undefined);
      if (!st) return { problem: this.#fail("failed") };
      const mine = await this.#commit(repo, st, rel, saveMessage, repo.moves);
      if (mine) return { problem: this.#fail(mine) };
      const before = await head();
      // A write that fails partway is still the agent's: what it changed is committed as the agent's, then the failure is reported.
      let failure: { error: unknown } | undefined;
      try {
        await c.apply();
      } catch (error) {
        failure = { error };
      }
      for (const p of c.paths) this.#touch(p);
      repo.cache.clear();
      const after = await repo.cache.fresh().catch(() => undefined);
      if (!after) return { problem: this.#fail("failed") };
      const problem = await this.#commit(repo, after, rel, (changes) => agentMessage(at[0]!.rel, changes, c.client), moves);
      if (failure) throw failure.error;
      if (problem) return { problem: this.#fail(problem) };
      const commit = await head();
      return commit && commit !== before ? { commit } : {};
    });
    void done.then(() => this.sync("batch"), () => this.sync("batch"));
    return done;
  }

  /**
   * Undo an agent's commit (AGT-04): its notes go back to how they were before it, as a new commit
   * by the writer. Refused when it isn't an agent commit named by its full ID, or when any of its
   * notes changed since, committed or not, so Undo never overwrites later writing.
   */
  undoAgentChange(which: "notes" | "private", oid: string): Promise<{ problem?: SyncProblem | "changed" | "notAgent" }> {
    const done = this.#ops.run(async (): Promise<{ problem?: SyncProblem | "changed" | "notAgent" }> => {
      const repo = which === "private" ? this.privateRepo : this.notes;
      if (!repo || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(oid)) return { problem: "notAgent" };
      if (!(await this.#lock())) return { problem: this.#fail("locked") };
      const msg = await this.#git(repo, ["log", "-1", "--format=%ae%x00%B", oid, "--"]);
      const [author, body = ""] = msg.stdout.split("\0");
      const note = agentNoteOf(body);
      if (msg.code !== 0 || !agentOf(body) || !note) return { problem: "notAgent" };
      // Only a commit in this branch's history: another branch's change isn't in these notes to undo.
      if ((await this.#git(repo, ["merge-base", "--is-ancestor", oid, "HEAD"])).code !== 0) return { problem: "notAgent" };
      // Made on this computer, by the identity the app commits as: a trailer alone proves nothing.
      const me = (await this.#git(repo, ["config", "user.email"])).stdout.trim();
      if (!me || author?.trim().toLowerCase() !== me.toLowerCase()) return { problem: "notAgent" };
      const names = async (args: string[]) => {
        const r = await this.#git(repo, ["diff-tree", "-r", "-z", "--name-only", "--no-renames", ...args]);
        return r.code === 0 ? r.stdout.split("\0").filter(Boolean) : undefined;
      };
      const paths = await names(["--no-commit-id", oid]);
      const since = await names([oid, "HEAD"]);
      // Exactly its note and the moves it describes, all under the notes folder: nothing else is undone in its name.
      const expected = new Set([note, ...agentMovesOf(body).flat()]);
      if (!paths || paths.length !== expected.size || !paths.every((p) => expected.has(p) && p.startsWith("notes/"))) return { problem: "notAgent" };
      repo.cache.clear();
      const st = await repo.cache.fresh().catch(() => undefined);
      if (!paths?.length || !since || !st) return { problem: this.#fail("failed") };
      const touched = (p: string) => since.includes(p) || repo.pending.has(p) || st.entries.some((e) => e.kind !== "ignored" && (e.path === p || e.from === p));
      if (paths.some(touched)) return { problem: "changed" };
      const restore = await this.#git(repo, ["restore", `--source=${oid}^`, "--worktree", "--pathspec-from-file=-", "--pathspec-file-nul"], paths.join("\0"));
      if (restore.code !== 0) return { problem: this.#fail("failed") };
      for (const p of paths) this.#touch(join(repo.dir, p));
      repo.cache.clear();
      const now = await repo.cache.fresh().catch(() => undefined);
      if (!now) return { problem: this.#fail("failed") };
      const problem = await this.#commit(repo, now, paths, () => undoAgentMessage(note), []);
      return problem ? { problem: this.#fail(problem) } : {};
    });
    void done.then(() => this.sync("batch"), () => this.sync("batch"));
    return done;
  }

  /** Recent agent changes (AGT-04): agent commits in both repositories, newest first. */
  async agentChanges(limit = 50): Promise<{ repo: "notes" | "private"; commit: string; at: number; agent: string; path: string }[]> {
    const out: { repo: "notes" | "private"; commit: string; at: number; agent: string; path: string }[] = [];
    for (const repo of [this.notes, this.privateRepo]) {
      if (!repo) continue;
      const r = await repo.queue.run(() => this.#run({ cwd: repo.dir, args: ["log", `-n${Math.max(1, Math.floor(limit))}`, `--grep=^${AGENT_TRAILER}: `, "--format=%H%x1f%ct%x1f%B%x1e", "HEAD", "--"], read: true }));
      if (r.code !== 0) continue;
      for (const rec of r.stdout.split("\x1e")) {
        const [commit, ct, body] = rec.replace(/^\s+/, "").split("\x1f");
        const agent = body ? agentOf(body) : undefined;
        const path = body ? agentNoteOf(body) : undefined;
        if (commit && agent && path) out.push({ repo: repo.name, commit, at: Number(ct) * 1000, agent, path });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }

  // ---- conflicts (FIL-12) ----

  #exec(repo: Repo): Exec {
    return (args, o = {}) => repo.queue.run(() => this.#run({ cwd: repo.dir, args, ...(o.input !== undefined ? { input: o.input } : {}), ...(o.env ? { env: o.env } : {}), ...(o.read ? { read: true } : {}) }));
  }

  /**
   * One repository's notes in conflict: changed on both sides since they parted, to different
   * text. This computer's side is the file as it is now, committed or not.
   */
  async #conflictsIn(repo: Repo, st: RepoStatus): Promise<{ rel: string; mine?: string; theirs?: string; theirsAt?: number; dirty: boolean }[]> {
    if (!st.upstream || st.behind === 0) return [];
    const exec = this.#exec(repo);
    const d = await divergence(exec);
    if (!d) return [];
    const dirty = new Set(st.entries.filter((e) => e.kind !== "ignored" && !e.sub.startsWith("S")).flatMap((e) => (e.from !== undefined ? [e.path, e.from] : [e.path])));
    const paths = new Set([...bothChanged(d), ...[...dirty].filter((p) => d.theirs.has(p))]);
    if (!paths.size) return [];
    const list = [...paths].sort();
    const [theirs, at] = await Promise.all([readBlobs(exec, list.map((p) => `${d.upstream}:${p}`)), changedAt(exec, d.base, d.upstream)]);
    const out: { rel: string; mine?: string; theirs?: string; theirsAt?: number; dirty: boolean }[] = [];
    for (const [i, rel] of list.entries()) {
      const mine = await readFile(join(repo.dir, ...rel.split("/")), "utf8").catch(() => undefined);
      if (mine === theirs[i]) continue;
      out.push({ rel, dirty: dirty.has(rel), ...(mine !== undefined ? { mine } : {}), ...(theirs[i] !== undefined ? { theirs: theirs[i] } : {}), ...(at.has(rel) ? { theirsAt: at.get(rel)! } : {}) });
    }
    return out;
  }

  /** Notes changed both here and elsewhere, private first, with both versions (FIL-12). */
  /** The repositories' health for the diagnostic report (QLT-04): counts only, never names, paths, or addresses. */
  async health(): Promise<RepoHealth[]> {
    const out: RepoHealth[] = [];
    for (const repo of [this.notes, this.privateRepo]) {
      if (!repo) continue;
      const st = await repo.cache.get().catch(() => undefined);
      const origin = await this.#run({ cwd: repo.dir, args: ["config", "--get", "remote.origin.url"], read: true }).catch(() => undefined);
      const url = origin?.code === 0 ? origin.stdout.trim() : "";
      out.push({
        role: repo.name, remote: !url ? "none" : /(^|[@/.])github\.com[:/]/i.test(url) ? "github" : "other",
        branch: Boolean(st?.branch), upstream: Boolean(st?.upstream), ahead: st?.ahead ?? 0, behind: st?.behind ?? 0,
        changed: st?.entries.filter((e) => e.kind !== "ignored").length ?? 0, unmerged: st?.entries.filter((e) => e.kind === "unmerged").length ?? 0,
      });
    }
    return out;
  }

  conflicts(): Promise<NoteConflict[]> {
    return this.#ops.run(async () => {
      const out: NoteConflict[] = [];
      for (const repo of [this.privateRepo, this.notes]) {
        if (!repo) continue;
        const st = await repo.cache.fresh().catch(() => undefined);
        if (!st) continue;
        for (const c of await this.#conflictsIn(repo, st).catch(() => [])) {
          out.push({ path: join(repo.dir, ...c.rel.split("/")), ...(c.mine !== undefined ? { mine: c.mine } : {}), ...(c.theirs !== undefined ? { theirs: c.theirs } : {}), ...(c.theirsAt !== undefined ? { theirsAt: c.theirsAt } : {}) });
        }
      }
      return out;
    });
  }

  /**
   * Settles conflicts as chosen (DD-FB-04), then syncs. In each repository the app's own unsaved
   * paths and the conflicting files are committed first, so this computer's version is a commit;
   * then the result is built on top of the other version and the branch moves there in one step.
   * A repository with a conflict that has no choice is left as it is ("Decide later").
   */
  async resolve(choices: ConflictChoice[]): Promise<SyncReport> {
    const problem = await this.#ops.run(async (): Promise<SyncProblem | undefined> => {
      if (!(await this.#lock())) return this.#fail("locked");
      let done!: () => void;
      this.#rebasing = new Promise((r) => (done = r));
      try {
        for (const repo of [this.privateRepo, this.notes]) {
          if (!repo) continue;
          let st = await repo.cache.fresh();
          const found = await this.#conflictsIn(repo, st);
          const chosen = new Map(choices.flatMap((c) => {
            const at = this.#locate(c.path);
            return at?.repo === repo ? [[at.rel, c] as const] : [];
          }));
          if (!found.length && !(st.ahead > 0 && st.behind > 0)) continue;
          if (found.some((f) => !chosen.has(f.rel))) continue;
          const commitFirst = [...repo.pending.keys(), ...found.filter((f) => f.dirty).map((f) => f.rel)];
          if (commitFirst.length) {
            for (const f of found) if (f.dirty) repo.pending.set(f.rel, ++this.#generation);
            const p = await this.#commit(repo, st, commitFirst, saveMessage, repo.moves);
            if (p) return this.#fail(p);
            st = await repo.cache.fresh();
          }
          const exec = this.#exec(repo);
          const d = await divergence(exec);
          if (!d) continue;
          const taken = new Set([...(await treeNames(exec, d.upstream)), ...(await treeNames(exec, d.head))]);
          const settles = new Map<string, Settle>();
          const lines: Parameters<typeof resolveMessage>[0] = [];
          const deleted: string[] = [];
          for (const f of found) {
            const c = chosen.get(f.rel)!;
            let copy: Settle["copy"];
            // A copy keeps this computer's version whenever it isn't the one kept at the path.
            if (c.choice !== "mine" && f.mine !== undefined) {
              const dir = dirname(f.rel) === "." ? "" : posix(dirname(f.rel));
              const names = [...taken].filter((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") === dir).map((p) => p.split("/").at(-1)!);
              const here = await readdir(join(repo.dir, ...dir.split("/").filter(Boolean))).catch(() => [] as string[]);
              copy = conflictCopy({ path: f.rel, text: f.mine, title: c.copyTitle ?? `${titleOrName(f.mine, f.rel)} (conflict copy)`, taken: [...names, ...here] });
              taken.add(copy.path);
              if (c.choice === "theirs") deleted.push(copy.path);
            }
            settles.set(f.rel, { choice: c.choice, ...(copy ? { copy } : {}) });
            lines.push({ path: f.rel, choice: c.choice, ...(copy ? { copy: copy.path } : {}) });
          }
          await settle(exec, {
            gitDir: repo.gitDir, d, choices: settles,
            message: lines.length ? resolveMessage(lines) : "Combine changes from elsewhere",
            deleteMessage: batchMessage(deleted.map((path) => ({ op: "delete", path }))),
          });
          repo.cache.clear();
          this.#generation++;
          this.#o.log?.(`git-resolve repo=${repo.name} notes=${lines.length}`);
        }
      } catch (e) {
        return this.#fail(e instanceof GitFailed && e.message === "undecided" ? "conflict" : "failed");
      } finally {
        this.#rebasing = undefined;
        done();
      }
      return undefined;
    });
    if (problem) {
      this.#emit({ state: "problem", problem });
      return this.#report;
    }
    return this.sync("save");
  }

  // ---- Note history (FIL-13, D-175) ----

  /** The repository a note is in and its path there (forward slashes), or undefined outside both. */
  #noteIn(path: string): { repo: Repo; rel: string } | undefined {
    for (const repo of [this.privateRepo, this.notes]) {
      if (!repo) continue;
      const rel = relative(repo.dir, resolve(path));
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return { repo, rel: rel.split(sep).join("/") };
    }
    return undefined;
  }

  /** A note's saved versions, newest first, following renames; an agent's commits name it. */
  async versions(path: string, page: { from?: { commit: string; file: string }; limit?: number } = {}): Promise<NoteVersion[]> {
    const at = this.#noteIn(path);
    if (!at) return [];
    const from = page.from;
    if (from && (!/^[0-9a-f]{7,64}$/.test(from.commit) || !isVersionFile(from.file))) return [];
    const r = await this.#exec(at.repo)([...VERSION_LOG_ARGS(from ? from.file : at.rel, { ...(from ? { from: from.commit } : {}), ...(page.limit ? { limit: page.limit } : {}) })], { read: true });
    if (r.code !== 0) return [];
    return parseVersionLog(r.stdout).map((e) => {
      const agent = agentOf(e.message);
      return { commit: e.commit, at: e.at, author: e.author, file: e.path, ...(agent ? { agent } : {}) };
    });
  }

  /**
   * A note's text in one of its versions: the file it was in that commit (as `versions` listed it),
   * read from the note's own repository. Only a commit ID and a Markdown path in that repository.
   */
  async readVersion(path: string, commit: string, file: string): Promise<string | undefined> {
    const at = this.#noteIn(path);
    if (!at || !/^[0-9a-f]{7,64}$/.test(commit) || !isVersionFile(file)) return undefined;
    const [text] = await readBlobs(this.#exec(at.repo), [`${commit}:${file}`]).catch(() => [undefined]);
    return text;
  }

  // ---- Recently deleted (FIL-10) ----

  #repoOf(root: DeletedNote["root"]): Repo | undefined {
    return root === "private" ? this.privateRepo : this.notes;
  }

  /** Notes deleted in the last 30 days in either repository, newest first, with their titles. */
  deleted(now = Date.now()): Promise<DeletedNote[]> {
    return this.#ops.run(async () => {
      const out: DeletedNote[] = [];
      for (const [root, repo] of [["private", this.privateRepo], ["public", this.notes]] as const) {
        if (!repo) continue;
        const exec = this.#exec(repo);
        const log = await exec([...DELETED_LOG_ARGS(Math.floor(now / 1000) - RECENTLY_DELETED_DAYS * 86_400)], { read: true });
        if (log.code !== 0) continue;
        const entries = recentDeletions(parseDeletedLog(log.stdout), { now, exists: (rel) => existsSync(join(repo.dir, ...rel.split("/"))) });
        const texts = await readBlobs(exec, entries.map((e) => `${e.commit}^:${e.path}`)).catch(() => entries.map(() => undefined));
        for (const [i, e] of entries.entries()) {
          const folder = e.path.split("/").slice(1, -1).join("/");
          out.push({ id: deletedId(root, e), root, path: join(repo.dir, ...e.path.split("/")), title: titleOrName(texts[i], e.path), folder, deletedAt: e.at });
        }
      }
      return out.sort((a, b) => b.deletedAt - a.deletedAt);
    });
  }

  /** A deleted note's text and where it was, from the commit before its deletion. */
  async readDeleted(id: string): Promise<{ root: DeletedNote["root"]; path: string; text: string } | undefined> {
    const at = parseDeletedId(id);
    const repo = at && this.#repoOf(at.root);
    if (!at || !repo) return undefined;
    const [text] = await readBlobs(this.#exec(repo), [`${at.commit}^:${at.path}`]).catch(() => [undefined]);
    return text === undefined ? undefined : { root: at.root, path: join(repo.dir, ...at.path.split("/")), text };
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
    const commitSaves = ["save", "switch", "idle", "quit"].some((r) => reasons.has(r as SyncReason));
    // It says it's backing up only when it sends something: saves it commits, commits not pushed
    // yet, a Files batch, or the pointer. A fetch with saves waiting sends none of them (DEF-16).
    const repos = [this.notes, this.privateRepo].filter((r): r is Repo => !!r);
    const sends = reasons.has("batch") || reasons.has("pointer") || repos.some((r) => (commitSaves && r.pending.size > 0) || (r.last?.upstream ? r.last.ahead > 0 : false));
    if (sends) this.#emit({ state: "syncing" });
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
    // Never to a template repository (D-157), whatever route the workspace came by.
    const refused = await this.#refusePush(repo, st.upstream);
    if (refused) return { problem: refused, moved };
    const push = () => this.#git(repo, ["-c", "push.default=upstream", "push", "--quiet"], undefined, timeout);
    let r = await push();
    repo.cache.clear();
    // Pushed: nothing of this repository waits any more, which the save state shows at once (D-132).
    const pushed = () => void (repo.last &&= { ...repo.last, ahead: 0 });
    if (r.code === 0) return (pushed(), { moved });
    const problem = networkProblem(r.stderr);
    if (problem !== "conflict") return { problem, moved };
    const p = await pull();
    if (p) return { problem: p, moved };
    // The remote is asked about again before the retry (LOW-6).
    const again = st.upstream ? await this.#refusePush(repo, st.upstream) : undefined;
    if (again) return { problem: again, moved };
    r = await push();
    repo.cache.clear();
    return r.code === 0 ? (pushed(), { moved }) : { problem: networkProblem(r.stderr), moved };
  }

  /**
   * Why a push to the branch's upstream remote must not go (D-157): any of its push URLs a template
   * (`template`), or one it can't read (`unreadableRemote`, MEDIUM-3, HIGH-2). Undefined when it may.
   */
  async #refusePush(repo: Repo, upstream: string): Promise<SyncProblem | undefined> {
    const check = this.#o.checkRemote;
    if (!check) return undefined;
    const names = (await this.#git(repo, ["remote"])).stdout.split(/\r?\n/).filter(Boolean);
    const remote = names.filter((n) => upstream.startsWith(`${n}/`)).sort((a, b) => b.length - a.length)[0];
    // A branch tracking another branch here pushes nowhere off this computer.
    if (!remote) return undefined;
    const got = await this.#git(repo, ["remote", "get-url", "--push", "--all", remote]);
    const urls = got.stdout.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
    if (got.code !== 0 || !urls.length) return "unreadableRemote";
    const verdicts = await Promise.all(urls.map((u) => check(u).catch(() => "unreadable" as const)));
    const problem = verdicts.includes("template") ? "template" : verdicts.includes("unreadable") ? "unreadableRemote" : undefined;
    if (problem) this.#o.log?.(`git-refused repo=${repo.name} problem=${problem}`);
    return problem;
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
