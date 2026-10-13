/**
 * The Electron main process (PKG-03, SEC-01, PKG-06, PRV-01): a hardened shell that owns the
 * window, the file system, and nothing else. It makes no network requests and allows none.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from "electron";
import { mkdir, readFile, rename, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const customWindow = process.argv.includes("--custom-window") && platform !== "macos";

if (process.env.FOCUS_NOTES_USER_DATA) app.setPath("userData", resolve(process.env.FOCUS_NOTES_USER_DATA));
const notesHome = () => resolve(process.env.FOCUS_NOTES_DOCS ?? join(app.getPath("documents"), "Focus Notes"));
const stateFile = () => join(app.getPath("userData"), "state.json");

const WELCOME = `# Welcome to Focus Notes

Everything you write here is saved as plain Markdown on your computer.
`;

if (!app.requestSingleInstanceLock()) app.quit();

/** Only Markdown files, given as absolute paths, may be read or written. */
function notePath(p: unknown): string {
  if (typeof p !== "string" || !p) throw new Error("A note path is required");
  const abs = resolve(p);
  if (![".md", ".markdown"].includes(extname(abs).toLowerCase())) throw new Error("Only Markdown files can be opened");
  return abs;
}

/** Atomic write: a temporary file next to the note, then rename (Performance and quality → Reliability). */
async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

function registerIpc(win: () => BrowserWindow | undefined): void {
  ipcMain.handle("note:read", async (_e, p) => readFile(notePath(p), "utf8"));
  ipcMain.handle("note:write", async (_e, p, content) => {
    if (typeof content !== "string") throw new Error("Content must be text");
    await atomicWrite(notePath(p), content);
  });
  ipcMain.handle("note:choose", async () => {
    const w = win();
    const opts = { properties: ["openFile" as const], defaultPath: notesHome(), filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? undefined : res.filePaths[0];
  });
  ipcMain.handle("note:default", async () => {
    const p = join(notesHome(), "Welcome.md");
    if (!existsSync(p)) await atomicWrite(p, WELCOME);
    return p;
  });
  ipcMain.handle("state:load", async () => {
    try {
      const s = JSON.parse(await readFile(stateFile(), "utf8"));
      return s && s.version === 1 ? s : { version: 1 };
    } catch {
      return { version: 1 };
    }
  });
  ipcMain.handle("state:save", async (_e, s) => {
    if (!s || s.version !== 1) throw new Error("Unknown state version");
    await atomicWrite(stateFile(), JSON.stringify(s, null, 2));
  });
  ipcMain.on("app:ready", () => {
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

  // Ask the renderer to save pending changes before the window closes (QLT-03).
  let flushed = false;
  win.on("close", (e) => {
    if (flushed) return;
    e.preventDefault();
    const done = () => {
      flushed = true;
      win.close();
    };
    const timer = setTimeout(done, 2000);
    ipcMain.once("app:flushed", () => {
      clearTimeout(timer);
      done();
    });
    win.webContents.send("app:flush");
  });

  nativeTheme.on("updated", () => {
    const d = nativeTheme.shouldUseDarkColors;
    win.webContents.send("scheme:changed", d ? "dark" : "light");
  });
  ipcMain.on("window:scheme", (_e, scheme: "light" | "dark") => {
    if (platform !== "macos" && !customWindow) win.setTitleBarOverlay?.({ color: "#00000000", symbolColor: scheme === "dark" ? "#eceae6" : "#1f1d1a", height: 44 });
    win.setBackgroundColor(customWindow ? "#00000000" : scheme === "dark" ? "#1a1a1c" : "#fbfaf7");
  });
  return win;
}

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) e.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    // Links open in the user's browser, only for https and mailto (Views as data → Security).
    if (/^(https|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

let mainWindow: BrowserWindow | undefined;
app.whenReady().then(async () => {
  hardenSession();
  registerIpc(() => mainWindow);
  await stat(notesHome()).catch(() => mkdir(notesHome(), { recursive: true }));
  mainWindow = createWindow();
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
});
app.on("window-all-closed", () => app.quit());
