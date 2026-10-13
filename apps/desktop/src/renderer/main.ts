/** The renderer entry: connects the preload bridge to the app core and mounts the canvas view. */
import { createApp, resolvedScheme, type PlatformBridge } from "@focus-notes/core";
import { mountApp, flushApp } from "@focus-notes/ui-runtime";
import { views, messages } from "@focus-notes/views";

interface DesktopBridge extends PlatformBridge {
  setWindowScheme(s: "light" | "dark"): void;
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

let lastScheme = "";
app.store.subscribe(() => {
  const s = resolvedScheme(app.store.state);
  if (s !== lastScheme) {
    lastScheme = s;
    bridge.setWindowScheme(s);
  }
});
bridge.onFlushRequest(() => flushApp(app));
void app.start();
