import { Store } from "./store.ts";
import { registerRewriteDemo } from "./rewrite-demo.ts";
import { CommandRegistry, chordsFor, formatChord, KEY_LAYERS, type Binding } from "./commands.ts";
import { BUILT_IN_THEMES, CONTENT_FONTS, DEFAULT_THEMES, FOCUS_DIM, LINE_HEIGHT, MEASURE, PARAGRAPH_SPACINGS, UI_SCALES, onSteps, themeById, type ContentFont, type ParagraphSpacing } from "./themes.ts";
import { cheatSheet, displayPlatform, EDITOR_COMMANDS, NATIVE_KEYS, type CheatSheetLayer, type CheatSheetPlatform } from "./keymap.ts";
import { ViewModelRegistry } from "./view-models.ts";
import { MessageCatalog, type Messages } from "./messages.ts";
import type { PlatformBridge, AppStateFile, Compositing, RepoId } from "./bridge.ts";
import { registerBrowserFeatures, PICKER_CLOSED, UNLOCK_CLOSED, NO_INSTANCE, type PickerState, type UnlockState, type InstanceState } from "./browser.ts";
import { isReadOnlyPath, sourceOf } from "./notes.ts";
import { registerWorkspaceFeatures, noteReadOnly, NO_WORKSPACE, type WorkspaceState, type WorkspaceFormatOptions } from "./workspace-app.ts";
import type { Platform } from "./commands.ts";
import { waits } from "@focus-notes/tokens";
import { TaskTracker, busyProps, type Clock, type TaskView } from "./tasks.ts";
import { registerFormatting, FORMAT_CLOSED, type FormatState } from "./format.ts";
import { registerFiles, FILES_CLOSED, type FilesState } from "./files-app.ts";
import { joinPath, newNoteFolder } from "./workspace.ts";
import { registerImport, IMPORT_CLOSED, type ImportState } from "./import-app.ts";
import { registerPublicLink } from "./public-link-app.ts";
import { appStateOfSettings, parseSettings, settingsFileOf, splitAppState, type SettingsFile } from "./settings.ts";
import { registerRepoBackup, repoBackupView, REPO_IDS, type RepoBackupState } from "./repo-backup.ts";
import { registerSync, NO_SYNC, SyncFailed, saveStateOf, syncProblemAction, type SyncState } from "./sync-app.ts";
import { registerSetup, NO_SETUP, type SetupState } from "./setup-app.ts";
import { registerFirstRun, FIRST_RUN_INACTIVE, NO_ACCOUNT, type FirstRunState, type AccountState } from "./first-run-app.ts";
import { registerRecover, RECOVER_CLOSED, type RecoverState } from "./recover-app.ts";
import { registerConflicts, CONFLICT_CLOSED, type ConflictState } from "./conflict-app.ts";
import { registerDrafts } from "./drafts-app.ts";
import { registerNoteHistory, HISTORY_CLOSED, type HistoryState } from "./note-history-app.ts";
import { registerDeepLinks } from "./deep-link-app.ts";
import { registerAgents, AGENTS_IDLE, type AgentsState } from "./agents-app.ts";
import { registerKeybindings, KEYBINDINGS_NONE, type KeybindingsState } from "./keybindings-app.ts";
import { registerToolbarCustomize, TOOLBAR_CUSTOMIZE_CLOSED, validPinned, type ToolbarCustomizeState } from "./toolbar-customize.ts";
import { registerHeld, HELD_CLOSED, type HeldUiState } from "./held-app.ts";
import { registerPrint, PRINT_CLOSED, type PrintUiState } from "./print-app.ts";
import { registerSettings, SETTINGS_CLOSED, type SettingsState } from "./settings-app.ts";
import { FEEDBACK_CLOSED, registerFeedback, type FeedbackState } from "./feedback-app.ts";
import { registerShareManage, SHARE_MANAGE_CLOSED, type ShareManageState } from "./share-manage.ts";
import { registerWindow, initialWindow, type WindowState } from "./window-app.ts";
import { registerTextMenu, TEXT_MENU_CLOSED, type TextMenuState } from "./text-menu-app.ts";
import { registerMenuBar } from "./menu-bar.ts";
import { WarmUp } from "./warmup.ts";
import { registerSpotlight, SPOTLIGHT_CLOSED, type SpotlightState } from "./spotlight-app.ts";
import { registerFindAll, FIND_ALL_CLOSED, type FindAllState, type FindJump } from "./find-all-app.ts";
import type { SearchService } from "./search/feed.ts";
import { registerThemeManager, THEME_MANAGER_CLOSED, kindOf, rootTheme, type Appearance, type ThemeManagerState } from "./theme-manager-app.ts";
import { customThemesOf, isCustomId } from "./custom-themes.ts";
import { headingCount } from "./outline.ts";

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
  /** Appearance and the reading settings (THM-08, THM-03, Theme manager → Reading). */
  appearance: Appearance;
  focusMode: boolean;
  /** The document minimap's card docked on the right, on this device (D-186, D-187). */
  outlinePinned: boolean;
  /** Printed pages carry their number and the count, on this device (D-231). */
  printPageNumbers: boolean;
  /** Its docked width in px, as resized; undefined: the token's default (D-187). */
  outlineWidth?: number;
  /** The toolbar's actions, in order: at most six (UI-08, D-170). */
  toolbarPinned: string[];
  /** keybindings.json as applied (KEY-07, D-170). */
  keybindings: KeybindingsState;
  /** How the window is composited, as the shell reports it (D-121): in software the note's edges fade without the blur. */
  compositing: Compositing;
  ui: {
    toolbarOpen: boolean;
    /** The keyboard shortcut cheat sheet (IA-VIEW-SHORTCUTS). */
    shortcuts: { open: boolean; query: string; layer: CheatSheetLayer; platform: CheatSheetPlatform };
    /** The find bar (IA-CMP-FINDBAR, FND-01, FND-02). */
    find: FindState;
    /** Find in all notes (FND-04): its side sheet, query, and results. */
    findAll: FindAllState;
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
    /** The Files panel, Move to…, and its confirmations: deleting, and changing who can see notes (IA-VIEW-FILES). */
    files: FilesState;
    /** Import notes on the desktop: where a chosen bundle's notes go (FRE-10). */
    importNotes: ImportState;
    /** The conflict resolver (FIL-12, IA-CMP-CONFLICT). */
    conflict: ConflictState;
    /** Customize toolbar (UI-08, D-170). */
    toolbarCustomize: ToolbarCustomizeState;
    /** Note history (FIL-13, IA-VIEW-HISTORY): the open note's versions from Git. */
    history: HistoryState;
    /** A new public note held out of Git until the writer answers (D-158): its pill and its question. */
    held: HeldUiState;
    /** Settings → Agents (WP-7.4, D-166). */
    agents: AgentsState;
    /** Settings (IA-VIEW-SETTINGS): Account and Workspace, with signing out and removing the workspace (FRE-07). */
    settings: SettingsState;
    /** Send feedback (IA-VIEW-FEEDBACK, D-203): the draft, in memory only. */
    feedback: FeedbackState;
    /** Settings → Sharing and its dialogs: audiences made, changed, and withdrawn (WP-5.3). */
    share: ShareManageState;
    /** Spotlight (IA-VIEW-SPOTLIGHT): search and act. */
    spotlight: SpotlightState;
    /** The theme manager (IA-VIEW-THEME, THM-07). */
    theme: ThemeManagerState;
    /** The note laid out for paper while the system's print dialog is open (SHR-12, D-230). */
    print: PrintUiState;
  };
  /** Synced settings (PRV-03): no private repository to sync through, or syncing off or on. */
  settingsSync: "unavailable" | "off" | "on";
  /** The instance this web app was deployed with, read-only (PKG-08, PKG-10). */
  instance: InstanceState;
  /** The workspace: its tree of notes and folders, and whether this app may write it (DST-05). */
  workspace: WorkspaceState;
  /** Save and sync with Git: whether there's a repository, and the problem to show if any (EDT-11). */
  sync: SyncState;
  /** What waits for backup in each section's repository (FIL-14, D-191). */
  repoBackup: RepoBackupState;
  /** Set up my instance: the latest report from the shell's setup (FRE-08). */
  setup: SetupState;
  /** The desktop's first run (FRE-01): the step it's at and what it found. */
  firstRun: FirstRunState;
  /** The GitHub account Git is signed in to on the desktop, for the account pill (UI-12). */
  account: AccountState;
  /** The notes folder is missing at start: the recovery view and the way back under way (FRE-11, FRE-12, D-212). */
  recover: RecoverState;
  /** The app-built window on Windows and Linux, as the shell reports it (DSK-03, D-14). Native elsewhere. */
  window: WindowState;
  /** The right-click menu in text the app draws on Windows and Linux (D-204, EDT-14). */
  textMenu: TextMenuState;
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
  /** Find in selection (FND-03): search only the scope the editor took as the bar opened. */
  inSelection: boolean;
  /** The editor has a scope: text was selected as the bar opened. */
  scoped: boolean;
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
  open: false, replaceOpen: false, query: "", replace: "", caseSensitive: false, wholeWord: false, regex: false, inSelection: false, scoped: false,
  count: 0, current: 0, invalid: false, notice: "", focusFind: 0, focusReplace: 0,
};

export interface ToastState {
  id: number;
  message: string;
  tone: "info" | "error";
  /** A command the toast offers ([Undo], [Retry], [Resolve]), its label, and its arguments. */
  action?: { command: string; label: string; args?: Record<string, unknown> };
  paused: boolean;
}

export const SAVE_DELAY_MS = 400;
/**
 * PRF-03's measures, on the User Timing timeline: opening a note, from the request to the first
 * frame that shows it with the caret ready, and each write's end, which a journey compares with the
 * last keystroke. Best effort: hosts without the API skip them.
 */
export const OPEN_MEASURE = "fn:note.open";
export const SAVED_MARK = "fn:note.saved";
const timing = {
  mark(name: string): number | undefined {
    try {
      return performance.mark(name).startTime;
    } catch {
      return undefined;
    }
  },
  measure(name: string, start: number): void {
    try {
      performance.measure(name, { start, end: performance.now() });
    } catch {
      // Not every host has the User Timing API.
    }
  },
};
/** After the next frame is painted (two animation frames), or at once where there are no frames. */
const afterPaint = (fn: () => void) => {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
  if (raf) raf(() => raf(fn));
  else fn();
};
/**
 * The longest the text the editor hands over waits to be kept (QLT-03) in the recovery journal (the
 * desktop). The editor hands text over at most 0.25 s after it changed, so a key typed is kept within
 * 0.4 s and a crash loses at most about a second of typing even on a busy computer (DEF-14, D-152).
 * The wait is from the text's arrival, never from the last write, so a handover just after one isn't
 * held back a whole interval.
 */
export const JOURNAL_INTERVAL_MS = 150;
/**
 * Without a journal (the browser), typing that never pauses saves the note itself at most this long
 * after the text arrives, so it's kept within half a second there.
 */
export const UNJOURNALED_SAVE_MS = 250;
/** The editor action that asks the editor to hand over text it hasn't sent yet (the runtime's flush). */
export const FLUSH_EDITOR = "note.flush";
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
    items: ["font.smaller", "font.larger", "font.reset", { submenu: "font.content", label: "menu.contentFont", items: CONTENT_FONTS.map((f) => `font.content.${f}`) }, "window.fullScreen", "files.togglePin", "outline.togglePin"],
  },
  {
    id: "theme", label: "menu.theme",
    items: [
      "theme.manager.open",
      "appearance.system", "appearance.light", "appearance.dark",
      { submenu: "theme.light", label: "menu.lightTheme", items: BUILT_IN_THEMES.filter((t) => t.kind === "light").map((t) => `theme.light.${t.id}`) },
      { submenu: "theme.dark", label: "menu.darkTheme", items: BUILT_IN_THEMES.filter((t) => t.kind === "dark").map((t) => `theme.dark.${t.id}`) },
    ],
  },
  { id: "edit", label: "menu.edit", items: ["find.open", "find.replace", "find.allNotes"] },
  { id: "note", label: "menu.note", items: ["note.share", "note.copyPublicLink", "history.open", "note.print", "print.pageNumbers"] },
  // Settings is available only where there's a GitHub account to manage (the desktop, FRE-07).
  { id: "app", label: "menu.app", items: ["settings.open", "feedback.open", "toolbar.customize", "shortcuts.open", "help.open"] },
];
/**
 * ⋯ items whose feature arrives in a later work package: present now, disabled, and saying why
 * (UI-07, Foundations → States), rather than hidden. Each becomes a real command when it lands.
 */
export const PLANNED_MENU_COMMANDS = [
  // Help and docs open the product site's help, which arrives with the product site (WP-5.6).
  { id: "help.open", title: "command.help.open", icon: "info", disabledReason: "command.help.open.reason" },
] as const;

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
  /** The page saw a key press that could be a menu bar item's key (DSK-05): that press isn't run again by the menu. */
  keySeen(): void;
  /** The warm-up after start (PRF-10): shells and later features add the work it does. */
  warmUp: WarmUp;
  /** The search index, once the shell has started it (`startSearch`, D-107): Spotlight and Find in all notes ask it. */
  useSearch(service: SearchService): void;
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
  /** HTML as Markdown, for Import files (FIL-15): the editor's paste pipeline, which core can't import. */
  htmlToMarkdown?: (html: string) => string;
}

export function createApp(bridge: PlatformBridge, messages: Messages, locale = "en", options: AppOptions = {}): App {
  const store = new Store<AppState>({
    note: { key: "none", initialMarkdown: "", markdown: "", status: "loading", saveState: "saved" },
    appearance: {
      mode: "system", system: bridge.systemScheme(), fontSize: DEFAULT_FONT_SIZE,
      lightTheme: DEFAULT_THEMES.light, darkTheme: DEFAULT_THEMES.dark, contentFont: "mono", uiScale: 1,
      lineHeight: LINE_HEIGHT.default, measure: MEASURE.default, paragraphSpacing: "comfortable",
    },
    focusMode: false,
    outlinePinned: false,
    printPageNumbers: false,
    toolbarPinned: [...DEFAULT_TOOLBAR],
    keybindings: KEYBINDINGS_NONE,
    compositing: bridge.compositing?.initial === "software" ? "software" : "gpu",
    ui: { toolbarOpen: false, shortcuts: { open: false, query: "", layer: "all", platform: bridge.platform === "macos" ? "mac" : "pc" }, find: FIND_CLOSED, findAll: FIND_ALL_CLOSED, toasts: [], toastFocus: 0, picker: PICKER_CLOSED, unlock: UNLOCK_CLOSED, aboutOpen: false, format: FORMAT_CLOSED, files: FILES_CLOSED, importNotes: IMPORT_CLOSED, conflict: CONFLICT_CLOSED, toolbarCustomize: TOOLBAR_CUSTOMIZE_CLOSED, history: HISTORY_CLOSED, held: HELD_CLOSED, agents: AGENTS_IDLE, settings: SETTINGS_CLOSED, feedback: FEEDBACK_CLOSED, share: SHARE_MANAGE_CLOSED, spotlight: SPOTLIGHT_CLOSED, theme: THEME_MANAGER_CLOSED, print: PRINT_CLOSED },
    settingsSync: "unavailable",
    instance: NO_INSTANCE,
    workspace: NO_WORKSPACE,
    sync: NO_SYNC,
    repoBackup: {},
    setup: NO_SETUP,
    firstRun: FIRST_RUN_INACTIVE,
    account: NO_ACCOUNT,
    recover: RECOVER_CLOSED,
    window: initialWindow(bridge),
    textMenu: TEXT_MENU_CLOSED,
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
  /** When the text not yet handed to a write first changed: the browser saves no later than a second after (QLT-03). */
  let unsavedSince: number | undefined;
  const warmUp = new WarmUp({ enabled: bridge.warmUp !== false });
  let appState: AppStateFile = { version: 1 };
  /** What this device keeps (`state.json`), and the synced settings file while syncing is on (PRV-03). */
  let deviceState: AppStateFile = { version: 1 };
  let settingsFile: SettingsFile | undefined;
  /** A patch's undefined values remove those keys (the recent note, forgotten on sign out, PRV-02). */
  const merge = (base: AppStateFile, patch: Partial<AppStateFile>) =>
    Object.fromEntries(Object.entries({ ...base, ...patch }).filter(([, v]) => v !== undefined)) as unknown as AppStateFile;
  const saveDevice = (patch: Partial<AppStateFile>) => {
    deviceState = merge(deviceState, patch);
    return bridge.saveAppState(deviceState);
  };
  const saveSettings = () => bridge.settings!.save(`${JSON.stringify(settingsFile, null, 2)}\n`);
  const persistAppState = async (patch: Partial<AppStateFile>) => {
    // A window opened for a note never changes which note the app reopens at launch (DSK-06, D-179).
    if (bridge.windows?.secondary && "lastNotePath" in patch) {
      const { lastNotePath: _, ...rest } = patch;
      if (!Object.keys(rest).length) return;
      patch = rest;
    }
    appState = merge(appState, patch);
    const { device, synced } = splitAppState(patch);
    // While syncing, the synced settings go to the private repository and the rest stays here (D-46).
    if (!settingsFile || !Object.keys(synced).length) return saveDevice(patch);
    settingsFile = settingsFileOf(synced, settingsFile);
    await Promise.all([saveSettings(), Object.keys(device).length ? saveDevice(device) : undefined]);
  };

  const setNote = (patch: Partial<AppState["note"]>) =>
    store.update((s) => ({ ...s, note: { ...s.note, ...patch } }));
  const sync = registerSync({ store, bridge, catalog, toast, announce });
  const repoBackup = registerRepoBackup({ store, bridge, catalog, tracker, toast, announce });
  // Back up to GitHub for one Files section's repository (FIL-14, D-191).
  commands.register({
    id: "repoBackup.backUp", title: "command.repoBackup.backUp",
    run: (a) => (REPO_IDS.includes(a.repo as RepoId) ? repoBackup.backUp(a.repo as RepoId) : undefined),
  });
  const setup = registerSetup({ store, bridge, catalog, commands, viewModels });
  /** The note put away while the first run's card shows again (Run setup again, Sign in, Switch account, Open another workspace). */
  let held: string | undefined;
  const firstRun = registerFirstRun({
    store, bridge, catalog, commands, viewModels, tracker, toast, persistAppState, now: clock.now,
    hold: async () => {
      editorAction(FLUSH_EDITOR);
      if (!(await flush())) return false;
      held = store.state.note.path;
      // The editor goes away until the card closes; the note is read again from disk then.
      setNote({ status: "loading" });
      return true;
    },
    release: async () => {
      const path = held;
      held = undefined;
      if (!path) return false;
      await load(path);
      return true;
    },
  });
  const recover = registerRecover({ store, bridge, catalog, commands, viewModels, tracker, clock, now: () => Date.now(), again: (scope) => firstRun.again(scope) });
  registerSettings({ store, bridge, catalog, commands, viewModels, toast, persistAppState, appState: () => appState, flush, again: (scope, o) => firstRun.again(scope, o), tracker, prefetchRepos: () => firstRun.prefetchRepos() });
  registerFeedback({ store, bridge, catalog, commands, viewModels, toast, announce, tracker, clock });
  registerShareManage({ store, access: bridge.access, catalog, commands, viewModels });
  const workspace = registerWorkspaceFeatures({
    store, commands, viewModels, catalog, bridge, toast, setNote, persistAppState, afterWrites, ...(options.workspaceFormat ? { format: options.workspaceFormat } : {}),
    // Unsaved edits and a file changed outside: both versions go to the resolver (D-92, FIL-12).
    outside: (path, mine, theirs) => conflicts.outside(path, mine, theirs),
    matched: (path) => conflicts.release(path),
    handOver: () => editorAction(FLUSH_EDITOR),
  });

  async function writeNow(): Promise<void> {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const { path, markdown, saveState } = store.state.note;
    // Never into a workspace this app mustn't write (DST-05); the text stays unsaved, not lost.
    if (!path || saveState === "saved" || noteReadOnly(store.state)) return;
    // The file changed outside while this was unsaved: nothing overwrites it until a choice is made (D-92).
    if (conflicts.holds(path)) return;
    unsavedSince = undefined;
    // What the save covers of the text kept for recovery: confirmed once it's on disk (QLT-06).
    const confirm = drafts.snapshot();
    setNote({ saveState: "saving" });
    try {
      // The shell writes only if the file still holds what this window knows is there: another
      // program's change since then is never saved over, even one the watcher hasn't reported yet
      // (D-92, DEF-26); the edits stay here and wait for a choice.
      const found = await bridge.writeNote(path, markdown, workspace.onDisk(path));
      if (found && typeof found === "object" && typeof found.outside === "string") {
        setNote({ saveState: "unsaved" });
        conflicts.outside(path, store.state.note.path === path ? store.state.note.markdown : markdown, found.outside);
        return;
      }
      timing.mark(SAVED_MARK);
      // The file name follows the title (FIL-07); a rename keeps the editor as it is.
      await workspace.written(path, markdown);
      // A held note asks before its first backup only once it has the writer's words (D-158).
      heldNotes.written(path, store.state.note.path);
      // Only mark saved if nothing changed while writing.
      const unchanged = store.state.note.markdown === markdown;
      confirm(unchanged);
      if (unchanged) setNote({ saveState: "saved" });
      else schedule();
    } catch {
      setNote({ saveState: "error" });
    }
  }
  /** Disk observations and mutations share one lane, including the save's acknowledgement. */
  function afterWrites<T>(fn: () => Promise<T>): Promise<T> {
    const run = saving.then(fn);
    saving = run.then(() => {}, () => {});
    return run;
  }
  /** Runs a file operation after pending edits are written, holding later saves until it's done. */
  const exclusive = async <T,>(fn: () => Promise<T>): Promise<T> => {
    await flush();
    return afterWrites(fn);
  };
  const schedule = () => {
    clearTimeout(saveTimer);
    // Without a shell keeping drafts, typing that never pauses is still saved every UNJOURNALED_SAVE_MS (QLT-03).
    const wait = bridge.recovery || unsavedSince === undefined ? SAVE_DELAY_MS : Math.min(SAVE_DELAY_MS, Math.max(0, unsavedSince + UNJOURNALED_SAVE_MS - Date.now()));
    saveTimer = setTimeout(() => {
      saving = saving.then(writeNow);
    }, wait);
  };
  /** Text that's the note's now, unsaved: saved soon, and kept for recovery until it is (QLT-03, QLT-06). */
  const typed = (markdown: string) => {
    unsavedSince ??= Date.now();
    setNote({ markdown, saveState: "unsaved" });
    sync.edited();
    schedule();
    drafts.edited();
  };

  // Back and forward between notes (Keyboard shortcuts → App and window, KEY-03), as in a browser:
  // opening a note drops the notes ahead of it; going back or forward only moves along the list.
  // The trail moves the moment the stepped-to note shows, not after the rest of opening finishes,
  // so forward pressed as soon as the note appears isn't lost (DEF-11).
  const trail = { paths: [] as string[], at: -1, step: undefined as { to: number; shown: boolean } | undefined };
  const visited = (path: string) => {
    const step = trail.step;
    if (step && trail.paths[step.to] === path) {
      trail.at = step.to;
      step.shown = true;
      return;
    }
    if (trail.paths[trail.at] === path) return;
    trail.paths = [...trail.paths.slice(0, trail.at + 1), path].slice(-50);
    trail.at = trail.paths.length - 1;
  };
  const stepTrail = async (dir: 1 | -1) => {
    const to = trail.at + dir;
    const path = trail.paths[to];
    if (path === undefined) return;
    const step = { to, shown: false };
    trail.step = step;
    try {
      await load(path);
    } finally {
      if (trail.step === step) trail.step = undefined;
    }
    if (!step.shown && store.state.note.path !== path) {
      // A note that's gone (deleted, or its folder removed) leaves the trail.
      trail.paths.splice(to, 1);
      if (to < trail.at) trail.at--;
    }
  };

  let opening: number | undefined;
  let rewriteRevision: string | undefined;
  const slashed = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  /** Whether a path is in the workspace's Public root (`notes/`). */
  const publicInWorkspace = (path: string, folder: string) => slashed(path).startsWith(`${slashed(folder)}/notes/`);
  /** Opens a note. `accept` may turn it down once read (the launch's last note, D-171): nothing shows then. */
  async function load(path: string): Promise<void> {
    await openNote(path);
  }
  async function openNote(path: string, opts: { accept?: (markdown: string) => boolean } = {}): Promise<boolean> {
    opening = timing.mark("fn:note.open.start");
    if (bridge.rewriteAuthority) {
      rewriteRevision = undefined;
      await bridge.rewriteAuthority("activate", { path: null });
    }
    // Never replace a note whose latest text isn't on disk (data safety, QLT-03).
    editorAction(FLUSH_EDITOR);
    if (!(await flush())) return false;
    // Switching notes commits and pushes the one being left (D-23).
    const leaving = store.state.note.path;
    if (leaving && leaving !== path) {
      // A new public note that waits is asked about before its first backup (D-158).
      void heldNotes.backingUp(leaving);
      sync.switched();
    }
    setNote({ status: "loading" });
    // The toolbar and link editor belong to the note that was open.
    store.update((s) => ({ ...s, ui: { ...s.ui, format: FORMAT_CLOSED } }));
    try {
      const md = await bridge.readNote(path);
      if (opts.accept && !opts.accept(md)) return false;
      if (bridge.rewriteAuthority) rewriteRevision = await bridge.rewriteAuthority("activate", { path, expected: md }).catch(() => undefined);
      setNote({ path, key: `${path}#${Date.now()}`, initialMarkdown: md, markdown: md, status: "ready", saveState: "saved" });
      workspace.sawOnDisk(path, md);
      workspace.loaded(path, md);
      visited(path);
      // A note sync found changed elsewhere opens the resolver when it's opened (IA-CMP-CONFLICT).
      conflicts.offer(path);
      // A new draft from its first edit; text a crash left for it comes back now (QLT-06).
      drafts.opened(path, md);
      // A private note's name is private: it's never written to this browser's storage (D-90).
      if (sourceOf(path) !== "private") await persistAppState({ lastNotePath: path });
      return true;
    } catch {
      setNote({ status: "error" });
      return false;
    }
  }

  /** Writes any unsaved or previously failed change now. Resolves to whether the note is saved. */
  async function flush(): Promise<boolean> {
    if (saveTimer || store.state.note.saveState === "unsaved" || store.state.note.saveState === "error") saving = saving.then(writeNow);
    await saving;
    // Text that can't be written without overwriting the other version asks for a choice instead.
    if (conflicts.holds(store.state.note.path) && store.state.note.saveState !== "saved") {
      conflicts.offer(store.state.note.path);
      return false;
    }
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
    // Saving is a wait the person started, so it goes through the task tracker (PRF-08). With Git,
    // it also commits and pushes now, and says "Saved and synced" or why it couldn't (D-23).
    // A note waiting for a conflict choice asks for it instead (FIL-12).
    run: () => (conflicts.holds(store.state.note.path) ? Promise.resolve(conflicts.offer(store.state.note.path)) : tracker.run("note.save", "task.saving", async () => {
      // What's on screen is what's saved: the editor hands over text it hasn't sent yet.
      editorAction(FLUSH_EDITOR);
      clearTimeout(saveTimer);
      saveTimer = undefined;
      saving = saving.then(writeNow);
      await saving;
      if (store.state.note.saveState === "error") throw new Error("save failed");
      // A new public note that waits is asked about; the rest is backed up as usual (D-158).
      await heldNotes.backingUp(store.state.note.path);
      await sync.saveNow();
    }, store.state.sync.git ? "task.synced" : "task.saved")).catch((e: unknown) => {
      const conflict = e instanceof SyncFailed && e.problem === "conflict";
      const special = e instanceof SyncFailed ? syncProblemAction(e.problem, catalog) : undefined;
      const action = conflict ? { command: "conflict.open", label: catalog.format("conflict.resolve") } : special ?? { command: "note.save", label: catalog.format("toast.retry") };
      toast(e instanceof SyncFailed ? e.message : catalog.format("toast.saveFailed"), { tone: "error", action });
    }),
  });
  // Save to cloud (D-132): Mod+Shift+S, and Mod+S for muscle memory, back up now; the pill's menu offers it.
  commands.register({
    id: "sync.now", title: "command.sync.now", icon: "cloudUp",
    shortcut: { default: "Mod+Shift+S" },
    layer: "basic", group: "app",
    enabled: (s) => sync.canSave(s.sync),
    run: (_a, c) => c.run("note.save"),
  });
  commands.register<{ value: string }>({
    id: "note.setContent",
    title: "command.note.setContent",
    run: ({ value }) => {
      if (typeof value !== "string" || value === store.state.note.markdown) return;
      // The instance's notes are read-only in the browser (D-90), and so is a workspace this app
      // mustn't write (DST-05); the editor doesn't change them either.
      if (noteReadOnly(store.state)) return;
      warmUp.typed();
      typed(value);
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
  // A note in a window of its own, side by side with this one (DSK-06, D-179): this window keeps its
  // note. Saved first, so the new window reads what's on screen here.
  commands.register({
    id: "note.openInNewWindow", title: "command.note.openInNewWindow", icon: "fullScreen", layer: "power", group: "app",
    enabled: (s) => Boolean(bridge.windows) && Boolean(s.note.path) && s.note.status === "ready",
    run: async () => {
      const path = store.state.note.path;
      if (!path || !bridge.windows) return;
      editorAction(FLUSH_EDITOR);
      await flush();
      await bridge.windows.open(path);
    },
  });
  commands.register({
    id: "note.new", title: "command.note.new", icon: "newNote", shortcut: { default: "Mod+N", web: "Ctrl+Alt+N" }, layer: "basic", group: "app",
    enabled: (s) => s.workspace.access === "write",
    disabledReason: "command.note.new.readOnly",
    // With a title (Spotlight's Create note "…"), the note starts with it as its H1 and is named after it (FIL-07).
    run: async ({ title }: { title?: unknown }) => {
      const current = store.state.note.path;
      // With the Files panel open, the note goes into the selected folder (Files → Creating); else
      // into the open note's folder if it's private, or the Private root: private by default (SHR-01).
      // Before the tree has been read (just after launch), whether the open note is private isn't known:
      // then only a chosen folder counts, and the shell puts it in the Private root (D-171).
      const tree = store.state.workspace.tree;
      const known = tree.roots.length > 0;
      const folder = known ? newNoteFolder(tree, files.newNoteFolder(), isReadOnlyPath(current) ? undefined : current) : files.newNoteFolder();
      const near = folder !== undefined ? joinPath(folder, "untitled.md") : known && !isReadOnlyPath(current) ? current : undefined;
      const path = await bridge.newNotePath(near);
      if (!(await flush())) return;
      files.created(path);
      await bridge.writeNote(path, "");
      // Without a private repository the shell held it: its pill shows from the start (D-158).
      await heldNotes.refresh();
      await load(path);
      const heading = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
      if (heading && store.state.note.path === path) {
        const md = `# ${heading}\n\n`;
        setNote({ key: `${path}#${Date.now()}`, initialMarkdown: md, markdown: md, saveState: "unsaved" });
        await flush();
      }
    },
  });
  commands.register({
    id: "note.back", title: "command.note.back", icon: "history",
    shortcut: { macos: "Mod+[", default: "Alt+Left" }, layer: "power", group: "app",
    enabled: () => trail.at > 0, disabledReason: "command.note.back.none",
    run: () => stepTrail(-1),
  });
  commands.register({
    id: "note.forward", title: "command.note.forward", icon: "history",
    shortcut: { macos: "Mod+]", default: "Alt+Right" }, layer: "power", group: "app",
    enabled: () => trail.at < trail.paths.length - 1, disabledReason: "command.note.forward.none",
    run: () => stepTrail(1),
  });
  commands.register({
    id: "window.fullScreen", title: "command.window.fullScreen", icon: "fullScreen",
    // Alt+Enter as in Windows games, media players and terminals; macOS keeps its own key.
    shortcut: { macos: "Ctrl+Mod+F", default: "F11", web: null, alternates: { windows: ["Alt+Enter"], linux: ["Alt+Enter"] } }, layer: "writer", group: "app",
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

  // Markdown has no underline (D-12): its key says so, once, instead of doing nothing (KEY-03).
  let underlineHinted = false;
  commands.register({
    id: "format.underline", title: "command.format.underline", shortcut: { default: "Mod+U" }, layer: "basic", group: "formatting",
    run: () => {
      if (underlineHinted) return;
      underlineHinted = true;
      toast(catalog.format("toast.noUnderline"));
    },
  });

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
  const openFind = (replace: boolean, inSelection = false) => {
    const f = store.state.ui.find;
    setFind({
      open: true, replaceOpen: replace || (f.open && f.replaceOpen), notice: "",
      ...(replace && f.query ? { focusReplace: f.focusReplace + 1 } : { focusFind: f.focusFind + 1 }),
      // A newly opened bar takes the selection as find in selection's scope; the editor says if there is one.
      ...(f.open ? {} : { inSelection, scoped: false }),
    });
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    // A selection in the note fills the field, as in VS Code and browsers; not when the bar is
    // already open, where the selection is just the current match, nor when opened to find in it.
    if (!f.open) editorAction("find.prefill", inSelection ? { scopeOnly: true } : undefined);
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
    setFind({ open: false, notice: "", inSelection: false, scoped: false });
  });
  // The document minimap's contents card from the keyboard (UI-13, D-185): the editor opens it.
  commands.register({
    id: "outline.show", title: "command.outline.show",
    enabled: (s) => ready(s) && headingCount(s.note.markdown) >= 2, disabledReason: "command.outline.show.reason",
    run: () => editorAction("outline.show"),
  });
  // Pinned open beside the text (D-186): the card stays wherever it fits; kept on this device.
  commands.register({
    id: "outline.togglePin", title: "command.outline.togglePin", icon: "pin", group: "app",
    checked: (s) => s.outlinePinned,
    run: async (_a, ctx) => {
      const on = !ctx.state.outlinePinned;
      ctx.update((s) => ({ ...s, outlinePinned: on }));
      await persistAppState({ outlinePinned: on ? true : undefined });
    },
  });
  // Resized by dragging its edge or with the arrow keys on it (D-187): kept on this device.
  commands.register<{ width: number }>({
    id: "outline.setWidth", title: "outline.resize",
    run: async ({ width }, ctx) => {
      if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return;
      const w = Math.round(width);
      ctx.update((s) => ({ ...s, outlineWidth: w }));
      await persistAppState({ outlineWidth: w });
    },
  });
  // Find in selection (FND-03, D-160): opens the bar scoped to the selection, or toggles the scope.
  commands.register({
    id: "find.toggle.inSelection", title: "command.find.inSelection",
    enabled: (s) => ready(s) && (!s.ui.find.open || s.ui.find.scoped), disabledReason: "find.noScope",
    shortcut: { macos: "Mod+Alt+L", default: "Alt+L" }, layer: "pro", group: "find",
    checked: (s) => s.ui.find.inSelection,
    run: () => {
      const f = store.state.ui.find;
      if (!f.open) return openFind(false, true);
      setFind({ inSelection: !f.inSelection, focusFind: f.focusFind + 1 });
    },
  });
  commands.register<{ scoped: boolean }>({
    id: "find.setScope", title: "command.find.setScope",
    run: ({ scoped }) => setFind({ scoped: Boolean(scoped), ...(scoped ? {} : { inSelection: false }) }),
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
  // A match opened from Find in all notes (FND-04): the find bar opens on the note's matches with
  // that one selected and the find field focused, once the note's editor is ready.
  let pendingJump: { path: string; jump: FindJump } | undefined;
  const showJump = (jump: FindJump) => {
    const f = store.state.ui.find;
    setFind({
      open: true, query: jump.query, caseSensitive: jump.caseSensitive, wholeWord: jump.wholeWord, regex: jump.regex, inSelection: false, scoped: false,
      notice: "", focusFind: f.focusFind + 1,
    });
    remember();
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    editorAction("find.select", { ...jump });
  };
  const openMatch = async (path: string, jump: FindJump) => {
    if (store.state.note.path === path && store.state.note.status === "ready") return showJump(jump);
    pendingJump = { path, jump };
    await load(path);
    // The note couldn't be opened, or another one was asked for meanwhile.
    if (pendingJump?.path === path && store.state.note.path !== path) pendingJump = undefined;
  };
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
      await ctx.run(t.action.command, t.action.args);
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

  for (const p of PLANNED_MENU_COMMANDS) {
    commands.register({
      id: p.id, title: p.title, icon: p.icon, disabledReason: p.disabledReason,
      enabled: () => false,
      run: () => {},
    });
  }

  commands.register({
    id: "app.ready",
    title: "command.app.ready",
    // The editor for the note just loaded is built and focused: once it's painted, the open is done.
    run: () => {
      bridge.markReady?.();
      const start = opening;
      opening = undefined;
      if (start !== undefined) afterPaint(() => timing.measure(OPEN_MEASURE, start));
      // The caret is ready: the warm-up may begin (PRF-10).
      warmUp.start();
      drafts.editorReady();
      const jump = pendingJump;
      if (jump && jump.path === store.state.note.path) {
        pendingJump = undefined;
        // Once the new editor has finished setting up (its caret placed, its listeners on).
        afterPaint(() => showJump(jump.jump));
      }
    },
  });

  // Menu groups only some shells have (the web app's Notes group), placed before Help.
  const extraMenu: { id: string; label: string; items: MenuEntry[] }[] = [];

  // ---- view models ----
  // A command's busy sign and words come from the task tracker (PRF-08), by the one busy policy (D-199).
  const busyOf = (id: string) => busyProps(store.state.tasks, id, (key, args) => catalog.format(key, args));
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
    loaded: (path, md) => workspace.loaded(path, md), sawOnDisk: (path, text) => workspace.sawOnDisk(path, text), holds: (path) => conflicts.holds(path),
    moved: (from, to) => {
      workspace.movedOnDisk(from, to);
      conflicts.moved(from, to);
    },
    notesMoved: (moves) => drafts.moved(moves),
    describeItem, itemSchema: ITEM_SCHEMA, editorAction: (id) => editorAction(id), tracker, htmlToMarkdown: options.htmlToMarkdown,
  });
  const browser = registerBrowserFeatures({
    store, commands, viewModels, catalog, bridge, load, flush, toast, tracker, menu: extraMenu,
    appState: () => appState, persistAppState, itemSchema: ITEM_SCHEMA, describeItem,
  });
  registerImport({ store, commands, viewModels, catalog, bridge, tracker, toast, menu: extraMenu });
  registerPublicLink({ store, commands, catalog, bridge, toast });
  registerPrint({ store, commands, viewModels, catalog, bridge, tracker, toast, handOver: () => editorAction(FLUSH_EDITOR), afterPaint, persistAppState });
  const conflicts = registerConflicts({
    store, commands, viewModels, catalog, bridge, tracker, toast, announce, exclusive, afterWrites, setNote, flush,
    handOver: () => editorAction(FLUSH_EDITOR),
    loaded: (path, md) => workspace.loaded(path, md),
    sawOnDisk: (path, text) => workspace.sawOnDisk(path, text),
    dropped: () => drafts.dropped(),
    ...(options.clock ? { now: options.clock.now } : {}),
  });
  // Crash recovery (QLT-06, D-190): drafts kept by the shell, and what the last session left.
  const drafts = registerDrafts({
    store, commands, catalog, bridge, toast, editorAction, afterPaint, typed, load,
    flush: () => {
      editorAction(FLUSH_EDITOR);
      return flush();
    },
    compare: (path, recovered, disk) => conflicts.recovered(path, recovered, disk),
    comparing: () => store.state.ui.conflict.kind === "recovered" && conflicts.holds(store.state.note.path),
    interval: JOURNAL_INTERVAL_MS,
  });
  // The demo (WP-10.6, D-177): its banner's actions, and what the desktop app would do instead.
  {
    const isDemo = () => Boolean(bridge.demo);
    commands.register({ id: "demo.download", title: "command.demo.download", icon: "download", enabled: isDemo, run: () => bridge.demo?.download() });
    commands.register({
      id: "demo.reset", title: "command.demo.reset", enabled: isDemo,
      run: async () => {
        if (!bridge.demo) return;
        announce(catalog.format("demo.resetting"));
        await bridge.demo.reset();
      },
    });
    commands.register({ id: "demo.about", title: "command.demo.about", enabled: isDemo, run: () => void toast(catalog.format("demo.aboutText"), { action: { command: "demo.download", label: catalog.format("command.demo.download") } }) });
  }
  viewModels.register({
    id: "vm.demo",
    schema: { type: "object", properties: { on: { type: "boolean" } } },
    reads: [],
    select: () => ({ on: Boolean(bridge.demo) }),
  });
  registerNoteHistory({ store, commands, viewModels, catalog, bridge, toast, announce, setNote, flush });
  const heldNotes = registerHeld({ store, commands, viewModels, catalog, bridge, toast, announce });
  void heldNotes.refresh();
  const windowApp = registerWindow({ store, commands, viewModels, catalog, bridge });
  const textMenuApp = registerTextMenu({ store, commands, viewModels, catalog, bridge, announce });
  // The compositing can change while the app runs: the GPU process crashed and came back in software (D-121).
  bridge.compositing?.onChange((c) => {
    if ((c === "gpu" || c === "software") && c !== store.state.compositing) store.update((s) => ({ ...s, compositing: c }));
  });
  const menuBar = registerMenuBar({ store, commands, catalog, platform: bridge.platform, ...(bridge.nativeWindow ? { bridge: bridge.nativeWindow } : {}) });
  // The actions that can be pinned (UI-08, D-170): the six defaults, then ⋯'s own commands.
  const planned = new Set<string>(PLANNED_MENU_COMMANDS.map((c) => c.id));
  const pinnable = () => [...new Set([...DEFAULT_TOOLBAR, ...[...MORE_MENU, ...extraMenu].flatMap((g) => g.items.filter((e): e is string => typeof e === "string"))])].filter((id) => commands.has(id) && !planned.has(id));
  registerToolbarCustomize({ store, commands, viewModels, catalog, persistAppState, announce, pinnable, defaults: DEFAULT_TOOLBAR });
  const keybindings = registerKeybindings({ store, commands, viewModels, catalog, bridge, toast });
  const spotlight = registerSpotlight({ store, commands, viewModels, catalog, bridge, load, toast, editorAction, now: clock.now });
  registerAgents({ store, commands, viewModels, catalog, bridge, toast, announce });
  const deepLinks = registerDeepLinks({ bridge, openAt: (path, at) => spotlight.openAt(path, at), searchNotes: (q) => spotlight.searchNotes(q) });
  const findAll = registerFindAll({ store, commands, viewModels, catalog, bridge, openMatch });
  registerThemeManager({ store, commands, viewModels, catalog, persistAppState, announce, ...(bridge.themes?.save ? { saveTheme: (file: string, text: string) => bridge.themes!.save!(file, text) } : {}), ...(bridge.themes ? { listThemes: () => bridge.themes!.list() } : {}), ...(bridge.themes?.remove ? { removeTheme: (file: string) => bridge.themes!.remove!(file) } : {}), ...(bridge.themes?.reveal ? { revealTheme: (file: string) => bridge.themes!.reveal!(file) } : {}), toast,
    // A workspace (its Private or Public root) holds theme files; a plain folder of notes doesn't (D-173).
    themesAvailable: () => { const roots = store.state.workspace.tree.roots; return !roots.length || roots.some((r) => r.id === "private" || r.id === "public"); } });
  // Sync appearance (PRV-03, THM-05): on writes the synced settings to the private repository; off
  // keeps them on this device as they are now, and deletes the file.
  commands.register({
    id: "settings.sync", title: "command.settings.sync",
    enabled: (s) => s.settingsSync !== "unavailable",
    checked: (s) => s.settingsSync === "on",
    run: async () => {
      if (!bridge.settings || store.state.settingsSync === "unavailable") return;
      const on = store.state.settingsSync === "off";
      const { synced } = splitAppState(appState);
      const before = settingsFile;
      try {
        if (on) {
          settingsFile = settingsFileOf(synced);
          await saveSettings();
        } else {
          settingsFile = undefined;
          await saveDevice(synced);
          await bridge.settings.remove();
        }
        store.update((s) => ({ ...s, settingsSync: on ? "on" : "off" }));
        toast(catalog.format(on ? "toast.settingsSynced" : "toast.settingsLocal"));
      } catch {
        settingsFile = before;
        toast(catalog.format("toast.settingsFailed"), { tone: "error" });
      }
    },
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
      // The six the writer pinned (UI-08, D-170); a pinned action leaves ⋯, and an unpinned default joins it.
      items: s.toolbarPinned.map(describeItem),
      // Sync appearance joins the Theme group where there's a private repository to sync through (PRV-03).
      more: [
        ...(DEFAULT_TOOLBAR.some((d) => !s.toolbarPinned.includes(d)) ? [{ id: "actions", label: "menu.actions", items: DEFAULT_TOOLBAR.filter((d) => !s.toolbarPinned.includes(d)) as MenuEntry[] }] : []),
        ...[...MORE_MENU.slice(0, -1), ...extraMenu, ...MORE_MENU.slice(-1)].map((g) => ({ ...g, items: g.items.filter((e) => typeof e !== "string" || !s.toolbarPinned.includes(e)) })),
      ].filter((g) => g.items.length).map((g) => (g.id === "theme" && s.settingsSync !== "unavailable" ? { ...g, items: [...g.items, "settings.sync"] } : g)).map((g) => ({
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
        inSelection: { type: "boolean" }, scoped: { type: "boolean" },
        status: { type: "string" }, statusTone: { type: "string", enum: ["muted", "danger"] }, notice: { type: "string" },
        focusFind: { type: "number" }, focusReplace: { type: "number" }, canReplace: { type: "boolean" },
        actions: {
          type: "object",
          properties: Object.fromEntries(["prev", "next", "close", "case", "word", "regex", "inSelection", "replaceNext", "replaceAll", "toggleReplace"].map((k) => [k, {
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
          word: action("find.toggle.wholeWord"), regex: action("find.toggle.regex"), inSelection: action("find.toggle.inSelection"), replaceNext: action("find.replaceNext"),
          replaceAll: action("find.replaceAll"), toggleReplace: action("find.toggleReplace"),
        },
      };
    },
  });

  // The editor's keymap comes from the registry, so keys are defined once (KEY-02), with the
  // person's own keys from keybindings.json (D-170): made again when the file changes.
  let keymapMemo: { version: number; keymap: { id: string; chord: string }[] } | undefined;
  const editorKeymapOf = (version: number) => {
    if (keymapMemo?.version !== version) keymapMemo = { version, keymap: commands.bindings().filter((b) => b.handledBy === "editor" || b.handledBy === "table").flatMap((b) => b.chords.map((chord) => ({ id: b.id, chord }))) };
    return keymapMemo.keymap;
  };
  viewModels.register({
    id: "vm.app",
    schema: {
      type: "object",
      properties: {
        scheme: { type: "string", enum: ["light", "dark"] },
        platform: { type: "string", enum: ["macos", "windows", "linux", "web"] },
        fontSize: { type: "number" },
        focusMode: { type: "boolean" },
        /** The document minimap's card docked (D-186, D-187), its width, and Files' docking as the canvas arbitrates it (D-187). */
        outlinePinned: { type: "boolean" },
        outlineWidth: { type: "number" },
        filesDock: { type: "boolean" },
        filesWidth: { type: "number" },
        theme: { type: "string", enum: BUILT_IN_THEMES.map((t) => t.id) },
        contentFont: { type: "string", enum: [...CONTENT_FONTS] },
        // Reading settings (Theme manager → Reading): unset where they're the token's own value.
        lineHeight: { type: "number" },
        measure: { type: "number" },
        paragraphSpacing: { type: "string", enum: [...PARAGRAPH_SPACINGS] },
        focusDim: { type: "number" },
        /** An edited copy of the theme showing (Edit colors): its colors over the theme's tokens. */
        themeColors: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } } } },
        uiScale: { type: "number" },
        /** GPU or software compositing (D-121). */
        compositing: { type: "string", enum: ["gpu", "software"] },
        editorKeymap: { type: "array", items: { type: "object", properties: { id: { type: "string" }, chord: { type: "string" } } } },
      },
    },
    reads: ["appearance", "focusMode", "outlinePinned", "outlineWidth", "ui.files.pinned", "ui.files.width", "compositing", "ui.theme.preview", "ui.theme.draft", "keybindings.version"],
    select: (s) => {
      // The theme manager's keyboard preview shows on the real note (THM-07), and so does an edited copy.
      // A custom theme shows through its base's styles with its own colors over them (D-173).
      const root = rootTheme(s);
      const theme = root.theme;
      const a = s.appearance;
      return {
        scheme: root.scheme ?? themeById(theme)?.kind ?? resolvedScheme(s), theme, platform: bridge.platform, fontSize: a.fontSize, focusMode: s.focusMode, outlinePinned: s.outlinePinned, outlineWidth: s.outlineWidth ?? 0, filesDock: s.ui.files.pinned, filesWidth: s.ui.files.width ?? 0,
        contentFont: a.contentFont, uiScale: a.uiScale, editorKeymap: editorKeymapOf(s.keybindings.version), compositing: s.compositing,
        lineHeight: a.lineHeight === LINE_HEIGHT.default ? undefined : a.lineHeight,
        measure: a.measure === MEASURE.default ? undefined : a.measure,
        paragraphSpacing: a.paragraphSpacing, focusDim: a.focusDim, themeColors: root.colors,
      };
    },
  });

  const allBindings = (platform: Platform): Binding[] => {
    const natives = NATIVE_KEYS.map((k) => ({ id: k.id, title: k.title, layer: k.layer, group: k.group, chords: chordsFor(k.shortcut, platform) }));
    return [...commands.bindings(platform), ...natives].filter((b) => b.chords.length);
  };
  const option = (id: string, label: string) => ({ id, label: catalog.format(label) });
  const CLOSED = { open: false, query: "", layer: "all", platform: "pc", layers: [], platforms: [], groups: [], count: 0, summary: "" };
  let sheetMemo: { key: AppState["ui"]["shortcuts"]; version: number; value: Record<string, unknown> } | undefined;
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
        conflicts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } },
        hasConflicts: { type: "boolean" },
      },
    },
    setters: { query: "shortcuts.setQuery", layer: "shortcuts.setLayer", platform: "shortcuts.setPlatform" },
    reads: ["ui.shortcuts", "keybindings.version"],
    // Re-selected on every keystroke in the note, so it's cheap while closed and memoized while open.
    select: (s) => {
      const sh = s.ui.shortcuts;
      if (!sh.open) return CLOSED;
      if (sheetMemo?.key === sh && sheetMemo.version === s.keybindings.version) return sheetMemo.value;
      const platform = displayPlatform(sh.platform, bridge.platform);
      const groups = cheatSheet(allBindings(platform), catalog, { query: sh.query, layer: sh.layer, platform });
      const count = groups.reduce((n, g) => n + g.rows.length, 0);
      const summary = count ? catalog.format("shortcuts.count", { count }) : catalog.format("shortcuts.empty", { query: sh.query.trim() });
      const layers = ["all", ...KEY_LAYERS].map((l) => option(l, `shortcuts.layer.${l}`));
      const platforms = [option("mac", "shortcuts.platform.mac"), option("pc", "shortcuts.platform.pc")];
      // Keys that run more than one command, from keybindings.json (D-170), at the top.
      const conflicts = keybindings.conflictTexts(s).map((text, i) => ({ id: `c${i}`, text }));
      const value = { ...sh, layers, platforms, groups, count, summary, conflicts, hasConflicts: conflicts.length > 0 };
      sheetMemo = { key: sh, version: s.keybindings.version, value };
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
    reads: ["note.key", "note.initialMarkdown", "note.status", "note.saveState", "note.path", "workspace.access", "workspace.folder", "sync", "ui.conflict.held"],
    shows: (s) => (s.note.path ? [{ kind: "note", path: s.note.path }] : []),
    select: (s) => ({
      noteKey: s.note.key,
      initialMarkdown: s.note.initialMarkdown,
      status: s.note.status,
      saveState: s.note.saveState,
      saveProblem: s.note.saveState === "error",
      readOnly: noteReadOnly(s),
      // The trigger's dot shows a save or sync problem (Feedback → Save and sync status).
      problem: s.note.saveState === "error" || Boolean(s.sync.problem) || Boolean(s.ui.conflict.held),
      problemLabel: s.note.saveState === "error" ? (catalog.has("trigger.saveProblem") ? catalog.format("trigger.saveProblem") : "")
        : s.ui.conflict.held && catalog.has("trigger.conflict") ? catalog.format("trigger.conflict")
          : s.sync.problem && catalog.has("trigger.syncProblem") ? catalog.format("trigger.syncProblem") : "",
    }),
  });

  // ---- the save state: the bottom-left pill's icon (EDT-11, UI-12, D-132) ----
  // The time of day, not "2 min ago": nothing repeats on a timer at rest to keep a relative time true (PRF-04).
  const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const when = (at: number) => timeOfDay.format(at);
  const backupDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  viewModels.register({
    id: "vm.saveState",
    schema: {
      type: "object",
      properties: {
        visible: { type: "boolean" },
        interactive: { type: "boolean" },
        state: { type: "string", enum: ["savedLocal", "pending", "syncing", "synced", "offline", "error"] },
        label: { type: "string" }, text: { type: "string" },
        backingUp: { type: "boolean" }, canBackUp: { type: "boolean" },
        backupTime: { type: "string" }, waitingText: { type: "string" }, backupReason: { type: "string" },
        icon: { type: "string" }, tone: { type: "string", enum: ["neutral", "accent", "danger", "success"] },
      },
    },
    reads: ["sync", "note.saveState", "note.path", "note.status"],
    select: (s) => {
      const state = saveStateOf(s.sync, s.note.saveState === "unsaved" || s.note.saveState === "saving");
      const label = !catalog.has("save.state.savedLocal") ? ""
        : state === "synced" ? (s.sync.backedUpAt !== undefined ? catalog.format("save.state.synced", { time: when(s.sync.backedUpAt) }) : catalog.format("save.state.syncedNow"))
          : catalog.format(`save.state.${state}`);
      const text = !s.sync.asked || !catalog.has("save.label.done") ? "" : catalog.format(s.sync.asked === "done" ? "save.label.done" : "save.label.syncing");
      // The card opens even for local-only notes; its backup action explains when Git is unavailable.
      const backingUp = state === "syncing";
      return {
        visible: Boolean(bridge.sync) && Boolean(s.note.path) && s.note.status === "ready", interactive: Boolean(bridge.sync), state, label, text,
        backingUp, canBackUp: s.sync.git && !backingUp,
        backupTime: s.sync.backedUpAt === undefined ? catalog.format("save.backup.unknown")
          : catalog.format("save.backup.last", { time: backupDate.format(s.sync.backedUpAt) }),
        waitingText: catalog.format(backingUp ? "save.backup.progress" : s.sync.waiting ? "save.backup.waiting" : "save.backup.current", { count: s.sync.waiting ?? 0 }),
        backupReason: catalog.format(backingUp ? "save.backup.progress" : "save.backup.local"),
        icon: state === "error" ? "warning" : state === "offline" ? "cloudOff" : backingUp ? "cloudUp" : state === "synced" ? "cloudCheck" : "cloud",
        tone: state === "error" || state === "offline" ? "danger" : backingUp ? "accent" : state === "synced" ? "success" : "neutral",
      };
    },
  });
  // ---- backup by repository: the icon on each Files section's heading, and its card (FIL-14, D-191) ----
  const REPO_VIEW = {
    type: "object" as const,
    properties: {
      visible: { type: "boolean" as const }, hasRepository: { type: "boolean" as const }, backingUp: { type: "boolean" as const }, canBackUp: { type: "boolean" as const },
      state: { type: "string" as const, enum: ["savedLocal", "pending", "syncing", "synced", "offline", "error"] },
      ...Object.fromEntries(["name", "stateText", "label", "repository", "backupTime", "waitingText", "backupReason"].map((k) => [k, { type: "string" as const }])),
      icon: { type: "string" as const }, tone: { type: "string" as const, enum: ["neutral", "accent", "danger", "success"] },
    },
  };
  viewModels.register({
    id: "vm.repoBackup",
    schema: { type: "object", properties: { private: REPO_VIEW, public: REPO_VIEW } },
    reads: ["sync", "repoBackup"],
    select: (s) => ({
      private: repoBackupView("private", s.repoBackup.private, s.sync, catalog),
      public: repoBackupView("public", s.repoBackup.public, s.sync, catalog),
    }),
  });

  registerRewriteDemo({ store, commands, viewModels, messages: catalog }, editorAction, bridge.rewriteConnection,
    bridge.rewriteAuthority ? {
      prepare: (source, target) => afterWrites(async () => {
        if (!rewriteRevision) throw new Error("rewrite-unavailable");
        return bridge.rewriteAuthority!("prepare", { revision: rewriteRevision, source, target });
      }),
      accept: (token) => bridge.rewriteAuthority!("accept", { token }),
      complete: (token, replacement) => bridge.rewriteAuthority!("complete", { token, replacement }),
      history: (source) => afterWrites(async () => {
        if (!rewriteRevision) throw new Error("rewrite-unavailable");
        return bridge.rewriteAuthority!("history", { revision: rewriteRevision, source });
      }),
      cancel: () => { if (rewriteRevision) void bridge.rewriteAuthority!("cancel", { revision: rewriteRevision }).catch(() => {}); },
    } : undefined);
  return {
    store, commands, viewModels, messages: catalog, bridge, flush,
    idle: () => tracker.idle(),
    keySeen: () => menuBar.keySeen(),
    warmUp,
    useSearch: (service) => {
      spotlight.attach(service);
      findAll.useSearch(service);
    },
    onEditorAction(listener) {
      editorListeners.add(listener);
      return () => editorListeners.delete(listener);
    },
    async start() {
      windowApp.start();
      textMenuApp.start();
      // The workspace format is read alongside the app state, before the first note opens (DST-05).
      const formatRead = workspace.prepare();
      const [loaded, synced] = await Promise.all([
        bridge.loadAppState().catch(() => ({ version: 1 as const })),
        bridge.settings?.load().catch(() => undefined),
      ]);
      deviceState = loaded;
      // Synced settings, when they're on, are read over this device's own (PRV-03).
      settingsFile = synced?.available ? parseSettings(synced.text) : undefined;
      appState = { ...deviceState, ...appStateOfSettings(settingsFile) };
      // Custom themes from the workspace (THM-04, D-173), read at launch only when a slot holds one,
      // to put it back: otherwise nothing about them is read, parsed, or checked at start (PRF-14);
      // the theme manager reads them when it opens.
      const wantsCustom = isCustomId(appState.lightTheme) || isCustomId(appState.darkTheme);
      const customThemes = wantsCustom ? customThemesOf((await bridge.themes?.list().catch(() => [])) ?? []) : [];
      if (customThemes.length) store.update((s) => ({ ...s, appearance: { ...s.appearance, customThemes } }));
      store.update((s) => ({ ...s, settingsSync: !synced?.available ? "unavailable" : settingsFile ? "on" : "off" }));
      store.update((s) => ({
        ...s,
        appearance: {
          ...s.appearance,
          ...(appState.appearance ? { mode: appState.appearance } : {}),
          ...(appState.fontSize ? { fontSize: appState.fontSize } : {}),
          // Unknown or removed themes fall back to the defaults rather than failing.
          ...(kindOf({ customThemes }, appState.lightTheme) === "light" ? { lightTheme: appState.lightTheme! } : {}),
          ...(kindOf({ customThemes }, appState.darkTheme) === "dark" ? { darkTheme: appState.darkTheme! } : {}),
          ...((CONTENT_FONTS as readonly string[]).includes(appState.contentFont ?? "") ? { contentFont: appState.contentFont as ContentFont } : {}),
          ...((UI_SCALES as readonly number[]).includes(appState.uiScale ?? 0) ? { uiScale: appState.uiScale! } : {}),
          ...(onSteps(appState.lineHeight, LINE_HEIGHT) !== undefined ? { lineHeight: onSteps(appState.lineHeight, LINE_HEIGHT)! } : {}),
          ...(onSteps(appState.measure, MEASURE) !== undefined ? { measure: onSteps(appState.measure, MEASURE)! } : {}),
          ...((PARAGRAPH_SPACINGS as readonly string[]).includes(appState.paragraphSpacing ?? "") ? { paragraphSpacing: appState.paragraphSpacing as ParagraphSpacing } : {}),
          ...(onSteps(appState.focusDim, FOCUS_DIM) !== undefined ? { focusDim: onSteps(appState.focusDim, FOCUS_DIM)! } : {}),
        },
        // Focus mode is on for new installs: it's a signature feature (D-04).
        focusMode: appState.focusMode ?? true,
        outlinePinned: appState.outlinePinned === true,
        printPageNumbers: appState.printPageNumbers === true,
        ...(typeof appState.outlineWidth === "number" && appState.outlineWidth > 0 ? { outlineWidth: Math.round(appState.outlineWidth) } : {}),
        // The toolbar's six, as pinned on this device (UI-08, D-170).
        toolbarPinned: validPinned(appState.toolbarPinned, pinnable(), DEFAULT_TOOLBAR),
      }));
      bridge.onSystemSchemeChange((system) => store.update((s) => ({ ...s, appearance: { ...s.appearance, system } })));
      await formatRead;
      // The person's own keys, before the first key can be pressed (KEY-07, D-170).
      await keybindings.load();
      // The notes folder is missing (FRE-11, D-212): the recovery view, and nothing that reads or
      // writes the folder (no note, Files, backup or setup) until the shell has one again and starts
      // the app over. The first run's steps are still there, for Sign in again and Choose your notes.
      const missing = await recover.begin();
      // What the last session left is asked for now, and never delays the first note (PRF-02).
      // Files → Recovered shows once the launch has sorted what the last session left (D-221).
      const recovering = missing ? undefined : drafts.start().catch(() => {}).then(() => files.listRecovered());
      if (missing) await firstRun.begin({ ...appState, firstRun: "done" });
      // The desktop's first run shows over the blank canvas; the first note opens when it's done (FRE-01).
      else if (!(await firstRun.begin(appState))) {
        // A panel pinned on this device is there from the first frame, so the text never jumps aside (D-161).
        files.restoreSort(appState.filesSort);
        files.restorePinned(appState.filesPinned, appState.filesWidth);
        // Only the note the person last opened, and never an empty public file;
        // else the app's own note, in the Private root (D-171, SHR-01).
        const folder = store.state.workspace.folder;
        // A window opened for a note opens that note (DSK-06, D-179); the first window, the last one.
        const last = bridge.windows?.initialNote ?? appState.lastNotePath;
        const reopened = last !== undefined && (await openNote(last, { accept: (md) => !(folder && publicInWorkspace(last, folder) && !md.trim()) }));
        if (!reopened) await load(await bridge.defaultNotePath());
        // A link the app was opened with goes on from the note it opened (D-165).
        void deepLinks.take();
      }
      if (!missing) {
        // What a crash left is back in its notes, or waits for a choice; one toast says so, calmly.
        await recovering;
        workspace.start();
        sync.start();
        repoBackup.start();
        setup.start();
      }
      await browser.start();
      // Once every command is registered and the first note is open: the menu bar never delays the caret (PRF-02).
      menuBar.start();
    },
  };
}
