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
  setWindowScheme: (s: "light" | "dark") => ipcRenderer.send("window:scheme", s),
  onFlushRequest: (listener: () => Promise<boolean>) => {
    ipcRenderer.on("app:flush", () => {
      void listener()
        .catch(() => false)
        .then((ok) => ipcRenderer.send("app:flushed", ok));
    });
  },
});
