/**
 * The Electron main process (PKG-03, SEC-01, PKG-06, PRV-01): a hardened shell that owns the
 * window, the file system, and nothing else. It makes no network requests and allows none.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { mkdir, readdir, readFile, rename, rm, writeFile, stat } from "node:fs/promises";
import { existsSync, realpathSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readWorkspaceFormat } from "@focus-notes/core/workspace-format";

const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const customWindow = process.argv.includes("--custom-window") && platform !== "macos";

if (process.env.FOCUS_NOTES_USER_DATA) app.setPath("userData", resolve(process.env.FOCUS_NOTES_USER_DATA));
const notesHome = () => resolve(process.env.FOCUS_NOTES_DOCS ?? join(app.getPath("documents"), "Focus Notes"));
const stateFile = () => join(app.getPath("userData"), "state.json");

const WELCOME = `# Welcome to Focus Notes

Everything you write here is saved as plain Markdown on your computer.
`;

if (!app.requestSingleInstanceLock()) app.quit();

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
/** Every note and folder under a root; folders and files starting with a dot are skipped. */
async function listTree(dir: string, out: { path: string; kind: "note" | "folder" }[] = []) {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const d of items) {
    if (d.name.startsWith(".") || d.name === "node_modules") continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) {
      out.push({ path: p, kind: "folder" });
      await listTree(p, out);
    } else if (d.isFile() && isMarkdown(d.name)) out.push({ path: p, kind: "note" });
  }
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

async function writeNow(path: string, content: string): Promise<void> {
  await assertWritable(path);
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
    await atomicWrite(notePath(p), content);
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
      await rename(a, tmp);
      await rename(tmp, b);
    } else await rename(a, b);
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
  ipcMain.on("app:ready", (e) => {
    if (!fromApp(e)) return;
    // From process start (PRF-02: "desktop start to an editable caret"), including Electron's own startup.
    const ms = Math.round(process.uptime() * 1000);
    process.stdout.write(`[focus-notes] ready-ms=${ms}\n`);
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
    const changes: { path: string; kind: "note" | "folder" | "format"; exists: boolean }[] = [];
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
      } else if (isMarkdown(p)) changes.push({ path: p, kind: "note", exists: true });
    }
    if (!changes.length) return;
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
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
});
app.on("window-all-closed", () => {
  watcher?.close();
  app.quit();
});
// Quitting waits for writes already under way, so a preference saved just before closing is kept.
app.on("will-quit", (e) => {
  if (writeQueues.size === 0) return;
  e.preventDefault();
  void Promise.allSettled([...writeQueues.values()]).then(() => app.quit());
});
