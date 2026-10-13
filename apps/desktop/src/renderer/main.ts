/** The renderer entry: connects the preload bridge to the app core and mounts the canvas view. */
import { createApp, resolvedScheme, resolvedTheme, type PlatformBridge } from "@focus-notes/core";
import { mountApp, flushApp } from "@focus-notes/ui-runtime";
import { views, messages } from "@focus-notes/views";

interface DesktopBridge extends PlatformBridge {
  setWindowScheme(s: "light" | "dark", canvas?: string): void;
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
mountApp(root, { app, views });

// The native parts follow the theme: title bar symbols and the window's own background (THM-02).
let lastTheme = "";
app.store.subscribe(() => {
  const s = resolvedScheme(app.store.state);
  const t = `${s}:${resolvedTheme(app.store.state)}`;
  if (t === lastTheme) return;
  lastTheme = t;
  requestAnimationFrame(() => {
    const canvas = getComputedStyle(document.documentElement).getPropertyValue("--fn-color-canvas").trim();
    bridge.setWindowScheme(s, canvas);
  });
});
bridge.onFlushRequest(() => flushApp(app));
void app.start();
