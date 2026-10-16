/**
 * Note history (FIL-13, IA-VIEW-HISTORY, D-175): the open note's versions from Git in a side sheet,
 * newest first and grouped by day, each with its time and author (an agent's labeled). Choosing one
 * shows it block by block, with the blocks that differ from the note now marked, and Restore this
 * version puts that text back as a new save: the newer versions stay in history (DD-HIST-01), and
 * the toast's Undo puts back the text it replaced.
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { compareVersions, versionsByDay, type NoteVersion } from "./history.ts";
import { isReadOnlyPath } from "./notes.ts";

export interface HistoryState {
  open: boolean;
  loading: boolean;
  /** The note whose history shows: the open note when the sheet opened. */
  path?: string;
  versions: NoteVersion[];
  /** The row the arrow keys are on. */
  active?: string;
  /** The version showing below the list, and its text. */
  chosen?: string;
  text?: string;
  /** The versions couldn't be read. */
  failed: boolean;
}
export const HISTORY_CLOSED: HistoryState = { open: false, loading: false, versions: [], failed: false };

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }) => number;
  announce: (text: string) => void;
  setNote: (patch: Partial<AppState["note"]>) => void;
  /** Writes the open note's unsaved text now. */
  flush: () => Promise<boolean>;
}

const DAY = "day:";

export function registerNoteHistory(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge, toast, announce, setNote, flush } = ctx;
  const history = () => store.state.ui.history;
  const set = (patch: Partial<HistoryState>) => store.update((s) => ({ ...s, ui: { ...s.ui, history: { ...s.ui.history, ...patch } } }));
  const available = () => Boolean(bridge.workspace?.versions && bridge.workspace.version) && store.state.sync.git;
  /** The text a restore replaced, so its Undo can put it back. */
  let replaced: { path: string; text: string } | undefined;

  async function choose(commit: string): Promise<void> {
    const h = history();
    if (!h.path || !h.versions.some((v) => v.commit === commit)) return;
    set({ active: commit });
    const text = await bridge.workspace?.version?.(h.path, commit).catch(() => undefined);
    if (history().path !== h.path || !history().open) return;
    set(text === undefined ? { chosen: undefined, text: undefined, failed: true } : { chosen: commit, text, failed: false });
  }

  commands.register({
    id: "history.open", title: "command.history.open", icon: "history", layer: "power", group: "app",
    enabled: () => available() && Boolean(store.state.note.path), disabledReason: "command.history.open.none",
    run: async () => {
      const path = store.state.note.path;
      if (!path || !bridge.workspace?.versions) return;
      set({ ...HISTORY_CLOSED, open: true, loading: true, path });
      const versions = await bridge.workspace.versions(path).catch(() => undefined);
      if (history().path !== path || !history().open) return;
      set({ loading: false, versions: versions ?? [], failed: !versions, ...(versions?.[0] ? { active: versions[0].commit } : {}) });
    },
  });
  commands.register({ id: "history.close", title: "command.history.close", run: () => set(HISTORY_CLOSED) });
  commands.register<{ id: string }>({ id: "history.setActive", title: "command.history.open", run: ({ id }) => { if (!id.startsWith(DAY)) set({ active: id }); } });
  commands.register<{ id: string }>({ id: "history.choose", title: "command.history.choose", run: ({ id }) => choose(id) });
  commands.register({ id: "history.back", title: "command.history.back", run: () => set({ chosen: undefined, text: undefined }) });
  commands.register({
    id: "history.restore", title: "command.history.restore",
    enabled: () => history().text !== undefined && history().path === store.state.note.path && !isReadOnlyPath(store.state.note.path),
    run: async () => {
      const h = history();
      const v = h.versions.find((x) => x.commit === h.chosen);
      if (!v || h.text === undefined || !h.path || h.path !== store.state.note.path) return;
      replaced = { path: h.path, text: store.state.note.markdown };
      setNote({ key: `${h.path}#history-${v.commit}-${Date.now()}`, initialMarkdown: h.text, markdown: h.text, saveState: "unsaved" });
      set(HISTORY_CLOSED);
      await flush();
      const done = catalog.format("history.restored", { at: v.at });
      announce(done);
      toast(done, { action: { command: "history.undoRestore", label: catalog.format("files.undo") } });
    },
  });
  commands.register({
    id: "history.undoRestore", title: "command.history.undoRestore",
    enabled: () => replaced !== undefined && replaced.path === store.state.note.path,
    run: async () => {
      const r = replaced;
      if (!r || r.path !== store.state.note.path) return;
      replaced = undefined;
      setNote({ key: `${r.path}#history-undo-${Date.now()}`, initialMarkdown: r.text, markdown: r.text, saveState: "unsaved" });
      await flush();
      announce(catalog.format("history.restoreUndone"));
    },
  });

  const BLOCK = { type: "object" as const, properties: { id: { type: "string" as const }, text: { type: "string" as const }, changed: { type: "boolean" as const } } };
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, description: { type: "string" as const }, state: { type: "string" as const }, header: { type: "boolean" as const } } };
  const dayLabel = (at: number, today: Date) => {
    const d = new Date(at);
    const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
    return days === 0 ? catalog.format("deleted.today") : days === 1 ? catalog.format("deleted.yesterday") : catalog.format("deleted.day", { at });
  };
  // Rows and blocks are rebuilt only when the history or the version shown changes: never per keystroke.
  let memo: { h?: HistoryState; md?: string; vm?: unknown } = {};
  viewModels.register({
    id: "vm.history",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, status: { type: "string" }, items: { type: "array", items: ITEM }, activeId: { type: "string" },
        showing: { type: "boolean" }, versionLabel: { type: "string" }, blocks: { type: "array", items: BLOCK }, emptyText: { type: "string" },
        canRestore: { type: "boolean" },
      },
    },
    reads: ["ui.history", "note.path"],
    select: (s) => {
      const h = s.ui.history;
      // The current text is read only while a version shows, and then only to compare it once.
      const md = h.text !== undefined ? s.note.markdown : undefined;
      if (memo.h === h && memo.md === md && memo.vm) return memo.vm as never;
      const now = new Date();
      const items = versionsByDay(h.versions).flatMap((g) => [
        { id: `${DAY}${g.day}`, label: dayLabel(g.at, now), header: true },
        ...g.versions.map((v) => ({
          id: v.commit, label: catalog.format("history.time", { at: v.at }),
          description: v.agent ?? v.author,
          ...(v.agent ? { state: catalog.format("history.agent") } : {}),
        })),
      ]);
      const v = h.versions.find((x) => x.commit === h.chosen);
      const status = !h.open ? "" : h.loading ? catalog.format("history.loading") : h.failed && !h.versions.length ? catalog.format("history.failed")
        : !h.versions.length ? catalog.format("history.none") : h.failed ? catalog.format("history.versionFailed") : catalog.format("history.count", { count: h.versions.length });
      const vm = {
        open: h.open, status, items, activeId: h.active ?? "",
        showing: Boolean(v && h.text !== undefined),
        versionLabel: v ? catalog.format("history.viewing", { at: v.at }) : "",
        blocks: v && h.text !== undefined ? compareVersions(h.text, md ?? "").mine : [],
        emptyText: catalog.format("conflict.emptyNote"),
        canRestore: Boolean(v && h.text !== undefined && h.path === s.note.path && !isReadOnlyPath(s.note.path)),
      };
      memo = { h, md, vm };
      return vm;
    },
  });
}
