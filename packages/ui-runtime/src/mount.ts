/** Mounting the app and the global keyboard handler. The only entry point shells call. */
import { createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { App } from "@focus-notes/core";
import { registry, contractByType, FLUSH_EVENT } from "@focus-notes/ui";
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
  return root;
}

/** Collects pending text from every surface, then writes it (QLT-03). Shells call this before closing. */
export async function flushApp(app: App): Promise<void> {
  window.dispatchEvent(new Event(FLUSH_EVENT));
  await app.flush();
}
