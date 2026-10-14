/**
 * Find in all notes (FND-04, Find and replace → Find in all notes): Mod+Shift+F opens a side sheet
 * that searches every note's visible text through the search index, matched exactly as the find bar
 * matches one note. Results are grouped by note, with its path, whether it's public or private, and
 * its count; each line shows the match marked. Enter on a line opens the note at that match with
 * the find bar open on it, so Enter then steps through the note's other matches; F4 and Shift+F4
 * open the next and previous result without the sheet. On the web it searches this browser's notes,
 * the instance's public notes, and its private notes only while they're unlocked (the index's rule).
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import { formatChord, type CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { RootId } from "./workspace.ts";
import type { FindMatch, FindNote, FindResults, SearchService } from "./search/index.ts";

export interface FindAllState {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Bumped to move focus into the field and select its text. */
  focus: number;
  /** The latest answer: for the query as it was then. */
  results?: FindResults;
  /** A search is on its way (or waiting for the index to start). */
  searching: boolean;
  activeId: string;
}
export const FIND_ALL_CLOSED: FindAllState = { open: false, query: "", caseSensitive: false, wholeWord: false, regex: false, focus: 0, searching: false, activeId: "" };

/** What opening a match asks of the find bar and the editor (the editor's `find.select`). */
export interface FindJump {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  index: number;
  lineKey: number;
  lineNth: number;
  occurrence: number;
}

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  /** Opens the note (if it isn't open) and selects the match, with the find bar open on it. */
  openMatch(path: string, jump: FindJump): Promise<void>;
}

/** Waits this long after typing before asking the index, and after the index changes before asking again. */
export const FIND_ALL_DEBOUNCE_MS = 120;
const RESEARCH_MS = 300;

/** The query's filters (`is:public`, `is:private`, `in:folder/`) and the text left to search for. */
export function parseFindQuery(query: string): { text: string; roots?: RootId[]; within?: string } {
  const roots: RootId[] = [];
  let within: string | undefined;
  const text = query.replace(/(^|\s)(is:(public|private)|in:(\S+))(?=\s|$)/g, (_m, lead: string, _f, root?: string, folder?: string) => {
    if (root) roots.push(root as RootId);
    if (folder) within = folder.replace(/^\/+|\/+$/g, "");
    return lead;
  }).trim();
  return { text, ...(roots.length ? { roots } : {}), ...(within !== undefined ? { within } : {}) };
}

/** A note's rows and its matches' rows have IDs from their places in the answer. */
const noteId = (n: number) => `n${n}`;
const matchId = (n: number, m: number) => `n${n}.${m}`;
function rowsOf(r: FindResults | undefined): { id: string; note: FindNote; match: FindMatch }[] {
  return (r?.notes ?? []).flatMap((note, n) => note.matches.map((match, m) => ({ id: matchId(n, m), note, match })));
}

export function registerFindAll(ctx: Ctx): { useSearch(service: SearchService): void } {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const state = () => store.state.ui.findAll;
  const set = (patch: Partial<FindAllState>) => store.update((s) => ({ ...s, ui: { ...s.ui, findAll: { ...s.ui.findAll, ...patch } } }));
  let service: SearchService | undefined;
  let asked = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The result opened last, so F4 opens the active one first, then moves on. */
  let opened = "";

  const search = async () => {
    timer = undefined;
    const f = state();
    const { text, roots, within } = parseFindQuery(f.query);
    const mine = ++asked;
    if (!text) return set({ results: undefined, searching: false, activeId: "" });
    // Before the index has started (just after launch), the answer comes once it has.
    if (!service) return set({ searching: true });
    set({ searching: true });
    try {
      const results = await service.find({ text, caseSensitive: f.caseSensitive, wholeWord: f.wholeWord, regex: f.regex, ...(roots ? { roots } : {}), ...(within !== undefined ? { within } : {}) });
      if (mine !== asked) return;
      const rows = rowsOf(results);
      // Asked again as the index grows, the active line stays where it was if it's still there.
      const keep = rows.some((r) => r.id === state().activeId) && state().results?.query.text === results.query.text;
      set({ results, searching: false, activeId: keep ? state().activeId : rows[0]?.id ?? "" });
    } catch {
      if (mine === asked) set({ searching: false });
    }
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(), ms);
  };

  const open = (query?: string) => {
    const f = state();
    set({ open: true, focus: f.focus + 1, ...(query !== undefined ? { query } : {}) });
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    // Asked again on opening: notes may have changed while it was closed.
    if (parseFindQuery(query ?? f.query).text) schedule(0);
  };
  const close = () => set({ open: false });

  const chosen = async (id: string) => {
    const row = rowsOf(state().results).find((r) => r.id === id);
    if (!row) return;
    const q = state().results!.query;
    opened = id;
    set({ activeId: id });
    close();
    await ctx.openMatch(row.note.path, {
      query: q.text, caseSensitive: Boolean(q.caseSensitive), wholeWord: Boolean(q.wholeWord), regex: Boolean(q.regex),
      index: row.match.index, lineKey: row.match.lineKey, lineNth: row.match.lineNth, occurrence: row.match.occurrence,
    });
  };
  const move = (dir: 1 | -1, wrap = false) => {
    const rows = rowsOf(state().results);
    if (!rows.length) return undefined;
    const at = rows.findIndex((r) => r.id === state().activeId);
    const next = at < 0 ? (dir > 0 ? 0 : rows.length - 1) : wrap ? (at + dir + rows.length) % rows.length : Math.max(0, Math.min(rows.length - 1, at + dir));
    set({ activeId: rows[next]!.id });
    return rows[next]!.id;
  };

  // Locking the vault (the browser, D-90) takes its notes out of the results at once, before the
  // index is asked again: nothing private stays on screen, or in F4's reach.
  let vault = store.state.instance.vault;
  store.subscribe(() => {
    const was = vault;
    vault = store.state.instance.vault;
    if (was !== "unlocked" || vault === "unlocked") return;
    asked++;
    set({ results: undefined, activeId: "", searching: false });
    opened = "";
    if (state().open && parseFindQuery(state().query).text) schedule(0);
  });

  commands.register<{ query: string }>({
    id: "find.allNotes", title: "command.find.allNotes", icon: "search",
    shortcut: { default: "Mod+Shift+F" }, layer: "power", group: "find",
    // Spotlight's "Find … in all notes" passes its query.
    run: ({ query }) => open(typeof query === "string" ? query : undefined),
  });
  commands.register({ id: "findAll.close", title: "command.findAll.close", run: close });
  commands.register<{ value: string }>({
    id: "findAll.setQuery", title: "command.findAll.setQuery",
    run: ({ value }) => {
      set({ query: typeof value === "string" ? value : "" });
      schedule(parseFindQuery(state().query).text ? FIND_ALL_DEBOUNCE_MS : 0);
    },
  });
  for (const [opt, key, title] of [["caseSensitive", "C", "command.find.matchCase"], ["wholeWord", "W", "command.find.wholeWord"], ["regex", "R", "command.find.regex"]] as const) {
    commands.register({
      id: `findAll.toggle.${opt}`, title,
      shortcut: { macos: `Mod+Alt+${key}`, default: `Alt+${key}`, handledBy: "findAll" }, layer: "pro", group: "find",
      checked: (s) => s.ui.findAll[opt],
      run: () => {
        set({ [opt]: !state()[opt] });
        schedule(0);
      },
    });
  }
  commands.register({ id: "findAll.next", title: "command.findAll.next", shortcut: { default: "Down", handledBy: "findAllField" }, layer: "basic", group: "find", run: () => void move(1) });
  commands.register({ id: "findAll.prev", title: "command.findAll.prev", shortcut: { default: "Up", handledBy: "findAllField" }, layer: "basic", group: "find", run: () => void move(-1) });
  commands.register({ id: "findAll.openActive", title: "command.findAll.open", shortcut: { default: "Enter", handledBy: "findAllField" }, layer: "basic", group: "find", run: () => chosen(state().activeId) });
  commands.register<{ id: string }>({ id: "findAll.choose", title: "command.findAll.open", run: ({ id }) => chosen(String(id)) });
  commands.register<{ id: string }>({ id: "findAll.setActive", title: "command.findAll.next", run: ({ id }) => { if (typeof id === "string") set({ activeId: id }); } });
  // The next and previous result across notes, without the sheet (VS Code's F4).
  const step = (dir: 1 | -1) => async () => {
    if (!rowsOf(state().results).length) return open();
    const id = opened === state().activeId ? move(dir, true) : state().activeId;
    if (id) await chosen(id);
  };
  commands.register({ id: "find.nextResult", title: "command.find.nextResult", shortcut: { default: "F4" }, layer: "pro", group: "find", run: step(1) });
  commands.register({ id: "find.prevResult", title: "command.find.prevResult", shortcut: { default: "Shift+F4" }, layer: "pro", group: "find", run: step(-1) });

  const where = (note: FindNote) => {
    const root = note.root === "local" ? "" : catalog.format(`files.root.${note.root}`);
    return [note.rel, root, catalog.format("findAll.matches", { count: note.count })].filter(Boolean).join(" · ");
  };
  const action = (id: string) => {
    const d = commands.describe(id);
    return { label: catalog.format(d.title), shortcut: d.shortcut ? formatChord(d.shortcut, bridge.platform) : "" };
  };
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, description: { type: "string" as const }, header: { type: "boolean" as const }, highlights: { type: "array" as const, items: { type: "array" as const, items: { type: "number" as const } } } } };
  const ACTION = { type: "object" as const, properties: { label: { type: "string" as const }, shortcut: { type: "string" as const } } };
  const CLOSED = { open: false, query: "", focus: 0, caseSensitive: false, wholeWord: false, regex: false, invalid: false, items: [], activeId: "", summary: "", summaryTone: "muted", empty: true, actions: {} };
  viewModels.register({
    id: "vm.findAll",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, query: { type: "string" }, focus: { type: "number" },
        caseSensitive: { type: "boolean" }, wholeWord: { type: "boolean" }, regex: { type: "boolean" }, invalid: { type: "boolean" },
        items: { type: "array", items: ITEM }, activeId: { type: "string" }, empty: { type: "boolean" },
        summary: { type: "string" }, summaryTone: { type: "string", enum: ["muted", "danger"] },
        actions: { type: "object", properties: { case: ACTION, word: ACTION, regex: ACTION, close: ACTION } },
      },
    },
    setters: { query: "findAll.setQuery" },
    reads: ["ui.findAll"],
    select: (s) => {
      const f = s.ui.findAll;
      if (!f.open) return CLOSED;
      const r = f.results;
      const text = parseFindQuery(f.query).text;
      const items = (text ? r?.notes ?? [] : []).flatMap((note, n) => [
        { id: noteId(n), label: note.title, description: where(note), header: true },
        ...note.matches.map((m, i) => ({ id: matchId(n, i), label: m.snippet.text, highlights: m.snippet.highlights.map(([a, b]) => [a, b]) })),
      ]);
      const invalid = Boolean(text && r?.invalid);
      const summary = !text ? catalog.format("findAll.hint")
        : invalid ? catalog.format("find.invalid")
          : !r ? catalog.format("findAll.searching")
            : [
              r.total ? catalog.format("findAll.count", { count: r.total, notes: r.notes.length }) : catalog.format("findAll.none"),
              ...(r.truncated ? [catalog.format("findAll.truncated", { shown: rowsOf(r).length })] : []),
              ...(r.unread ? [catalog.format("findAll.unread", { count: r.unread })] : []),
            ].join(" · ");
      return {
        open: true, query: f.query, focus: f.focus, caseSensitive: f.caseSensitive, wholeWord: f.wholeWord, regex: f.regex, invalid,
        items, activeId: f.activeId, empty: !items.length, summary, summaryTone: text && (invalid || r?.total === 0) ? "danger" : "muted",
        actions: { case: action("findAll.toggle.caseSensitive"), word: action("findAll.toggle.wholeWord"), regex: action("findAll.toggle.regex"), close: action("findAll.close") },
      };
    },
  });

  return {
    useSearch(s) {
      service = s;
      // As notes are read and changed, an open search is asked again, so its answer stays complete.
      s.onStatus(() => {
        if (state().open && parseFindQuery(state().query).text && !timer) schedule(RESEARCH_MS);
      });
      if (state().open) schedule(0);
    },
  };
}
