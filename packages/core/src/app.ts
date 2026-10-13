import { Store } from "./store.ts";
import { CommandRegistry, formatChord } from "./commands.ts";
import { ViewModelRegistry } from "./view-models.ts";
import { MessageCatalog, type Messages } from "./messages.ts";
import type { PlatformBridge, AppStateFile } from "./bridge.ts";

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
  appearance: { mode: "system" | "light" | "dark"; system: Scheme; fontSize: number };
  focusMode: boolean;
  ui: { toolbarOpen: boolean };
}

export const SAVE_DELAY_MS = 400;
/** Note text sizes in px (THM-06). */
export const FONT_STEPS = [14, 15, 16, 17, 18, 20, 22, 24, 28, 32] as const;
export const DEFAULT_FONT_SIZE = 18;

/** The six default toolbar actions, in order (UI-07, D-18). */
export const DEFAULT_TOOLBAR = ["note.new", "note.open", "spotlight.open", "note.save", "focus.toggle", "appearance.toggle"] as const;
/** The ⋯ menu groups available so far (Main UI → The ⋯ menu). */
export const MORE_MENU: { id: string; label: string; items: string[] }[] = [
  { id: "view", label: "menu.view", items: ["font.smaller", "font.larger", "font.reset", "window.fullScreen"] },
  { id: "theme", label: "menu.theme", items: ["appearance.system", "appearance.light", "appearance.dark"] },
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
}

export const resolvedScheme = (s: AppState): Scheme =>
  s.appearance.mode === "system" ? s.appearance.system : s.appearance.mode;

export function createApp(bridge: PlatformBridge, messages: Messages, locale = "en"): App {
  const store = new Store<AppState>({
    note: { key: "none", initialMarkdown: "", markdown: "", status: "loading", saveState: "saved" },
    appearance: { mode: "system", system: bridge.systemScheme(), fontSize: DEFAULT_FONT_SIZE },
    focusMode: false,
    ui: { toolbarOpen: false },
  });
  const commands = new CommandRegistry<AppState>(() => store.state, (r) => store.update(r), bridge.platform);
  const viewModels = new ViewModelRegistry<AppState>();
  const catalog = new MessageCatalog(locale, messages);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();
  let appState: AppStateFile = { version: 1 };

  const persistAppState = (patch: Partial<AppStateFile>) => {
    appState = { ...appState, ...patch };
    return bridge.saveAppState(appState);
  };

  const setNote = (patch: Partial<AppState["note"]>) =>
    store.update((s) => ({ ...s, note: { ...s.note, ...patch } }));

  async function writeNow(): Promise<void> {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const { path, markdown, saveState } = store.state.note;
    if (!path || saveState === "saved") return;
    setNote({ saveState: "saving" });
    try {
      await bridge.writeNote(path, markdown);
      // Only mark saved if nothing changed while writing.
      if (store.state.note.markdown === markdown) setNote({ saveState: "saved" });
      else schedule();
    } catch {
      setNote({ saveState: "error" });
    }
  }
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
    try {
      const md = await bridge.readNote(path);
      setNote({ path, key: `${path}#${Date.now()}`, initialMarkdown: md, markdown: md, status: "ready", saveState: "saved" });
      await persistAppState({ lastNotePath: path });
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
    run: async () => {
      const path = await bridge.chooseNote();
      if (path) await load(path);
    },
  });
  commands.register({
    id: "note.save",
    title: "command.note.save",
    icon: "save",
    shortcut: { default: "Mod+S" },
    run: async () => {
      if (store.state.note.saveState !== "saved") {
        clearTimeout(saveTimer);
        saving = saving.then(writeNow);
        await saving;
      }
    },
  });
  commands.register<{ value: string }>({
    id: "note.setContent",
    title: "command.note.setContent",
    run: ({ value }) => {
      if (typeof value !== "string" || value === store.state.note.markdown) return;
      setNote({ markdown: value, saveState: "unsaved" });
      schedule();
    },
  });
  commands.register({
    id: "appearance.toggle",
    title: "command.appearance.toggle",
    icon: "darkTheme",
    shortcut: { default: "Mod+Shift+L" },
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
    shortcut: { default: "Mod+=", alternates: { default: ["Mod+Plus", "Mod+Shift+Plus"] } },
    enabled: (s) => s.appearance.fontSize < FONT_STEPS[FONT_STEPS.length - 1]!,
    run: () => setFontSize(step(1)),
  });
  commands.register({
    id: "font.smaller", title: "command.font.smaller", icon: "font", shortcut: { default: "Mod+-" },
    enabled: (s) => s.appearance.fontSize > FONT_STEPS[0],
    run: () => setFontSize(step(-1)),
  });
  commands.register({ id: "font.reset", title: "command.font.reset", shortcut: { default: "Mod+0" }, run: () => setFontSize(DEFAULT_FONT_SIZE) });
  commands.register({
    id: "focus.toggle", title: "command.focus.toggle", icon: "focus",
    shortcut: { default: "Mod+Shift+D", alternates: { default: ["F8"] } },
    checked: (s) => s.focusMode,
    run: async (_a, ctx) => {
      const on = !ctx.state.focusMode;
      ctx.update((s) => ({ ...s, focusMode: on }));
      await persistAppState({ focusMode: on });
    },
  });
  commands.register({
    id: "note.new", title: "command.note.new", icon: "newNote", shortcut: { default: "Mod+N" },
    run: async () => {
      const path = await bridge.newNotePath(store.state.note.path);
      if (!(await flush())) return;
      await bridge.writeNote(path, "");
      await load(path);
    },
  });
  commands.register({
    id: "spotlight.open", title: "command.spotlight.open", icon: "search",
    shortcut: { default: "Mod+/", alternates: { default: ["Mod+Shift+P"] } },
    // Spotlight arrives in M4; until then the command says so instead of doing nothing.
    enabled: () => false,
    disabledReason: "command.spotlight.open.reason",
    run: () => {},
  });
  commands.register({
    id: "window.fullScreen", title: "command.window.fullScreen", icon: "fullScreen",
    shortcut: { macos: "Ctrl+Mod+F", default: "F11" },
    enabled: () => Boolean(bridge.toggleFullScreen),
    run: () => bridge.toggleFullScreen?.(),
  });
  commands.register<{ open: boolean }>({
    id: "toolbar.setOpen", title: "command.toolbar.toggle",
    run: ({ open }) => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: Boolean(open) } })),
  });
  commands.register({
    id: "toolbar.toggle", title: "command.toolbar.toggle",
    shortcut: { default: "Mod+.", alternates: { windows: ["F10"], linux: ["F10"] } },
    run: () => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: !s.ui.toolbarOpen } })),
  });
  commands.register<{ id: string }>({
    id: "command.run", title: "command.command.run",
    // Runs a command chosen from a registry-built list (toolbar, menus). Unknown IDs are refused.
    run: async ({ id }, ctx) => {
      if (typeof id !== "string" || id === "command.run" || !commands.has(id)) return;
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
      await ctx.run(id);
    },
  });
  commands.register({
    id: "app.ready",
    title: "command.app.ready",
    run: () => bridge.markReady?.(),
  });

  // ---- view models ----
  const describeItem = (id: string) => {
    const d = commands.describe(id);
    return {
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
    },
  };
  viewModels.register({
    id: "vm.toolbar",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" },
        items: { type: "array", items: ITEM_SCHEMA },
        more: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ITEM_SCHEMA } } } },
        triggerShortcut: { type: "string" },
      },
    },
    select: (s) => ({
      open: s.ui.toolbarOpen,
      items: DEFAULT_TOOLBAR.map(describeItem),
      more: MORE_MENU.map((g) => ({ id: g.id, label: catalog.format(g.label), items: g.items.map(describeItem) })),
      triggerShortcut: formatChord("Mod+.", bridge.platform),
    }),
  });
  viewModels.register({
    id: "vm.app",
    schema: {
      type: "object",
      properties: {
        scheme: { type: "string", enum: ["light", "dark"] },
        platform: { type: "string", enum: ["macos", "windows", "linux", "web"] },
        fontSize: { type: "number" },
        focusMode: { type: "boolean" },
      },
    },
    select: (s) => ({ scheme: resolvedScheme(s), platform: bridge.platform, fontSize: s.appearance.fontSize, focusMode: s.focusMode }),
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
      },
    },
    select: (s) => ({
      noteKey: s.note.key,
      initialMarkdown: s.note.initialMarkdown,
      status: s.note.status,
      saveState: s.note.saveState,
      saveProblem: s.note.saveState === "error",
    }),
  });

  return {
    store, commands, viewModels, messages: catalog, bridge, flush,
    async start() {
      appState = await bridge.loadAppState().catch(() => ({ version: 1 as const }));
      store.update((s) => ({
        ...s,
        appearance: { ...s.appearance, ...(appState.appearance ? { mode: appState.appearance } : {}), ...(appState.fontSize ? { fontSize: appState.fontSize } : {}) },
        focusMode: appState.focusMode ?? false,
      }));
      bridge.onSystemSchemeChange((system) => store.update((s) => ({ ...s, appearance: { ...s.appearance, system } })));
      const path = appState.lastNotePath ?? (await bridge.defaultNotePath());
      await load(path);
      if (store.state.note.status === "error" && appState.lastNotePath) await load(await bridge.defaultNotePath());
    },
  };
}
