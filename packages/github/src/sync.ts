/**
 * The browser's sync engine (PKG-08, D-82): local first, one commit per push through the Git Data
 * API, pulls that fetch only changed blobs, and conflicts that keep both versions.
 */
import { GitHubApi, GitHubError } from "./api.ts";

export interface NoteRecord {
  path: string;
  text: string;
  /** The Git blob SHA this note had at its last sync; absent if it was never synced. */
  sha?: string;
  /** Changed here since the last sync. */
  dirty?: boolean;
  /** Deleted here, waiting to be deleted on GitHub. */
  deleted?: boolean;
  updated: number;
}

export interface Connection {
  owner: string;
  repo: string;
  branch: string;
  /** The commit and tree the local notes were last synced with. */
  commit?: string;
  tree?: string;
}

export interface SyncStore {
  allNotes(): Promise<NoteRecord[]>;
  getNote(path: string): Promise<NoteRecord | undefined>;
  putNote(note: NoteRecord): Promise<void>;
  removeNote(path: string): Promise<void>;
  getConnection(): Promise<Connection | undefined>;
  setConnection(c: Connection): Promise<void>;
}

export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "signedOut";

export interface SyncResult {
  /** Notes changed here by a pull (added, updated, or removed). */
  changed: string[];
  /** Conflict copies made: [original path, copy path]. */
  conflicts: [string, string][];
  pushed: number;
}

/** Notes are Markdown files outside dot-folders; the rest of the repository is left alone. */
export const isNotePath = (p: string) => /\.(md|markdown)$/i.test(p) && !p.split("/").some((s) => s.startsWith("."));

/** Files larger than this aren't synced from the browser (Web app → Limits). */
export const MAX_SYNC_BYTES = 1_000_000;

export function conflictPath(path: string, date: Date, taken: (p: string) => boolean): string {
  const dot = path.lastIndexOf(".");
  const stem = path.slice(0, dot);
  const ext = path.slice(dot);
  const day = date.toISOString().slice(0, 10);
  for (let n = 1; ; n++) {
    const p = `${stem} (conflict ${day}${n > 1 ? ` ${n}` : ""})${ext}`;
    if (!taken(p)) return p;
  }
}

const titleOf = (path: string) => path.split("/").at(-1)!.replace(/\.(md|markdown)$/i, "");

export function commitMessage(writes: string[], deletes: string[]): string {
  const all = [...writes.map((p) => `Update ${titleOf(p)}`), ...deletes.map((p) => `Delete ${titleOf(p)}`)];
  if (all.length === 1) return all[0]!;
  return `Update ${writes.length + deletes.length} notes\n\n${all.map((l) => `- ${l}`).join("\n")}`;
}

export class SyncEngine {
  readonly #api: GitHubApi;
  readonly #store: SyncStore;
  readonly #now: () => Date;
  #running: Promise<SyncResult> | undefined;
  #again = false;

  constructor(api: GitHubApi, store: SyncStore, now: () => Date = () => new Date()) {
    this.#api = api;
    this.#store = store;
    this.#now = now;
  }

  /** Pulls, then pushes. Calls made while a sync runs fold into one more run after it. */
  sync(): Promise<SyncResult> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      const total: SyncResult = { changed: [], conflicts: [], pushed: 0 };
      try {
        do {
          this.#again = false;
          const r = await this.#once();
          total.changed.push(...r.changed);
          total.conflicts.push(...r.conflicts);
          total.pushed += r.pushed;
        } while (this.#again);
        return total;
      } finally {
        this.#running = undefined;
      }
    })();
    return this.#running;
  }

  async #once(): Promise<SyncResult> {
    const result: SyncResult = { changed: [], conflicts: [], pushed: 0 };
    for (let attempt = 0; attempt < 4; attempt++) {
      const pulled = await this.pull();
      result.changed.push(...pulled.changed);
      result.conflicts.push(...pulled.conflicts);
      try {
        result.pushed += await this.push();
        return result;
      } catch (e) {
        // The branch moved between our pull and push: pull again and retry.
        if (e instanceof GitHubError && (e.status === 422 || e.status === 409) && attempt < 3) continue;
        throw e;
      }
    }
    return result;
  }

  async pull(): Promise<Omit<SyncResult, "pushed">> {
    const c = await this.#need();
    const changed: string[] = [];
    const conflicts: [string, string][] = [];
    const head = await this.#api.head(c.owner, c.repo, c.branch);
    if (!head || head === c.commit) return { changed, conflicts };
    const treeSha = await this.#api.commitTree(c.owner, c.repo, head);
    const { entries } = await this.#api.tree(c.owner, c.repo, treeSha);
    const remote = new Map(entries.filter((e) => e.type === "blob" && isNotePath(e.path) && (e.size ?? 0) <= MAX_SYNC_BYTES).map((e) => [e.path, e.sha]));
    const local = new Map((await this.#store.allNotes()).map((n) => [n.path, n]));
    const taken = (p: string) => local.has(p) || remote.has(p);

    for (const [path, sha] of remote) {
      const note = local.get(path);
      if (note?.sha === sha) continue;
      if (!note || (!note.dirty && !note.deleted)) {
        const text = await this.#api.blob(c.owner, c.repo, sha);
        await this.#store.putNote({ path, text, sha, updated: Date.now() });
        changed.push(path);
        continue;
      }
      // Changed in both places (or deleted here and changed there): keep both, lose nothing.
      const text = await this.#api.blob(c.owner, c.repo, sha);
      if (note.deleted) {
        await this.#store.putNote({ path, text, sha, updated: Date.now() });
        changed.push(path);
        continue;
      }
      if (text === note.text) {
        await this.#store.putNote({ ...note, sha, dirty: false });
        continue;
      }
      const copy = conflictPath(path, this.#now(), taken);
      local.set(copy, { path: copy, text, updated: Date.now(), dirty: true });
      await this.#store.putNote({ path: copy, text, dirty: true, updated: Date.now() });
      await this.#store.putNote({ ...note, sha });
      conflicts.push([path, copy]);
      changed.push(copy);
    }
    for (const [path, note] of local) {
      if (remote.has(path) || !note.sha) continue;
      // Deleted on GitHub. Unchanged here: remove it. Changed here: keep it, and it's pushed back.
      if (note.dirty) await this.#store.putNote({ path, text: note.text, dirty: true, updated: note.updated });
      else {
        await this.#store.removeNote(path);
        changed.push(path);
      }
    }
    await this.#store.setConnection({ ...c, commit: head, tree: treeSha });
    return { changed, conflicts };
  }

  /** Commits every local change as one commit. Returns how many notes it pushed. */
  async push(): Promise<number> {
    let c = await this.#need();
    const pending = (await this.#store.allNotes()).filter((n) => n.dirty || n.deleted);
    if (!pending.length) return 0;
    if (!c.commit) {
      // An empty repository: the Git Data API needs one commit first.
      await this.#api.createFile(c.owner, c.repo, "README.md", "# Notes\n\nWritten with Focus Notes.\n", "Start notes", c.branch);
      await this.pull();
      c = await this.#need();
    }
    const writes = pending.filter((n) => !n.deleted && n.text.length <= MAX_SYNC_BYTES);
    const deletes = pending.filter((n) => n.deleted && n.sha);
    const blobs = await Promise.all(writes.map(async (n) => ({ note: n, sha: await this.#api.createBlob(c.owner, c.repo, n.text) })));
    const tree = await this.#api.createTree(c.owner, c.repo, c.tree, [
      ...blobs.map((b) => ({ path: b.note.path, sha: b.sha })),
      ...deletes.map((n) => ({ path: n.path, sha: null })),
    ]);
    if (tree === c.tree) {
      // Nothing actually differs from GitHub (the same text was saved again): no empty commit.
      for (const { note, sha } of blobs) await this.#store.putNote({ ...note, sha, dirty: false });
      return 0;
    }
    const commit = await this.#api.createCommit(c.owner, c.repo, commitMessage(writes.map((n) => n.path), deletes.map((n) => n.path)), tree, c.commit ? [c.commit] : []);
    await this.#api.updateRef(c.owner, c.repo, c.branch, commit);
    for (const { note, sha } of blobs) {
      // A note edited while this push ran stays dirty, now based on the pushed version.
      const now = await this.#store.getNote(note.path);
      if (!now) continue;
      await this.#store.putNote(now.text === note.text && !now.deleted ? { ...now, sha, dirty: false } : { ...now, sha });
    }
    for (const n of deletes) {
      const now = await this.#store.getNote(n.path);
      if (now?.deleted) await this.#store.removeNote(n.path);
    }
    for (const n of pending.filter((p) => p.deleted && !p.sha)) await this.#store.removeNote(n.path);
    await this.#store.setConnection({ ...c, commit, tree });
    return blobs.length + deletes.length;
  }

  async #need(): Promise<Connection> {
    const c = await this.#store.getConnection();
    if (!c) throw new GitHubError(401, "not connected");
    return c;
  }
}
