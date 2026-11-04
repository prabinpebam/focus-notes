/**
 * Note history (FIL-13, IA-VIEW-HISTORY, D-175): the open note's versions from Git in a side sheet,
 * newest first and grouped by day, each with its time and author (an agent's labeled). Choosing one
 * shows it block by block, with the blocks that differ from the note now marked, and Restore this
 * version puts that text back as a new save: the newer versions stay in history (DD-HIST-01), and
 * the toast's Undo puts back the text it replaced.
 */
import type { AppState } from "./app.ts";
import { opErrorCode, type PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { compareVersions, NOTE_HISTORY_PAGE, versionsByDay, type NoteVersion } from "./history.ts";
import { isReadOnlyPath } from "./notes.ts";
import { busyProps, type TaskTracker } from "./tasks.ts";

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
  listFailed?: boolean;
  error?: string;
  details?: string;
  retrying?: boolean;
  saving?: boolean;
  /** Older versions than those read are there: Show older versions reads the next page. */
  more: boolean;
  /** A version's text is being read. */
  reading: boolean;
  /** Bumped to move focus into the list of versions. */
  focus: number;
}
export const HISTORY_CLOSED: HistoryState = { open: false, loading: false, versions: [], failed: false, more: false, reading: false, focus: 0 };

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
  tracker: TaskTracker;
}

const DAY = "day:";

export function registerNoteHistory(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge, toast, announce, setNote, flush, tracker } = ctx;
  const history = () => store.state.ui.history;
  const set = (patch: Partial<HistoryState>) => store.update((s) => ({ ...s, ui: { ...s.ui, history: { ...s.ui.history, ...patch } } }));
  const available = () => Boolean(bridge.workspace?.versions && bridge.workspace.version) && store.state.sync.git;
  /** The text a restore replaced, so its Undo can put it back. */
  let replaced: { path: string; text: string } | undefined;
  let generation = 0;
  let selection = 0;
  let writing = false;
  let recovery: { command: string; args: Record<string, unknown> } | undefined;
  let restoreReceipt: { path: string; text: string; before: string; commit: string; at: number } | undefined;
  let undoReceipt: { path: string; text: string } | undefined;
  const clearFailure = () => {
    recovery = undefined;
    set({ failed: false, listFailed: false, error: "", details: "" });
  };
  const fail = (kind: "list" | "more" | "version" | "restore", error: unknown, commit?: string) => {
    const code = opErrorCode(error);
    console.error("History action failed", kind, code);
    recovery = {
      command: kind === "list" ? "history.open" : kind === "more" ? "history.more" : kind === "version" ? "history.choose" : "history.restore",
      args: commit ? { id: commit } : {},
    };
    const message = catalog.format(kind === "list" || kind === "more" ? "history.failed" : kind === "version" ? "history.versionFailed" : "history.restoreFailed");
    const retained = history().failed && history().error === message;
    set({ failed: true, listFailed: kind === "list" || kind === "more", error: message,
      details: catalog.format("history.failureDetails", { operation: kind, code }) });
    if (kind !== "restore" && retained) tracker.announceOutcome(message);
  };

  async function choose(commit: string): Promise<void> {
    const h = history();
    const v = h.versions.find((x) => x.commit === commit);
    if (!h.path || !v || writing) return;
    const request = ++selection;
    restoreReceipt = undefined;
    if (!h.retrying) clearFailure();
    set({ active: commit, reading: true });
    try {
      const text = await tracker.section("history.version", "history.reading", async () => {
        const result = await bridge.workspace?.version?.(h.path!, commit, v.file);
        if (result === undefined) throw new Error("History version unavailable");
        return result;
      }, "fn:history.version", "success");
      if (request !== selection || history().path !== h.path || !history().open) return;
      clearFailure();
      set({ chosen: commit, text });
    } catch (error) {
      if (request === selection && history().path === h.path && history().open) fail("version", error, commit);
    } finally {
      if (request === selection && history().path === h.path && history().open) set({ reading: false });
    }
  }

  /**
   * Reads a page of versions, newest first: from HEAD, or from the oldest one read (listed again, and
   * dropped). One more than a page tells whether there are older ones.
   */
  const page = async (path: string, from?: NoteVersion): Promise<NoteVersion[]> => {
    const read = await tracker.section("history.load", from ? "history.loadingMore" : "history.loading", async () => {
      if (!bridge.workspace?.versions) throw new Error("History unavailable");
      return bridge.workspace.versions(path, { limit: NOTE_HISTORY_PAGE + 1 + (from ? 1 : 0), ...(from ? { from: { commit: from.commit, file: from.file } } : {}) });
    }, "fn:history.list", "success");
    return from ? read.filter((v) => v.commit !== from.commit) : read;
  };

  commands.register({
    id: "history.open", title: "command.history.open", icon: "history", layer: "power", group: "app",
    enabled: () => !writing && available() && Boolean(store.state.note.path), disabledReason: "command.history.open.none",
    run: async () => {
      const path = store.state.note.path;
      if (!path || !bridge.workspace?.versions) return;
      const request = ++generation;
      selection++;
      const previous = history();
      const retained = previous.open && previous.path === path ? previous : HISTORY_CLOSED;
      if (!previous.retrying) clearFailure();
      set({ ...retained, open: true, loading: true, reading: false, path, focus: previous.focus + 1,
        ...(!previous.retrying ? { listFailed: false, failed: false, error: "", details: "" } : {}) });
      // Read only now, as the sheet opens, a page at a time (D-175).
      try {
        const read = await page(path);
        if (request !== generation || history().path !== path || !history().open) return;
        const versions = read.slice(0, NOTE_HISTORY_PAGE);
        clearFailure();
        const retainedChoice = versions.some(v => v.commit === retained.chosen);
        set({ versions, more: read.length > NOTE_HISTORY_PAGE, active: versions.some(v => v.commit === retained.active) ? retained.active : versions[0]?.commit,
          ...(!retainedChoice ? { chosen: undefined, text: undefined } : {}) });
      } catch (error) {
        if (request === generation && history().path === path && history().open) fail("list", error);
      } finally {
        if (request === generation && history().path === path && history().open) set({ loading: false });
      }
    },
  });
  commands.register({ id: "history.close", title: "command.history.close", run: () => { generation++; selection++; recovery = undefined; restoreReceipt = undefined; set({ ...HISTORY_CLOSED, focus: history().focus }); } });
  commands.register({
    id: "history.retry", title: "commit.retry",
    enabled: () => history().open && Boolean(recovery) && !history().retrying && !writing,
    run: async () => {
      const failed = recovery;
      if (!failed) throw new Error("No history action to retry");
      const path = history().path;
      set({ retrying: true });
      try { await commands.run(failed.command, failed.args); }
      finally { if (history().path === path && history().open) set({ retrying: false }); }
    },
  });
  commands.register({
    id: "history.more", title: "command.history.more",
    enabled: () => !writing && history().more && !history().loading,
    run: async () => {
      const h = history();
      if (!h.path || !h.more || h.loading) return;
      const request = ++generation;
      if (!h.retrying) clearFailure();
      set({ loading: true });
      try {
        const read = await page(h.path, h.versions.at(-1));
        if (request !== generation || history().path !== h.path || !history().open) return;
        const older = read.slice(0, NOTE_HISTORY_PAGE);
        const known = new Set(h.versions.map((v) => v.commit));
        clearFailure();
        set({ versions: [...history().versions, ...older.filter((v) => !known.has(v.commit))], more: read.length > NOTE_HISTORY_PAGE });
      } catch (error) {
        if (request === generation && history().path === h.path && history().open) fail("more", error);
      } finally {
        if (request === generation && history().path === h.path && history().open) set({ loading: false });
      }
    },
  });
  commands.register<{ id: string }>({ id: "history.setActive", title: "command.history.open", run: ({ id }) => { if (!id.startsWith(DAY)) set({ active: id }); } });
  commands.register<{ id: string }>({ id: "history.choose", title: "command.history.choose", enabled: () => !writing, run: ({ id }) => choose(id) });
  // Back to current: the list again, where the version was chosen.
  commands.register({ id: "history.back", title: "command.history.back", enabled: () => !writing, run: () => { selection++; restoreReceipt = undefined; clearFailure(); set({ chosen: undefined, text: undefined, reading: false, focus: history().focus + 1 }); } });
  commands.register({
    id: "history.restore", title: "command.history.restore",
    enabled: () => !writing && !history().reading && history().text !== undefined && history().path === store.state.note.path && !isReadOnlyPath(store.state.note.path),
    run: async () => {
      const h = history();
      const v = h.versions.find((x) => x.commit === h.chosen);
      if (!v || h.text === undefined || !h.path || h.path !== store.state.note.path) return;
      if (restoreReceipt && restoreReceipt.text !== store.state.note.markdown) {
        restoreReceipt = undefined;
        fail("restore", new Error("History target changed"));
        set({ error: catalog.format("history.restoreChanged") });
        recovery = { command: "history.choose", args: { id: v.commit } };
        return;
      }
      const request = generation;
      const chosen = selection;
      if (!h.retrying) clearFailure();
      writing = true;
      set({ saving: true });
      try {
        await tracker.run("history.restore", "history.restoring", async () => {
          if (!restoreReceipt) {
            if (!await flush()) throw new Error("Current note was not saved");
            if (store.state.note.path !== h.path || request !== generation || chosen !== selection) throw new Error("History target changed");
            restoreReceipt = { path: h.path!, text: h.text!, before: store.state.note.markdown, commit: v.commit, at: v.at };
            setNote({ key: `${h.path}#history-${v.commit}-${Date.now()}`, initialMarkdown: h.text, markdown: h.text, saveState: "unsaved" });
          }
          const receipt = restoreReceipt;
          if (receipt.path !== store.state.note.path || receipt.text !== store.state.note.markdown || receipt.commit !== h.chosen) throw new Error("History target changed");
          if (!await flush()) throw new Error("Restored note was not saved");
          replaced = { path: receipt.path, text: receipt.before };
          undoReceipt = undefined;
          restoreReceipt = undefined;
          if (request === generation && chosen === selection && history().open) {
            clearFailure();
            set({ ...HISTORY_CLOSED, focus: h.focus });
          }
          const done = catalog.format("history.restored", { at: receipt.at });
          announce(done);
          toast(done, { action: { command: "history.undoRestore", label: catalog.format("files.undo") } });
        }, undefined, "fn:history.restore");
      } catch (error) {
        if (request === generation && chosen === selection && history().open) fail("restore", error);
        else { console.error("History restore failed", opErrorCode(error)); toast(catalog.format("history.restoreFailed"), { tone: "error" }); }
      } finally {
        writing = false;
        if (request === generation && history().open) set({ saving: false });
      }
    },
  });
  commands.register({
    id: "history.undoRestore", title: "command.history.undoRestore",
    enabled: () => !writing && replaced !== undefined && replaced.path === store.state.note.path,
    run: async () => {
      const r = replaced;
      if (!r || r.path !== store.state.note.path) return;
      if (undoReceipt && undoReceipt.text !== store.state.note.markdown) {
        console.error("History undo target changed");
        toast(catalog.format("history.undoChanged"), { tone: "error", action: { command: "history.open", label: catalog.format("command.history.open") } });
        return;
      }
      writing = true;
      try {
        await tracker.run("history.undo", "history.undoing", async () => {
          if (!undoReceipt) {
            if (!await flush() || store.state.note.path !== r.path) throw new Error("Current note was not saved");
            undoReceipt = r;
            setNote({ key: `${r.path}#history-undo-${Date.now()}`, initialMarkdown: r.text, markdown: r.text, saveState: "unsaved" });
          }
          if (undoReceipt.text !== store.state.note.markdown) throw new Error("History target changed");
          if (!await flush()) throw new Error("Undo was not saved");
          replaced = undefined;
          undoReceipt = undefined;
          announce(catalog.format("history.restoreUndone"));
        }, undefined, "fn:history.undo");
      } catch (error) {
        console.error("History undo failed", opErrorCode(error));
        toast(catalog.format("history.undoFailed"), { tone: "error", action: { command: "history.undoRestore", label: catalog.format("commit.retry") } });
      } finally { writing = false; }
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
  let memo: { h?: HistoryState; md?: string; tasks?: AppState["tasks"]; waiting?: boolean; versionWaiting?: boolean; vm?: unknown } = {};
  viewModels.register({
    id: "vm.history",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, status: { type: "string" }, items: { type: "array", items: ITEM }, activeId: { type: "string" }, loading: { type: "boolean" }, listFailed: { type: "boolean" },
        showing: { type: "boolean" }, versionLabel: { type: "string" }, blocks: { type: "array", items: BLOCK }, emptyText: { type: "string" },
        canRestore: { type: "boolean" }, more: { type: "boolean" }, focus: { type: "number" },
        error: { type: "string" }, details: { type: "string" }, retrying: { type: "boolean" }, saving: { type: "boolean" }, versionLoading: { type: "boolean" },
        restoreDisabled: { type: "boolean" }, moreBusy: { type: "boolean" }, restoreBusyLabel: { type: "string" }, moreBusyLabel: { type: "string" },
      },
    },
    reads: ["ui.history", "note.path", "tasks"],
    select: (s) => {
      const h = s.ui.history;
      // The current text is read only while a version shows, and then only to compare it once.
      const md = h.text !== undefined ? s.note.markdown : undefined;
      const waiting = h.loading && s.tasks.findLast(t => t.target === "history.load")?.phase === "on";
      const versionWaiting = h.reading && s.tasks.findLast(t => t.target === "history.version")?.phase === "on";
      if (memo.h === h && memo.md === md && memo.tasks === s.tasks && memo.waiting === waiting && memo.versionWaiting === versionWaiting && memo.vm) return memo.vm as never;
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
      const status = !h.open ? "" : h.loading ? waiting ? catalog.format(h.versions.length ? "history.loadingMore" : "history.loading") : "" : h.reading ? catalog.format("history.reading") : h.failed && !h.versions.length ? catalog.format("history.failed")
        : !h.versions.length ? catalog.format("history.none") : h.failed ? catalog.format("history.versionFailed") : catalog.format("history.count", { count: h.versions.length });
      const vm = {
        open: h.open, status, items, activeId: h.active ?? "",
        // The first versions are on their way: placeholders where the list will be (D-208).
        loading: h.open && waiting && !h.versions.length, listFailed: h.listFailed === true,
        error: h.error ?? "", details: h.details ?? "", retrying: h.retrying === true, saving: h.saving === true,
        versionLoading: h.open && versionWaiting && h.text === undefined,
        showing: Boolean(v && h.text !== undefined),
        versionLabel: v ? catalog.format("history.viewing", { at: v.at }) : "",
        blocks: v && h.text !== undefined ? compareVersions(h.text, md ?? "").mine : [],
        emptyText: catalog.format("conflict.emptyNote"),
        canRestore: Boolean(v && h.text !== undefined && h.path === s.note.path && !isReadOnlyPath(s.note.path)),
        restoreDisabled: h.reading || h.retrying === true,
        restoreBusyLabel: h.saving ? busyProps(s.tasks, "history.restore", (key, args) => catalog.format(key, args)).busyLabel ?? "" : "",
        moreBusyLabel: h.loading && h.versions.length ? busyProps(s.tasks, "history.load", (key, args) => catalog.format(key, args)).busyLabel ?? "" : "",
        more: h.more, moreBusy: h.loading && h.versions.length > 0, focus: h.focus,
      };
      memo = { h, md, tasks: s.tasks, waiting, versionWaiting, vm };
      return vm;
    },
  });
}
