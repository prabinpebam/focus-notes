/**
 * The preload bridge: the renderer's only door to the system. Sandboxed, typed, and narrow.
 * It exposes the PlatformBridge contract from packages/core as window.focusNotes.
 */
import { contextBridge, ipcRenderer } from "electron";

const params = new URLSearchParams(globalThis.location?.search ?? "");
const platform = (params.get("platform") ?? "windows") as "macos" | "windows" | "linux";
const darkQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

contextBridge.exposeInMainWorld("focusNotes", {
  platform,
  readNote: (path: string) => ipcRenderer.invoke("note:read", path),
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
    onChange: (listener: (changes: unknown[]) => void) => {
      const handler = (_e: unknown, changes: unknown[]) => listener(changes);
      ipcRenderer.on("workspace:changed", handler);
      return () => ipcRenderer.removeListener("workspace:changed", handler);
    },
  },
  // Save and sync with the user's own Git (WP-3.3): intent-level only, never a Git command.
  sync: {
    now: (reason: "save" | "switch") => ipcRenderer.invoke("sync:now", reason),
    status: () => ipcRenderer.invoke("sync:status"),
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
    signOut: () => ipcRenderer.invoke("firstRun:signOut"),
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
  setWindowScheme: (s: "light" | "dark", canvas?: string) => ipcRenderer.send("window:scheme", s, canvas),
  onFlushRequest: (listener: () => Promise<boolean>) => {
    ipcRenderer.on("app:flush", () => {
      void listener()
        .catch(() => false)
        .then((ok) => ipcRenderer.send("app:flushed", ok));
    });
  },
});
