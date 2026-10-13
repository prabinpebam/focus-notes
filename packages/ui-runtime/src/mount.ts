/** Mounting the app and the global keyboard handler. The only entry point shells call. */
import { createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { App } from "@focus-notes/core";
import { registry, contractByType, FLUSH_EVENT, REFOCUS_EVENT, EDITOR_ACTION_EVENT, installTrustedTypes, slashCatalog } from "@focus-notes/ui";
import { ViewHost, ViewBoundary, type RuntimeDeps } from "./render.ts";

export interface MountOptions {
  app: App;
  views: Record<string, unknown>;
  view?: string;
}

export function mountApp(el: Element, { app, views, view = "canvas" }: MountOptions): Root {
  // Before anything renders: HTML reaches the DOM only through the sanitizing policy (SEC-02).
  installTrustedTypes();
  // The slash menu offers the editor's registered blocks (EDT-06, EXT-01).
  void app.commands.run("slash.register", { entries: slashCatalog() });
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views };
  const root = createRoot(el);
  const Text = registry.Text!;
  const fallback = createElement(Text, { value: app.messages.has("app.viewFailed") ? app.messages.format("app.viewFailed") : "This panel couldn't load." });
  root.render(
    createElement(StrictMode, null,
      createElement(ViewBoundary, { fallback, onError: (e: unknown) => console.error(e), children: createElement(ViewHost, { viewId: view, deps }) })),
  );

  // Keys run commands (KEY-01). App keys are resolved first, in the capture phase, so a key does the
  // same thing wherever focus is (on a German layout Ctrl+Shift+7 types "/", which is the cheat
  // sheet, not the numbered list). Editor keys aren't app keys, so they reach the editor.
  window.addEventListener("keydown", (e) => {
    // keyCode 229 is the IME's own keydown on some platforms, before isComposing is set (KEY-06).
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    // Key scopes focus is inside, innermost first (data-key-scope on primitives and layouts).
    const scopes: string[] = [];
    for (let el = e.target instanceof Element ? e.target.closest("[data-key-scope]") : null; el; el = el.parentElement?.closest("[data-key-scope]") ?? null) {
      scopes.push((el as HTMLElement).dataset.keyScope!);
    }
    const id = app.commands.match({
      key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      altGraph: e.getModifierState?.("AltGraph") ?? false,
    }, scopes);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    void app.commands.run(id);
  }, true);
  // Editor commands run from menus and Spotlight reach the editor surface through a window event.
  app.onEditorAction((id, args) => window.dispatchEvent(new CustomEvent(EDITOR_ACTION_EVENT, { detail: { id, args } })));
  // A file dropped outside the editor must never navigate the window away from the app.
  const stopNavigation = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  };
  window.addEventListener("dragover", stopNavigation);
  window.addEventListener("drop", stopNavigation);
  // When the toolbar closes, the caret goes back to the note.
  // The same when a dialog closes: its saved focus target may be gone (opened from the ⋯ menu).
  let toolbarWasOpen = app.store.state.ui.toolbarOpen;
  let sheetWasOpen = app.store.state.ui.shortcuts.open;
  app.store.subscribe(() => {
    const { toolbarOpen, shortcuts, find } = app.store.state.ui;
    // Not when the toolbar closed because the find bar or the cheat sheet took focus.
    if ((toolbarWasOpen && !toolbarOpen && !shortcuts.open && !find.open) || (sheetWasOpen && !shortcuts.open)) {
      setTimeout(() => window.dispatchEvent(new Event(REFOCUS_EVENT)), 0);
    }
    toolbarWasOpen = toolbarOpen;
    sheetWasOpen = shortcuts.open;
  });
  return root;
}

/** Collects pending text from every surface, then writes it (QLT-03). Resolves to whether it's saved. */
export async function flushApp(app: App): Promise<boolean> {
  window.dispatchEvent(new Event(FLUSH_EVENT));
  return app.flush();
}
