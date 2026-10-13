/**
 * The Electron main process (PKG-03, SEC-01, PKG-06, PRV-01): a hardened shell that owns the
 * window, the file system, and the user's own `git`. It makes no network requests of its own and
 * allows none from the renderer; Git talks to the workspace's remotes (WP-3.3).
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { mkdir, open, readdir, readFile, rename, rm, writeFile, stat } from "node:fs/promises";
import { existsSync, realpathSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readWorkspaceFormat } from "@focus-notes/core/workspace-format";
import { titleOfMarkdown } from "@focus-notes/core/workspace";
import { GitSync, NO_GIT } from "./git/sync.ts";
import type { BatchOp } from "./git/message.ts";

const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const customWindow = process.argv.includes("--custom-window") && platform !== "macos";

if (process.env.FOCUS_NOTES_USER_DATA) app.setPath("userData", resolve(process.env.FOCUS_NOTES_USER_DATA));
const notesHome = () => resolve(process.env.FOCUS_NOTES_DOCS ?? join(app.getPath("documents"), "Focus Notes"));
const stateFile = () => join(app.getPath("userData"), "state.json");

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
const gitWaiting: ((g: GitSync) => void)[] = [];
/** Runs now if Git is open, or once it opens (a note written before then is still committed). */
const withGit = (fn: (g: GitSync) => void) => {
  if (gitSync) fn(gitSync);
  else if (!gitOpened) gitWaiting.push(fn);
};
let startGit: () => void = () => {};
/** Opened once the caret is ready, so Git never competes with the first frame (PRF-02, PRF-07). */
const gitOpening = new Promise<GitSync | undefined>((resolve) => {
  startGit = () => {
    startGit = () => {};
    const idleMs = envMs("FOCUS_NOTES_IDLE_COMMIT_MS");
    const pointerGapMs = envMs("FOCUS_NOTES_POINTER_GAP_MS");
    resolve(GitSync.open({
      folder: notesHome(),
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
});

// ---- the workspace (WP-2.3) ----
// The notes folder is the workspace. With .focus-notes/workspace.json it has the repository's
// layout: public notes in notes/, private ones in private/notes/ (D-84). Before that, it's one
// root of its own (D-92), as it was through M2.
const formatFile = () => join(notesHome(), ".focus-notes", "workspace.json");
const isWorkspace = () => existsSync(formatFile());
const roots = () => isWorkspace()
  ? [{ id: "private", path: join(notesHome(), "private", "notes"), readOnly: false }, { id: "public", path: join(notesHome(), "notes"), readOnly: false }]
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
 * A move between roots changes visibility, which arrives with Git (WP-3.4), so it's refused here.
 */
async function applyOps(raw: unknown): Promise<BatchOp[]> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5000) throw refuse("invalid");
  type Op = { op: "createFolder" | "delete"; path: string; root: string } | { op: "move"; path: string; to: string; root: string }
    | { op: "write"; path: string; text: string; root: string };
  const ops = raw.map((op: unknown): Op => {
    const o = op as Record<string, unknown>;
    if (o?.op === "createFolder" || o?.op === "delete") return { op: o.op, ...opPath(o.path) };
    if (o?.op === "move") {
      const from = opPath(o.from);
      const to = opPath(o.to);
      if (from.root !== to.root) throw refuse("invalid");
      return { op: "move" as const, path: from.path, to: to.path, root: from.root };
    }
    if (o?.op === "write") {
      const at = opPath(o.path);
      if (typeof o.text !== "string" || !isMarkdown(at.path)) throw refuse("invalid");
      return { op: "write" as const, ...at, text: o.text };
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
  handle("sync:now", async (reason) => {
    const g = await gitOpening;
    return g ? g.request(reason === "switch" ? "switch" : "save") : NO_GIT;
  });
  handle("sync:status", async () => {
    const g = await gitOpening;
    return g ? g.status() : NO_GIT;
  });
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
app.on("will-quit", (e) => {
  if (writeQueues.size === 0 && (gitQuit || !gitSync)) return;
  e.preventDefault();
  void Promise.allSettled([...writeQueues.values()])
    .then(async () => {
      if (gitQuit) return;
      gitQuit = true;
      await gitSync?.quit().catch(() => {});
    })
    .then(() => app.quit());
});
