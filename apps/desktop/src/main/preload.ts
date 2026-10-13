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
  setWindowScheme: (s: "light" | "dark", canvas?: string) => ipcRenderer.send("window:scheme", s, canvas),
  onFlushRequest: (listener: () => Promise<boolean>) => {
    ipcRenderer.on("app:flush", () => {
      void listener()
        .catch(() => false)
        .then((ok) => ipcRenderer.send("app:flushed", ok));
    });
  },
});
