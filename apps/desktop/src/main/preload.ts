/**
 * The preload bridge: the renderer's only door to the system. Sandboxed, typed, and narrow.
 * It exposes the PlatformBridge contract from packages/core as window.focusNotes.
 */
import { contextBridge, ipcRenderer } from "electron";
import { parsePointerZone, pointerMove } from "./window/pointer-report.ts";

const params = new URLSearchParams(globalThis.location?.search ?? "");
const platform = (params.get("platform") ?? "windows") as "macos" | "windows" | "linux";
const darkQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
/** The app-built window's state when the page loaded (Windows and Linux, D-14); absent on macOS. */
const initialWindow = (() => {
  try {
    const w = JSON.parse(params.get("window") ?? "null") as { frame?: unknown } | null;
    return w && (w.frame === "custom" || w.frame === "opaque") ? w : undefined;
  } catch {
    return undefined;
  }
})();
const listen = (channel: string) => (listener: (...args: unknown[]) => void) => {
  const handler = (_e: unknown, ...args: unknown[]) => listener(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
/** The latest compositing the main process sent (D-121), kept for the app, which listens only once it starts. */
let latestCompositing: unknown;
ipcRenderer.on("compositing:changed", (_e, c: unknown) => (latestCompositing = c));

/**
 * The pointer near the window's edges (Windows and Linux: the click-through margin, D-104) or near
 * the title bar band (macOS: the system's drag region hides the pointer from the page, D-106), and
 * leaving the page. The shell reads where the pointer is itself, so the report carries nothing, and
 * nothing is sent while the pointer is still or elsewhere (PRF-04): at most one report a frame while
 * it moves in that zone, and one more as it leaves it. While the window lets clicks through (the
 * shell says so, `window:passthrough`), every move the system forwards is reported, so the window
 * takes the mouse again wherever the pointer comes back (D-150).
 */
const pointerZone = parsePointerZone(params.get("pointer"));
if (pointerZone) {
  let near = false;
  let passthrough = false;
  ipcRenderer.on("window:passthrough", (_e, on: unknown) => (passthrough = on === true));
  let queued = false;
  const report = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      ipcRenderer.send("window:pointer");
    });
  };
  // Mouse events, which Windows forwards to a window that ignores the mouse.
  addEventListener("mousemove", (e) => {
    const move = pointerMove(pointerZone, near, passthrough, e.clientX, e.clientY, innerWidth, innerHeight);
    near = move.near;
    if (move.report) report();
  }, { capture: true, passive: true });
  addEventListener("mouseout", (e) => {
    if (e.relatedTarget) return;
    near = false;
    report();
  }, { capture: true, passive: true });
}

contextBridge.exposeInMainWorld("focusNotes", {
  platform,
  // GPU or software compositing (D-121): the main process reads it, and tells of changes after a GPU crash.
  compositing: {
    initial: params.get("compositing") === "software" ? "software" : "gpu",
    onChange: (listener: (...args: unknown[]) => void) => {
      if (latestCompositing !== undefined) listener(latestCompositing);
      return listen("compositing:changed")(listener);
    },
  },
  // Off only when the main process says so: end-to-end tests (PRF-10).
  warmUp: params.get("warmup") !== "0",
  readNote: (path: string) => ipcRenderer.invoke("note:read", path),
  readNotes: (paths: readonly string[]) => ipcRenderer.invoke("notes:read", paths),
  writeNote: (path: string, content: string) => ipcRenderer.invoke("note:write", path, content),
  chooseNote: () => ipcRenderer.invoke("note:choose"),
  newNotePath: (near?: string) => ipcRenderer.invoke("note:newPath", near),
  toggleFullScreen: () => void ipcRenderer.invoke("window:fullScreen"),
  defaultNotePath: () => ipcRenderer.invoke("note:default"),
  loadAppState: () => ipcRenderer.invoke("state:load"),
  saveAppState: (state: unknown) => ipcRenderer.invoke("state:save", state),
  systemScheme: () => (darkQuery?.matches ? "dark" : "light"),
  onSystemSchemeChange: (listener: (s: "light" | "dark") => void) => {
    const handler = (_e: unknown, s: "light" | "dark") => listener(s);
    ipcRenderer.on("scheme:changed", handler);
    return () => ipcRenderer.removeListener("scheme:changed", handler);
  },
  markReady: () => ipcRenderer.send("app:ready"),
  // Links in notes open in the default browser; the main process checks the address again (EDT-13).
  openLink: (url: string) => ipcRenderer.send("link:open", url),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  // The workspace (WP-2.3): its tree, its format, renames that follow titles, and outside changes.
  workspace: {
    info: () => ipcRenderer.invoke("workspace:info"),
    scan: () => ipcRenderer.invoke("workspace:scan"),
    writeFormat: (text: string) => ipcRenderer.invoke("workspace:writeFormat", text),
    renameNote: (from: string, to: string) => ipcRenderer.invoke("workspace:rename", from, to),
    apply: (ops: unknown[]) => ipcRenderer.invoke("workspace:apply", ops),
    // Import notes (FRE-10): the main process shows the open dialog and reads the bundle itself.
    chooseBundle: () => ipcRenderer.invoke("bundle:choose"),
    importBundle: (id: string, to: "private" | "public") => ipcRenderer.invoke("bundle:import", id, to),
    // Recently deleted (FIL-10): found from Git history, put back by the main process.
    deleted: () => ipcRenderer.invoke("history:deleted"),
    restore: (ids: string[], folder?: string) => ipcRenderer.invoke("history:restore", ids, folder),
    // Remove this workspace from this computer (FRE-07): the main process checks everything is on GitHub, twice.
    removal: () => ipcRenderer.invoke("workspace:removal"),
    remove: () => ipcRenderer.invoke("workspace:remove"),
    onChange: (listener: (changes: unknown[]) => void) => {
      const handler = (_e: unknown, changes: unknown[]) => listener(changes);
      ipcRenderer.on("workspace:changed", handler);
      return () => ipcRenderer.removeListener("workspace:changed", handler);
    },
  },
  // The recovery journal (QLT-03): unsaved text, and what this launch restored after a crash.
  journal: {
    write: (path: string, text: string) => ipcRenderer.invoke("journal:write", path, text),
    restored: () => ipcRenderer.invoke("journal:restored"),
  },
  // Synced settings in the private repository (PRV-03): the main process checks what it writes.
  settings: {
    load: () => ipcRenderer.invoke("settings:load"),
    save: (text: string) => ipcRenderer.invoke("settings:save", text),
    remove: () => ipcRenderer.invoke("settings:remove"),
  },
  // Share audiences (WP-5.3, D-134): changes as data; the main process makes the secrets and writes access.json.
  access: {
    load: () => ipcRenderer.invoke("access:load"),
    apply: (change: unknown) => ipcRenderer.invoke("access:apply", change),
    reveal: (id: string) => ipcRenderer.invoke("access:reveal", id),
    setTemplate: (template: string | null) => ipcRenderer.invoke("access:template", template),
    copy: (id: string, what: string, invite?: unknown) => ipcRenderer.invoke("access:copy", id, what, invite),
  },
  // Local diagnostics (QLT-04, D-140): the main process builds and redacts the report; the window sends only its timings.
  diagnostics: {
    preview: () => ipcRenderer.invoke("diagnostics:preview"),
    copy: (timings: unknown) => ipcRenderer.invoke("diagnostics:copy", timings),
    save: (timings: unknown) => ipcRenderer.invoke("diagnostics:save", timings),
    reportProblem: (timings: unknown) => ipcRenderer.invoke("diagnostics:reportProblem", timings),
  },
  // Save and sync with the user's own Git (WP-3.3): intent-level only, never a Git command.
  sync: {
    now: (reason: "save" | "switch") => ipcRenderer.invoke("sync:now", reason),
    status: () => ipcRenderer.invoke("sync:status"),
    // The conflict resolver (FIL-12): both versions, and the choices; the main process checks them.
    conflicts: () => ipcRenderer.invoke("sync:conflicts"),
    resolve: (choices: unknown[]) => ipcRenderer.invoke("sync:resolve", choices),
    onStatus: (listener: (report: unknown) => void) => {
      const handler = (_e: unknown, report: unknown) => listener(report);
      ipcRenderer.on("sync:status", handler);
      return () => ipcRenderer.removeListener("sync:status", handler);
    },
  },
  // Set up my instance (WP-3.1, FRE-08): intent-level steps; the passphrase is passed only to run the vault step.
  setup: {
    status: () => ipcRenderer.invoke("setup:status"),
    start: (options: unknown, passphrase?: string) => ipcRenderer.invoke("setup:start", options, passphrase),
    retry: (step: string, passphrase?: string) => ipcRenderer.invoke("setup:retry", step, passphrase),
    reset: () => ipcRenderer.invoke("setup:reset"),
    passphraseStrength: (passphrase: string) => ipcRenderer.invoke("setup:strength", passphrase),
    onReport: (listener: (report: unknown) => void) => {
      const handler = (_e: unknown, report: unknown) => listener(report);
      ipcRenderer.on("setup:report", handler);
      return () => ipcRenderer.removeListener("setup:report", handler);
    },
  },
  // The first run (WP-3.2): intent-level only. A pasted token goes to the main process once, which gives it to Git's helper.
  firstRun: {
    git: () => ipcRenderer.invoke("firstRun:git"),
    account: () => ipcRenderer.invoke("firstRun:account"),
    useExisting: () => ipcRenderer.invoke("firstRun:useExisting"),
    signIn: (device: boolean) => ipcRenderer.invoke("firstRun:signIn", device),
    cancelSignIn: () => ipcRenderer.invoke("firstRun:cancelSignIn"),
    onSignIn: (listener: (p: unknown) => void) => {
      const handler = (_e: unknown, p: unknown) => listener(p);
      ipcRenderer.on("firstRun:signIn", handler);
      return () => ipcRenderer.removeListener("firstRun:signIn", handler);
    },
    useToken: (token: string) => ipcRenderer.invoke("firstRun:useToken", token),
    signOut: (options?: { git?: boolean }) => ipcRenderer.invoke("firstRun:signOut", { git: options?.git !== false }),
    // Switch account (FRE-07): the main process takes the credential out of Git's helper, and puts it back if no one signs in.
    beginSwitch: () => ipcRenderer.invoke("firstRun:beginSwitch"),
    endSwitch: () => ipcRenderer.invoke("firstRun:endSwitch"),
    identity: () => ipcRenderer.invoke("firstRun:identity"),
    setIdentity: (identity: unknown, scope: string) => ipcRenderer.invoke("firstRun:setIdentity", identity, scope),
    repositories: () => ipcRenderer.invoke("firstRun:repositories"),
    folder: () => ipcRenderer.invoke("firstRun:folder"),
    chooseFolder: () => ipcRenderer.invoke("firstRun:chooseFolder"),
    clone: (owner: string, name: string) => ipcRenderer.invoke("firstRun:clone", owner, name),
    openFolder: () => ipcRenderer.invoke("firstRun:openFolder"),
    openWorkspace: () => ipcRenderer.invoke("firstRun:openWorkspace"),
    openPage: (page: string) => ipcRenderer.send("firstRun:openPage", page),
  },
  setWindowScheme: (s: "light" | "dark", canvas?: string, accent?: string) => ipcRenderer.send("window:scheme", s, canvas, accent),
  // The window the app draws and manages on Windows and Linux (DSK-03, DSK-08): intent-level only.
  window: initialWindow
    ? {
        initial: initialWindow,
        state: () => ipcRenderer.invoke("window:state"),
        onState: listen("window:state"),
        onMenu: listen("window:menu"),
        minimize: () => ipcRenderer.send("window:minimize"),
        maximize: () => ipcRenderer.send("window:maximize"),
        restore: () => ipcRenderer.send("window:restore"),
    toggleVertical: () => ipcRenderer.send("window:vertical"),
        close: () => ipcRenderer.send("window:close"),
        snap: (zone: string) => ipcRenderer.send("window:snap", zone),
        drag: (phase: string, kind: string, x: number, y: number, shift: boolean) => ipcRenderer.send("window:drag", phase, kind, x, y, shift),
        keyboard: (mode: string) => ipcRenderer.send("window:keyboard", mode),
        key: (key: string, fine: boolean) => ipcRenderer.send("window:key", key, fine),
      }
    : undefined,
  // macOS's native window (DSK-02, DSK-05): the menu bar the renderer builds from its commands, and the traffic lights.
  nativeWindow: platform === "macos"
    ? {
        setMenu: (model: unknown) => ipcRenderer.send("menu:set", model),
        onMenuCommand: listen("menu:run"),
        revealControls: (show: boolean) => ipcRenderer.send("window:reveal", show === true),
      }
    : undefined,
  onFlushRequest: (listener: () => Promise<boolean>) => {
    ipcRenderer.on("app:flush", () => {
      void listener()
        .catch(() => false)
        .then((ok) => ipcRenderer.send("app:flushed", ok));
    });
  },
});
