/**
 * The Electron main process (PKG-03, SEC-01, PKG-06, PRV-01): a hardened shell that owns the
 * window, the file system, and the user's own `git`. It allows no network requests from the
 * renderer; Git talks to the workspace's remotes (WP-3.3), and its own only requests are setup's
 * calls to api.github.com, made when the person sets up their instance (FRE-08, WP-3.1).
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { mkdir, open, readdir, readFile, rename, rm, writeFile, stat } from "node:fs/promises";
import { existsSync, readFileSync, realpathSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { readWorkspaceFormat } from "@focus-notes/core/workspace-format";
import { titleOfMarkdown } from "@focus-notes/core/workspace";
import { BUNDLE_MAX_BYTES, parseBundle, planImport, safeWorkspacePath, type Bundle } from "@focus-notes/core/notes";
import { parseSettings } from "@focus-notes/core/settings";
import { restorePlace, titleOrName } from "@focus-notes/core/history";
import { GitSync, NO_GIT } from "./git/sync.ts";
import { createRunner, type GitRunner } from "./git/run.ts";
import { passphraseStrength } from "@focus-notes/seal";
import { isRepoName, SETUP_STEPS, type SetupStepId } from "@focus-notes/core/setup";
import { FIRST_RUN_PAGES, identityProblem, type FirstRunPage, type RepoChoice, type WorkspaceResult } from "@focus-notes/core/first-run";
import { checkOptions, SetupEngine } from "./setup/engine.ts";
import { githubFetch } from "./setup/credential.ts";
import type { BatchOp } from "./git/message.ts";
import { Account } from "./first-run/account.ts";
import { createToolRunner } from "./first-run/tools.ts";
import { applyLocalIdentity, checkWorkspace, cloneWorkspace } from "./first-run/workspace.ts";
import type { ConflictChoice, RemovalCheck } from "@focus-notes/core";
import { CHROMIUM_FOLDERS, DATA_FILES, type DataFile } from "@focus-notes/core/inventory";
import { forgetLocalData, removalCheck, removeWorkspace } from "./workspace/remove.ts";

const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const customWindow = process.argv.includes("--custom-window") && platform !== "macos";

if (process.env.FOCUS_NOTES_USER_DATA) app.setPath("userData", resolve(process.env.FOCUS_NOTES_USER_DATA));
/** A file in the app's data folder: only those the data inventory names (PRV-02). */
const dataFile = (f: DataFile) => join(app.getPath("userData"), f);
// Chromium's working files go in one folder of the data folder, which the inventory lists as one item.
app.setPath("sessionData", join(app.getPath("userData"), CHROMIUM_FOLDERS.session));
/** Where a new workspace goes unless another folder is chosen: Documents/Focus Notes. */
const defaultHome = () => resolve(process.env.FOCUS_NOTES_DOCS ?? join(app.getPath("documents"), "Focus Notes"));
/** The workspace the first run opened (D-98), kept by the main process only: the renderer can't name a folder. */
const workspaceFile = () => dataFile(DATA_FILES.workspace);
let chosenHome: string | undefined;
function readChosenHome(): string | undefined {
  try {
    const w = JSON.parse(readFileSync(workspaceFile(), "utf8")) as { version?: number; folder?: unknown };
    return w.version === 1 && typeof w.folder === "string" && isAbsolute(w.folder) ? resolve(w.folder) : undefined;
  } catch {
    return undefined;
  }
}
const notesHome = () => chosenHome ?? defaultHome();
const stateFile = () => dataFile(DATA_FILES.state);

// Test seams, never in a packaged app: a local fake of GitHub's API and local bare remotes, so the
// journeys make no network request; and a log of every program started, to check no token is in one.
const devEnv = (name: string) => (app.isPackaged ? undefined : process.env[name]);
const fakeApi = devEnv("FOCUS_NOTES_GITHUB_API");
const localRemotes = devEnv("FOCUS_NOTES_GIT_REMOTES");
const logSpawns = devEnv("FOCUS_NOTES_LOG_SPAWNS") === "1";
const onSpawn = logSpawns ? (program: string, args: string[]) => process.stdout.write(`[focus-notes] spawn ${JSON.stringify([program, ...args])}\n`) : undefined;
const apiFetch = githubFetch(fakeApi && /^http:\/\/127\.0\.0\.1:\d+$/.test(fakeApi)
  ? (i, init) => fetch(fakeApi + i.slice("https://api.github.com".length), init)
  : undefined);
const remoteUrl = (owner: string, repo: string) => (localRemotes ? `${localRemotes.replace(/\\/g, "/")}/${owner}/${repo}.git` : `https://github.com/${owner}/${repo}.git`);

const WELCOME = `# Welcome to Focus Notes

Everything you write here is saved as plain Markdown on your computer.
`;

if (!app.requestSingleInstanceLock()) app.quit();

// ---- save and sync with Git (WP-3.3, D-23) ----
// The workspace folder's own repository, if it is one; otherwise saving stays local, with no Git UI.
// The delays are configurable (D-23), which also lets the journeys use short ones.
const envMs = (name: string) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};
let gitSync: GitSync | undefined;
let gitOpened = false;
let gitWaiting: ((g: GitSync) => void)[] = [];
/** Runs now if Git is open, or once it opens (a note written before then is still committed). */
const withGit = (fn: (g: GitSync) => void) => {
  if (gitSync) fn(gitSync);
  else if (!gitOpened) gitWaiting.push(fn);
};
let startGit: () => void = () => {};
let gitOpening: Promise<GitSync | undefined>;
/** Opened once the caret is ready, so Git never competes with the first frame (PRF-02, PRF-07). Again after the workspace changes. */
const armGit = () => (gitSync = undefined, gitOpened = false, gitWaiting = [], gitOpening = new Promise<GitSync | undefined>((resolve) => {
  startGit = () => {
    startGit = () => {};
    const idleMs = envMs("FOCUS_NOTES_IDLE_COMMIT_MS");
    const pointerGapMs = envMs("FOCUS_NOTES_POINTER_GAP_MS");
    resolve(GitSync.open({
      folder: notesHome(),
      ...(onSpawn ? { run: createRunner({ onSpawn: (args) => onSpawn("git", args) }) } : {}),
      ...(idleMs !== undefined ? { idleMs } : {}),
      ...(pointerGapMs !== undefined ? { pointerGapMs } : {}),
      // After the window closes, the final sync on quit still runs; there's just no one to tell.
      onReport: (r) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sync:status", r);
      },
      // Counts and problems only: note names are private.
      log: (line) => process.stdout.write(`[focus-notes] ${line}\n`),
    }).then((g) => {
      gitSync = g;
      gitOpened = true;
      for (const fn of gitWaiting.splice(0)) if (g) fn(g);
      return g;
    }, () => {
      gitOpened = true;
      gitWaiting.length = 0;
      return undefined;
    }));
  };
}));
armGit();

// ---- set up my instance (WP-3.1, FRE-08) ----
// Opened when first asked. The token is read from Git's credential helper when a step needs it and
// kept only in the engine; progress (names and step states, nothing secret) is in setup.json.
let setupEngine: Promise<SetupEngine> | undefined;
const setupRunner = createRunner(onSpawn ? { onSpawn: (args) => onSpawn("git", args) } : {});
/** Setup's commits carry the identity chosen for only this workspace (FRE-05) until it's in the workspace's own settings. */
const setupGit: GitRunner = (call) => {
  const id = workspaceIdentity;
  return setupRunner(id ? { ...call, args: ["-c", `user.name=${id.name}`, "-c", `user.email=${id.email}`, ...call.args] } : call);
};
const setup = () => (setupEngine ??= SetupEngine.open({
  git: setupGit,
  progressFile: dataFile(DATA_FILES.setup),
  token: () => account.token(),
  fetch: apiFetch,
  remoteUrl,
  onReport: (r) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("setup:report", r);
  },
  // Step names, states, and problem codes only.
  log: (line) => process.stdout.write(`[focus-notes] ${line}\n`),
}));
/** A vault passphrase from the renderer: text, or none (Skip for now). Never logged or stored. */
const passphraseArg = (p: unknown) => (typeof p === "string" && p.length > 0 && p.length <= 1024 ? p : undefined);

// ---- the first run (WP-3.2, FRE-01 to FRE-06) ----
// Signing in goes through Git's own helpers; the token is read from them when needed and kept only
// in memory (SEC-03). The folder a workspace goes in is chosen here, with the system's dialog (D-98).
const account = new Account({
  git: createRunner(onSpawn ? { onSpawn: (args) => onSpawn("git", args) } : {}),
  tools: createToolRunner(onSpawn ? { onSpawn } : {}),
  fetch: apiFetch,
  home: app.getPath("home"),
  env: process.env,
  onProgress: (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("firstRun:signIn", p);
  },
  log: (line) => process.stdout.write(`[focus-notes] ${line}\n`),
  signedOutFile: dataFile(DATA_FILES.account),
});
const firstRunFile = () => dataFile(DATA_FILES.firstRun);
/** A name and email for only the notes workspace, kept until the workspace has them (not secret). */
let workspaceIdentity: { name: string; email: string } | undefined;
/** Where a new or cloned workspace goes: Documents/Focus Notes unless another folder was chosen. */
let targetFolder: string | undefined;
/** A workspace cloned or chosen, waiting to be opened. */
let pendingWorkspace: string | undefined;
const saveFirstRun = () => atomicWrite(firstRunFile(), JSON.stringify({ version: 1, ...(workspaceIdentity ? { identity: workspaceIdentity } : {}) }, null, 2));
function readFirstRun(): void {
  try {
    const f = JSON.parse(readFileSync(firstRunFile(), "utf8")) as { version?: number; identity?: { name?: unknown; email?: unknown } };
    const i = f.identity;
    if (f.version === 1 && i && typeof i.name === "string" && typeof i.email === "string" && !identityProblem({ name: i.name, email: i.email })) workspaceIdentity = { name: i.name, email: i.email };
  } catch {
    // Nothing chosen yet.
  }
}
/** The folder setup makes the workspace in: the one it started with, the chosen one, or the open workspace (Run setup again). */
const setupFolder = async () => (await setup()).report().options?.folder ?? targetFolder ?? (isWorkspace() ? notesHome() : defaultHome());
/**
 * Deletes what the data inventory lists for signing out or removing the workspace (PRV-02): setup's
 * progress (through the engine, so it forgets too), the first run's workspace identity, and, for
 * removing, the workspace folder's name; Chromium's caches and web storage are emptied too. The
 * renderer forgets the recent note in state.json itself, since it owns that file.
 */
async function forgetLocal(event: "signOut" | "removeWorkspace"): Promise<void> {
  if (setupEngine) await (await setupEngine).reset().catch(() => {});
  workspaceIdentity = undefined;
  targetFolder = undefined;
  pendingWorkspace = undefined;
  await forgetLocalData(app.getPath("userData"), event);
  await session.defaultSession.clearCache().catch(() => {});
  await session.defaultSession.clearStorageData().catch(() => {});
}
/**
 * Removes the workspace's local clone (FRE-07): checked again here, with the watcher and Git
 * stopped first so nothing writes into it, and only when everything is on the remote. Afterwards
 * the window starts again with no workspace, at the first run's Your workspace step.
 */
async function removeLocalWorkspace(): Promise<RemovalCheck> {
  const folder = notesHome();
  const first = await removalCheck(setupRunner, folder);
  if (first.state !== "ready") return first;
  await Promise.allSettled([...writeQueues.values()]);
  watcher?.close();
  watcher = undefined;
  const old = gitSync;
  armGit();
  await old?.dispose();
  const r = await removeWorkspace(setupRunner, folder);
  if (r.state !== "removed") {
    watcher = watchWorkspace(() => mainWindow);
    startGit();
    return r;
  }
  chosenHome = undefined;
  await forgetLocal("removeWorkspace");
  process.stdout.write("[focus-notes] workspace-removed\n");
  setTimeout(() => mainWindow?.webContents.reload(), 0);
  return r;
}
async function chooseFolder(title: string): Promise<string | undefined> {
  const w = mainWindow;
  const opts = { title, defaultPath: dirname(defaultHome()), properties: ["openDirectory" as const, "createDirectory" as const, "promptToCreate" as const] };
  const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
  return r.canceled || !r.filePaths[0] ? undefined : resolve(r.filePaths[0]);
}
/** Repositories in the signed-in account, Focus Notes workspaces first (checked for the ten most recent). */
async function repositories(): Promise<RepoChoice[]> {
  const s = await account.api();
  if (!s) throw new Error("Signed out");
  const repos = await s.api.ownRepos();
  const checked = await Promise.all(repos.map((r, i) => (i < 10 ? s.api.hasFile(r.owner, r.name, ".focus-notes/workspace.json").catch(() => false) : Promise.resolve(false))));
  const list = repos.map((r, i) => ({ owner: r.owner, name: r.name, private: r.private, instance: checked[i]! }));
  return [...list.filter((r) => r.instance), ...list.filter((r) => !r.instance)];
}
/**
 * Opens a workspace in this window (D-98): the main process keeps the folder, the watcher and Git
 * move to it, and the renderer starts again in it.
 */
async function switchWorkspace(folder: string): Promise<void> {
  if (workspaceIdentity) {
    await applyLocalIdentity(setupRunner, folder, workspaceIdentity);
    workspaceIdentity = undefined;
    await saveFirstRun();
  }
  await atomicWrite(workspaceFile(), JSON.stringify({ version: 1, folder }, null, 2));
  chosenHome = folder;
  pendingWorkspace = undefined;
  watcher?.close();
  const old = gitSync;
  armGit();
  await old?.dispose();
  watcher = watchWorkspace(() => mainWindow);
  setTimeout(() => startGit(), 3000);
  setTimeout(() => mainWindow?.webContents.reload(), 0);
}

// ---- the workspace (WP-2.3) ----
// The notes folder is the workspace. With .focus-notes/workspace.json it has the repository's
// layout: public notes in notes/, private ones in private/notes/ (D-84). Before that, it's one
// root of its own (D-92), as it was through M2.
const formatFile = () => join(notesHome(), ".focus-notes", "workspace.json");
const isWorkspace = () => existsSync(formatFile());
// A clone whose account can't reach the private repository has no private root (FRE-06).
const hasPrivate = () => existsSync(join(notesHome(), "private", "notes")) || existsSync(join(notesHome(), "private", ".git"));
const roots = () => isWorkspace()
  ? [...(hasPrivate() ? [{ id: "private", path: join(notesHome(), "private", "notes"), readOnly: false }] : []), { id: "public", path: join(notesHome(), "notes"), readOnly: false }]
  : [{ id: "local", path: notesHome(), readOnly: false }];
/** Where new notes go when there's no note to put them next to. */
const notesRoot = () => roots()[0]!.path;
const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p);
const inside = (base: string, p: string) => {
  const r = relative(base, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};
const readFormat = () => readFile(formatFile(), "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? undefined : "unreadable"));
/** This app never writes into a workspace whose format it mustn't write (DST-05). */
async function assertWritable(p: string): Promise<void> {
  // The format file itself is written only by workspace:writeFormat, which checks what it writes.
  if (!inside(notesHome(), p) || p === formatFile()) return;
  if (readWorkspaceFormat(await readFormat()).access !== "write") throw new Error("This workspace is read-only for this version of Focus Notes");
}
/** A note's title from its first 16 KB, so the Files panel shows titles without reading whole notes. */
async function readTitle(p: string): Promise<string | undefined> {
  const h = await open(p, "r").catch(() => undefined);
  if (!h) return undefined;
  try {
    const buf = Buffer.alloc(16 * 1024);
    const { bytesRead } = await h.read(buf, 0, buf.length, 0);
    return titleOfMarkdown(buf.subarray(0, bytesRead).toString("utf8"));
  } catch {
    return undefined;
  } finally {
    await h.close();
  }
}
type Entry = { path: string; kind: "note" | "folder"; title?: string };
/** Every note (with its title) and folder under a root; folders and files starting with a dot are skipped. */
async function listTree(dir: string, out: Entry[] = []): Promise<Entry[]> {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const notes: Promise<Entry>[] = [];
  for (const d of items) {
    if (d.name.startsWith(".") || d.name === "node_modules") continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) {
      out.push({ path: p, kind: "folder" });
      await listTree(p, out);
    } else if (d.isFile() && isMarkdown(d.name)) notes.push(readTitle(p).then((title) => ({ path: p, kind: "note", ...(title ? { title } : {}) })));
  }
  out.push(...(await Promise.all(notes)));
  return out;
}

/** Only Markdown files, given as absolute paths, may be read or written. */
function notePath(p: unknown): string {
  if (typeof p !== "string" || !p) throw new Error("A note path is required");
  const abs = resolve(p);
  if (![".md", ".markdown"].includes(extname(abs).toLowerCase())) throw new Error("Only Markdown files can be opened");
  return abs;
}

/** Writes to one path run one after another, so an older write can never land after a newer one. */
const writeQueues = new Map<string, Promise<void>>();
let tmpCounter = 0;

/** Atomic write: a temporary file next to the note, then rename (Performance and quality → Reliability). */
function atomicWrite(path: string, content: string): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => writeNow(path, content));
  writeQueues.set(path, next);
  void next.finally(() => { if (writeQueues.get(path) === next) writeQueues.delete(path); }).catch(() => {});
  return next;
}

/** Renames, retrying while Windows sync clients and antivirus briefly lock a file they just saw. */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
    }
  }
}

async function writeNow(path: string, content: string): Promise<void> {
  await assertWritable(path);
  // A pull rewriting files finishes first, so a save never lands in the middle of it.
  await gitSync?.writable();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
  await writeFile(tmp, content, "utf8");
  // On Windows, sync clients and antivirus briefly lock files; retry before reporting a failure.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt < 4 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        continue;
      }
      await rm(tmp, { force: true });
      throw error;
    }
  }
}

// ---- file operations from the Files panel (WP-2.4, D-94) ----

/** A refusal the renderer explains: the message is the reason's code (OpErrorCode in core). */
class Refused extends Error {}
const refuse = (code: "notFound" | "taken" | "readOnly" | "invalid" | "intoItself" | "trash" | "failed") => new Refused(code);
/** A path the Files panel may change: absolute, inside a writable root (not the root itself), no dot folders. */
function opPath(p: unknown): { path: string; root: string } {
  if (typeof p !== "string" || !p || !isAbsolute(p) || resolve(p) !== p) throw refuse("invalid");
  const root = roots().find((r) => p !== r.path && inside(r.path, p));
  if (!root || relative(root.path, p).split(sep).some((part) => part.startsWith("."))) throw refuse("invalid");
  return { path: p, root: root.path };
}
const isDir = (p: string) => stat(p).then((s) => s.isDirectory(), () => false);
/** Writes already under way to anything inside a path finish first, so none lands in the old place. */
const writesDone = (p: string) => Promise.allSettled([...writeQueues].filter(([k]) => inside(p, k)).map(([, v]) => v));

/**
 * A batch from the Files panel, all or nothing (Desktop and Git → Changes shown before they're
 * saved): every operation is checked, folders are created and items moved in order, and if any step
 * fails the earlier ones are undone. A write replaces a moved or linking note's text (links that
 * follow the move, FIL-09), and is undone by writing the old text back. Deletes go last, to the
 * system trash, until Git keeps them (FIL-10).
 * A move between the Private and Public roots changes who can see it (FIL-06): the folders it needs
 * in the other root are made, and taken away again if the batch is undone.
 */
async function applyOps(raw: unknown): Promise<BatchOp[]> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5000) throw refuse("invalid");
  type Op = { op: "createFolder" | "delete"; path: string; root: string } | { op: "move"; path: string; to: string; root: string }
    | { op: "write" | "create"; path: string; text: string; root: string };
  const ops = raw.map((op: unknown): Op => {
    const o = op as Record<string, unknown>;
    if (o?.op === "createFolder" || o?.op === "delete") return { op: o.op, ...opPath(o.path) };
    if (o?.op === "move") {
      const from = opPath(o.from);
      const to = opPath(o.to);
      // Only a workspace's two roots can be crossed (D-84); anything else stays in its root.
      if (from.root !== to.root && !isWorkspace()) throw refuse("invalid");
      return { op: "move" as const, path: from.path, to: to.path, root: from.root };
    }
    if (o?.op === "write" || o?.op === "create") {
      const at = opPath(o.path);
      if (typeof o.text !== "string" || !isMarkdown(at.path)) throw refuse("invalid");
      return { op: o.op, ...at, text: o.text };
    }
    throw refuse("invalid");
  });
  for (const op of ops) await assertWritable(op.path).catch(() => { throw refuse("readOnly"); });
  // Deletes are checked before anything changes, because the trash can't be undone from here.
  for (const op of ops) if (op.op === "delete" && !existsSync(op.path)) throw refuse("notFound");
  const undo: (() => Promise<unknown>)[] = [];
  try {
    for (const op of ops) {
      if (op.op === "createFolder") {
        if (existsSync(op.path)) throw refuse("taken");
        if (!(await isDir(dirname(op.path)))) throw refuse("notFound");
        await mkdir(op.path);
        undo.push(() => rm(op.path, { recursive: true, force: true }));
        // Git tracks folders only through files (Files and sharing → Operations).
        await writeFile(join(op.path, ".gitkeep"), "");
      } else if (op.op === "move") {
        const { path: from, to } = op;
        const st = await stat(from).catch(() => undefined);
        if (!st) throw refuse("notFound");
        if (st.isFile() && (!isMarkdown(from) || !isMarkdown(to))) throw refuse("invalid");
        if (st.isDirectory() && inside(from, to)) throw refuse("intoItself");
        const caseOnly = from.toLowerCase() === to.toLowerCase();
        if (!caseOnly && existsSync(to)) throw refuse("taken");
        if (!inside(op.root, to)) {
          // Into the other root: the same folder path there is made if it's missing (Files and sharing → Changing visibility).
          const made = await mkdir(dirname(to), { recursive: true });
          if (made) undo.push(() => rm(made, { recursive: true, force: true }));
        }
        if (!(await isDir(dirname(to)))) throw refuse("notFound");
        await writesDone(from);
        if (caseOnly && from !== to) {
          const tmp = `${from}.${process.pid}.move.tmp`;
          await renameRetrying(from, tmp);
          await renameRetrying(tmp, to);
        } else await renameRetrying(from, to);
        undo.push(() => renameRetrying(to, from));
      } else if (op.op === "write") {
        // Only a note that's there (after the batch's moves) is written: never a new file.
        const old = (await isDir(op.path)) ? undefined : await readFile(op.path, "utf8").catch(() => undefined);
        if (old === undefined) throw refuse("notFound");
        await atomicWrite(op.path, op.text);
        undo.push(() => atomicWrite(op.path, old));
      } else if (op.op === "create") {
        // A new note, never over another (the conflict resolver's copies, FIL-12).
        if (existsSync(op.path)) throw refuse("taken");
        if (!(await isDir(dirname(op.path)))) throw refuse("notFound");
        await writeFile(op.path, op.text, { encoding: "utf8", flag: "wx" });
        undo.push(() => rm(op.path, { force: true }));
      }
    }
    for (const op of ops) {
      if (op.op !== "delete") continue;
      await writesDone(op.path);
      await shell.trashItem(op.path).catch(() => { throw refuse("trash"); });
    }
  } catch (error) {
    for (const u of undo.reverse()) await u().catch(() => {});
    throw error instanceof Refused ? error : refuse("failed");
  }
  // What was done, for the batch's one commit.
  return ops.map((op): BatchOp => (op.op === "move" ? { op: "move", from: op.path, to: op.to } : { op: op.op, path: op.path }));
}

// ---- Recently deleted and conflicts (FIL-10, FIL-12) ----

/** A folder deleted notes may be restored into: a root, or a folder in one, that's there. */
async function restoreFolder(p: unknown): Promise<string> {
  if (typeof p !== "string" || !p || !isAbsolute(p) || resolve(p) !== p) throw refuse("invalid");
  const root = roots().find((r) => inside(r.path, p));
  if (!root || relative(root.path, p).split(sep).some((part) => part.startsWith(".")) || !(await isDir(p))) throw refuse("notFound");
  return p;
}
/**
 * Puts deleted notes back from Git history (FIL-10), all or nothing and never over a file (`wx`):
 * where each was, in its root when its folder is gone, or in the chosen folder of the same root
 * (Restore to… doesn't change who can see a note). One commit, like any batch.
 */
async function restoreNotes(rawIds: unknown, rawFolder: unknown): Promise<{ path: string; title: string }[]> {
  const g = await gitOpening;
  if (!g || !isWorkspace()) throw refuse("notFound");
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 1000 || rawIds.some((i) => typeof i !== "string")) throw refuse("invalid");
  const folder = rawFolder === undefined || rawFolder === null ? undefined : await restoreFolder(rawFolder);
  const planned: { path: string; text: string; title: string }[] = [];
  const names = new Map<string, string[]>();
  for (const id of rawIds as string[]) {
    const d = await g.readDeleted(id);
    if (!d) throw refuse("notFound");
    const root = roots().find((r) => r.id === d.root);
    if (!root || !inside(root.path, d.path) || d.path === root.path || (folder && !inside(root.path, folder))) throw refuse("invalid");
    await assertWritable(d.path).catch(() => { throw refuse("readOnly"); });
    const dir = folder ?? ((await isDir(dirname(d.path))) ? dirname(d.path) : root.path);
    const taken = names.get(dir) ?? (await readdir(dir).catch(() => [] as string[]));
    names.set(dir, taken);
    const path = restorePlace({ original: d.path, root: root.path, folder: dir, folderExists: true, taken });
    taken.push(basename(path));
    planned.push({ path, text: d.text, title: titleOrName(d.text, path) });
  }
  const written: string[] = [];
  try {
    for (const p of planned) {
      await writeFile(p.path, p.text, { encoding: "utf8", flag: "wx" });
      written.push(p.path);
    }
  } catch (error) {
    for (const w of written.reverse()) await rm(w, { force: true }).catch(() => {});
    throw refuse((error as NodeJS.ErrnoException).code === "EEXIST" ? "taken" : "failed");
  }
  await g.commitBatch(planned.map((p) => ({ op: "restore", path: p.path })));
  return planned.map(({ path, title }) => ({ path, title }));
}
/** The resolver's choices, checked: notes in the workspace, one of three outcomes, a short copy title. */
function conflictChoices(raw: unknown): ConflictChoice[] {
  if (!Array.isArray(raw) || raw.length > 1000) throw new Error("invalid");
  return raw.map((c: unknown) => {
    const o = c as Record<string, unknown>;
    if (typeof o?.path !== "string" || !isAbsolute(o.path) || !inside(notesHome(), o.path) || !["mine", "theirs", "both"].includes(String(o.choice))) throw new Error("invalid");
    if (o.copyTitle !== undefined && (typeof o.copyTitle !== "string" || o.copyTitle.length > 300)) throw new Error("invalid");
    return { path: resolve(o.path), choice: o.choice as ConflictChoice["choice"], ...(typeof o.copyTitle === "string" ? { copyTitle: o.copyTitle } : {}) };
  });
}

// ---- importing browser notes (FRE-10, D-90) ----
// Only this process reads the bundle: the renderer gets a handle and a count, never the file.
let chosenBundle: { id: string; bundle: Bundle } | undefined;
const fold = (p: string) => p.normalize("NFC").toLowerCase();
/** Every note's path in a root, relative with forward slashes; dot folders skipped as in the scan. */
async function notesIn(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (d.name.startsWith(".")) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) await notesIn(p, base, out);
    else if (d.isFile() && isMarkdown(d.name)) out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}
async function chooseBundle(w: BrowserWindow | undefined): Promise<{ id: string; name: string; notes: number } | undefined> {
  const opts = { properties: ["openFile" as const], filters: [{ name: "Focus Notes export", extensions: ["json"] }] };
  const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
  const file = res.canceled ? undefined : res.filePaths[0];
  if (!file) return undefined;
  // A file that's too large is refused unread (web-app.md → Moving notes).
  const st = await stat(file).catch(() => undefined);
  if (!st?.isFile()) throw new Error("invalid");
  if (st.size > BUNDLE_MAX_BYTES) throw new Error("tooLarge");
  let bundle: Bundle;
  try {
    bundle = parseBundle(await readFile(file, "utf8"));
  } catch {
    throw new Error("invalid");
  }
  chosenBundle = { id: randomUUID(), bundle };
  return { id: chosenBundle.id, name: basename(file), notes: bundle.notes.length };
}
/**
 * Adds the chosen bundle's notes to a root, all or nothing, never replacing a file (`wx`), then
 * commits them as one batch in that root's repository.
 */
async function importBundle(id: unknown, to: unknown): Promise<{ added: number; renamed: number }> {
  if (!chosenBundle || chosenBundle.id !== id) throw refuse("notFound");
  const root = isWorkspace() ? roots().find((r) => r.id === to) : undefined;
  if (!root) throw refuse("invalid");
  await assertWritable(root.path).catch(() => { throw refuse("readOnly"); });
  const { bundle } = chosenBundle;
  const existing = new Map<string, string | undefined>((await notesIn(root.path)).map((p) => [p, undefined]));
  // Only the notes a bundle note could be the same as are read, to skip identical copies.
  const named = new Set(bundle.notes.map((n) => fold(safeWorkspacePath(n.path))));
  for (const p of existing.keys()) if (named.has(fold(p))) existing.set(p, await readFile(join(root.path, ...p.split("/")), "utf8").catch(() => undefined));
  const plan = planImport(bundle, existing, { foldCase: true });
  const written: string[] = [];
  const made: string[] = [];
  try {
    for (const n of plan) {
      const abs = resolve(root.path, ...n.path.split("/"));
      if (!inside(root.path, abs) || abs === root.path) throw refuse("invalid");
      const dir = await mkdir(dirname(abs), { recursive: true });
      if (dir) made.push(dir);
      await writeFile(abs, n.text, { encoding: "utf8", flag: "wx" });
      written.push(abs);
    }
  } catch (error) {
    for (const p of written.reverse()) await rm(p, { force: true }).catch(() => {});
    for (const d of made.reverse()) await rm(d, { recursive: true, force: true }).catch(() => {});
    throw error instanceof Refused ? error : refuse("failed");
  }
  chosenBundle = undefined;
  // Ordinary commits: one for the import, in the chosen root's repository (FRE-10, D-97).
  if (written.length) await (await gitOpening)?.commitBatch(written.map((path) => ({ op: "import", path })));
  return { added: plan.length, renamed: plan.filter((n) => n.renamed).length };
}

// ---- synced settings (PRV-03, D-46) ----
// Only where there's a private repository to sync through; while the file exists, syncing is on.
const privateDir = () => join(notesHome(), "private");
const settingsFile = () => join(privateDir(), ".focus-notes", "settings.json");
const settingsAvailable = () => isWorkspace() && existsSync(privateDir());

/** Addresses a note's link may open in the browser: http, https, and mailto, well formed (EDT-13). */
function isWebLink(url: string): boolean {
  if (!/^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i.test(url)) return false;
  try {
    return Boolean(new URL(url));
  } catch {
    return false;
  }
}

/** The renderer page every IPC request must come from (review issue 4). */
const appPageUrl = () => pathToFileURL(join(import.meta.dirname, "..", "renderer", "index.html")).href;
function fromApp(e: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return url.split("?")[0]!.split("#")[0] === appPageUrl();
}
function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromApp(e)) throw new Error("Refused: request didn't come from the app");
    return fn(...args);
  });
}

function registerIpc(win: () => BrowserWindow | undefined): void {
  handle("note:read", async (p) => readFile(notePath(p), "utf8"));
  handle("note:write", async (p, content) => {
    if (typeof content !== "string") throw new Error("Content must be text");
    const path = notePath(p);
    await atomicWrite(path, content);
    // Committed on the cadence: Mod+S, switching notes, quitting, or 60 s with no typing (D-23).
    withGit((g) => g.written(path));
  });
  handle("note:choose", async () => {
    const w = win();
    const opts = { properties: ["openFile" as const], defaultPath: notesHome(), filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? undefined : res.filePaths[0];
  });
  handle("note:default", async () => {
    const p = isWorkspace() ? join(notesRoot(), "welcome.md") : join(notesHome(), "Welcome.md");
    // Not written into a workspace this app mustn't write (DST-05): the app then shows it can't open it.
    if (!existsSync(p)) await atomicWrite(p, WELCOME).catch(() => {});
    return p;
  });
  handle("note:newPath", async (near) => {
    const dir = typeof near === "string" && near ? dirname(notePath(near)) : notesRoot();
    for (let i = 1; ; i++) {
      const p = join(dir, i === 1 ? "Untitled.md" : `Untitled ${i}.md`);
      if (!existsSync(p)) return p;
    }
  });
  handle("workspace:info", async () => {
    const format = await readFormat();
    return { folder: notesHome(), ...(format !== undefined ? { format } : {}) };
  });
  handle("workspace:scan", async () => {
    const rs = roots();
    const entries = [];
    for (const r of rs) entries.push(...(await listTree(r.path)));
    return { folder: notesHome(), roots: rs, entries };
  });
  handle("workspace:writeFormat", async (text) => {
    // Only a format file this app writes itself: the current version (a migration the person agreed to).
    if (typeof text !== "string" || readWorkspaceFormat(text).access !== "write" || text.length > 64 * 1024) throw new Error("Not a workspace format file");
    await atomicWrite(formatFile(), text);
  });
  handle("workspace:rename", async (from, to) => {
    const a = notePath(from);
    const b = notePath(to);
    // A file name that follows its title (FIL-07): same folder, inside the workspace, never over another note.
    if (dirname(a) !== dirname(b) || !inside(notesHome(), a) || basename(b).startsWith(".")) throw new Error("Can't rename there");
    await assertWritable(a);
    await (writeQueues.get(a) ?? Promise.resolve()).catch(() => {});
    const caseOnly = a.toLowerCase() === b.toLowerCase();
    if (!caseOnly && existsSync(b)) throw new Error("That name is taken");
    if (caseOnly && a !== b) {
      // Case-insensitive file systems need two steps for a change of case.
      const tmp = `${a}.${process.pid}.rename.tmp`;
      await renameRetrying(a, tmp);
      await renameRetrying(tmp, b);
    } else await renameRetrying(a, b);
    withGit((g) => g.renamed(a, b));
  });
  // Each batch is one commit (FIL-05, D-94): resolved after the commit, so "saved" means saved (PRF-09).
  // A commit that fails leaves the files as the batch made them and is reported as a sync problem.
  handle("workspace:apply", async (ops) => {
    const done = await applyOps(ops);
    await (await gitOpening)?.commitBatch(done);
  });
  handle("bundle:choose", () => chooseBundle(win()));
  handle("bundle:import", (id, to) => importBundle(id, to));
  handle("settings:load", async () => {
    if (!settingsAvailable()) return { available: false };
    const text = await readFile(settingsFile(), "utf8").catch(() => undefined);
    return { available: true, ...(text !== undefined && text.length <= 64 * 1024 ? { text } : {}) };
  });
  handle("settings:save", async (text) => {
    // Only a settings file, and only what's valid in it, is ever written (schemas/settings.schema.json).
    const parsed = typeof text === "string" && text.length <= 64 * 1024 ? parseSettings(text) : undefined;
    if (!settingsAvailable() || !parsed) throw new Error("Not a settings file");
    await atomicWrite(settingsFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    withGit((g) => g.written(settingsFile()));
  });
  handle("settings:remove", async () => {
    if (!settingsAvailable()) return;
    await assertWritable(settingsFile());
    await rm(settingsFile(), { force: true });
    withGit((g) => g.written(settingsFile()));
  });
  handle("sync:now", async (reason) => {
    const g = await gitOpening;
    return g ? g.request(reason === "switch" ? "switch" : "save") : NO_GIT;
  });
  handle("sync:status", async () => {
    const g = await gitOpening;
    return g ? g.status() : NO_GIT;
  });
  handle("setup:status", async () => (await setup()).report());
  // The folder is the main process's own: the one setup started with, or the one chosen with the dialog (D-98).
  handle("setup:start", async (options, passphrase) => (await setup()).start(checkOptions({ ...(options as object), folder: await setupFolder() }), passphraseArg(passphrase)));
  handle("setup:retry", async (id, passphrase) => {
    if (!(SETUP_STEPS as readonly unknown[]).includes(id)) throw new Error("Unknown setup step");
    return (await setup()).retry(id as SetupStepId, passphraseArg(passphrase));
  });
  handle("setup:reset", async () => (await setup()).reset());
  handle("setup:strength", async (p) => passphraseStrength(passphraseArg(p) ?? ""));
  handle("firstRun:git", () => account.gitCheck());
  handle("firstRun:account", () => account.status());
  handle("firstRun:useExisting", () => account.useExisting());
  handle("firstRun:signIn", (device) => account.signIn(device === true));
  handle("firstRun:cancelSignIn", async () => account.cancel());
  handle("firstRun:useToken", async (token) => {
    if (typeof token !== "string" || token.length > 255) throw new Error("Not a token");
    return account.useToken(token);
  });
  handle("firstRun:signOut", async (options) => {
    const s = await account.signOut({ git: (options as { git?: unknown } | undefined)?.git !== false });
    if (!s.account || s.signedOut) await forgetLocal("signOut");
    return s;
  });
  handle("firstRun:beginSwitch", () => account.beginSwitch());
  handle("firstRun:endSwitch", () => account.endSwitch());
  handle("workspace:removal", () => removalCheck(setupRunner, notesHome()));
  handle("workspace:remove", () => removeLocalWorkspace());
  handle("firstRun:identity", () => account.identity());
  handle("firstRun:setIdentity", async (i, scope) => {
    const id = { name: String(i?.name ?? "").trim(), email: String(i?.email ?? "").trim() };
    if (identityProblem(id)) return false;
    if (scope === "global") return account.setGlobalIdentity(id);
    if (scope !== "workspace") return false;
    workspaceIdentity = id;
    await saveFirstRun();
    return true;
  });
  handle("firstRun:repositories", () => repositories());
  handle("firstRun:folder", () => setupFolder());
  handle("firstRun:chooseFolder", async () => {
    const folder = await chooseFolder("Choose a folder for your workspace");
    if (folder) targetFolder = folder;
    return folder;
  });
  handle("firstRun:clone", async (owner, name): Promise<WorkspaceResult> => {
    if (typeof owner !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(owner) || typeof name !== "string" || !isRepoName(name)) throw new Error("Not a repository");
    const r = await cloneWorkspace(setupRunner, remoteUrl(owner, name), targetFolder ?? defaultHome());
    if (r.ok) pendingWorkspace = r.folder;
    return r;
  });
  handle("firstRun:openFolder", async (): Promise<WorkspaceResult | undefined> => {
    const folder = await chooseFolder("Open a workspace folder");
    if (!folder) return undefined;
    const r = await checkWorkspace(setupRunner, folder);
    if (r.ok) pendingWorkspace = folder;
    return r;
  });
  handle("firstRun:openWorkspace", async (): Promise<WorkspaceResult> => {
    const report = (await setup()).report();
    const made = ["clone", "link"].every((id) => report.steps.find((x) => x.id === id)?.state === "done");
    const folder = pendingWorkspace ?? (made ? report.options?.folder : undefined);
    if (!folder) return { ok: false, problem: "failed" };
    const r = await checkWorkspace(setupRunner, folder);
    if (r.ok) await switchWorkspace(folder);
    return r;
  });
  ipcMain.on("firstRun:openPage", (e, page: unknown) => {
    if (!fromApp(e) || typeof page !== "string" || !Object.hasOwn(FIRST_RUN_PAGES, page)) return;
    void shell.openExternal(FIRST_RUN_PAGES[page as FirstRunPage]);
  });
  handle("sync:conflicts", async () => (await gitOpening)?.conflicts() ?? []);
  handle("sync:resolve", async (choices) => {
    const checked = conflictChoices(choices);
    const g = await gitOpening;
    return g ? g.resolve(checked) : NO_GIT;
  });
  handle("history:deleted", async () => (isWorkspace() ? (await gitOpening)?.deleted() ?? [] : []));
  handle("history:restore", (ids, folder) => restoreNotes(ids, folder));
  handle("window:fullScreen", async () => {
    const w = win();
    if (w) w.setFullScreen(!w.isFullScreen());
  });
  handle("state:load", async () => {
    try {
      const s = JSON.parse(await readFile(stateFile(), "utf8"));
      return s && s.version === 1 ? s : { version: 1 };
    } catch {
      return { version: 1 };
    }
  });
  handle("state:save", async (s) => {
    if (!s || s.version !== 1) throw new Error("Unknown state version");
    await atomicWrite(stateFile(), JSON.stringify(s, null, 2));
  });
  // Copying a link's address (EDT-13). Text only, and never read back: the renderer can't read the clipboard.
  handle("clipboard:write", async (text) => {
    if (typeof text !== "string" || text.length > 10_000) throw new Error("Only text can be copied");
    clipboard.writeText(text);
  });
  // A link from a note (EDT-13): only http, https, and mailto, and only in the user's browser.
  ipcMain.on("link:open", (e, url: unknown) => {
    if (!fromApp(e) || typeof url !== "string" || !isWebLink(url)) return;
    void shell.openExternal(url);
  });
  ipcMain.on("app:ready", (e) => {
    if (!fromApp(e)) return;
    // From process start (PRF-02: "desktop start to an editable caret"), including Electron's own startup.
    const ms = Math.round(process.uptime() * 1000);
    process.stdout.write(`[focus-notes] ready-ms=${ms}\n`);
    startGit();
  });
}

function hardenSession(): void {
  // No network: only the app's own files and DevTools may load (PRV-01, PKG-06).
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = details.url.startsWith("file:") || details.url.startsWith("devtools:") || details.url.startsWith("data:");
    if (!ok) process.stdout.write(`[focus-notes] blocked request to ${new URL(details.url).origin}\n`);
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow(): BrowserWindow {
  const dark = nativeTheme.shouldUseDarkColors;
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 360,
    minHeight: 320,
    show: false,
    title: "Focus Notes",
    backgroundColor: customWindow ? "#00000000" : dark ? "#1a1a1c" : "#fbfaf7",
    ...(platform === "macos"
      ? { titleBarStyle: "hiddenInset" as const }
      : customWindow
        ? { frame: false, transparent: true, roundedCorners: true }
        : { titleBarStyle: "hidden" as const, titleBarOverlay: { color: "#00000000", symbolColor: dark ? "#eceae6" : "#1f1d1a", height: 44 } }),
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged || process.env.FOCUS_NOTES_DEVTOOLS === "1",
    },
  });
  win.once("ready-to-show", () => win.show());
  // ⇧⌘V pastes plain text on macOS too (Keyboard shortcuts → Everyday editing), where Chromium binds
  // only ⌥⇧⌘V. The renderer still sees Shift held, so the editor pastes the text as it is (EDT-09).
  if (platform === "macos") {
    win.webContents.on("before-input-event", (_e, input) => {
      if (input.type === "keyDown" && input.meta && input.shift && !input.alt && !input.control && input.key.toLowerCase() === "v") win.webContents.pasteAndMatchStyle();
    });
  }
  void win.loadFile(join(import.meta.dirname, "..", "renderer", "index.html"), { query: { platform } });

  // Ask the renderer to save pending changes before the window closes (QLT-03). If saving fails,
  // the person decides; text is never discarded silently.
  let closing = false;
  let allowClose = false;
  win.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    if (closing) return;
    closing = true;
    const decide = async (ok: boolean) => {
      if (ok) {
        allowClose = true;
        win.close();
        return;
      }
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        message: "Couldn't save your latest changes",
        detail: "Your text is still in the window. If you close now, the changes since the last save will be lost.",
        buttons: ["Keep the window open", "Close without saving"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      closing = false;
      if (response === 1) {
        allowClose = true;
        win.close();
      }
    };
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners("app:flushed");
      void decide(false);
    }, 5000);
    ipcMain.once("app:flushed", (_e, ok: unknown) => {
      clearTimeout(timer);
      void decide(ok === true);
    });
    win.webContents.send("app:flush");
  });

  nativeTheme.on("updated", () => {
    const d = nativeTheme.shouldUseDarkColors;
    win.webContents.send("scheme:changed", d ? "dark" : "light");
  });
  ipcMain.on("window:scheme", (e, scheme: unknown, canvas: unknown) => {
    if (!fromApp(e) || (scheme !== "light" && scheme !== "dark")) return;
    if (platform !== "macos" && !customWindow) win.setTitleBarOverlay?.({ color: "#00000000", symbolColor: scheme === "dark" ? "#eceae6" : "#1f1d1a", height: 44 });
    const color = typeof canvas === "string" && /^#[0-9a-f]{6}$/i.test(canvas) ? canvas : scheme === "dark" ? "#1a1a1c" : "#fbfaf7";
    win.setBackgroundColor(customWindow ? "#00000000" : color);
  });
  return win;
}

app.on("web-contents-created", (_e, contents) => {
  // The app never navigates: dropped files, links, and redirects can't replace it (review issue 4).
  contents.on("will-navigate", (e) => e.preventDefault());
  contents.on("will-redirect", (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    // Links open in the user's browser, only for https and mailto (Views as data → Security).
    if (/^(https|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

/**
 * Watches the workspace for changes made outside the app (Desktop and Git → External changes).
 * Events are batched for 30 ms, checked against the disk, and sent as one report (PRF-11).
 * Git's own files, dot folders, and the app's temporary files aren't reported.
 */
function watchWorkspace(win: () => BrowserWindow | undefined): FSWatcher | undefined {
  const home = notesHome();
  const formatRel = join(".focus-notes", "workspace.json");
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const report = async () => {
    timer = undefined;
    // A pull or a conflict being settled rewrites files: they're read once it's over, so the app
    // never sees a half-applied state (a rebase's conflict markers) as a change made outside.
    await gitSync?.writable().catch(() => {});
    if (timer) return; // More changes came meanwhile: they're reported together.
    const rels = [...pending];
    pending.clear();
    const changes: { path: string; kind: "note" | "folder" | "format"; exists: boolean; title?: string }[] = [];
    for (const rel of rels) {
      const p = join(home, rel);
      if (rel === formatRel) {
        changes.push({ path: p, kind: "format", exists: existsSync(p) });
        continue;
      }
      const st = await stat(p).catch(() => undefined);
      if (!st) changes.push({ path: p, kind: isMarkdown(p) ? "note" : "folder", exists: false });
      else if (st.isDirectory()) {
        changes.push({ path: p, kind: "folder", exists: true });
        for (const e of await listTree(p)) changes.push({ ...e, exists: true });
      } else if (isMarkdown(p)) {
        const title = await readTitle(p);
        changes.push({ path: p, kind: "note", exists: true, ...(title ? { title } : {}) });
      }
    }
    if (!changes.length) return;
    // Anything that changed on disk changes the Git status cache's key (PRF-07).
    gitSync?.changed();
    win()?.webContents.send("workspace:changed", changes);
    // Counts and times only: note names are private.
    process.stdout.write(`[focus-notes] workspace-changed n=${changes.length} at=${Date.now()}\n`);
  };
  try {
    // The real path: on Windows, a short (8.3) folder name makes the watcher report wrong names.
    const w = watch(realpathSync.native(home), { recursive: true }, (_event, name) => {
      if (!name) return;
      const rel = name.toString();
      const hidden = rel.split(sep).some((part) => part.startsWith(".") || part === "node_modules");
      if ((hidden && rel !== formatRel) || rel.endsWith(".tmp")) return;
      pending.add(rel);
      clearTimeout(timer);
      timer = setTimeout(() => void report(), 30);
    });
    w.on("error", () => w.close());
    return w;
  } catch {
    return undefined; // No watcher (an unsupported file system): the app still works, without live updates.
  }
}

let mainWindow: BrowserWindow | undefined;
let watcher: FSWatcher | undefined;
app.whenReady().then(async () => {
  chosenHome = readChosenHome();
  readFirstRun();
  hardenSession();
  registerIpc(() => mainWindow);
  await stat(notesHome()).catch(() => mkdir(notesHome(), { recursive: true }));
  mainWindow = createWindow();
  watcher = watchWorkspace(() => mainWindow);
  // Never on the path of the first frame: Git answers when it answers (PRF-07).
  // Git opens once the caret is ready, or after 3 s if the note never becomes ready.
  setTimeout(() => startGit(), 3000);
  // Fetching when the window becomes active (Desktop and Git → Save and sync, step 5).
  mainWindow.on("focus", () => gitSync?.focused());
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
});
app.on("window-all-closed", () => {
  watcher?.close();
  app.quit();
});
// Quitting waits for writes already under way, so a preference saved just before closing is kept,
// then commits and pushes (D-23) and releases the workspace's lock.
let gitQuit = false;
const QUIT_GIT_LIMIT_MS = 8_000;
app.on("will-quit", (e) => {
  if (writeQueues.size === 0 && (gitQuit || !gitSync)) return;
  e.preventDefault();
  void Promise.allSettled([...writeQueues.values()])
    .then(async () => {
      if (gitQuit) return;
      gitQuit = true;
      // Quitting never hangs on the network: the commit is local, and a push that doesn't finish
      // in time is retried at the next start.
      await Promise.race([gitSync?.quit().catch(() => {}), new Promise((r) => setTimeout(r, QUIT_GIT_LIMIT_MS))]);
    })
    .then(() => app.quit());
});
