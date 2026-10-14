/** Mounting the app and the global keyboard handler. The only entry point shells call. */
import { createElement, Fragment, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FLUSH_EDITOR, type App } from "@focus-notes/core";
import { registry, contractByType, FLUSH_EVENT, EDITOR_ACTION_EVENT, installTrustedTypes, keyRanCommand, slashCatalog, preloadViews, InWindow } from "@focus-notes/ui";
import { ViewHost, ViewBoundary, type RuntimeDeps } from "./render.ts";
import { panelOpen, refocusNote } from "./refocus.ts";

export interface MountOptions {
  app: App;
  views: Record<string, unknown>;
  view?: string;
  /**
   * Views hosted beside the main one, each showing only what its view models open: dialogs with a
   * view document of their own, such as Settings (IA-VIEW-SETTINGS). Each fails on its own.
   */
  overlays?: readonly string[];
}

const MODIFIERS = new Set(["Meta", "Control", "Alt", "Shift", "AltGraph", "CapsLock", "Fn"]);

export function mountApp(el: Element, { app, views, view = "canvas", overlays = [] }: MountOptions): Root {
  // Before anything renders: HTML reaches the DOM only through the sanitizing policy (SEC-02).
  installTrustedTypes();
  // The slash menu offers the editor's registered blocks (EDT-06, EXT-01).
  void app.commands.run("slash.register", { entries: slashCatalog() });
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views };
  // The warm-up after start loads the code of the views opened first, at idle priority (PRF-10).
  app.warmUp.add({ id: "views", run: async () => void (await preloadViews()) });
  const root = createRoot(el);
  const Text = registry.Text!;
  const fallback = createElement(Text, { value: app.messages.has("app.viewFailed") ? app.messages.format("app.viewFailed") : "This panel couldn't load." });
  const host = (viewId: string) => createElement(ViewBoundary, { key: viewId, fallback, onError: (e: unknown) => console.error(e), children: createElement(ViewHost, { viewId, deps }) });
  // Overlays render inside the window as drawn (D-14, D-111): their scrims and sheets never reach its shadow margin.
  root.render(createElement(StrictMode, null, createElement(Fragment, null, host(view), ...overlays.map((id) => createElement(InWindow, { key: id }, host(id))))));

  // Keys run commands (KEY-01). App keys are resolved first, in the capture phase, so a key does the
  // same thing wherever focus is (on a German layout Ctrl+Shift+7 types "/", which is the cheat
  // sheet, not the numbered list). Editor keys aren't app keys, so they reach the editor.
  window.addEventListener("keydown", (e) => {
    // A key a menu bar item could have (macOS, DSK-05): the page has it first, so the menu leaves it alone.
    if ((e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(e.key)) && !MODIFIERS.has(e.key)) app.keySeen();
    // keyCode 229 is the IME's own keydown on some platforms, before isComposing is set (KEY-06).
    // The warm-up waits while someone types (PRF-10).
    app.warmUp.typed();
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    // Key scopes focus is inside, innermost first (data-key-scope on primitives and layouts).
    const scopes: string[] = [];
    // A scope marked data-key-scope-stop (a name field inside a tree) hides the scopes around it.
    for (let el = e.target instanceof Element ? e.target.closest("[data-key-scope]") : null; el; el = el.parentElement?.closest("[data-key-scope]") ?? null) {
      scopes.push((el as HTMLElement).dataset.keyScope!);
      if (el.hasAttribute("data-key-scope-stop")) break;
    }
    // In a text field, whether the caret is at the end of its text (→ opens Spotlight's actions only there).
    const field = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ? e.target : undefined;
    const id = app.commands.match({
      key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      altGraph: e.getModifierState?.("AltGraph") ?? false,
      ...(field ? { caretAtEnd: field.selectionStart === field.value.length && field.selectionEnd === field.value.length } : {}),
    }, scopes);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    // Focus a key moves shows its ring, whatever the pointer did before (UI-05).
    keyRanCommand();
    void app.commands.run(id);
  }, true);
  // Editor commands run from menus and Spotlight reach the editor surface through a window event.
  // Saving and switching notes first collect text the editor hasn't sent yet (QLT-03, D-23).
  app.onEditorAction((id, args) => window.dispatchEvent(id === FLUSH_EDITOR ? new Event(FLUSH_EVENT) : new CustomEvent(EDITOR_ACTION_EVENT, { detail: { id, args } })));
  // A file dropped outside the editor must never navigate the window away from the app.
  const stopNavigation = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  };
  window.addEventListener("dragover", stopNavigation);
  window.addEventListener("drop", stopNavigation);
  // When the toolbar closes, the caret goes back to the note.
  // The same when a dialog closes: its saved focus target may be gone (opened from the ⋯ menu).
  const ui = () => app.store.state.ui;
  let toolbarWasOpen = app.store.state.ui.toolbarOpen;
  let sheetWasOpen = app.store.state.ui.shortcuts.open;
  let filesWereOpen = app.store.state.ui.files.open;
  let spotlightWasOpen = app.store.state.ui.spotlight.open;
  let findAllWasOpen = app.store.state.ui.findAll.open;
  let themeWasOpen = app.store.state.ui.theme.open;
  app.store.subscribe(() => {
    const { toolbarOpen, shortcuts, find, files, spotlight, findAll, theme } = app.store.state.ui;
    // Spotlight hands focus back where it was; if that's gone (a dialog it replaced), to the note.
    if (spotlightWasOpen && !spotlight.open) {
      setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) refocusNote(ui);
      }, 300);
    }
    spotlightWasOpen = spotlight.open;
    // Find in all notes closing: back to the note, unless a match it opened has the find bar's focus.
    if (findAllWasOpen && !findAll.open) {
      const asked = find.focusFind;
      setTimeout(() => { if (app.store.state.ui.find.focusFind === asked) refocusNote(ui); }, 0);
    }
    findAllWasOpen = findAll.open;
    // Not when the toolbar closed because the find bar, the cheat sheet, the Files panel, or the theme manager took focus.
    if ((toolbarWasOpen && !toolbarOpen && !shortcuts.open && !find.open && !files.open && !theme.open) || (sheetWasOpen && !shortcuts.open) || (filesWereOpen && !files.open) || (themeWasOpen && !theme.open)) {
      // Nor once the toolbar or another panel has opened meanwhile (by its key, which the page may
      // handle before this timer or the note's frame): it has taken focus (DEF-4).
      setTimeout(() => { if (!panelOpen(ui())) refocusNote(ui); }, 0);
    }
    toolbarWasOpen = toolbarOpen;
    sheetWasOpen = shortcuts.open;
    filesWereOpen = files.open;
    themeWasOpen = theme.open;
  });
  return root;
}

/** Collects pending text from every surface, then writes it (QLT-03). Resolves to whether it's saved. */
export async function flushApp(app: App): Promise<boolean> {
  window.dispatchEvent(new Event(FLUSH_EVENT));
  return app.flush();
}
