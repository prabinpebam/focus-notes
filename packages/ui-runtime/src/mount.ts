/** Mounting the app and the global keyboard handler. The only entry point shells call. */
import { createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { App } from "@focus-notes/core";
import { registry, contractByType, FLUSH_EVENT, REFOCUS_EVENT } from "@focus-notes/ui";
import { ViewHost, ViewBoundary, type RuntimeDeps } from "./render.ts";

export interface MountOptions {
  app: App;
  views: Record<string, unknown>;
  view?: string;
}

export function mountApp(el: Element, { app, views, view = "canvas" }: MountOptions): Root {
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views };
  const root = createRoot(el);
  const Text = registry.Text!;
  const fallback = createElement(Text, { value: app.messages.has("app.viewFailed") ? app.messages.format("app.viewFailed") : "This panel couldn't load." });
  root.render(
    createElement(StrictMode, null,
      createElement(ViewBoundary, { fallback, onError: (e: unknown) => console.error(e), children: createElement(ViewHost, { viewId: view, deps }) })),
  );

  // Keys run commands (KEY-01). Editor-owned keys are handled by the editor first.
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const id = app.commands.match(e);
    if (!id) return;
    e.preventDefault();
    void app.commands.run(id);
  });
  // A file dropped outside the editor must never navigate the window away from the app.
  const stopNavigation = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  };
  window.addEventListener("dragover", stopNavigation);
  window.addEventListener("drop", stopNavigation);
  // When the toolbar closes, the caret goes back to the note.
  let toolbarWasOpen = app.store.state.ui.toolbarOpen;
  app.store.subscribe(() => {
    const open = app.store.state.ui.toolbarOpen;
    if (toolbarWasOpen && !open) setTimeout(() => window.dispatchEvent(new Event(REFOCUS_EVENT)), 0);
    toolbarWasOpen = open;
  });
  return root;
}

/** Collects pending text from every surface, then writes it (QLT-03). Resolves to whether it's saved. */
export async function flushApp(app: App): Promise<boolean> {
  window.dispatchEvent(new Event(FLUSH_EVENT));
  return app.flush();
}
