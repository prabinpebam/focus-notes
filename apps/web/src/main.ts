/** The web app's entry (D-80, D-90): the same app as every shell, on IndexedDB and its own site's files. */
import { createApp } from "@focus-notes/core";
import { mountApp, flushApp } from "@focus-notes/ui-runtime";
import { views, messages } from "@focus-notes/views";
import { createSearchWorker, startSearch } from "@focus-notes/core/search";
import searchWorkerUrl from "@focus-notes/core/search-worker?worker&url";
import { createWebBridge } from "./bridge.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root in the entry document");
// The demo build (`--mode demo`, D-177) runs on its own sample notes.
const bridge = await createWebBridge({ demo: import.meta.env.FOCUS_NOTES_DEMO === true });
const app = createApp(bridge, messages.en!);
// The theme manager is a view document of its own, hosted beside the canvas (IA-VIEW-THEME).
mountApp(root, { app, views, overlays: ["theme", "feedback"] });
// Hand over pending text whenever the page might go away (QLT-03).
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flushApp(app); });
addEventListener("pagehide", () => void flushApp(app));
// The search index (WP-4.1) builds in its worker once the first note is open, never before; Spotlight
// (WP-4.2) and Find in all notes (WP-4.3) ask it.
void app.start().then(() => {
  app.useSearch(startSearch(app, createSearchWorker(searchWorkerUrl)));
  if (bridge.demoFirstVisit) void demoAtTop();
});

/**
 * The demo's first visit opens the welcome note at its top, the caret at the start of its title, so
 * focus mode shows its first lines at full contrast (D-177). Waits for the editor to take focus.
 */
async function demoAtTop(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const a = document.activeElement;
    if (a instanceof HTMLElement && a.isContentEditable) {
      await app.commands.run("edit.docStart");
      return;
    }
  }
}
