/** The renderer entry: connects the preload bridge to the app core and mounts the canvas view. */
import { createApp, resolvedScheme, resolvedTheme, type App, type PlatformBridge } from "@focus-notes/core";
import { mountApp, swapApp, flushApp } from "@focus-notes/ui-runtime";
import { afterFirstThemedFrame, bootTheme, htmlToMarkdown } from "@focus-notes/ui";
import { views, messages } from "@focus-notes/views";
import { createSearchWorker, startSearch, type SearchService } from "@focus-notes/core/search";
import searchWorkerUrl from "@focus-notes/core/search-worker?worker&url";

/** Marked when every note in the workspace is indexed (read by tools/bench/large.mjs). */
const INDEXED_MARK = "fn:search.indexed";
/** Marked when the page's first themed frame with the app's layout is drawn, and the window shows (DSK-09). */
const FIRST_FRAME_MARK = "fn:window.firstFrame";
/** Marked each time the app has started again in place in another workspace (D-148). */
const SWITCH_MARK = "fn:workspace.switch";

interface DesktopBridge extends PlatformBridge {
  setWindowScheme(s: "light" | "dark", canvas?: string, accent?: string, appearance?: string): void;
  onFlushRequest(listener: () => Promise<boolean>): void;
  firstFrame(): void;
  onWorkspaceSwitched(listener: () => void): () => void;
}
declare global {
  interface Window {
    focusNotes: DesktopBridge;
  }
}

// The first frame is the theme's canvas, never Chromium's white (DSK-09, D-148).
bootTheme(location.search);

const base = window.focusNotes;
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root in the entry document");
const OVERLAYS = ["settings", "theme", "history", "feedback"] as const;

/**
 * The bridge as one app instance sees it. When another instance replaces it (D-148), everything it
 * listened to is let go, and its calls do nothing more: an old app finishing its work can't write
 * into the new workspace or answer for it. The drawn window's state is the current one.
 */
function scopedBridge(b: DesktopBridge, windowState?: unknown): { bridge: DesktopBridge; revoke: () => void } {
  let live = true;
  const offs: (() => void)[] = [];
  const listens = (k: string) => /^on[A-Z]/.test(k);
  const wrap = (o: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "function") {
        out[k] = (...args: unknown[]) => {
          // Never settles: the old app's awaits simply stop there.
          if (!live) return listens(k) ? () => {} : new Promise(() => {});
          const r = (v as (...a: unknown[]) => unknown)(...args);
          if (listens(k) && typeof r === "function") offs.push(r as () => void);
          return r;
        };
      } else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = wrap(v as Record<string, unknown>);
      else out[k] = v;
    }
    return out;
  };
  const bridge = wrap(b as unknown as Record<string, unknown>) as unknown as DesktopBridge;
  if (bridge.window && windowState && typeof windowState === "object") bridge.window = { ...bridge.window, initial: windowState as typeof bridge.window.initial };
  return {
    bridge,
    revoke: () => {
      live = false;
      for (const off of offs.splice(0)) off();
    },
  };
}

interface Running {
  app: App;
  root: ReturnType<typeof mountApp>;
  abort: AbortController;
  revoke: () => void;
  offTheme: () => void;
  search?: SearchService;
}

// The native parts follow the theme: title bar symbols and the window's own background (THM-02).
let lastTheme = "";
const followTheme = (app: App) => app.store.subscribe(() => {
  const s = resolvedScheme(app.store.state);
  // The appearance too: macOS's native menus follow the app's light or dark (D-204).
  const mode = app.store.state.appearance.mode;
  const t = `${s}:${resolvedTheme(app.store.state)}:${mode}`;
  if (t === lastTheme) return;
  lastTheme = t;
  requestAnimationFrame(() => {
    const style = getComputedStyle(document.documentElement);
    const canvas = style.getPropertyValue("--fn-color-canvas").trim();
    // The snap preview is the theme's accent (cmp.windowFrame.snapPreview), drawn by the shell.
    const accent = style.getPropertyValue("--fn-cmp-window-frame-snap-preview").trim();
    base.setWindowScheme(s, canvas, accent, mode);
  });
});

// The search index (WP-4.1) builds in its worker once the first note is open, never before; Spotlight
// (WP-4.2) and Find in all notes (WP-4.3) ask it. Each time every note is indexed, a performance mark
// says so: the large-workspace bench waits for it, so it measures a workspace that is open, not one still loading.
function attachSearch(r: Running): void {
  const search = startSearch(r.app, createSearchWorker(searchWorkerUrl));
  r.search = search;
  r.app.useSearch(search);
  let indexed = false;
  search.onStatus((s) => {
    const now = s.notes > 0 && s.indexed >= s.notes && s.pending === 0;
    if (now && !indexed) performance.mark(INDEXED_MARK, { detail: { notes: s.notes } });
    indexed = now;
  });
}

let running: Running;
{
  const scoped = scopedBridge(base);
  const app = createApp(scoped.bridge, messages.en!, "en", { htmlToMarkdown });
  const abort = new AbortController();
  // Settings and the theme manager are view documents of their own, hosted beside the canvas (IA-VIEW-SETTINGS, IA-VIEW-THEME).
  const demo = new URLSearchParams(location.search).get("rewriteDemo") === "1";
  if (demo) window.addEventListener("keydown", (event) => {
    const state = app.viewModels.select("vm.rewriteDemo", app.store.state);
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z" && state.undo && !state.open) {
      event.preventDefault(); event.stopImmediatePropagation();
      void app.commands.run("demo.undo");
    }
  }, { capture: true, signal: abort.signal });
  const react = mountApp(root, { app, views, ...(demo ? { view: "rewriteDemo" } : { overlays: OVERLAYS }), signal: abort.signal });
  const r: Running = { app, root: react, abort, revoke: scoped.revoke, offTheme: followTheme(app) };
  running = r;
  // A missing notes folder (FRE-11): the first frame is the recovery view, never a canvas that can't open a note.
  const missing = new URLSearchParams(location.search).get("folder") === "missing";
  const started = demo ? Promise.resolve() : app.start();
  // The window shows once this frame is drawn, never an unpainted page (DSK-09, D-148).
  void (missing ? started.catch(() => {}) : Promise.resolve()).then(() => afterFirstThemedFrame()).then(() => {
    performance.mark(FIRST_FRAME_MARK);
    base.firstFrame();
  });
  void started.then(() => {
    if (!demo && running === r && !app.store.state.recover.open) attachSearch(r);
  });
}
base.onFlushRequest(() => flushApp(running.app));

/**
 * Another workspace was opened, setup finished, or the workspace was removed (D-98, D-148): the app
 * starts again in place. The new instance builds its stores and opens its note while the old view
 * stays on screen, then the two swap in one frame. The main process has already moved the watcher
 * and Git (D-101).
 */
let switching = Promise.resolve();
base.onWorkspaceSwitched(() => {
  switching = switching.then(async () => {
    const old = running;
    const began = performance.now();
    old.revoke();
    old.offTheme();
    old.search?.stop();
    const windowState = base.window ? await base.window.state().catch(() => undefined) : undefined;
    const scoped = scopedBridge(base, windowState);
    const app = createApp(scoped.bridge, messages.en!, "en", { htmlToMarkdown });
    await app.start().catch((e: unknown) => console.error(e));
    const abort = new AbortController();
    const react = swapApp(root, old, { app, views, overlays: OVERLAYS, signal: abort.signal });
    const r: Running = { app, root: react, abort, revoke: scoped.revoke, offTheme: followTheme(app) };
    running = r;
    performance.measure(SWITCH_MARK, { start: began });
    attachSearch(r);
  }).catch((e: unknown) => console.error(e));
});
