import { Store } from "./store.ts";
import { CommandRegistry } from "./commands.ts";
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
  appearance: { mode: "system" | "light" | "dark"; system: Scheme };
}

export const SAVE_DELAY_MS = 400;

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
    appearance: { mode: "system", system: bridge.systemScheme() },
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
  commands.register({
    id: "app.ready",
    title: "command.app.ready",
    run: () => bridge.markReady?.(),
  });
  commands.register({
    id: "trigger.activate",
    title: "command.trigger.activate",
    run: (_args, ctx) => ctx.run("note.open"),
  });

  // ---- view models ----
  viewModels.register({
    id: "vm.app",
    schema: {
      type: "object",
      properties: {
        scheme: { type: "string", enum: ["light", "dark"] },
        platform: { type: "string", enum: ["macos", "windows", "linux", "web"] },
      },
    },
    select: (s) => ({ scheme: resolvedScheme(s), platform: bridge.platform }),
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
      if (appState.appearance) store.update((s) => ({ ...s, appearance: { ...s.appearance, mode: appState.appearance! } }));
      bridge.onSystemSchemeChange((system) => store.update((s) => ({ ...s, appearance: { ...s.appearance, system } })));
      const path = appState.lastNotePath ?? (await bridge.defaultNotePath());
      await load(path);
      if (store.state.note.status === "error" && appState.lastNotePath) await load(await bridge.defaultNotePath());
    },
  };
}
