import { Store } from "./store.ts";
import { CommandRegistry, chordsFor, formatChord, KEY_LAYERS, type Binding } from "./commands.ts";
import { BUILT_IN_THEMES, CONTENT_FONTS, DEFAULT_THEMES, UI_SCALES, themeById, type ContentFont } from "./themes.ts";
import { cheatSheet, displayPlatform, EDITOR_COMMANDS, NATIVE_KEYS, type CheatSheetLayer, type CheatSheetPlatform } from "./keymap.ts";
import { ViewModelRegistry } from "./view-models.ts";
import { MessageCatalog, type Messages } from "./messages.ts";
import type { PlatformBridge, AppStateFile } from "./bridge.ts";
import { registerBrowserFeatures, PICKER_CLOSED, UNLOCK_CLOSED, NO_INSTANCE, type PickerState, type UnlockState, type InstanceState } from "./browser.ts";
import { isReadOnlyPath, sourceOf } from "./notes.ts";
import { registerWorkspaceFeatures, noteReadOnly, NO_WORKSPACE, type WorkspaceState, type WorkspaceFormatOptions } from "./workspace-app.ts";
import type { Platform } from "./commands.ts";
import { waits } from "@focus-notes/tokens";
import { TaskTracker, type Clock, type TaskView } from "./tasks.ts";
import { registerFormatting, FORMAT_CLOSED, type FormatState } from "./format.ts";
import { registerFiles, FILES_CLOSED, type FilesState } from "./files-app.ts";
import { joinPath } from "./workspace.ts";

export type SaveState = "saved" | "saving" | "unsaved" | "error";
export type Scheme = "light" | "dark";

export interface AppState {
  note: {
    path?: string;
    /** Changes whenever a different note is loaded, so the editor resets only then. */
    key: string;
    initialMarkdown: string;
    markdown: string;
    status: "loading" | "ready" | "error";
    saveState: SaveState;
  };
  appearance: {
    mode: "system" | "light" | "dark";
    system: Scheme;
    fontSize: number;
    lightTheme: string;
    darkTheme: string;
    contentFont: ContentFont;
    uiScale: number;
  };
  focusMode: boolean;
  ui: {
    toolbarOpen: boolean;
    /** The keyboard shortcut cheat sheet (IA-VIEW-SHORTCUTS). */
    shortcuts: { open: boolean; query: string; layer: CheatSheetLayer; platform: CheatSheetPlatform };
    /** The find bar (IA-CMP-FINDBAR, FND-01, FND-02). */
    find: FindState;
    /** Toasts, newest last; at most two show (IA-CMP-TOAST). */
    toasts: ToastState[];
    /** Bumped to move focus to the newest toast's action (F6). */
    toastFocus: number;
    /** Open… for notes the shell keeps itself (the web app). */
    picker: PickerState;
    /** Unlock private notes (PKG-10). */
    unlock: UnlockState;
    /** Use this app for yourself (DST-01). */
    aboutOpen: boolean;
    /** The formatting toolbar, link editor, and link hover card (EDT-12, EDT-13). */
    format: FormatState;
    /** The Files panel, Move to…, and delete confirmations (IA-VIEW-FILES, WP-2.4). */
    files: FilesState;
  };
  /** The instance this web app was deployed with, read-only (PKG-08, PKG-10). */
  instance: InstanceState;
  /** The workspace: its tree of notes and folders, and whether this app may write it (DST-05). */
  workspace: WorkspaceState;
  /** Waits a person started (PRF-08). */
  tasks: TaskView[];
  /** The latest polite announcement for screen readers; `n` makes repeats announce again. */
  announcement: { text: string; n: number };
}

export interface FindState {
  open: boolean;
  replaceOpen: boolean;
  query: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  count: number;
  current: number;
  invalid: boolean;
  /** A short notice for the live region: "Wrapped to top", "Replaced 12 matches". */
  notice: string;
  /** Bumped to move focus into the find field (or the replace field). */
  focusFind: number;
  focusReplace: number;
}
const FIND_CLOSED: FindState = {
  open: false, replaceOpen: false, query: "", replace: "", caseSensitive: false, wholeWord: false, regex: false,
  count: 0, current: 0, invalid: false, notice: "", focusFind: 0, focusReplace: 0,
};

export interface ToastState {
  id: number;
  message: string;
  tone: "info" | "error";
  /** A command the toast offers ([Undo], [Retry]) and its label. */
  action?: { command: string; label: string };
  paused: boolean;
}

export const SAVE_DELAY_MS = 400;
/** Note text sizes in px (THM-06). */
export const FONT_STEPS = [14, 15, 16, 17, 18, 20, 22, 24, 28, 32] as const;
export const DEFAULT_FONT_SIZE = 16;

/** The six default toolbar actions, in order (UI-07, D-18). */
export const DEFAULT_TOOLBAR = ["note.new", "note.open", "spotlight.open", "note.save", "focus.toggle", "appearance.toggle"] as const;
/** A ⋯ menu entry: a command, or a submenu of commands. */
export type MenuEntry = string | { submenu: string; label: string; items: string[] };
/** The ⋯ menu groups available so far (Main UI → The ⋯ menu). */
export const MORE_MENU: { id: string; label: string; items: MenuEntry[] }[] = [
  {
    id: "view", label: "menu.view",
    items: ["font.smaller", "font.larger", "font.reset", { submenu: "font.content", label: "menu.contentFont", items: CONTENT_FONTS.map((f) => `font.content.${f}`) }, "window.fullScreen"],
  },
  {
    id: "theme", label: "menu.theme",
    items: [
      "appearance.system", "appearance.light", "appearance.dark",
      { submenu: "theme.light", label: "menu.lightTheme", items: BUILT_IN_THEMES.filter((t) => t.kind === "light").map((t) => `theme.light.${t.id}`) },
      { submenu: "theme.dark", label: "menu.darkTheme", items: BUILT_IN_THEMES.filter((t) => t.kind === "dark").map((t) => `theme.dark.${t.id}`) },
    ],
  },
  { id: "edit", label: "menu.edit", items: ["find.open", "find.replace"] },
  { id: "help", label: "menu.help", items: ["shortcuts.open"] },
];

export interface App {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  messages: MessageCatalog;
  bridge: PlatformBridge;
  start(): Promise<void>;
  /** Writes any pending or failed change now. Resolves to false if the note couldn't be saved. */
  flush(): Promise<boolean>;
  /** Editor commands are delivered to the editor surface through this, some with arguments (a link's address). */
  onEditorAction(listener: (id: string, args?: Record<string, unknown>) => void): () => void;
  /** Resolves when no wait is running or showing (PRF-08), so tests never race a save. */
  idle(): Promise<void>;
}

export const resolvedScheme = (s: AppState): Scheme =>
  s.appearance.mode === "system" ? s.appearance.system : s.appearance.mode;
/** The theme showing now: the chosen light or dark theme for the resolved scheme (THM-08). */
export const resolvedTheme = (s: AppState): string =>
  resolvedScheme(s) === "dark" ? s.appearance.darkTheme : s.appearance.lightTheme;

export interface AppOptions {
  /** A clock for the task tracker and toasts; tests pass a fake one. */
  clock?: Clock;
  /** The workspace format and its migrations; tests pass their own (DST-05). */
  workspaceFormat?: WorkspaceFormatOptions;
}

export function createApp(bridge: PlatformBridge, messages: Messages, locale = "en", options: AppOptions = {}): App {
  const store = new Store<AppState>({
    note: { key: "none", initialMarkdown: "", markdown: "", status: "loading", saveState: "saved" },
    appearance: {
      mode: "system", system: bridge.systemScheme(), fontSize: DEFAULT_FONT_SIZE,
      lightTheme: DEFAULT_THEMES.light, darkTheme: DEFAULT_THEMES.dark, contentFont: "mono", uiScale: 1,
    },
    focusMode: false,
    ui: { toolbarOpen: false, shortcuts: { open: false, query: "", layer: "all", platform: bridge.platform === "macos" ? "mac" : "pc" }, find: FIND_CLOSED, toasts: [], toastFocus: 0, picker: PICKER_CLOSED, unlock: UNLOCK_CLOSED, aboutOpen: false, format: FORMAT_CLOSED, files: FILES_CLOSED },
    instance: NO_INSTANCE,
    workspace: NO_WORKSPACE,
    tasks: [],
    announcement: { text: "", n: 0 },
  });
  const commands = new CommandRegistry<AppState>(() => store.state, (r) => store.update(r), bridge.platform);
  const viewModels = new ViewModelRegistry<AppState>();
  const catalog = new MessageCatalog(locale, messages);
  const announce = (text: string) => store.update((s) => ({ ...s, announcement: { text, n: s.announcement.n + 1 } }));
  const tracker = new TaskTracker(waits, {
    change: (tasks) => store.update((s) => ({ ...s, tasks })),
    announce: (key, args) => announce(catalog.has(key) ? catalog.format(key, args) : key),
  }, options.clock);
  const clock = options.clock ?? { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };

  // ---- toasts (IA-CMP-TOAST) ----
  let toastId = 1;
  const toastTimers = new Map<number, { handle: unknown; remaining: number; started: number }>();
  const setToasts = (fn: (t: ToastState[]) => ToastState[]) => store.update((s) => ({ ...s, ui: { ...s.ui, toasts: fn(s.ui.toasts) } }));
  const dismissToast = (id: number) => {
    const t = toastTimers.get(id);
    if (t) clock.clearTimeout(t.handle);
    toastTimers.delete(id);
    setToasts((ts) => ts.filter((x) => x.id !== id));
  };
  const arm = (id: number, ms: number) => toastTimers.set(id, { handle: clock.setTimeout(() => dismissToast(id), ms), remaining: ms, started: clock.now() });
  /** Shows a toast: one past-tense sentence, an optional action. At most two show; older ones go early. */
  const toast = (message: string, opts: { tone?: ToastState["tone"]; action?: ToastState["action"] } = {}) => {
    const id = toastId++;
    setToasts((ts) => [...ts, { id, message, tone: opts.tone ?? "info", paused: false, ...(opts.action ? { action: opts.action } : {}) }]);
    for (const old of store.state.ui.toasts.slice(0, -2)) dismissToast(old.id);
    arm(id, opts.action ? waits.toastUndoDuration : waits.toastDuration);
    return id;
  };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();
  let appState: AppStateFile = { version: 1 };

  const persistAppState = (patch: Partial<AppStateFile>) => {
    appState = { ...appState, ...patch };
    return bridge.saveAppState(appState);
  };

  const setNote = (patch: Partial<AppState["note"]>) =>
    store.update((s) => ({ ...s, note: { ...s.note, ...patch } }));
  const workspace = registerWorkspaceFeatures({ store, commands, viewModels, catalog, bridge, toast, setNote, persistAppState, ...(options.workspaceFormat ? { format: options.workspaceFormat } : {}) });

  async function writeNow(): Promise<void> {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const { path, markdown, saveState } = store.state.note;
    // Never into a workspace this app mustn't write (DST-05); the text stays unsaved, not lost.
    if (!path || saveState === "saved" || noteReadOnly(store.state)) return;
    setNote({ saveState: "saving" });
    try {
      await bridge.writeNote(path, markdown);
      // The file name follows the title (FIL-07); a rename keeps the editor as it is.
      await workspace.written(path, markdown);
      // Only mark saved if nothing changed while writing.
      if (store.state.note.markdown === markdown) setNote({ saveState: "saved" });
      else schedule();
    } catch {
      setNote({ saveState: "error" });
    }
  }
  /** Runs a file operation after pending edits are written, holding later saves until it's done. */
  const exclusive = async <T,>(fn: () => Promise<T>): Promise<T> => {
    await flush();
    const run = saving.then(fn);
    saving = run.then(() => {}, () => {});
    return run;
  };
  const schedule = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saving = saving.then(writeNow);
    }, SAVE_DELAY_MS);
  };

  async function load(path: string): Promise<void> {
    // Never replace a note whose latest text isn't on disk (data safety, QLT-03).
    if (!(await flush())) return;
    setNote({ status: "loading" });
    // The toolbar and link editor belong to the note that was open.
    store.update((s) => ({ ...s, ui: { ...s.ui, format: FORMAT_CLOSED } }));
    try {
      const md = await bridge.readNote(path);
      setNote({ path, key: `${path}#${Date.now()}`, initialMarkdown: md, markdown: md, status: "ready", saveState: "saved" });
      workspace.loaded(path, md);
      // A private note's name is private: it's never written to this browser's storage (D-90).
      if (sourceOf(path) !== "private") await persistAppState({ lastNotePath: path });
    } catch {
      setNote({ status: "error" });
    }
  }

  /** Writes any unsaved or previously failed change now. Resolves to whether the note is saved. */
  async function flush(): Promise<boolean> {
    if (saveTimer || store.state.note.saveState === "unsaved" || store.state.note.saveState === "error") saving = saving.then(writeNow);
    await saving;
    return store.state.note.saveState === "saved" || !store.state.note.path;
  }

  // ---- commands (the M0 set) ----
  commands.register({
    id: "note.open",
    title: "command.note.open",
    icon: "open",
    shortcut: { default: "Mod+O" },
    layer: "basic", group: "app",
    run: async (_a, ctx) => {
      // Open… is the Files panel wherever there's a workspace (IA-VIEW-FILES).
      if (bridge.workspace) return ctx.run("files.open");
      // Shells that keep notes themselves show them in an in-app dialog.
      if (bridge.listNotes) return ctx.run("picker.open");
      const path = await bridge.chooseNote();
      if (path) await load(path);
    },
  });
  commands.register({
    id: "note.save",
    title: "command.note.save",
    icon: "save",
    shortcut: { default: "Mod+S" },
    layer: "basic", group: "app",
    // Saving is a wait the person started, so it goes through the task tracker (PRF-08).
    run: () => tracker.run("note.save", "task.saving", async () => {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      saving = saving.then(writeNow);
      await saving;
      if (store.state.note.saveState === "error") throw new Error("save failed");
    }, "task.saved").catch(() => {
      toast(catalog.format("toast.saveFailed"), { tone: "error", action: { command: "note.save", label: catalog.format("toast.retry") } });
    }),
  });
  commands.register<{ value: string }>({
    id: "note.setContent",
    title: "command.note.setContent",
    run: ({ value }) => {
      if (typeof value !== "string" || value === store.state.note.markdown) return;
      // The instance's notes are read-only in the browser (D-90), and so is a workspace this app
      // mustn't write (DST-05); the editor doesn't change them either.
      if (noteReadOnly(store.state)) return;
      setNote({ markdown: value, saveState: "unsaved" });
      schedule();
    },
  });
  commands.register({
    id: "appearance.toggle",
    title: "command.appearance.toggle",
    icon: "darkTheme",
    shortcut: { default: "Mod+Shift+L" },
    layer: "writer", group: "app",
    checked: (s) => resolvedScheme(s) === "dark",
    run: async ({}, ctx) => {
      const mode = resolvedScheme(ctx.state) === "dark" ? "light" : "dark";
      ctx.update((s) => ({ ...s, appearance: { ...s.appearance, mode } }));
      await persistAppState({ appearance: mode });
    },
  });
  for (const mode of ["system", "light", "dark"] as const) {
    commands.register({
      id: `appearance.${mode}`,
      title: `command.appearance.${mode}`,
      checked: (s) => s.appearance.mode === mode,
      run: async (_a, ctx) => {
        ctx.update((s) => ({ ...s, appearance: { ...s.appearance, mode } }));
        await persistAppState({ appearance: mode });
      },
    });
  }
  const setFontSize = async (size: number) => {
    store.update((s) => ({ ...s, appearance: { ...s.appearance, fontSize: size } }));
    await persistAppState({ fontSize: size });
  };
  const step = (dir: 1 | -1) => {
    const i = FONT_STEPS.indexOf(store.state.appearance.fontSize as (typeof FONT_STEPS)[number]);
    const at = i < 0 ? FONT_STEPS.indexOf(DEFAULT_FONT_SIZE) : i;
    return FONT_STEPS[Math.min(FONT_STEPS.length - 1, Math.max(0, at + dir))]!;
  };
  commands.register({
    id: "font.larger", title: "command.font.larger", icon: "font",
    shortcut: { default: "Mod+=", quiet: ["Mod+Plus", "Mod+Shift+Plus"] }, layer: "writer", group: "app",
    enabled: (s) => s.appearance.fontSize < FONT_STEPS[FONT_STEPS.length - 1]!,
    run: () => setFontSize(step(1)),
  });
  commands.register({
    id: "font.smaller", title: "command.font.smaller", icon: "font", shortcut: { default: "Mod+-" }, layer: "writer", group: "app",
    enabled: (s) => s.appearance.fontSize > FONT_STEPS[0],
    run: () => setFontSize(step(-1)),
  });
  // Theme choices (THM-08) and content fonts (THM-03): one command each, so menus, Spotlight, and agents can run them.
  const setAppearance = async (patch: Partial<AppState["appearance"]>) => {
    store.update((s) => ({ ...s, appearance: { ...s.appearance, ...patch } }));
    const { lightTheme, darkTheme, contentFont, uiScale } = store.state.appearance;
    await persistAppState({ lightTheme, darkTheme, contentFont, uiScale });
  };
  for (const t of BUILT_IN_THEMES) {
    const key = t.kind === "light" ? "lightTheme" : "darkTheme";
    commands.register({
      id: `theme.${t.kind}.${t.id}`, title: t.title,
      checked: (s) => s.appearance[key] === t.id,
      run: () => setAppearance({ [key]: t.id }),
    });
  }
  for (const f of CONTENT_FONTS) {
    commands.register({
      id: `font.content.${f}`, title: `font.${f}`,
      checked: (s) => s.appearance.contentFont === f,
      run: () => setAppearance({ contentFont: f }),
    });
  }
  const scaleStep = (dir: 1 | -1) => {
    const i = UI_SCALES.indexOf(store.state.appearance.uiScale as (typeof UI_SCALES)[number]);
    return UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))]!;
  };
  commands.register({ id: "ui.scaleUp", title: "command.ui.scaleUp", enabled: (s) => s.appearance.uiScale < UI_SCALES[UI_SCALES.length - 1]!, run: () => setAppearance({ uiScale: scaleStep(1) }) });
  commands.register({ id: "ui.scaleDown", title: "command.ui.scaleDown", enabled: (s) => s.appearance.uiScale > UI_SCALES[0], run: () => setAppearance({ uiScale: scaleStep(-1) }) });
  commands.register({ id: "ui.scaleReset", title: "command.ui.scaleReset", run: () => setAppearance({ uiScale: 1 }) });
  commands.register({ id: "font.reset", title: "command.font.reset", shortcut: { default: "Mod+0" }, layer: "writer", group: "app", run: () => setFontSize(DEFAULT_FONT_SIZE) });
  commands.register({
    id: "focus.toggle", title: "command.focus.toggle", icon: "focus",
    shortcut: { default: "Mod+Shift+D", alternates: { default: ["F8"] } }, layer: "writer", group: "app",
    checked: (s) => s.focusMode,
    run: async (_a, ctx) => {
      const on = !ctx.state.focusMode;
      ctx.update((s) => ({ ...s, focusMode: on }));
      await persistAppState({ focusMode: on });
    },
  });
  commands.register({
    id: "note.new", title: "command.note.new", icon: "newNote", shortcut: { default: "Mod+N", web: "Ctrl+Alt+N" }, layer: "basic", group: "app",
    enabled: (s) => s.workspace.access === "write",
    disabledReason: "command.note.new.readOnly",
    run: async () => {
      const current = store.state.note.path;
      // With the Files panel open, the note goes into the selected folder (Files → Creating).
      const folder = files.newNoteFolder();
      const near = folder !== undefined ? joinPath(folder, "untitled.md") : isReadOnlyPath(current) ? undefined : current;
      const path = await bridge.newNotePath(near);
      if (!(await flush())) return;
      files.created(path);
      await bridge.writeNote(path, "");
      await load(path);
    },
  });
  commands.register({
    id: "spotlight.open", title: "command.spotlight.open", icon: "search",
    shortcut: { default: "Mod+/", alternates: { default: ["Mod+Shift+P"] } }, layer: "power", group: "spotlight", planned: true,
    // Spotlight arrives in M4; until then the command says so instead of doing nothing.
    enabled: () => false,
    disabledReason: "command.spotlight.open.reason",
    run: () => {},
  });
  commands.register({
    id: "window.fullScreen", title: "command.window.fullScreen", icon: "fullScreen",
    shortcut: { macos: "Ctrl+Mod+F", default: "F11", web: null }, layer: "writer", group: "app",
    enabled: () => Boolean(bridge.toggleFullScreen),
    run: () => bridge.toggleFullScreen?.(),
  });
  commands.register<{ open: boolean }>({
    id: "toolbar.setOpen", title: "command.toolbar.toggle",
    run: ({ open }) => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: Boolean(open) } })),
  });
  commands.register({
    id: "toolbar.toggle", title: "command.toolbar.toggle",
    shortcut: { default: "Mod+.", alternates: { windows: ["F10"], linux: ["F10"] } }, layer: "writer", group: "app",
    run: () => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: !s.ui.toolbarOpen } })),
  });
  commands.register<{ id: string }>({
    id: "command.run", title: "command.command.run",
    // Runs a command chosen from a registry-built list (toolbar, menus). Unknown IDs are refused.
    run: async ({ id }, ctx) => {
      if (typeof id !== "string" || id === "command.run" || !commands.has(id)) return;
      // The command runs first, so one that opens a panel (find, the cheat sheet) owns focus
      // before the toolbar closes and would hand the caret back to the note.
      const done = ctx.run(id);
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
      await done;
    },
  });
  // Editor commands: the editor's keymap runs their keys; menus and Spotlight run them through here.
  const editorListeners = new Set<(id: string, args?: Record<string, unknown>) => void>();
  for (const spec of EDITOR_COMMANDS) {
    commands.register({
      ...spec,
      enabled: (s) => s.note.status === "ready",
      run: () => { for (const l of editorListeners) l(spec.id); },
    });
  }

  // ---- find and replace (FND-01, FND-02) ----
  const setFind = (patch: Partial<FindState>) => store.update((s) => ({ ...s, ui: { ...s.ui, find: { ...s.ui.find, ...patch } } }));
  const editorAction = (id: string, args?: Record<string, unknown>) => { for (const l of editorListeners) l(id, args); };
  const findHistory: string[] = [];
  let historyAt = -1;
  const remember = () => {
    const q = store.state.ui.find.query;
    if (q && findHistory[0] !== q) findHistory.unshift(q);
    findHistory.length = Math.min(findHistory.length, 20);
    historyAt = -1;
  };
  const openFind = (replace: boolean) => {
    const f = store.state.ui.find;
    setFind({
      open: true, replaceOpen: replace || (f.open && f.replaceOpen), notice: "",
      ...(replace && f.query ? { focusReplace: f.focusReplace + 1 } : { focusFind: f.focusFind + 1 }),
    });
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    // A selection in the note fills the field, as in VS Code and browsers; not when the bar is
    // already open, where the selection is just the current match.
    if (!f.open) editorAction("find.prefill");
  };
  const ready = (s: AppState) => s.note.status === "ready";
  const findCmd = (id: string, title: string, extra: Partial<Parameters<typeof commands.register>[0]>, run: () => void) =>
    commands.register({ id, title, enabled: ready, ...extra, run });
  findCmd("find.open", "command.find.open", { icon: "search", shortcut: { default: "Mod+F" }, layer: "basic", group: "find" }, () => openFind(false));
  findCmd("find.replace", "command.find.replace", { shortcut: { macos: "Mod+Alt+F", default: "Mod+H" }, layer: "power", group: "find" }, () => openFind(true));
  const findStep = (id: "find.next" | "find.prev") => () => {
    if (!store.state.ui.find.open) return openFind(false);
    remember();
    setFind({ notice: "" });
    editorAction(id);
  };
  findCmd("find.next", "command.find.next", { shortcut: { macos: "Mod+G", default: "F3" }, layer: "basic", group: "find" }, findStep("find.next"));
  findCmd("find.prev", "command.find.prev", { shortcut: { macos: "Mod+Shift+G", default: "Shift+F3" }, layer: "basic", group: "find" }, findStep("find.prev"));
  findCmd("find.nextInField", "command.find.nextInField", { shortcut: { default: "Enter", handledBy: "findField" }, layer: "basic", group: "find" }, findStep("find.next"));
  findCmd("find.prevInField", "command.find.prevInField", { shortcut: { default: "Shift+Enter", handledBy: "findField" }, layer: "basic", group: "find" }, findStep("find.prev"));
  // Replacing works only with the replace row showing and something to replace (never by accident).
  const canReplace = (s: AppState) => ready(s) && s.ui.find.open && s.ui.find.replaceOpen && s.ui.find.count > 0;
  findCmd("find.replaceNext", "command.find.replaceNext", { enabled: canReplace, shortcut: { default: "Enter", handledBy: "replaceField" }, layer: "power", group: "find" }, () => {
    remember();
    editorAction("find.replaceNext");
  });
  findCmd("find.replaceAll", "command.find.replaceAll", { enabled: canReplace, shortcut: { macos: "Mod+Enter", default: "Ctrl+Alt+Enter", handledBy: "findBar" }, layer: "power", group: "find" }, () => {
    remember();
    editorAction("find.replaceAll");
  });
  findCmd("find.close", "command.find.close", { shortcut: { default: "Escape", handledBy: "findBar" }, layer: "basic", group: "find" }, () => {
    remember();
    setFind({ open: false, notice: "" });
  });
  findCmd("find.toggleReplace", "command.find.toggleReplace", {}, () => setFind({ replaceOpen: !store.state.ui.find.replaceOpen }));
  for (const [opt, key, title] of [["caseSensitive", "C", "command.find.matchCase"], ["wholeWord", "W", "command.find.wholeWord"], ["regex", "R", "command.find.regex"]] as const) {
    commands.register({
      id: `find.toggle.${opt}`, title, enabled: ready,
      shortcut: { macos: `Mod+Alt+${key}`, default: `Alt+${key}`, handledBy: "findBar" }, layer: "pro", group: "find",
      checked: (s) => s.ui.find[opt],
      run: () => setFind({ [opt]: !store.state.ui.find[opt] }),
    });
  }
  const recall = (dir: 1 | -1) => () => {
    const next = historyAt + dir;
    if (next < -1 || next >= findHistory.length) return;
    historyAt = next;
    setFind({ query: next === -1 ? "" : findHistory[next]! });
  };
  commands.register({ id: "find.historyOlder", title: "command.find.historyOlder", shortcut: { default: "Up", handledBy: "findField" }, layer: "power", group: "find", run: recall(1) });
  commands.register({ id: "find.historyNewer", title: "command.find.historyNewer", shortcut: { default: "Down", handledBy: "findField" }, layer: "power", group: "find", run: recall(-1) });
  commands.register<{ value: string }>({ id: "find.setQuery", title: "command.find.setQuery", run: ({ value }) => setFind({ query: typeof value === "string" ? value : "", notice: "" }) });
  commands.register<{ value: string }>({ id: "find.setReplace", title: "command.find.setReplace", run: ({ value }) => setFind({ replace: typeof value === "string" ? value : "" }) });
  commands.register<{ value: string }>({
    id: "find.prefill", title: "command.find.setQuery",
    run: ({ value }) => { if (typeof value === "string" && value) setFind({ query: value }); },
  });
  commands.register<{ count: number; current: number; invalid: boolean; wrapped: boolean; replaced: number }>({
    id: "find.setResult", title: "command.find.setResult",
    run: ({ count, current, invalid, wrapped, replaced }) => {
      // Replace all is confirmed by a toast; wrapping is a short notice in the bar.
      if (replaced > 0) toast(catalog.format("find.replaced", { count: replaced }));
      const notice = wrapped ? catalog.format("find.wrapped") : replaced > 0 ? "" : store.state.ui.find.notice;
      setFind({ count: Number(count) || 0, current: Number(current) || 0, invalid: Boolean(invalid), notice });
    },
  });

  // Toast commands: dismiss, the toast's action, pausing while hovered or focused, and F6 to reach it.
  commands.register<{ id: number }>({ id: "toast.dismiss", title: "command.toast.dismiss", run: ({ id }) => dismissToast(Number(id)) });
  commands.register<{ id: number }>({
    id: "toast.action", title: "command.toast.action",
    run: async ({ id }, ctx) => {
      const t = store.state.ui.toasts.find((x) => x.id === Number(id));
      if (!t?.action) return;
      dismissToast(t.id);
      await ctx.run(t.action.command);
    },
  });
  commands.register<{ id: number; paused: boolean }>({
    id: "toast.setPaused", title: "command.toast.setPaused",
    run: ({ id, paused }) => {
      const t = toastTimers.get(Number(id));
      if (!t) return;
      if (paused) {
        clock.clearTimeout(t.handle);
        t.remaining = Math.max(0, t.remaining - (clock.now() - t.started));
      } else arm(Number(id), Math.max(t.remaining, 1500));
      setToasts((ts) => ts.map((x) => (x.id === Number(id) ? { ...x, paused: Boolean(paused) } : x)));
    },
  });
  commands.register({
    id: "toast.focus", title: "command.toast.focus", shortcut: { default: "F6" }, layer: "power", group: "app",
    enabled: (s) => s.ui.toasts.length > 0,
    run: () => store.update((s) => ({ ...s, ui: { ...s.ui, toastFocus: s.ui.toastFocus + 1 } })),
  });

  const setShortcuts = (patch: Partial<AppState["ui"]["shortcuts"]>) =>
    store.update((s) => ({ ...s, ui: { ...s.ui, shortcuts: { ...s.ui.shortcuts, ...patch } } }));
  commands.register({
    id: "shortcuts.open", title: "command.shortcuts.open", icon: "keyboard",
    shortcut: { default: "Mod+Shift+/" }, layer: "writer", group: "app",
    run: () => store.update((s) => ({
      ...s,
      ui: { ...s.ui, toolbarOpen: false, shortcuts: { open: true, query: "", layer: "all", platform: s.ui.shortcuts.platform } },
    })),
  });
  commands.register<{ open: boolean }>({
    id: "shortcuts.setOpen", title: "command.shortcuts.open",
    // Opening goes through shortcuts.open, which resets the search; this only closes.
    run: ({ open }) => { if (!open) setShortcuts({ open: false }); },
  });
  commands.register<{ value: string }>({
    id: "shortcuts.setQuery", title: "command.shortcuts.setQuery",
    run: ({ value }) => setShortcuts({ query: typeof value === "string" ? value : "" }),
  });
  commands.register<{ value: string }>({
    id: "shortcuts.setLayer", title: "command.shortcuts.setLayer",
    run: ({ value }) => { if (value === "all" || (KEY_LAYERS as readonly string[]).includes(value)) setShortcuts({ layer: value as CheatSheetLayer }); },
  });
  commands.register<{ value: string }>({
    id: "shortcuts.setPlatform", title: "command.shortcuts.setPlatform",
    run: ({ value }) => { if (value === "mac" || value === "pc") setShortcuts({ platform: value }); },
  });

  commands.register({
    id: "app.ready",
    title: "command.app.ready",
    run: () => bridge.markReady?.(),
  });

  // Menu groups only some shells have (the web app's Notes group), placed before Help.
  const extraMenu: { id: string; label: string; items: MenuEntry[] }[] = [];

  // ---- view models ----
  // A command's busy sign and words come from the task tracker (PRF-08).
  const busyOf = (id: string) => {
    const t = store.state.tasks.find((x) => x.target === id && x.phase !== "ack");
    if (!t) return {};
    const words = t.phase === "done" ? catalog.format(t.doneMessage ?? "task.done") : catalog.format(t.message);
    return { busy: t.phase === "on", busyLabel: t.elapsed ? catalog.format("task.elapsed", { words, seconds: t.elapsed }) : words };
  };
  const describeItem = (id: string) => {
    const d = commands.describe(id);
    return {
      ...busyOf(id),
      id,
      label: catalog.format(d.title),
      ...(d.icon ? { icon: d.icon } : {}),
      ...(d.shortcut ? { shortcut: formatChord(d.shortcut, bridge.platform) } : {}),
      ...(d.checked !== undefined ? { checked: d.checked } : {}),
      ...(!d.enabled ? { disabled: true, ...(d.disabledReason ? { reason: catalog.format(d.disabledReason) } : {}) } : {}),
    };
  };
  const ITEM_SCHEMA = {
    type: "object" as const,
    properties: {
      id: { type: "string" as const }, label: { type: "string" as const }, icon: { type: "string" as const },
      shortcut: { type: "string" as const }, checked: { type: "boolean" as const }, disabled: { type: "boolean" as const }, reason: { type: "string" as const },
      busy: { type: "boolean" as const }, busyLabel: { type: "string" as const },
    },
  };
  registerFormatting({
    store, commands, viewModels, catalog, bridge, editorAction, toast: (m) => void toast(m),
    announce: (key, args) => announce(catalog.has(key) ? catalog.format(key, args) : key),
  });
  const files = registerFiles({
    store, commands, viewModels, catalog, bridge, toast, announce, load, exclusive, setNote, persistAppState,
    loaded: (path, md) => workspace.loaded(path, md), describeItem, itemSchema: ITEM_SCHEMA,
  });
  const browser = registerBrowserFeatures({
    store, commands, viewModels, catalog, bridge, load, flush, toast, tracker, menu: extraMenu,
    appState: () => appState, persistAppState, itemSchema: ITEM_SCHEMA, describeItem,
  });
  viewModels.register({
    id: "vm.feedback",
    schema: {
      type: "object",
      properties: {
        announcement: { type: "string" },
        announcementKey: { type: "number" },
        toasts: { type: "array", items: { type: "object", properties: {
          id: { type: "number" }, message: { type: "string" }, tone: { type: "string", enum: ["info", "error"] },
          actionLabel: { type: "string" }, hasAction: { type: "boolean" }, paused: { type: "boolean" },
        } } },
        toastFocus: { type: "number" },
        dismissLabel: { type: "string" },
      },
    },
    reads: ["announcement", "ui.toasts", "ui.toastFocus"],
    select: (s) => ({
      announcement: s.announcement.text,
      announcementKey: s.announcement.n,
      toasts: s.ui.toasts.map((t) => ({ id: t.id, message: t.message, tone: t.tone, actionLabel: t.action?.label ?? "", hasAction: Boolean(t.action), paused: t.paused })),
      toastFocus: s.ui.toastFocus,
      dismissLabel: catalog.has("toast.dismiss") ? catalog.format("toast.dismiss") : "",
    }),
  });
  viewModels.register({
    id: "vm.toolbar",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" },
        items: { type: "array", items: ITEM_SCHEMA },
        more: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { ...ITEM_SCHEMA, properties: { ...ITEM_SCHEMA.properties, items: { type: "array", items: ITEM_SCHEMA } } } } } } },
        triggerShortcut: { type: "string" },
      },
    },
    // Command states can depend on anything; the value is kept while it's equal (PRF-11).
    reads: "*",
    select: (s) => ({
      open: s.ui.toolbarOpen,
      items: DEFAULT_TOOLBAR.map(describeItem),
      more: [...MORE_MENU.slice(0, -1), ...extraMenu, ...MORE_MENU.slice(-1)].map((g) => ({
        id: g.id, label: catalog.format(g.label),
        items: g.items.map((e) => (typeof e === "string" ? describeItem(e) : { id: e.submenu, label: catalog.format(e.label), items: e.items.map(describeItem) })),
      })),
      triggerShortcut: formatChord("Mod+.", bridge.platform),
    }),
  });
  viewModels.register({
    id: "vm.find",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, replaceOpen: { type: "boolean" }, query: { type: "string" }, replace: { type: "string" },
        caseSensitive: { type: "boolean" }, wholeWord: { type: "boolean" }, regex: { type: "boolean" }, invalid: { type: "boolean" },
        status: { type: "string" }, statusTone: { type: "string", enum: ["muted", "danger"] }, notice: { type: "string" },
        focusFind: { type: "number" }, focusReplace: { type: "number" }, canReplace: { type: "boolean" },
        actions: {
          type: "object",
          properties: Object.fromEntries(["prev", "next", "close", "case", "word", "regex", "replaceNext", "replaceAll", "toggleReplace"].map((k) => [k, {
            type: "object" as const, properties: { label: { type: "string" as const }, shortcut: { type: "string" as const } },
          }])),
        },
      },
    },
    setters: { query: "find.setQuery", replace: "find.setReplace" },
    reads: ["ui.find"],
    select: (s) => {
      const f = s.ui.find;
      if (!f.open) return { ...f, status: "", statusTone: "muted", canReplace: false, actions: {} };
      const status = !f.query ? "" : f.invalid ? catalog.format("find.invalid") : f.count === 0 ? catalog.format("find.none") : catalog.format("find.count", { current: f.current, count: f.count });
      // Each action's name and shortcut come from the registry, so tooltips teach the keys.
      const action = (id: string) => {
        const d = commands.describe(id);
        return { label: catalog.format(d.title), shortcut: d.shortcut ? formatChord(d.shortcut, bridge.platform) : "" };
      };
      return {
        ...f, status, statusTone: f.query && (f.count === 0 || f.invalid) ? "danger" : "muted", canReplace: f.count > 0,
        actions: {
          prev: action("find.prev"), next: action("find.next"), close: action("find.close"), case: action("find.toggle.caseSensitive"),
          word: action("find.toggle.wholeWord"), regex: action("find.toggle.regex"), replaceNext: action("find.replaceNext"),
          replaceAll: action("find.replaceAll"), toggleReplace: action("find.toggleReplace"),
        },
      };
    },
  });

  // The editor's keymap comes from the registry, so keys are defined once (KEY-02).
  const editorKeymap = commands.bindings().filter((b) => b.handledBy === "editor" || b.handledBy === "table").flatMap((b) => b.chords.map((chord) => ({ id: b.id, chord })));
  viewModels.register({
    id: "vm.app",
    schema: {
      type: "object",
      properties: {
        scheme: { type: "string", enum: ["light", "dark"] },
        platform: { type: "string", enum: ["macos", "windows", "linux", "web"] },
        fontSize: { type: "number" },
        focusMode: { type: "boolean" },
        theme: { type: "string", enum: BUILT_IN_THEMES.map((t) => t.id) },
        contentFont: { type: "string", enum: [...CONTENT_FONTS] },
        uiScale: { type: "number" },
        editorKeymap: { type: "array", items: { type: "object", properties: { id: { type: "string" }, chord: { type: "string" } } } },
      },
    },
    reads: ["appearance", "focusMode"],
    select: (s) => ({
      scheme: resolvedScheme(s), theme: resolvedTheme(s), platform: bridge.platform, fontSize: s.appearance.fontSize, focusMode: s.focusMode,
      contentFont: s.appearance.contentFont, uiScale: s.appearance.uiScale, editorKeymap,
    }),
  });

  const allBindings = (platform: Platform): Binding[] => {
    const natives = NATIVE_KEYS.map((k) => ({ id: k.id, title: k.title, layer: k.layer, group: k.group, chords: chordsFor(k.shortcut, platform) }));
    return [...commands.bindings(platform), ...natives].filter((b) => b.chords.length);
  };
  const option = (id: string, label: string) => ({ id, label: catalog.format(label) });
  const CLOSED = { open: false, query: "", layer: "all", platform: "pc", layers: [], platforms: [], groups: [], count: 0, summary: "" };
  let sheetMemo: { key: AppState["ui"]["shortcuts"]; value: Record<string, unknown> } | undefined;
  const KEY_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const }, text: { type: "string" as const }, spoken: { type: "string" as const }, keys: { type: "array" as const, items: { type: "string" as const } }, first: { type: "boolean" as const } } };
  const OPTION_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  viewModels.register({
    id: "vm.shortcuts",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" },
        query: { type: "string" },
        layer: { type: "string", enum: ["all", ...KEY_LAYERS] },
        platform: { type: "string", enum: ["mac", "pc"] },
        layers: { type: "array", items: OPTION_SCHEMA },
        platforms: { type: "array", items: OPTION_SCHEMA },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" }, label: { type: "string" },
              rows: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, layer: { type: "string" }, chords: { type: "array", items: KEY_SCHEMA } } } },
            },
          },
        },
        count: { type: "number" },
        summary: { type: "string" },
      },
    },
    setters: { query: "shortcuts.setQuery", layer: "shortcuts.setLayer", platform: "shortcuts.setPlatform" },
    reads: ["ui.shortcuts"],
    // Re-selected on every keystroke in the note, so it's cheap while closed and memoized while open.
    select: (s) => {
      const sh = s.ui.shortcuts;
      if (!sh.open) return CLOSED;
      if (sheetMemo?.key === sh) return sheetMemo.value;
      const platform = displayPlatform(sh.platform, bridge.platform);
      const groups = cheatSheet(allBindings(platform), catalog, { query: sh.query, layer: sh.layer, platform });
      const count = groups.reduce((n, g) => n + g.rows.length, 0);
      const summary = count ? catalog.format("shortcuts.count", { count }) : catalog.format("shortcuts.empty", { query: sh.query.trim() });
      const layers = ["all", ...KEY_LAYERS].map((l) => option(l, `shortcuts.layer.${l}`));
      const platforms = [option("mac", "shortcuts.platform.mac"), option("pc", "shortcuts.platform.pc")];
      const value = { ...sh, layers, platforms, groups, count, summary };
      sheetMemo = { key: sh, value };
      return value;
    },
  });
  viewModels.register({
    id: "vm.canvas",
    schema: {
      type: "object",
      properties: {
        noteKey: { type: "string" },
        initialMarkdown: { type: "string" },
        status: { type: "string", enum: ["loading", "ready", "error"] },
        saveState: { type: "string", enum: ["saved", "saving", "unsaved", "error"] },
        saveProblem: { type: "boolean" },
        readOnly: { type: "boolean" },
        problem: { type: "boolean" },
        problemLabel: { type: "string" },
      },
    },
    // Not note.markdown: typing never re-selects the canvas (PRF-11). It shows one note, by path.
    reads: ["note.key", "note.initialMarkdown", "note.status", "note.saveState", "note.path", "workspace.access", "workspace.folder"],
    shows: (s) => (s.note.path ? [{ kind: "note", path: s.note.path }] : []),
    select: (s) => ({
      noteKey: s.note.key,
      initialMarkdown: s.note.initialMarkdown,
      status: s.note.status,
      saveState: s.note.saveState,
      saveProblem: s.note.saveState === "error",
      readOnly: noteReadOnly(s),
      // The trigger's dot shows a save problem (Feedback → Save and sync status).
      problem: s.note.saveState === "error",
      problemLabel: s.note.saveState === "error" ? (catalog.has("trigger.saveProblem") ? catalog.format("trigger.saveProblem") : "") : "",
    }),
  });

  return {
    store, commands, viewModels, messages: catalog, bridge, flush,
    idle: () => tracker.idle(),
    onEditorAction(listener) {
      editorListeners.add(listener);
      return () => editorListeners.delete(listener);
    },
    async start() {
      // The workspace format is read alongside the app state, before the first note opens (DST-05).
      const formatRead = workspace.prepare();
      appState = await bridge.loadAppState().catch(() => ({ version: 1 as const }));
      store.update((s) => ({
        ...s,
        appearance: {
          ...s.appearance,
          ...(appState.appearance ? { mode: appState.appearance } : {}),
          ...(appState.fontSize ? { fontSize: appState.fontSize } : {}),
          // Unknown or removed themes fall back to the defaults rather than failing.
          ...(themeById(appState.lightTheme)?.kind === "light" ? { lightTheme: appState.lightTheme! } : {}),
          ...(themeById(appState.darkTheme)?.kind === "dark" ? { darkTheme: appState.darkTheme! } : {}),
          ...((CONTENT_FONTS as readonly string[]).includes(appState.contentFont ?? "") ? { contentFont: appState.contentFont as ContentFont } : {}),
          ...((UI_SCALES as readonly number[]).includes(appState.uiScale ?? 0) ? { uiScale: appState.uiScale! } : {}),
        },
        // Focus mode is on for new installs: it's a signature feature (D-04).
        focusMode: appState.focusMode ?? true,
      }));
      bridge.onSystemSchemeChange((system) => store.update((s) => ({ ...s, appearance: { ...s.appearance, system } })));
      await formatRead;
      const path = appState.lastNotePath ?? (await bridge.defaultNotePath());
      await load(path);
      if (store.state.note.status === "error" && appState.lastNotePath) await load(await bridge.defaultNotePath());
      workspace.start();
      await browser.start();
    },
  };
}
