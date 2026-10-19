/**
 * Spotlight in the app (IA-VIEW-SPOTLIGHT; SPT-01 to SPT-05, FIL-04, KEY-01): its state, its commands
 * and keys, the view model the panel shows, and what each result and quick action does. It asks the
 * search index (D-107) once the shell has started it, and keeps frecency in memory (D-109).
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import { formatChord, type CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import { innerPath, isReadOnlyPath, sourceOf, titleOfPath } from "./notes.ts";
import type { Store } from "./store.ts";
import { BUILT_IN_THEMES, CONTENT_FONTS, DEFAULT_THEMES, UI_SCALES } from "./themes.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { dirOf, findNode, rootOf, titleOfMarkdown, visibilityOf, walk } from "./workspace.ts";
import { copyPublicLink, publicLinkReason } from "./public-link-app.ts";
import { extractNote } from "./search/extract.ts";
import type { IndexStatus, SearchHit, SearchItem, SearchKind, SearchQuery, SearchResults } from "./search/types.ts";
import {
  actionsFor, Frecency, HELP_ENTRIES, isInternalCommand, itemKey, mergeResults, parseFilters, prefixMode, rankLocal, rowId,
  type ActionContext, type ActionId, type GroupId, type QuickAction, type SpotlightMode, type SpotlightRow,
} from "./spotlight.ts";

export interface SpotlightState {
  open: boolean;
  mode: SpotlightMode;
  /** Headings in every note (`##`) rather than this one. */
  everywhere: boolean;
  query: string;
  rows: SpotlightRow[];
  activeId: string;
  /** The quick actions panel: the result it's for, and its selected action. */
  actions?: { row: string; activeId: string };
  /** Bumped to move focus into the field. */
  focus: number;
  /** Results that are still coming (full text after titles). */
  busy: boolean;
  /** How far the index has got, while it's still reading notes. */
  indexing?: { indexed: number; notes: number };
  /** The mode and query the rows answer (`answerKey`), so a caller can tell the answer is in. */
  answered: string;
  /**
   * The query came from a search link (D-165): results only, with no Create note or Find rows and
   * no quick actions, so a link is never one Enter from a write. Typing makes it the person's own.
   */
  fromLink?: boolean;
}
export const SPOTLIGHT_CLOSED: SpotlightState = { open: false, mode: "all", everywhere: false, query: "", rows: [], activeId: "", focus: 0, busy: false, answered: "" };
/** What a set of rows answers: the mode, `##` or not, and the query. */
export const answerKey = (s: Pick<SpotlightState, "mode" | "everywhere" | "query">) => `${s.mode}${s.everywhere ? "+" : ""}:${s.query}`;

/** The search service as Spotlight uses it (`startSearch`'s `SearchService`). */
export interface SpotlightSearch {
  query(query: SearchQuery): Promise<SearchResults>;
  status(): IndexStatus;
  onStatus(listener: (status: IndexStatus) => void): () => void;
  setItems(kind: "command" | "setting", items: readonly SearchItem[]): void;
}

/** Spotlight's keypress-to-visible measure on the User Timing timeline (SPT-07). */
export const SPOTLIGHT_MEASURE = "fn:spotlight.open";
/** No match offers Find in all notes (WP-4.3), which opens on the query; disabled only while that command is. */
export const FIND_ALL_NOTES = "find.allNotes";
/** A group's header item in the list: its ID is this and the group's (row IDs are `group:key`). */
export const GROUP_HEADER = "group/";
/** The empty field's suggestions (Spotlight → Empty and no-result states). */
export const SUGGESTIONS = ["note.new", "focus.toggle", "appearance.toggle"] as const;
/** While the index reads, an open Spotlight with a query asks again at most this often. */
const REFRESH_MS = 250;

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  load(path: string): Promise<void>;
  toast(message: string, opts?: { tone?: "info" | "error" }): number;
  editorAction(id: string, args?: Record<string, unknown>): void;
  now(): number;
}

/** A setting as Spotlight lists it: its current value, a step, and its default (Spotlight → What it searches). */
interface SettingDef {
  id: string;
  title: string;
  available?(s: AppState): boolean;
  value(s: AppState): string;
  step(): Promise<void>;
  atDefault(s: AppState): boolean;
  reset(): Promise<void>;
}

const next = <T,>(list: readonly T[], at: T) => list[(list.indexOf(at) + 1) % list.length]!;
const ICON_OF_GROUP: Partial<Record<GroupId, string>> = { recent: "history", help: "info" };

export function registerSpotlight(ctx: Ctx): { attach(search: SpotlightSearch): void; openAt(path: string, at: { heading?: { index: number; text: string } }): Promise<void>; searchNotes(query: string): void } {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const sp = () => store.state.ui.spotlight;
  const set = (patch: Partial<SpotlightState>) => store.update((s) => ({ ...s, ui: { ...s.ui, spotlight: { ...s.ui.spotlight, ...patch } } }));
  const msg = (key: string, args?: Record<string, unknown>) => (catalog.has(key) ? catalog.format(key, args) : key);
  let search: SpotlightSearch | undefined;
  const frecency = new Frecency();
  let seq = 0;
  let opening: number | undefined;

  // ---- what it lists: commands (KEY-01) and settings ----
  const run = (id: string, args?: Record<string, unknown>) => commands.run(id, args);
  const appearanceModes = ["system", "light", "dark"] as const;
  const lightThemes = BUILT_IN_THEMES.filter((t) => t.kind === "light").map((t) => t.id);
  const darkThemes = BUILT_IN_THEMES.filter((t) => t.kind === "dark").map((t) => t.id);
  const onOff = (on: boolean) => msg(on ? "spotlight.on" : "spotlight.off");
  const themeTitle = (id: string) => msg(BUILT_IN_THEMES.find((t) => t.id === id)?.title ?? id);
  const SETTINGS: SettingDef[] = [
    {
      id: "setting.appearance", title: "spotlight.setting.appearance",
      value: (s) => msg(`command.appearance.${s.appearance.mode}`),
      step: () => run(`appearance.${next(appearanceModes, store.state.appearance.mode)}`),
      atDefault: (s) => s.appearance.mode === "system", reset: () => run("appearance.system"),
    },
    {
      id: "setting.lightTheme", title: "spotlight.setting.lightTheme",
      value: (s) => themeTitle(s.appearance.lightTheme),
      step: () => run(`theme.light.${next(lightThemes, store.state.appearance.lightTheme)}`),
      atDefault: (s) => s.appearance.lightTheme === DEFAULT_THEMES.light, reset: () => run(`theme.light.${DEFAULT_THEMES.light}`),
    },
    {
      id: "setting.darkTheme", title: "spotlight.setting.darkTheme",
      value: (s) => themeTitle(s.appearance.darkTheme),
      step: () => run(`theme.dark.${next(darkThemes, store.state.appearance.darkTheme)}`),
      atDefault: (s) => s.appearance.darkTheme === DEFAULT_THEMES.dark, reset: () => run(`theme.dark.${DEFAULT_THEMES.dark}`),
    },
    {
      id: "setting.contentFont", title: "spotlight.setting.contentFont",
      value: (s) => msg(`font.${s.appearance.contentFont}`),
      step: () => run(`font.content.${next(CONTENT_FONTS, store.state.appearance.contentFont)}`),
      atDefault: (s) => s.appearance.contentFont === CONTENT_FONTS[0], reset: () => run(`font.content.${CONTENT_FONTS[0]}`),
    },
    {
      id: "setting.fontSize", title: "spotlight.setting.fontSize",
      value: (s) => msg("spotlight.value.px", { size: s.appearance.fontSize }),
      step: () => run(commands.describe("font.larger").enabled ? "font.larger" : "font.reset"),
      atDefault: (s) => s.appearance.fontSize === 16, reset: () => run("font.reset"),
    },
    {
      id: "setting.uiScale", title: "spotlight.setting.uiScale",
      value: (s) => msg("spotlight.value.percent", { value: Math.round(s.appearance.uiScale * 100) }),
      step: () => run(store.state.appearance.uiScale < UI_SCALES[UI_SCALES.length - 1]! ? "ui.scaleUp" : "ui.scaleReset"),
      atDefault: (s) => s.appearance.uiScale === 1, reset: () => run("ui.scaleReset"),
    },
    {
      id: "setting.focusMode", title: "spotlight.setting.focusMode",
      value: (s) => onOff(s.focusMode),
      step: () => run("focus.toggle"),
      // Focus mode is on for new installs (D-04).
      atDefault: (s) => s.focusMode, reset: async () => { if (!store.state.focusMode) await run("focus.toggle"); },
    },
    {
      id: "setting.syncAppearance", title: "spotlight.setting.syncAppearance",
      available: (s) => s.settingsSync !== "unavailable",
      value: (s) => onOff(s.settingsSync === "on"),
      step: () => run("settings.sync"),
      atDefault: (s) => s.settingsSync !== "on", reset: async () => { if (store.state.settingsSync === "on") await run("settings.sync"); },
    },
  ];
  const settingById = (id: string) => SETTINGS.find((x) => x.id === id && (x.available?.(store.state) ?? true));

  /** A command's name in Spotlight: theme and font choices say what they choose ("Dark theme: Dusk"). */
  const commandLabel = (id: string) => {
    const title = msg(commands.describe(id).title);
    const m = /^(theme\.light|theme\.dark|font\.content|appearance)\.(\w[\w-]*)$/.exec(id);
    if (m && m[2] !== "toggle") return msg(`spotlight.command.${m[1]!.replace(".", "-")}`, { name: title });
    return title;
  };
  let listed: string[] | undefined;
  /** Every command Spotlight can run: all but setters, components' events, and keys of a field (KEY-01). */
  const listedCommands = () => (listed ??= commands.ids().filter((id) => !isInternalCommand(id, commands.describe(id).handledBy)));
  const keywords = (key: string) => (catalog.has(key) ? catalog.format(key).split(/\s+/).filter(Boolean) : []);
  const commandItems = (): SearchItem[] => listedCommands().map((id) => {
    const k = keywords(`${commands.describe(id).title}.keywords`);
    return { id, title: commandLabel(id), ...(k.length ? { keywords: k } : {}) };
  });
  const settingItems = (): SearchItem[] => SETTINGS.map((x) => {
    const k = keywords(`${x.title}.keywords`);
    return { id: x.id, title: msg(x.title), ...(k.length ? { keywords: k } : {}) };
  });

  // ---- results ----
  const tree = () => store.state.workspace.tree;
  const noteRow = (path: string, group: GroupId): SpotlightRow | undefined => {
    const found = findNode(tree(), path);
    if (!found || found.node.kind !== "note") return undefined;
    const rel = path.slice(found.root.path.length).replace(/\\/g, "/").replace(/^\/+/, "");
    const label = found.node.title ?? found.node.name.replace(/\.(md|markdown)$/i, "");
    return { id: rowId(group, path), group, kind: "note", key: path, label, highlights: [], path, rel, root: found.root.id };
  };
  const commandRow = (id: string, group: GroupId, highlights: SpotlightRow["highlights"] = []): SpotlightRow =>
    ({ id: rowId(group, id), group, kind: id.startsWith("setting.") ? "setting" : "command", key: id, label: id.startsWith("setting.") ? msg(settingById(id)?.title ?? id) : commandLabel(id), highlights });
  const recentNotes = () => frecency.recent((k) => k !== store.state.note.path && findNode(tree(), k)?.node.kind === "note");

  /** The current note's headings, from its text as it is now (`#`). */
  const localHeadings = (query: string): SpotlightRow[] => {
    const path = store.state.note.path;
    if (!path) return [];
    const heads = extractNote(store.state.note.markdown).headings.map((h, index) => ({ ...h, index, label: h.text }));
    const title = titleOfMarkdown(store.state.note.markdown) ?? "";
    return rankLocal(heads, query).map((h) => ({
      id: rowId("headings", `${path}#${h.index}`), group: "headings", kind: "heading", key: `${path}#${h.index}`, label: h.text,
      highlights: h.highlights, path, heading: { level: h.level, index: h.index, note: title },
    }));
  };
  const helpRows = (query: string): SpotlightRow[] =>
    rankLocal(HELP_ENTRIES.map((h) => ({ ...h, label: `${h.key} ${msg(h.title)}` })), query)
      .map((h) => ({ id: rowId("help", h.key), group: "help", kind: "help", key: h.insert, label: h.label, highlights: h.highlights }));

  /** Every command and setting Spotlight can run, each by name: the commands list, and the action center (D-111). */
  const everyAction = (): SpotlightRow[] => {
    const byLabel = (a: SpotlightRow, b: SpotlightRow) => a.label.localeCompare(b.label);
    return [
      ...listedCommands().map((id) => commandRow(id, "commands")).sort(byLabel),
      ...SETTINGS.filter((x) => x.available?.(store.state) ?? true).map((x) => commandRow(x.id, "settings")).sort(byLabel),
    ];
  };

  /** What the field shows before anything is typed. */
  const emptyRows = (mode: SpotlightMode): SpotlightRow[] => {
    if (mode === "all") {
      // After recent notes and suggestions, every action the app has (SPT-04, D-111): Spotlight is the
      // action center, where the arrow keys reach any action and Enter runs it.
      return [
        ...recentNotes().slice(0, 5).map((p) => noteRow(p, "recent")!),
        ...SUGGESTIONS.filter((id) => commands.has(id)).map((id) => commandRow(id, "suggestions")),
        ...everyAction(),
      ];
    }
    if (mode === "notes") {
      const recent = recentNotes().slice(0, 10);
      const rest: SpotlightRow[] = [];
      for (const { node, path } of walk(tree())) {
        if (rest.length >= 50) break;
        if (node.kind === "note" && !recent.includes(path)) rest.push(noteRow(path, "notes")!);
      }
      return [...recent.map((p) => noteRow(p, "recent")!), ...rest];
    }
    if (mode === "commands") return everyAction();
    return [];
  };

  /**
   * Quick open's empty list in a shell that keeps notes itself (the browser): every note it has,
   * newest first, the instance's private ones while unlocked (D-90), as the old Open a note list did.
   */
  const shellNotes = async (): Promise<SpotlightRow[]> => {
    const notes = ((await bridge.listNotes?.().catch(() => [])) ?? []).sort((a, b) => b.updated - a.updated);
    const recent = recentNotes().filter((p) => notes.some((n) => n.path === p)).slice(0, 10);
    const row = (path: string, title: string, group: GroupId): SpotlightRow => {
      const source = sourceOf(path);
      return { id: rowId(group, path), group, kind: "note", key: path, label: title || titleOfPath(path), highlights: [], path, rel: innerPath(path), root: source };
    };
    const byPath = new Map(notes.map((n) => [n.path, n.title]));
    return [...recent.map((p) => row(p, byPath.get(p) ?? "", "recent")), ...notes.filter((n) => !recent.includes(n.path)).slice(0, 200).map((n) => row(n.path, n.title ?? "", "notes"))];
  };

  /** Before the index has started (or where there's none): commands and settings matched here. */
  const localCommandHits = (text: string, kinds?: readonly string[]): SearchHit[] => {
    const items = [
      ...(!kinds || kinds.includes("command") ? listedCommands().map((id) => ({ id, label: commandLabel(id), kind: "command" as const })) : []),
      ...(!kinds || kinds.includes("setting") ? SETTINGS.map((x) => ({ id: x.id, label: msg(x.title), kind: "setting" as const })) : []),
    ];
    return rankLocal(items, text).slice(0, 40).map((h) => ({ kind: h.kind, key: h.id, label: h.label, highlights: h.highlights, tier: h.tier, score: h.score }));
  };

  const firstActive = (rows: readonly SpotlightRow[]) => rows.find((r) => rowEnabled(r))?.id ?? "";
  const setRows = (rows: SpotlightRow[], busy: boolean, keep: boolean) => {
    const active = keep && rows.some((r) => r.id === sp().activeId) ? sp().activeId : firstActive(rows);
    set({ rows, busy, activeId: active, answered: answerKey(sp()) });
  };
  const currentFolder = () => {
    const path = store.state.note.path;
    const root = path ? rootOf(tree(), path) : undefined;
    return path && root ? dirOf(path).slice(root.path.length).replace(/\\/g, "/").replace(/^\/+/, "") : undefined;
  };

  /**
   * Asks again for what the field shows. `follow`: the index has read more since; a row the person
   * moved to stays active while it's still listed, otherwise the best row is.
   */
  async function refresh(follow = false): Promise<void> {
    const s = sp();
    const keep = follow && s.activeId !== firstActive(s.rows);
    if (!s.open) return;
    const my = ++seq;
    if (s.mode === "help") return setRows(helpRows(s.query), false, false);
    if (s.mode === "headings" && !s.everywhere) return setRows(localHeadings(s.query), false, false);
    const { text, filters } = parseFilters(s.query);
    if (!text.trim()) {
      if (s.mode === "notes" && bridge.listNotes) {
        const listed = await shellNotes();
        if (my === seq) setRows(listed, false, false);
        return;
      }
      return setRows(s.mode === "headings" ? [] : emptyRows(s.mode), false, false);
    }
    const kinds: readonly SearchKind[] | undefined = s.mode === "notes" ? ["note"] : s.mode === "commands" ? ["command", "setting"] : s.mode === "headings" ? ["heading"] : filters.kinds;
    const top = s.mode === "all";
    const actions = (s.mode === "all" || s.mode === "notes") && !s.fromLink;
    if (!search) {
      const titles = s.mode === "notes" || s.mode === "headings" ? [] : localCommandHits(text, kinds);
      return setRows(mergeResults(titles, [], { query: text, top, actions }), false, false);
    }
    const folder = currentFolder();
    const base = {
      text, limit: 60,
      ...(kinds ? { kinds } : {}), ...(filters.roots ? { roots: filters.roots } : {}), ...(filters.within ? { within: filters.within } : {}),
      boost: { frecency: frecency.scores(ctx.now()), ...(folder !== undefined ? { folder } : {}) },
    };
    const wantsText = s.mode === "all" && (!kinds || kinds.includes("note")) && (Boolean(filters.phrase) || text.trim().length >= 2);
    let titles: SearchHit[] = [];
    try {
      if (!filters.phrase) titles = (await search.query({ ...base, scope: "titles" })).hits;
      if (my !== seq) return;
      setRows(mergeResults(titles, [], { query: text, top, actions }), wantsText, keep);
      if (!wantsText) return;
      const found = (await search.query({ ...base, scope: "text", limit: 10, ...(filters.phrase ? { phrase: true } : {}) })).hits;
      if (my !== seq) return;
      setRows(mergeResults(titles, found, { query: text, top, actions }), false, true);
    } catch {
      if (my === seq) set({ busy: false });
    }
  }

  // ---- opening (SPT-01, SPT-05) ----
  const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
  const openIn = (mode: SpotlightMode) => {
    const s = sp();
    // Pressing a mode's key again switches mode and keeps the query; the same mode's key closes it.
    if (s.open && s.mode === mode && !s.everywhere) return close();
    if (!s.open) {
      opening = now();
      dismissDialogs();
    }
    store.update((st) => ({ ...st, ui: { ...st.ui, toolbarOpen: false } }));
    // A link's query stays the link's through a change of mode, until the person types (D-165 (8e)).
    set({ open: true, mode, everywhere: false, query: s.open ? s.query : "", actions: undefined, fromLink: s.open ? Boolean(s.fromLink) : false, focus: s.focus + 1, indexing: indexingOf() });
    void refresh().then(() => measureOpen());
  };
  /**
   * Spotlight opens from anywhere, Settings and the cheat sheet included: a dialog that's open and
   * safe to dismiss closes first (as Esc would), so Spotlight is the one modal and owns focus (D-109).
   */
  const dismissDialogs = () => {
    const ui = store.state.ui;
    const open: [boolean, string][] = [
      [ui.settings.open, "settings.setOpen"], [ui.shortcuts.open, "shortcuts.setOpen"], [ui.picker.open, "picker.setOpen"],
      [ui.aboutOpen, "about.setOpen"], [ui.unlock.open && !ui.unlock.busy, "unlock.setOpen"],
      [ui.files.move.open, "move.setOpen"], [Boolean(ui.files.confirm), "files.setConfirmOpen"], [ui.feedback.open, "feedback.close"],
    ];
    for (const [shown, id] of open) if (shown && commands.has(id)) void run(id, { open: false });
  };
  const close = () => {
    seq++;
    opening = undefined;
    set({ open: false, actions: undefined, busy: false, fromLink: false });
  };
  /** Keypress to a visible panel with its results (SPT-07): from the command to the frame that shows them. */
  const measureOpen = () => {
    const start = opening;
    opening = undefined;
    if (start === undefined) return;
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
    const done = () => {
      try {
        performance.measure(SPOTLIGHT_MEASURE, { start, end: performance.now() });
      } catch {
        // Not every host has the User Timing API.
      }
    };
    if (raf) raf(() => raf(done));
    else done();
  };
  const indexingOf = () => {
    const st = search?.status();
    return st && st.indexed < st.notes ? { indexed: st.indexed, notes: st.notes } : undefined;
  };
  const MODE_KEYS = { all: "Mod+/", notes: "Mod+P", commands: "Mod+Shift+P", headings: "Mod+Shift+O" } as const;
  const modeCommand = (id: string, mode: keyof typeof MODE_KEYS, title: string, extra: Record<string, unknown> = {}) => commands.register({
    id, title, icon: "search", shortcut: { default: MODE_KEYS[mode], ...extra }, layer: "power", group: "spotlight",
    run: () => openIn(mode),
  });
  modeCommand("spotlight.open", "all", "command.spotlight.open");
  modeCommand("spotlight.quickOpen", "notes", "command.spotlight.quickOpen");
  modeCommand("spotlight.commands", "commands", "command.spotlight.commands");
  modeCommand("spotlight.headings", "headings", "command.spotlight.headings");
  commands.register<{ open: boolean }>({
    id: "spotlight.setOpen", title: "command.spotlight.open",
    run: ({ open }) => {
      if (open) return;
      close();
      // Closed without acting: focus goes back where it was, and the Files panel keeps its own (D-94).
      if (store.state.ui.files.open) store.update((st) => ({ ...st, ui: { ...st.ui, files: { ...st.ui.files, focusRequest: st.ui.files.focusRequest + 1 } } }));
    },
  });
  commands.register<{ value: string }>({
    id: "spotlight.setQuery", title: "command.spotlight.setQuery",
    run: ({ value }) => {
      const s = sp();
      const query = typeof value === "string" ? value : "";
      const switched = prefixMode(s.mode, s.everywhere, query);
      set({ ...(switched ?? { query }), actions: undefined, fromLink: false });
      void refresh();
    },
  });

  // ---- moving and acting (Keyboard shortcuts → Spotlight) ----
  const rowById = (id: string) => sp().rows.find((r) => r.id === id);
  const activeRow = () => rowById(sp().activeId);
  const actionList = (row: SpotlightRow): QuickAction[] => actionsFor(row, actionContext(row));
  const step = (dir: 1 | -1) => () => {
    const s = sp();
    if (s.actions) {
      const row = rowById(s.actions.row);
      const list = row ? actionList(row).filter((a) => a.available) : [];
      const i = list.findIndex((a) => a.id === s.actions!.activeId);
      if (list.length) set({ actions: { ...s.actions, activeId: list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]!.id } });
      return;
    }
    const list = s.rows.filter(rowEnabled);
    if (!list.length) return;
    const i = list.findIndex((r) => r.id === s.activeId);
    set({ activeId: list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]!.id });
  };
  const scope = "spotlightField";
  const isOpen = (s: AppState) => s.ui.spotlight.open;
  commands.register({ id: "spotlight.next", title: "command.spotlight.next", shortcut: { default: "Down", handledBy: scope }, layer: "basic", group: "spotlight", run: step(1) });
  commands.register({ id: "spotlight.prev", title: "command.spotlight.prev", shortcut: { default: "Up", handledBy: scope }, layer: "basic", group: "spotlight", run: step(-1) });
  commands.register({ id: "spotlight.run", title: "command.spotlight.run", shortcut: { default: "Enter", handledBy: scope }, layer: "basic", group: "spotlight", run: () => runActive(false) });
  commands.register({ id: "spotlight.runAlt", title: "command.spotlight.runAlt", shortcut: { default: "Mod+Enter", handledBy: scope }, layer: "power", group: "spotlight", run: () => runActive(true) });
  const canShowActions = (s: AppState) => isOpen(s) && !s.ui.spotlight.actions && !s.ui.spotlight.fromLink && Boolean(s.ui.spotlight.rows.find((r) => r.id === s.ui.spotlight.activeId && actionsOf(r.kind)));
  const showActions = () => {
    const row = activeRow();
    if (!row || !actionsOf(row.kind) || sp().fromLink) return;
    set({ actions: { row: row.id, activeId: actionList(row).find((a) => a.available)?.id ?? "" } });
  };
  commands.register({ id: "spotlight.actions", title: "command.spotlight.actions", shortcut: { default: "Mod+K", handledBy: scope, whenEnabled: true }, layer: "power", group: "spotlight", enabled: canShowActions, run: showActions });
  // → does the same at the end of the field's text; elsewhere it still moves the caret (D-109).
  commands.register({ id: "spotlight.actionsRight", title: "command.spotlight.actionsRight", shortcut: { default: "Right", handledBy: scope, whenEnabled: true, atFieldEnd: true }, layer: "power", group: "spotlight", enabled: canShowActions, run: showActions });
  commands.register({
    id: "spotlight.back", title: "command.spotlight.back", shortcut: { default: "Left", alternates: { default: ["Escape"] }, handledBy: scope, whenEnabled: true }, layer: "power", group: "spotlight",
    enabled: (s) => Boolean(s.ui.spotlight.actions), run: () => set({ actions: undefined }),
  });
  commands.register({
    id: "spotlight.all", title: "command.spotlight.all", shortcut: { default: "Backspace", handledBy: scope, whenEnabled: true }, layer: "power", group: "spotlight",
    enabled: (s) => isOpen(s) && s.ui.spotlight.query === "" && s.ui.spotlight.mode !== "all",
    run: () => { set({ mode: "all", everywhere: false, actions: undefined }); void refresh(); },
  });
  // ---- the Pro keys (KEY-04, D-160): the nth result, a note's link, and the next or previous group ----
  const shown = () => sp().rows.filter(rowEnabled);
  for (let n = 1; n <= 9; n++) {
    commands.register({
      id: `spotlight.run${n}`, title: `command.spotlight.run${n}`,
      shortcut: { default: `Mod+${n}`, handledBy: scope, whenEnabled: true }, layer: "pro", group: "spotlight",
      enabled: (s) => isOpen(s) && !s.ui.spotlight.actions && s.ui.spotlight.rows.filter(rowEnabled).length >= n,
      run: () => {
        const row = shown()[n - 1];
        if (!row) return;
        set({ activeId: row.id });
        return runActive(false);
      },
    });
  }
  const linkable = (s: AppState) => {
    const row = s.ui.spotlight.rows.find((r) => r.id === s.ui.spotlight.activeId);
    return Boolean(isOpen(s) && !s.ui.spotlight.actions && row && actionsOf(row.kind) && actionList(row).some((a) => a.id === "copyLink" && a.available));
  };
  commands.register({
    id: "spotlight.copyLink", title: "command.spotlight.copyLink",
    shortcut: { default: "Mod+Shift+C", handledBy: scope, whenEnabled: true }, layer: "pro", group: "spotlight",
    enabled: linkable,
    run: () => { const row = activeRow(); return row ? perform(row, "copyLink") : undefined; },
  });
  const jumpGroup = (dir: 1 | -1) => () => {
    const list = shown();
    const i = list.findIndex((r) => r.id === sp().activeId);
    const group = list[i]?.group;
    // The first row of the next group down, or of the group above (the current group's first row first).
    if (dir > 0) {
      const next = list.slice(i + 1).find((r) => r.group !== group);
      if (next) set({ activeId: next.id });
      return;
    }
    const start = list.findIndex((r) => r.group === group);
    if (i > start) return void set({ activeId: list[start]!.id });
    const prev = list.slice(0, Math.max(0, start)).at(-1);
    if (prev) set({ activeId: list.find((r) => r.group === prev.group)!.id });
  };
  const hasRows = (s: AppState) => isOpen(s) && !s.ui.spotlight.actions && s.ui.spotlight.rows.length > 0;
  commands.register({ id: "spotlight.nextGroup", title: "command.spotlight.nextGroup", shortcut: { default: "Alt+Down", handledBy: scope, whenEnabled: true }, layer: "pro", group: "spotlight", enabled: hasRows, run: jumpGroup(1) });
  commands.register({ id: "spotlight.prevGroup", title: "command.spotlight.prevGroup", shortcut: { default: "Alt+Up", handledBy: scope, whenEnabled: true }, layer: "pro", group: "spotlight", enabled: hasRows, run: jumpGroup(-1) });
  commands.register<{ id: string }>({
    id: "spotlight.setActive", title: "command.spotlight.next",
    run: ({ id }) => {
      if (typeof id !== "string") return;
      const s = sp();
      if (s.actions) set({ actions: { ...s.actions, activeId: id } });
      else set({ activeId: id });
    },
  });
  commands.register<{ id: string }>({
    id: "spotlight.choose", title: "command.spotlight.run",
    run: ({ id }) => {
      if (typeof id !== "string") return;
      const s = sp();
      if (s.actions) set({ actions: { ...s.actions, activeId: id } });
      else set({ activeId: id });
      return runActive(false);
    },
  });

  // ---- what results do ----
  const actionsOf = (kind: SpotlightRow["kind"]) => kind !== "create" && kind !== "find" && kind !== "help";
  /** Why Find in all notes can't run now: its own reason, as a command's row shows it. */
  function findAllReason(): string {
    const reason = commands.has(FIND_ALL_NOTES) ? commands.describe(FIND_ALL_NOTES).disabledReason : undefined;
    return reason ? msg(reason) : msg("spotlight.unavailable");
  }
  function rowEnabled(r: SpotlightRow): boolean {
    if (r.kind === "find") return commands.has(FIND_ALL_NOTES) && commands.describe(FIND_ALL_NOTES).enabled;
    if (r.kind === "create") return commands.describe("note.new").enabled;
    return true;
  }
  function actionContext(row: SpotlightRow): ActionContext {
    const s = store.state;
    const t = tree();
    const path = row.path;
    const root = path ? rootOf(t, path) : undefined;
    const visibility = path && (row.kind === "note" || row.kind === "text") ? visibilityOf(t, path) : undefined;
    const other = visibility === "public" ? "private" : "public";
    const current = s.note.path;
    // A public note never links to a private one (Files and sharing).
    const linkRefused = !current ? "spotlight.reason.noNote" : rootOf(t, current)?.id === "public" && root?.id === "private" ? "spotlight.reason.privateLink" : undefined;
    const setting = row.kind === "setting" ? settingById(row.key) : undefined;
    // A public note's page address needs the site's (SHR-03, D-139).
    const publicLink = visibility === "public" ? publicLinkReason(s, path) : undefined;
    return {
      newWindow: Boolean(bridge.windows),
      writable: Boolean(root && !root.readOnly) && s.workspace.access === "write",
      ...(visibility ? { visibility } : {}),
      otherRoot: t.roots.some((r) => r.id === other && !r.readOnly),
      files: Boolean(bridge.workspace),
      clipboard: Boolean(bridge.copyText),
      copyToLocal: Boolean(path) && isReadOnlyPath(path) && commands.has("note.copyToLocal"),
      ...(linkRefused ? { linkRefused } : {}),
      ...(publicLink ? { publicLink } : {}),
      resettable: setting ? !setting.atDefault(s) : false,
    };
  }

  /** The editor work waiting for the note being opened: a heading to go to, or a match to find. */
  let pending: { path: string; heading?: { index: number; text: string }; find?: string } | undefined;
  const settle = async () => {
    const p = pending;
    if (!p || store.state.note.path !== p.path || store.state.note.status !== "ready") return;
    pending = undefined;
    if (p.heading) ctx.editorAction("editor.goToHeading", p.heading);
    if (p.find) {
      await run("find.open");
      await run("find.setQuery", { value: p.find });
      await run("find.next");
    }
  };
  // The editor of a note just loaded reports it's ready; then the heading or match can be shown.
  commands.onRun((id) => { if (id === "app.ready") void settle(); });
  const openAt = async (path: string, at: Omit<NonNullable<typeof pending>, "path">) => {
    pending = { path, ...at };
    if (store.state.note.path === path && store.state.note.status === "ready") return settle();
    await ctx.load(path);
  };
  const reveal = (path: string) => run("files.reveal", { path });
  const linkTo = (row: SpotlightRow): string => {
    const from = store.state.note.path ?? "";
    const strip = (p: string) => p.replace(/^(public|private):/, "").split(/[\\/]/);
    const a = strip(dirOf(from)).filter(Boolean);
    const b = strip(row.path ?? "").filter(Boolean);
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    const rel = [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
    const href = encodeURI(rel);
    if (row.kind !== "heading") return `[${row.label}](${href})`;
    const slug = row.label.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
    return `[${row.label}](${href}#${slug})`;
  };
  const copy = async (text: string, done: string) => {
    try {
      await bridge.copyText!(text);
      ctx.toast(done);
    } catch {
      ctx.toast(msg("spotlight.copyFailed"), { tone: "error" });
    }
  };

  async function perform(row: SpotlightRow, id: ActionId): Promise<void> {
    const path = row.path ?? "";
    // Commands that toggle and settings stay open, so Spotlight works as a quick settings panel.
    if (id === "run" && (row.kind === "setting" || (row.kind === "command" && commands.describe(row.key).checked !== undefined))) {
      frecency.record(itemKey(row.kind, row.key), ctx.now());
      if (row.kind === "setting") await settingById(row.key)?.step();
      else await run(row.key);
      return;
    }
    if (id === "reset") return settingById(row.key)?.reset();
    close();
    if (id === "copyId") return copy(row.key, msg("spotlight.copiedId", { id: row.key }));
    if (id === "copyLink") return copy(linkTo(row), msg("spotlight.copiedLink", { name: row.label }));
    if (id === "copyPublicLink") return void (await copyPublicLink(ctx, path));
    switch (id) {
      case "open":
        return row.kind === "text" ? openAt(path, { find: parseFilters(sp().query).text }) : openAt(path, {});
      case "goTo":
        return openAt(path, { heading: { index: row.heading?.index ?? 0, text: row.label } });
      case "openWindow":
        // In a window of its own (DSK-06, D-179); this window keeps its note.
        close();
        frecency.record(path, ctx.now());
        return void (await bridge.windows?.open(path));
      case "run":
        frecency.record(itemKey("command", row.key), ctx.now());
        return run(row.key);
      case "copyToLocal":
        await ctx.load(path);
        return run("note.copyToLocal");
      case "showInFiles":
        return reveal(path);
      case "newNoteHere":
        await reveal(path);
        return run("files.newNote");
      case "rename":
      case "moveTo":
      case "delete":
      case "makePublic":
      case "makePrivate":
        // Files acts on what it has selected: the result, revealed there (D-94, D-99).
        await reveal(path);
        return run(`files.${id}`);
      default:
        return undefined;
    }
  }
  async function runActive(alternative: boolean): Promise<void> {
    const s = sp();
    if (s.actions) {
      const row = rowById(s.actions.row);
      const a = row ? actionList(row).find((x) => x.id === s.actions!.activeId) : undefined;
      if (row && a?.available) await perform(row, a.id);
      return;
    }
    const row = activeRow();
    if (!row || !rowEnabled(row)) return;
    if (alternative) {
      // Notes, headings, and matches open in a new window (DSK-06, D-179); folders get a new note; commands show their keys.
      if ((row.kind === "note" || row.kind === "text" || row.kind === "heading") && row.path && bridge.windows) return perform(row, "openWindow");
      if (row.kind === "folder") return perform(row, "newNoteHere");
      if (row.kind === "command") {
        close();
        return run("shortcuts.open").then(() => run("shortcuts.setQuery", { value: row.label }));
      }
      if (row.kind === "setting") return perform(row, "reset");
      return;
    }
    switch (row.kind) {
      case "note": return perform(row, "open");
      case "text": return perform(row, "open");
      case "heading": return perform(row, "goTo");
      case "folder": return perform(row, "showInFiles");
      case "command":
      case "setting": return perform(row, "run");
      case "create": {
        const title = parseFilters(s.query).text;
        close();
        return run("note.new", { title });
      }
      case "find": {
        const query = parseFilters(s.query).text;
        close();
        return run(FIND_ALL_NOTES, { query });
      }
      case "help": {
        const switched = prefixMode("all", false, row.key);
        set({ mode: switched?.mode ?? "all", everywhere: switched?.everywhere ?? false, query: switched ? "" : row.key, focus: s.focus + 1 });
        return refresh();
      }
    }
  }

  // Frecency: every note opened, however it was opened (Spotlight → Ranking).
  let lastPath: string | undefined;
  store.subscribe(() => {
    const n = store.state.note;
    if (n.status === "ready" && n.path && n.path !== lastPath) {
      lastPath = n.path;
      frecency.record(n.path, ctx.now());
    }
  });

  // ---- the view model ----
  const describeRow = (r: SpotlightRow, s: AppState) => {
    const base = { id: r.id, label: r.label, highlights: r.highlights.map((x) => [x[0], x[1]]) };
    switch (r.kind) {
      case "note":
      case "text": {
        const vis = (r.path ? visibilityOf(s.workspace.tree, r.path) : undefined) ?? (r.root === "public" || r.root === "private" ? r.root : undefined);
        const where = [r.rel, vis ? msg(`spotlight.visibility.${vis}`) : ""].filter(Boolean).join(" · ");
        if (r.kind === "text" && r.snippet) {
          return { ...base, icon: "text", description: r.snippet.text, descriptionHighlights: r.snippet.highlights.map((x) => [x[0], x[1]]), state: where };
        }
        return { ...base, icon: vis === "private" || vis === "shared" ? "lock" : "document", ...(where ? { description: where } : {}) };
      }
      case "heading":
        return { ...base, icon: `heading${Math.min(3, Math.max(1, r.heading?.level ?? 1))}`, description: [r.heading?.note, r.rel].filter(Boolean).join(" · ") };
      case "folder":
        return { ...base, icon: "folder", ...(r.rel ? { description: r.rel } : {}) };
      case "command": {
        const d = commands.describe(r.key);
        return {
          ...base, icon: d.icon ?? "chevronRight",
          ...(d.shortcut ? { shortcut: formatChord(d.shortcut, bridge.platform) } : {}),
          ...(d.checked !== undefined ? { state: onOff(d.checked) } : {}),
          ...(!d.enabled ? { disabled: true, description: d.disabledReason ? msg(d.disabledReason) : msg("spotlight.unavailable") } : {}),
        };
      }
      case "setting": {
        const x = settingById(r.key);
        return { ...base, icon: "settings", ...(x ? { state: x.value(s) } : {}) };
      }
      case "create":
        return { ...base, label: msg("spotlight.create", { query: r.label }), highlights: [], icon: "add", shortcut: formatChord("Mod+N", bridge.platform), ...(!rowEnabled(r) ? { disabled: true, description: msg("command.note.new.readOnly") } : {}) };
      case "find":
        return { ...base, label: msg("spotlight.find", { query: r.label }), highlights: [], icon: "search", ...(!rowEnabled(r) ? { disabled: true, description: findAllReason() } : {}) };
      default:
        return { ...base, icon: ICON_OF_GROUP[r.group] ?? "info" };
    }
  };
  const ACTION_ICONS: Record<ActionId, string> = {
    open: "open", openWindow: "fullScreen", copyLink: "link", copyPublicLink: "link", copyToLocal: "copy", rename: "rename", moveTo: "folder",
    makePublic: "share", makePrivate: "lock", showInFiles: "folder", delete: "delete", goTo: "open", newNoteHere: "newNote", run: "chevronRight", copyId: "copy", reset: "undo",
  };
  const MODE_LABELS: Record<SpotlightMode, string> = { all: "spotlight.mode.all", notes: "spotlight.mode.notes", commands: "spotlight.mode.commands", headings: "spotlight.mode.headings", help: "spotlight.mode.help" };
  const CLOSED_VM = { open: false, mode: "", query: "", placeholder: "", fieldLabel: "", activeId: "", focus: 0, items: [], summary: "", status: "", hints: "", actionsTitle: "", listLabel: "" };
  const ITEM = {
    type: "object" as const,
    properties: {
      id: { type: "string" as const }, label: { type: "string" as const }, description: { type: "string" as const }, icon: { type: "string" as const },
      shortcut: { type: "string" as const }, state: { type: "string" as const }, disabled: { type: "boolean" as const }, header: { type: "boolean" as const },
      highlights: { type: "array" as const, items: { type: "array" as const, items: { type: "number" as const } } },
      descriptionHighlights: { type: "array" as const, items: { type: "array" as const, items: { type: "number" as const } } },
    },
  };
  viewModels.register({
    id: "vm.spotlight",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, mode: { type: "string" }, query: { type: "string" }, placeholder: { type: "string" }, fieldLabel: { type: "string" },
        activeId: { type: "string" }, focus: { type: "number" }, items: { type: "array", items: ITEM },
        summary: { type: "string" }, status: { type: "string" }, hints: { type: "string" }, actionsTitle: { type: "string" }, listLabel: { type: "string" },
      },
    },
    setters: { query: "spotlight.setQuery" },
    // Rows show live states (a toggle's value), which can depend on anything; closed, it's a constant.
    reads: "*",
    select: (s) => {
      const p = s.ui.spotlight;
      if (!p.open) return { ...CLOSED_VM, focus: p.focus };
      const key = (c: string) => formatChord(c, bridge.platform);
      const mode = p.mode === "headings" && p.everywhere ? msg("spotlight.mode.allHeadings") : msg(MODE_LABELS[p.mode]);
      const status = p.indexing ? msg("spotlight.indexing", { indexed: p.indexing.indexed, notes: p.indexing.notes }) : p.query ? "" : msg("spotlight.helpHint");
      if (p.actions) {
        const row = p.rows.find((r) => r.id === p.actions!.row);
        const list = row ? actionList(row) : [];
        return {
          open: true, mode, query: p.query, placeholder: msg(`spotlight.placeholder.${p.mode}`), fieldLabel: msg(`spotlight.placeholder.${p.mode}`),
          activeId: p.actions.activeId, focus: p.focus, status,
          items: list.map((a) => ({
            id: a.id, label: msg(a.title), icon: ACTION_ICONS[a.id], highlights: [],
            ...(a.shortcut ? { shortcut: key(a.shortcut) } : {}),
            ...(!a.available ? { disabled: true, ...(a.reason ? { description: msg(a.reason) } : {}) } : {}),
          })),
          summary: msg("spotlight.actionsCount", { count: list.filter((a) => a.available).length }),
          hints: msg("spotlight.hints.actions", { run: key("Enter"), back: key("Left"), close: key("Escape") }),
          actionsTitle: msg("spotlight.actionsFor", { name: row?.label ?? "" }),
          listLabel: msg("spotlight.actionsList"),
        };
      }
      // Each group is headed by its label (ResultList's header items): Top hit, Notes, Commands…
      const items = p.rows.flatMap((r, i) => [
        ...(r.group !== p.rows[i - 1]?.group ? [{ id: `${GROUP_HEADER}${r.group}`, label: msg(`spotlight.group.${r.group}`), header: true }] : []),
        describeRow(r, s),
      ]);
      const count = p.rows.filter((r) => r.kind !== "create" && r.kind !== "find").length;
      const summary = p.busy ? "" : count ? msg("spotlight.count", { count }) : p.query ? msg("spotlight.none", { query: p.query }) : "";
      return {
        open: true, mode, query: p.query, placeholder: msg(`spotlight.placeholder.${p.mode}`), fieldLabel: msg(`spotlight.placeholder.${p.mode}`),
        activeId: p.activeId, focus: p.focus, items, summary, status,
        hints: msg("spotlight.hints", { open: key("Enter"), alt: key("Mod+Enter"), actions: key("Mod+K"), close: key("Escape") }),
        actionsTitle: "", listLabel: msg("spotlight.list"),
      };
    },
  });

  return {
    /** Opens a note and then goes to a heading in it, once the editor is ready (deep links, D-165). */
    openAt,
    /**
     * Spotlight searching notes for a query that came from outside (a search link, D-165): in notes
     * mode, with the query set as it is. Never read for prefixes (`>` commands, `#` headings, `?`
     * help), so a link can't put a command one Enter away.
     */
    searchNotes(query: string): void {
      if (!sp().open) {
        opening = now();
        dismissDialogs();
      }
      store.update((st) => ({ ...st, ui: { ...st.ui, toolbarOpen: false } }));
      set({ open: true, mode: "notes", everywhere: false, query, actions: undefined, fromLink: true, focus: sp().focus + 1, indexing: indexingOf() });
      void refresh().then(() => measureOpen());
    },
    attach(s: SpotlightSearch): void {
      search = s;
      s.setItems("command", commandItems());
      s.setItems("setting", settingItems());
      // "Indexing 1,240 / 5,000" while it reads, in the footer of an open Spotlight. What it shows
      // follows the index too: a note listed or read since the query was answered appears, without
      // moving the active row while it's still there.
      let seen = { notes: s.status().notes, indexed: s.status().indexed };
      let again: ReturnType<typeof setTimeout> | undefined;
      s.onStatus((st) => {
        if (!sp().open) return;
        const indexing = st.indexed < st.notes ? { indexed: st.indexed, notes: st.notes } : undefined;
        if (indexing?.indexed !== sp().indexing?.indexed || indexing?.notes !== sp().indexing?.notes) set({ indexing });
        const changed = st.notes !== seen.notes || st.indexed !== seen.indexed;
        seen = { notes: st.notes, indexed: st.indexed };
        if (!changed || !sp().query.trim() || again) return;
        again = setTimeout(() => {
          again = undefined;
          if (sp().open) void refresh(true);
        }, REFRESH_MS);
      });
      if (sp().open) void refresh();
    },
  };
}
