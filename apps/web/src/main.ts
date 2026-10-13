/** The web app's entry (D-80): the same app as every shell, on IndexedDB and the GitHub API. */
import { createApp } from "@focus-notes/core";
import { mountApp, flushApp } from "@focus-notes/ui-runtime";
import { views, messages } from "@focus-notes/views";
import { createWebBridge } from "./bridge.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root in the entry document");
const bridge = await createWebBridge();
const app = createApp(bridge, messages.en!);
mountApp(root, { app, views });
// Hand over pending text whenever the page might go away (QLT-03).
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flushApp(app); });
addEventListener("pagehide", () => void flushApp(app));
void app.start();
