/** The renderer entry: connects the preload bridge to the app core and mounts the canvas view. */
import { createApp, resolvedScheme, resolvedTheme, type PlatformBridge } from "@focus-notes/core";
import { mountApp, flushApp } from "@focus-notes/ui-runtime";
import { views, messages } from "@focus-notes/views";
import { createSearchWorker, startSearch } from "@focus-notes/core/search";
import searchWorkerUrl from "@focus-notes/core/search-worker?worker&url";

interface DesktopBridge extends PlatformBridge {
  setWindowScheme(s: "light" | "dark", canvas?: string, accent?: string): void;
  onFlushRequest(listener: () => Promise<boolean>): void;
}
declare global {
  interface Window {
    focusNotes: DesktopBridge;
  }
}

const bridge = window.focusNotes;
const app = createApp(bridge, messages.en!);
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root in the entry document");
// Settings is a view document of its own, hosted beside the canvas (IA-VIEW-SETTINGS).
mountApp(root, { app, views, overlays: ["settings"] });

// The native parts follow the theme: title bar symbols and the window's own background (THM-02).
let lastTheme = "";
app.store.subscribe(() => {
  const s = resolvedScheme(app.store.state);
  const t = `${s}:${resolvedTheme(app.store.state)}`;
  if (t === lastTheme) return;
  lastTheme = t;
  requestAnimationFrame(() => {
    const style = getComputedStyle(document.documentElement);
    const canvas = style.getPropertyValue("--fn-color-canvas").trim();
    // The snap preview is the theme's accent (cmp.windowFrame.snapPreview), drawn by the shell.
    const accent = style.getPropertyValue("--fn-cmp-window-frame-snap-preview").trim();
    bridge.setWindowScheme(s, canvas, accent);
  });
});
bridge.onFlushRequest(() => flushApp(app));
// The search index (WP-4.1) builds in its worker once the first note is open, never before.
void app.start().then(() => startSearch(app, createSearchWorker(searchWorkerUrl)));
