/**
 * The Files panel in the app (WP-2.4, IA-VIEW-FILES): opening and revealing, the selection, inline
 * names, and every operation shown at once, written after, and put back if refused (PRF-09).
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge, AppStateFile, WorkspaceOp, OpErrorCode } from "./bridge.ts";
import { opErrorCode } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { sourceOf } from "./notes.ts";
import {
  actedOn, ancestorsOf, destinations, isRootRow, keepShowing, NO_SELECTION, rebase, rootRowId, select, selectAll, targetFolder, titleOfNode,
  topLevel, visibleRows, type FileRow, type Selection,
} from "./files.ts";
import {
  applyChanges, buildTree, dirOf, findNode, joinPath, planCreateFolder, planDelete, planMove, planRename, planRenameFolder, retitle, rootOf,
  type RefusalReason, type WorkspaceTree,
} from "./workspace.ts";

export interface FilesState {
  open: boolean;
  /** Open folders, by path, and collapsed root sections, by row ID. */
  expanded: readonly string[];
  collapsed: readonly string[];
  selection: Selection;
  filter: string;
  /** Bumped to move focus into the tree, to the focused row. */
  focusRequest: number;
  /** The inline name field: renaming a row, or naming a new folder in `parent`. */
  edit?: { kind: "rename" | "newFolder"; id: string; parent: string; value: string; error: string };
  /** Rows shown in their new place whose write hasn't finished: the saving sign (Files → Row states). */
  pending: readonly string[];
  /** Deleting that asks first (Files → Deleting). */
  confirm?: { paths: string[]; notes: number; name: string };
  /** Move to… (IA-CMP-MOVE). */
  move: { open: boolean; query: string; activeId: string; paths: string[]; focus: number };
}
export const FILES_CLOSED: FilesState = {
  open: false, expanded: [], collapsed: [], selection: NO_SELECTION, filter: "", focusRequest: 0, pending: [],
  move: { open: false, query: "", activeId: "", paths: [], focus: 0 },
};

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => number;
  announce: (text: string) => void;
  load: (path: string) => Promise<void>;
  /** Runs after pending edits are written, with saves held until it finishes, so none lands in the old place. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  setNote: (patch: Partial<AppState["note"]>) => void;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  /** The open note was loaded again with this text (its title changed). */
  loaded: (path: string, markdown: string) => void;
  describeItem: (id: string) => Record<string, unknown>;
  itemSchema: Record<string, unknown>;
}

const REASONS: Record<RefusalReason | OpErrorCode | "visibility", string> = {
  notFound: "files.reason.notFound", taken: "files.reason.taken", readOnly: "files.reason.readOnly", invalid: "files.reason.invalid",
  intoItself: "files.reason.intoItself", trash: "files.reason.trash", failed: "files.reason.failed", visibility: "files.reason.visibility",
};

export function registerFiles(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge, toast, announce } = ctx;
  const ws = bridge.workspace;
  const files = () => store.state.ui.files;
  const tree = () => store.state.workspace.tree;
  const setFiles = (fn: (f: FilesState) => Partial<FilesState>) => store.update((s) => ({ ...s, ui: { ...s.ui, files: { ...s.ui.files, ...fn(s.ui.files) } } }));
  const setTree = (t: WorkspaceTree) => store.update((s) => (s.workspace.tree === t ? s : { ...s, workspace: { ...s.workspace, tree: t } }));
  const canWrite = (s: AppState) => Boolean(ws?.apply) && s.workspace.access === "write";
  const reason = (r: keyof typeof REASONS) => catalog.format(REASONS[r]);

  // ---- rows ----
  let rowsMemo: { tree: WorkspaceTree; expanded: readonly string[]; collapsed: readonly string[]; filter: string; rows: FileRow[] } | undefined;
  const rowsOf = (s: AppState): FileRow[] => {
    const f = s.ui.files;
    const t = s.workspace.tree;
    if (rowsMemo && rowsMemo.tree === t && rowsMemo.expanded === f.expanded && rowsMemo.collapsed === f.collapsed && rowsMemo.filter === f.filter) return rowsMemo.rows;
    const rows = visibleRows(t, { expanded: new Set(f.expanded), collapsed: new Set(f.collapsed) }, f.filter);
    rowsMemo = { tree: t, expanded: f.expanded, collapsed: f.collapsed, filter: f.filter, rows };
    return rows;
  };
  const rowById = (id: string) => rowsOf(store.state).find((r) => r.id === id);
  const nameOf = (path: string) => {
    const found = findNode(tree(), path);
    return found ? titleOfNode(found.node) : path.split(/[\\/:]/).at(-1) ?? path;
  };
  /** One item by its name in quotes, or a count. */
  const whatOf = (paths: readonly string[]) => (paths.length === 1 ? catalog.format("files.quoted", { name: nameOf(paths[0]!) }) : catalog.format("files.items", { count: paths.length }));
  const folderLabel = (path: string) => {
    const root = rootOf(tree(), path);
    if (root && root.path === path) return rootLabel(root.id);
    return nameOf(path);
  };
  const rootLabel = (id: string) => catalog.format(`files.root.${id === "local" && bridge.platform !== "web" ? "folder" : id}`);

  // ---- opening, revealing, closing ----
  // Opened before the workspace was first listed: the current note is revealed once it is.
  let revealWhenListed = false;
  store.subscribe(() => {
    if (!revealWhenListed || !tree().roots.length) return;
    revealWhenListed = false;
    if (files().open) reveal();
  });
  const reveal = () => {
    if (!tree().roots.length) revealWhenListed = true;
    const path = store.state.note.path;
    const add = path && findNode(tree(), path) ? ancestorsOf(tree(), path) : [];
    setFiles((f) => ({
      open: true, filter: "", edit: undefined, focusRequest: f.focusRequest + 1,
      expanded: [...new Set([...f.expanded, ...add])],
      collapsed: f.collapsed.filter((c) => !path || c !== rootRowId(rootOf(tree(), path)?.id ?? "local")),
      selection: path && findNode(tree(), path) ? { selected: [path], anchor: path, focus: path } : f.selection,
    }));
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    // The current note may be in a folder that only now shows; focus falls back to the first row.
    setFiles((f) => ({ selection: keepShowing(f.selection, rowsOf(store.state)) }));
  };
  const close = () => setFiles(() => ({ open: false, edit: undefined, confirm: undefined, move: { ...files().move, open: false } }));
  commands.register({ id: "files.open", title: "command.files.open", icon: "open", enabled: () => Boolean(ws), run: () => (files().open ? close() : reveal()) });
  commands.register({
    id: "files.reveal", title: "command.files.reveal", shortcut: { default: "Mod+Shift+E" }, layer: "power", group: "files",
    enabled: () => Boolean(ws), run: reveal,
  });
  commands.register({ id: "files.close", title: "command.files.close", run: close });

  // ---- the tree: focus, selection, folders ----
  commands.register<{ id: string; mode: string }>({
    id: "files.select", title: "command.files.select",
    run: ({ id, mode }) => {
      const m = mode === "toggle" || mode === "range" || mode === "focus" ? mode : "replace";
      setFiles((f) => ({ selection: select(f.selection, rowsOf(store.state), String(id), m) }));
    },
  });
  commands.register({
    id: "files.selectAll", title: "command.files.selectAll", shortcut: { default: "Mod+A", handledBy: "filesTree" }, layer: "basic", group: "files",
    run: () => setFiles((f) => ({ selection: selectAll(f.selection, rowsOf(store.state)) })),
  });
  commands.register({
    id: "files.clearSelection", title: "command.files.clearSelection", icon: "dismiss",
    run: () => setFiles((f) => ({ selection: { selected: f.selection.focus ? [f.selection.focus] : [], anchor: f.selection.focus, focus: f.selection.focus }, focusRequest: f.focusRequest + 1 })),
  });
  const setExpanded = (id: string, open: boolean) => setFiles((f) => isRootRow(id)
    ? { collapsed: open ? f.collapsed.filter((c) => c !== id) : [...new Set([...f.collapsed, id])] }
    : { expanded: open ? [...new Set([...f.expanded, id])] : f.expanded.filter((e) => e !== id) });
  commands.register<{ id: string; expanded: boolean }>({ id: "files.setExpanded", title: "command.files.setExpanded", run: ({ id, expanded }) => setExpanded(String(id), Boolean(expanded)) });
  commands.register<{ value: string }>({ id: "files.setFilter", title: "command.files.setFilter", run: ({ value }) => setFiles(() => ({ filter: typeof value === "string" ? value : "" })) });
  const activate = async (id: string) => {
    const row = rowById(id);
    if (!row) return;
    if (row.kind !== "note") return setExpanded(row.id, !row.expanded);
    // Opening a note closes the panel (DD-FILES-01).
    close();
    if (store.state.note.path !== row.path) await ctx.load(row.path);
  };
  commands.register<{ id: string }>({ id: "files.activate", title: "command.files.openItem", run: ({ id }) => activate(String(id)) });
  commands.register({
    id: "files.openItem", title: "command.files.openItem", shortcut: { macos: "Mod+Down", default: "Enter", handledBy: "filesTree" }, layer: "basic", group: "files",
    run: () => activate(files().selection.focus),
  });

  // ---- showing changes at once (PRF-09) ----
  let queue: Promise<unknown> = Promise.resolve();
  const rescan = async () => {
    const scan = await ws?.scan().catch(() => undefined);
    if (scan) setTree(buildTree(scan));
  };
  /**
   * Shows `next` now, then writes the batch. Success changes nothing visible but the saving sign;
   * a refusal puts the tree and the selection back and says why (Desktop and Git → Changes shown before they're saved).
   */
  async function perform(next: WorkspaceTree, ops: WorkspaceOp[], o: { touched: string[]; moves?: { from: string; to: string }[]; deletes?: string[]; select?: string[]; done: string; failed: (why: string) => string; open?: string[] }) {
    const before = tree();
    const beforeFiles = files();
    const moves = o.moves ?? [];
    setTree(next);
    setFiles((f) => ({
      pending: [...f.pending, ...o.touched],
      expanded: [...new Set([...f.expanded.map((e) => rebase(e, moves)), ...(o.open ?? [])])],
      selection: o.select?.length ? { selected: o.select, anchor: o.select[0]!, focus: o.select[0]! }
        : moves.length ? { selected: moves.map((m) => m.to), anchor: moves[0]!.to, focus: moves[0]!.to } : f.selection,
    }));
    setFiles((f) => ({ selection: keepShowing(f.selection, rowsOf(store.state)) }));
    const done = (queue = queue.catch(() => {}).then(() => ctx.exclusive(async () => {
      await ws!.apply!(ops);
      // The open note follows a move; a deleted one is closed after.
      const p = store.state.note.path;
      if (p && moves.length) {
        const to = rebase(p, moves);
        if (to !== p) {
          store.update((s) => ({ ...s, note: { ...s.note, path: to } }));
          if (sourceOf(to) !== "private") await ctx.persistAppState({ lastNotePath: to });
        }
      }
    })));
    try {
      await done;
      setFiles((f) => ({ pending: f.pending.filter((x) => !o.touched.includes(x)) }));
      const p = store.state.note.path;
      if (p && o.deletes?.some((d) => p === d || p.startsWith(d + "/") || p.startsWith(d + "\\"))) {
        // Nothing of the deleted note may be written again.
        ctx.setNote({ path: undefined, saveState: "saved" });
        await ctx.load(await bridge.defaultNotePath());
      }
      toast(o.done);
      announce(o.done);
    } catch (e) {
      // The screen as it is now: anything else that changed meanwhile is read again.
      const untouched = tree() === next;
      setTree(before);
      if (!untouched) void rescan();
      setFiles((f) => ({
        pending: f.pending.filter((x) => !o.touched.includes(x)),
        selection: keepShowing(beforeFiles.selection, rowsOf(store.state)),
        focusRequest: f.focusRequest + 1,
      }));
      toast(o.failed(reason(opErrorCode(e))), { tone: "error" });
    }
  }
  const refused = (key: string, args: Record<string, unknown>, why: keyof typeof REASONS) => toast(catalog.format(key, { ...args, reason: reason(why) }), { tone: "error" });

  // ---- moving (FIL-03, FIL-08) ----
  function doMove(paths: string[], dest: string): void {
    if (!paths.length || !canWrite(store.state)) return;
    const what = whatOf(paths);
    const where = catalog.format("files.quoted", { name: folderLabel(dest) });
    const plan = planMove(tree(), paths, dest);
    if (plan.kind === "refused") return void refused("files.moveFailed", { what }, plan.reason);
    // Changing who can see a note asks first, and arrives with Git (WP-3.4).
    if (plan.crossesVisibility) return void refused("files.moveFailed", { what }, "visibility");
    if (!plan.moves.length) return;
    void perform(plan.tree, plan.moves.map((m) => ({ op: "move" as const, from: m.from, to: m.to })), {
      touched: plan.moves.map((m) => m.to), moves: plan.moves, open: dest === rootOf(tree(), dest)?.path ? [] : [dest],
      done: catalog.format("files.moved", { what, where }),
      failed: (why) => catalog.format("files.moveFailed", { what, reason: why }),
    });
  }
  commands.register<{ source: string; target: string }>({
    id: "files.drop", title: "command.files.moveTo",
    run: ({ source, target }) => {
      const row = rowById(String(target));
      if (!row || row.kind === "note") return;
      doMove(topLevel(actedOn(files().selection, String(source))), row.path);
    },
  });
  const moveList = (s: AppState) => {
    const m = s.ui.files.move;
    const q = m.query.trim().toLocaleLowerCase();
    const from = rootOf(s.workspace.tree, m.paths[0] ?? "");
    return destinations(s.workspace.tree, m.paths)
      .map((d) => {
        const label = d.depth === 0 ? rootLabel(d.root.id) : d.name;
        const where = d.depth === 0 ? "" : rootLabel(d.root.id) + " · " + dirOf(d.path).slice(d.root.path.length).replace(/^[\\/:]+/, "").replace(/\\/g, "/");
        // Moving between Public and Private changes visibility, which arrives with Git (WP-3.4).
        const other = from && d.root.id !== from.id;
        return { id: d.path, label, description: other ? catalog.format("files.visibilityLater") : where.replace(/ · $/, ""), icon: d.depth === 0 ? "open" : "folder", ...(other ? { disabled: true } : {}) };
      })
      .filter((d) => !q || d.label.toLocaleLowerCase().includes(q));
  };
  const firstEnabled = (s: AppState) => moveList(s).find((d) => !d.disabled)?.id ?? "";
  const setMove = (patch: Partial<FilesState["move"]>) => setFiles((f) => ({ move: { ...f.move, ...patch } }));
  commands.register({
    id: "files.moveTo", title: "command.files.moveTo", icon: "folder", shortcut: { default: "Mod+Shift+M", handledBy: "files" }, layer: "power", group: "files",
    enabled: canWrite,
    run: () => {
      const paths = topLevel(actedOn(files().selection, files().selection.focus).map((id) => rowById(id)?.path ?? id));
      if (!paths.length) return;
      if (paths.some((p) => rootOf(tree(), p)?.readOnly)) return void refused("files.moveFailed", { what: whatOf(paths) }, "readOnly");
      setMove({ open: true, query: "", paths, focus: files().move.focus + 1, activeId: "" });
      setMove({ activeId: firstEnabled(store.state) });
    },
  });
  commands.register<{ value: string }>({
    id: "move.setQuery", title: "command.move.setQuery",
    run: ({ value }) => { setMove({ query: typeof value === "string" ? value : "" }); setMove({ activeId: firstEnabled(store.state) }); },
  });
  const step = (dir: 1 | -1) => () => {
    const list = moveList(store.state).filter((d) => !d.disabled);
    if (!list.length) return;
    const i = list.findIndex((d) => d.id === files().move.activeId);
    setMove({ activeId: list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]!.id });
  };
  commands.register({ id: "move.next", title: "command.move.next", shortcut: { default: "Down", handledBy: "moveField" }, layer: "power", group: "files", run: step(1) });
  commands.register({ id: "move.prev", title: "command.move.prev", shortcut: { default: "Up", handledBy: "moveField" }, layer: "power", group: "files", run: step(-1) });
  commands.register<{ id: string }>({ id: "move.setActive", title: "command.move.next", run: ({ id }) => { if (typeof id === "string") setMove({ activeId: id }); } });
  commands.register<{ id: string }>({
    id: "move.choose", title: "command.move.choose",
    run: ({ id }) => {
      const dest = typeof id === "string" && id !== "" ? id : files().move.activeId;
      const item = moveList(store.state).find((d) => d.id === dest);
      if (!item || item.disabled) return;
      const paths = files().move.paths;
      setFiles((f) => ({ move: { ...f.move, open: false }, focusRequest: f.focusRequest + 1 }));
      doMove(paths, dest);
    },
  });
  commands.register({ id: "move.chooseActive", title: "command.move.choose", shortcut: { default: "Enter", handledBy: "moveField" }, layer: "power", group: "files", run: (_a, c) => c.run("move.choose", { id: "" }) });
  commands.register<{ open: boolean }>({ id: "move.setOpen", title: "command.files.moveTo", run: ({ open }) => { if (!open) setFiles((f) => ({ move: { ...f.move, open: false }, focusRequest: f.focusRequest + 1 })); } });

  // ---- deleting (FIL-01, FIL-02) ----
  function doDelete(paths: string[]): void {
    const plan = planDelete(tree(), paths);
    const what = whatOf(paths);
    if (plan.kind === "refused") return void refused("files.deleteFailed", { what }, plan.reason);
    void perform(plan.tree, paths.map((path) => ({ op: "delete" as const, path })), {
      touched: [], deletes: paths,
      done: catalog.format(bridge.platform === "web" ? "files.deleted" : "files.trashed", { what }),
      failed: (why) => catalog.format("files.deleteFailed", { what, reason: why }),
    });
  }
  commands.register({
    id: "files.delete", title: "command.files.delete", icon: "delete", shortcut: { macos: "Mod+Backspace", default: "Delete", handledBy: "filesTree" }, layer: "basic", group: "files",
    enabled: canWrite,
    run: () => {
      const paths = topLevel(actedOn(files().selection, files().selection.focus).map((id) => rowById(id)?.path ?? id));
      if (!paths.length) return;
      const what = whatOf(paths);
      const plan = planDelete(tree(), paths);
      if (plan.kind === "refused") return void refused("files.deleteFailed", { what }, plan.reason);
      // A folder with notes, five or more items, or a public note asks first (DD-FILES-06).
      if (plan.ask) return setFiles(() => ({ confirm: { paths, notes: plan.notes.length, name: what } }));
      doDelete(paths);
    },
  });
  commands.register({
    id: "files.confirmDelete", title: "command.files.delete",
    run: () => {
      const c = files().confirm;
      setFiles((f) => ({ confirm: undefined, focusRequest: f.focusRequest + 1 }));
      if (c) doDelete(c.paths);
    },
  });
  commands.register<{ open: boolean }>({ id: "files.setConfirmOpen", title: "command.files.delete", run: ({ open }) => { if (!open) setFiles((f) => ({ confirm: undefined, focusRequest: f.focusRequest + 1 })); } });

  // ---- creating and renaming (FIL-01, FIL-02) ----
  commands.register({
    id: "files.newFolder", title: "command.files.newFolder", icon: "folder",
    shortcut: { default: "Mod+Shift+N", web: "Ctrl+Alt+Shift+N", handledBy: "files" }, layer: "writer", group: "files",
    enabled: canWrite,
    run: () => {
      const s = store.state;
      if (!s.ui.files.open) reveal();
      const parent = targetFolder(tree(), rowsOf(store.state), files().selection.focus, s.note.path);
      if (parent === undefined) return;
      const root = rootOf(tree(), parent);
      if (root && parent !== root.path) setExpanded(parent, true);
      else if (root) setExpanded(rootRowId(root.id), true);
      setFiles(() => ({ edit: { kind: "newFolder", id: `new:${parent}`, parent, value: catalog.format("files.newFolderName"), error: "" } }));
    },
  });
  commands.register({
    id: "files.newNote", title: "command.note.new", icon: "newNote",
    enabled: canWrite, run: (_a, c) => c.run("note.new"),
  });
  commands.register({
    id: "files.rename", title: "command.files.rename", shortcut: { macos: "Enter", default: "F2", handledBy: "filesTree" }, layer: "basic", group: "files",
    enabled: canWrite,
    run: () => {
      const row = rowById(files().selection.focus);
      if (!row || row.kind === "root") return;
      if (row.readOnly) return void refused("files.renameFailed", { what: catalog.format("files.quoted", { name: row.label }) }, "readOnly");
      setFiles(() => ({ edit: { kind: "rename", id: row.id, parent: dirOf(row.path), value: row.label, error: "" } }));
    },
  });
  commands.register<{ value: string }>({ id: "files.setEditValue", title: "command.files.rename", run: ({ value }) => setFiles((f) => (f.edit ? { edit: { ...f.edit, value: String(value ?? ""), error: "" } } : {})) });
  const cancelEdit = () => setFiles((f) => ({ edit: undefined, focusRequest: f.focusRequest + 1 }));
  commands.register({ id: "files.cancelEdit", title: "command.files.cancelEdit", shortcut: { default: "Escape", handledBy: "filesEdit" }, layer: "basic", group: "files", run: cancelEdit });
  const editError = (r: RefusalReason) => setFiles((f) => (f.edit ? { edit: { ...f.edit, error: catalog.format(`files.nameError.${r}`) } } : {}));
  async function commitEdit(): Promise<void> {
    const e = files().edit;
    if (!e) return;
    const value = e.value.trim();
    if (e.kind === "newFolder") {
      if (!value) return cancelEdit();
      const plan = planCreateFolder(tree(), e.parent, value);
      if (plan.kind === "refused") return editError(plan.reason);
      setFiles((f) => ({ edit: undefined, focusRequest: f.focusRequest + 1 }));
      await perform(plan.tree, [{ op: "createFolder", path: plan.path }], {
        touched: [plan.path], select: [plan.path], done: catalog.format("files.folderCreated", { what: catalog.format("files.quoted", { name: value }) }),
        failed: (why) => catalog.format("files.createFailed", { what: catalog.format("files.quoted", { name: value }), reason: why }),
      });
      return;
    }
    const row = rowById(e.id);
    if (!row || !value || value === row.label) return cancelEdit();
    if (row.kind === "folder") {
      const plan = planRenameFolder(tree(), row.path, value);
      if (plan.kind === "refused") return editError(plan.reason);
      setFiles((f) => ({ edit: undefined, focusRequest: f.focusRequest + 1 }));
      await perform(plan.tree, [{ op: "move", from: plan.from, to: plan.to }], {
        touched: [plan.to], moves: [{ from: plan.from, to: plan.to }],
        done: catalog.format("files.renamed", { what: catalog.format("files.quoted", { name: value }) }),
        failed: (why) => catalog.format("files.renameFailed", { what: catalog.format("files.quoted", { name: row.label }), reason: why }),
      });
      return;
    }
    setFiles((f) => ({ edit: undefined, focusRequest: f.focusRequest + 1 }));
    await renameNote(row.path, value);
  }
  /** A note's name is its title: the H1 changes, and the file name follows unless published (FIL-07). */
  async function renameNote(path: string, title: string): Promise<void> {
    try {
      await ctx.exclusive(async () => {
        const isOpen = store.state.note.path === path;
        const text = isOpen ? store.state.note.markdown : await bridge.readNote(path);
        const next = retitle(text, title);
        await bridge.writeNote(path, next);
        const plan = planRename(tree(), path, title);
        let to = path;
        if (plan?.kind === "renamed") {
          await ws!.renameNote(path, plan.to);
          to = plan.to;
          setTree(plan.tree);
        }
        setTree(applyChanges(tree(), [{ path: to, kind: "note", exists: true, title }]));
        setFiles((f) => ({ selection: { selected: [to], anchor: to, focus: to } }));
        if (isOpen) {
          ctx.setNote({ path: to, key: `${to}#${Date.now()}`, initialMarkdown: next, markdown: next, saveState: "saved" });
          ctx.loaded(to, next);
          if (sourceOf(to) !== "private") await ctx.persistAppState({ lastNotePath: to });
        }
      });
      announce(catalog.format("files.renamed", { what: catalog.format("files.quoted", { name: title }) }));
    } catch (e) {
      void rescan();
      toast(catalog.format("files.renameFailed", { what: whatOf([path]), reason: reason(opErrorCode(e)) }), { tone: "error" });
    }
  }
  commands.register({ id: "files.commitEdit", title: "command.files.commitEdit", shortcut: { default: "Enter", handledBy: "filesEdit" }, layer: "basic", group: "files", run: commitEdit });
  // Clicking away keeps a typed name and drops an empty one (Files → Creating).
  commands.register({ id: "files.editBlur", title: "command.files.commitEdit", run: () => (files().edit?.value.trim() ? commitEdit() : files().edit ? cancelEdit() : undefined) });

  // ---- view models ----
  const TREE_ITEM = {
    type: "object" as const,
    properties: Object.fromEntries([
      ...["id", "label", "description", "title", "parent"].map((k) => [k, { type: "string" as const }]),
      ["kind", { type: "string" as const, enum: ["section", "folder", "note"] }],
      ["level", { type: "number" as const }],
      ...["expanded", "hasChildren", "selected", "current", "pending", "readOnly", "draggable", "droppable", "editing"].map((k) => [k, { type: "boolean" as const }]),
    ]),
  };
  const CLOSED = { open: false, focusRequest: 0, items: [], focusId: "", editValue: "", editError: "", editLabel: "", filter: "", empty: false, emptyText: "", selectedCount: 0, multi: false, selectionText: "", newText: "", newMenu: [] };
  viewModels.register({
    id: "vm.files",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, focusRequest: { type: "number" }, items: { type: "array", items: TREE_ITEM }, focusId: { type: "string" },
        editValue: { type: "string" }, editError: { type: "string" }, editLabel: { type: "string" },
        filter: { type: "string" }, empty: { type: "boolean" }, emptyText: { type: "string" },
        selectedCount: { type: "number" }, multi: { type: "boolean" }, selectionText: { type: "string" }, newText: { type: "string" },
        newMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } },
      },
    },
    setters: { filter: "files.setFilter", editValue: "files.setEditValue" },
    // The tree, the open note, and whether the workspace can be written (PRF-11). Cheap while closed.
    reads: ["ui.files", "workspace", "note.path"],
    shows: (s) => (s.ui.files.open ? [{ kind: "tree" }] : []),
    select: (s) => {
      const f = s.ui.files;
      if (!f.open) return CLOSED;
      const rows = rowsOf(s);
      const selected = new Set(f.selection.selected);
      const pending = new Set(f.pending);
      const writable = canWrite(s);
      const items: Record<string, unknown>[] = rows.map((r) => ({
        id: r.id, kind: r.kind === "root" ? "section" : r.kind, level: r.level,
        label: r.kind === "root" ? rootLabel(r.rootId) : r.label,
        description: r.readOnly ? catalog.format("files.readOnly") : r.rootId === "public" && r.kind === "note" ? catalog.format("files.public") : "",
        title: r.kind === "note" ? r.name : "", parent: r.parent ?? "",
        expanded: r.expanded, hasChildren: r.hasChildren, selected: selected.has(r.id), current: r.path === s.note.path && r.kind === "note",
        pending: pending.has(r.id), readOnly: r.readOnly,
        draggable: writable && !r.readOnly && r.kind !== "root", droppable: writable && !r.readOnly && r.kind !== "note",
        editing: f.edit?.kind === "rename" && f.edit.id === r.id,
      }));
      // A new folder's name field shows in place, first in its folder.
      if (f.edit?.kind === "newFolder") {
        const parentRow = rows.find((r) => (r.kind === "root" ? r.path === f.edit!.parent : r.id === f.edit!.parent));
        const at = parentRow ? rows.indexOf(parentRow) + 1 : 0;
        items.splice(at, 0, {
          id: f.edit.id, kind: "folder", level: (parentRow?.level ?? 1) + 1, label: f.edit.value, description: "", title: "", parent: parentRow?.id ?? "",
          expanded: false, hasChildren: false, selected: false, current: false, pending: false, readOnly: false, draggable: false, droppable: false, editing: true,
        });
      }
      const count = f.selection.selected.filter((x) => !isRootRow(x)).length;
      const notes = rows.filter((r) => r.kind !== "root").length;
      return {
        open: true, focusRequest: f.focusRequest, items, focusId: f.edit ? f.edit.id : f.selection.focus,
        editValue: f.edit?.value ?? "", editError: f.edit?.error ?? "",
        editLabel: catalog.format(f.edit?.kind === "newFolder" ? "files.folderName" : rows.find((r) => r.id === f.edit?.id)?.kind === "folder" ? "files.folderName" : "files.title"),
        filter: f.filter, empty: notes === 0,
        emptyText: f.filter.trim() ? catalog.format("files.noMatch", { query: f.filter.trim() }) : catalog.format("files.empty"),
        selectedCount: count, multi: count > 1, selectionText: catalog.format("files.selected", { count }), newText: catalog.format("files.new"),
        newMenu: [{ id: "new", label: "", items: [ctx.describeItem("files.newNote"), ctx.describeItem("files.newFolder")] }],
      };
    },
  });
  viewModels.register({
    id: "vm.move",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, title: { type: "string" }, query: { type: "string" }, activeId: { type: "string" }, focus: { type: "number" }, summary: { type: "string" },
        items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" }, disabled: { type: "boolean" } } } },
      },
    },
    setters: { query: "move.setQuery" },
    reads: ["ui.files.move", "workspace.tree"],
    select: (s) => {
      const m = s.ui.files.move;
      if (!m.open) return { open: false, title: "", query: "", activeId: "", focus: m.focus, summary: "", items: [] };
      const items = moveList(s);
      const what = whatOf(m.paths);
      return {
        open: true, title: catalog.format("move.title", { what }), query: m.query, activeId: m.activeId, focus: m.focus, items,
        summary: items.length ? catalog.format("move.count", { count: items.length }) : catalog.format("move.none"),
      };
    },
  });
  viewModels.register({
    id: "vm.confirm",
    schema: { type: "object", properties: { open: { type: "boolean" }, message: { type: "string" }, confirmLabel: { type: "string" } } },
    reads: ["ui.files.confirm"],
    select: (s) => {
      const c = s.ui.files.confirm;
      if (!c) return { open: false, message: "", confirmLabel: "" };
      const pub = c.paths.some((p) => rootOf(s.workspace.tree, p)?.id === "public");
      return {
        open: true,
        message: catalog.format(pub ? "files.confirm.public" : "files.confirm.message", { what: c.name, notes: c.notes }),
        confirmLabel: catalog.format(pub ? "files.confirm.unpublish" : "files.confirm.delete", { notes: c.notes }),
      };
    },
  });

  return {
    /** Where note.new puts a note while the panel is open, and closes it (Files → Creating). Undefined otherwise. */
    newNoteFolder(): string | undefined {
      const s = store.state;
      if (!s.ui.files.open) return undefined;
      const folder = targetFolder(tree(), rowsOf(s), s.ui.files.selection.focus, s.note.path);
      close();
      return folder;
    },
    /** A note the app is about to write shows in the tree first (PRF-09). */
    created(path: string): void {
      setTree(applyChanges(tree(), [{ path, kind: "note", exists: true }]));
    },
    joinPath,
  };
}
