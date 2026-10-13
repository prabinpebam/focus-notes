/**
 * The web app's PlatformBridge (D-80 to D-82): notes and state in IndexedDB, and sync with the
 * user's notes repository through the GitHub REST API once they connect.
 */
import { ConnectError, parseRepo, type AppStateFile, type GitHubBridge, type NoteSummary, type PlatformBridge, type SyncStatus } from "@focus-notes/core";
import { GitHubApi, GitHubError, SyncEngine, type Connection } from "@focus-notes/github";
import { WebDb } from "./idb.ts";
import { forgetToken, loadToken, storeToken } from "./vault.ts";

const WELCOME = `# Welcome to Focus Notes

This note lives in your browser. Write anything; it's saved as you type.

- Press **Ctrl+.** (or click the red dot) for the toolbar.
- Press **Ctrl+Shift+/** for every keyboard shortcut.
- Choose **Connect GitHub…** in the toolbar's ⋯ menu to keep your notes in a repository you own.
`;

/** Push this long after the last change, so a burst of typing becomes one commit. */
const PUSH_DELAY_MS = 3000;
/** Pull this often while the page is visible. */
const PULL_EVERY_MS = 5 * 60_000;

export interface WebBridge extends PlatformBridge {
  github: GitHubBridge;
  db: WebDb;
}

export async function createWebBridge(fetchImpl?: typeof fetch): Promise<WebBridge> {
  const db = await WebDb.open();
  void navigator.storage?.persist?.().catch(() => false);
  const dark = matchMedia("(prefers-color-scheme: dark)");

  let status: SyncStatus = { state: "local", pending: 0 };
  let engine: SyncEngine | undefined;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const changeListeners = new Set<(paths: string[]) => void>();
  const conflictListeners = new Set<(a: string, b: string) => void>();
  const pending = async () => (await db.allNotes()).filter((n) => n.dirty || n.deleted).length;
  const setStatus = async (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch, pending: await pending() };
    for (const l of statusListeners) l(status);
  };

  const run = async () => {
    if (!engine) return;
    if (!navigator.onLine) return setStatus({ state: "offline" });
    await setStatus({ state: "syncing" });
    try {
      const r = await engine.sync();
      if (r.changed.length) for (const l of changeListeners) l(r.changed);
      for (const [a, b] of r.conflicts) for (const l of conflictListeners) l(a, b);
      await setStatus({ state: "idle", message: "" });
    } catch (e) {
      const ge = e instanceof GitHubError ? e : undefined;
      if (ge?.status === 0) await setStatus({ state: "offline" });
      else if (ge?.unauthorized) await setStatus({ state: "signedOut" });
      else await setStatus({ state: "error", message: ge?.message ?? String(e) });
      throw e;
    }
  };
  const schedule = (ms = PUSH_DELAY_MS) => {
    clearTimeout(pushTimer);
    if (engine) pushTimer = setTimeout(() => void run().catch(() => {}), ms);
  };

  const begin = async () => {
    const token = await loadToken(db);
    const conn = await db.getMeta<Connection>("connection");
    if (!token || !conn) return;
    engine = new SyncEngine(new GitHubApi(token, fetchImpl), {
      allNotes: () => db.allNotes(), getNote: (p) => db.getNote(p), putNote: (n) => db.putNote(n), removeNote: (p) => db.removeNote(p),
      getConnection: () => db.getMeta<Connection>("connection"), setConnection: (c) => db.setMeta("connection", c),
    });
    const login = await db.getMeta<string>("login");
    await setStatus({ state: "idle", repo: `${conn.owner}/${conn.repo}`, ...(login ? { login } : {}) });
  };
  await begin();
  if (engine) schedule(0);
  addEventListener("online", () => schedule(0));
  addEventListener("offline", () => void setStatus({ state: engine ? "offline" : "local" }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(0); });
  setInterval(() => { if (document.visibilityState === "visible") schedule(0); }, PULL_EVERY_MS);

  const github: GitHubBridge = {
    status: () => status,
    onStatus(l) { statusListeners.add(l); return () => statusListeners.delete(l); },
    onNotesChanged(l) { changeListeners.add(l); return () => changeListeners.delete(l); },
    onConflict(l) { conflictListeners.add(l); return () => conflictListeners.delete(l); },
    async connect(repoInput, token) {
      const parsed = parseRepo(repoInput);
      if (!parsed) throw new ConnectError("notFound");
      const api = new GitHubApi(token, fetchImpl);
      const fail = (e: unknown): never => {
        if (e instanceof GitHubError) {
          if (e.status === 0) throw new ConnectError("offline");
          if (e.status === 401) throw new ConnectError("badToken");
          if (e.status === 403) throw new ConnectError("noAccess");
          if (e.status === 404) throw new ConnectError("notFound");
        }
        throw new ConnectError("other", String(e));
      };
      const user = await api.user().catch(fail);
      const owner = parsed.owner ?? user.login;
      const repo = await api.repo(owner, parsed.name).catch(fail);
      if (!repo.canPush) throw new ConnectError("readOnly");
      const previous = await db.getMeta<Connection>("connection");
      const same = previous && previous.owner === repo.owner && previous.repo === repo.name;
      if (!same) {
        // A different repository: every note here that was ever written is offered to it, and
        // matching notes there resolve without conflict copies.
        for (const n of await db.allNotes()) {
          if (n.deleted) await db.removeNote(n.path);
          else if (n.sha || n.dirty) await db.putNote({ path: n.path, text: n.text, dirty: true, updated: n.updated });
        }
      }
      await db.setMeta("connection", same ? previous : { owner: repo.owner, repo: repo.name, branch: repo.defaultBranch } satisfies Connection);
      await db.setMeta("login", user.login);
      await storeToken(db, token);
      await begin();
      await run().catch(() => {});
      return { login: user.login, repo: `${repo.owner}/${repo.name}` };
    },
    async disconnect() {
      clearTimeout(pushTimer);
      engine = undefined;
      await forgetToken(db);
      await db.deleteMeta("login");
      await setStatus({ state: "local", login: "", repo: "", message: "" });
    },
    async syncNow() {
      clearTimeout(pushTimer);
      await run();
    },
  };

  const bridge: WebBridge = {
    platform: "web",
    db,
    github,
    async readNote(path) {
      const n = await db.getNote(path);
      if (!n || n.deleted) throw new Error(`No note at ${path}`);
      return n.text;
    },
    async writeNote(path, text) {
      const old = await db.getNote(path);
      if (old && old.text === text && !old.deleted) return;
      await db.putNote({ path, text, ...(old?.sha ? { sha: old.sha } : {}), dirty: true, updated: Date.now() });
      await setStatus({});
      schedule();
    },
    chooseNote: async () => undefined,
    async listNotes(): Promise<NoteSummary[]> {
      return (await db.allNotes()).filter((n) => !n.deleted).map((n) => ({ path: n.path, updated: n.updated }));
    },
    async newNotePath(near) {
      const dir = near && near.includes("/") ? near.slice(0, near.lastIndexOf("/") + 1) : "";
      for (let i = 1; ; i++) {
        const p = `${dir}${i === 1 ? "Untitled" : `Untitled ${i}`}.md`;
        if (!(await db.getNote(p))) return p;
      }
    },
    async defaultNotePath() {
      const notes = (await db.allNotes()).filter((n) => !n.deleted);
      if (notes.length) return notes.sort((a, b) => b.updated - a.updated)[0]!.path;
      // The welcome note is local only: it isn't pushed unless it's edited.
      await db.putNote({ path: "Welcome.md", text: WELCOME, updated: Date.now() });
      return "Welcome.md";
    },
    loadAppState: async () => (await db.getMeta<AppStateFile>("appState")) ?? { version: 1 },
    saveAppState: (s) => db.setMeta("appState", s),
    systemScheme: () => (dark.matches ? "dark" : "light"),
    onSystemSchemeChange(listener) {
      const h = () => listener(dark.matches ? "dark" : "light");
      dark.addEventListener("change", h);
      return () => dark.removeEventListener("change", h);
    },
    toggleFullScreen() {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    },
    openExternal(url) {
      // Only GitHub's own pages are ever opened (D-81).
      if (/^https:\/\/github\.com\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    },
  };
  return bridge;
}
