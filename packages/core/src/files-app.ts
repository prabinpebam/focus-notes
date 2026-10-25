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
import { groupByDay, type DeletedNote } from "./history.ts";
import { planLinkWrites, rewriteLinks, sameRootOf, type LinkWrite, type PathMove } from "./links.ts";
import {
  actedOn, ancestorsOf, copyTitle, destinations, importedNote, isRootRow, keepShowing, NO_SELECTION, rebase, rootRowId, rowMenu, select, selectAll, targetFolder, titleOfNode,
  topLevel, visibleRows, withoutNoteId, type FileRow, type FilesSort, type Selection,
} from "./files.ts";
import { copyPublicLink, publicLinkReason } from "./public-link-app.ts";
import {
  applyChanges, buildTree, dirOf, findNode, isWithin, joinPath, planCreateFolder, planCreateNote, planDelete, planMove, planRename, planRenameFolder, planVisibility, retitle, rootOf,
  visibilityOf, walk, type RefusalReason, type WorkspaceTree,
} from "./workspace.ts";

export interface FilesState {
  open: boolean;
  /** Docked (D-187, was pinned in D-161): flush to the window's left edge, the text beside it; opening a note, a click on the canvas, and Esc leave it open. */
  pinned: boolean;
  /** Whether the window has room to dock it beside the note's narrowest text (D-187); docked = pinned and fits. */
  fits: boolean;
  /** Its docked width in px, as the person resized it; undefined: the token's default (D-187). */
  width?: number;
  /** Open folders, by path, and collapsed root sections, by row ID. */
  expanded: readonly string[];
  collapsed: readonly string[];
  selection: Selection;
  filter: string;
  /** How the tree is sorted (FIL-11, D-175): by name, or by last change. */
  sort: FilesSort;
  /** Bumped to move focus into the tree, to the focused row. */
  focusRequest: number;
  /** The inline name field: renaming a row, or naming a new folder in `parent`. */
  edit?: { kind: "rename" | "newFolder"; id: string; parent: string; value: string; error: string };
  /** Rows shown in their new place whose write hasn't finished: the saving sign (Files → Row states). */
  pending: readonly string[];
  /** Notes with text a crash left, not opened yet (QLT-06): their rows say unsaved until they open. */
  unsaved: readonly string[];
  /**
   * What asks first: deleting (Files → Deleting), and changing who can see notes (DD-FILES-08):
   * Make public or private keeps each item's folder path (`dest` unset); a drop or Move to… has one.
   */
  confirm?: { kind: "delete"; paths: string[]; notes: number; name: string } | { kind: "visibility"; to: "public" | "private"; paths: string[]; dest?: string; name: string };
  /** Move to… (IA-CMP-MOVE). `restore` is a deleted note being restored to a chosen folder (FIL-10). */
  move: { open: boolean; query: string; activeId: string; paths: string[]; focus: number; restore?: string };
  /** Recently deleted, in place of the tree (FIL-10). `notes` is undefined until it's first listed. */
  recent: { open: boolean; loading: boolean; notes?: readonly DeletedNote[]; focus: number };
}
export const FILES_CLOSED: FilesState = {
  open: false, pinned: false, fits: true, expanded: [], collapsed: [], selection: NO_SELECTION, filter: "", sort: "name", focusRequest: 0, pending: [], unsaved: [],
  move: { open: false, query: "", activeId: "", paths: [], focus: 0 },
  recent: { open: false, loading: false, focus: 0 },
};

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string; args?: Record<string, unknown> } }) => number;
  announce: (text: string) => void;
  load: (path: string) => Promise<void>;
  /** Runs after pending edits are written, with saves held until it finishes, so none lands in the old place. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  setNote: (patch: Partial<AppState["note"]>) => void;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  /** The open note was loaded again with this text (its title changed). */
  loaded: (path: string, markdown: string) => void;
  /** The app wrote this text to the open note's file itself (a move, its links): the next save expects it there (DEF-26). */
  sawOnDisk?: (path: string, text: string) => void;
  /** Whether a note's saves wait for a conflict choice (FIL-12, D-92). */
  holds?: (path: string) => boolean;
  /** The app moved the open note's file: what's known on disk, and a pending conflict, go with it (DEF-26). */
  moved?: (from: string, to: string) => void;
  /** The app moved notes or folders (any, open or not): text a crash left for them follows (QLT-06). */
  notesMoved?: (moves: readonly { from: string; to: string }[]) => void;
  describeItem: (id: string) => Record<string, unknown>;
  itemSchema: Record<string, unknown>;
  /** Runs an editor action: `edit.focus` puts the caret back in the note. */
  editorAction: (id: string) => void;
  /** The one task tracker (PRF-08): waits a person starts show their sign through it. */
  tracker?: { run<T>(target: string, message: string, work: () => Promise<T>, doneMessage?: string): Promise<T> };
  /** HTML as Markdown, for Import files (FIL-15); without it, Import files isn't offered. */
  htmlToMarkdown?: (html: string) => string;
}

const REASONS: Record<RefusalReason | OpErrorCode, string> = {
  notFound: "files.reason.notFound", taken: "files.reason.taken", readOnly: "files.reason.readOnly", invalid: "files.reason.invalid",
  intoItself: "files.reason.intoItself", trash: "files.reason.trash", failed: "files.reason.failed", changed: "files.reason.changed",
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
  // Worked out only when the tree, the open folders, the filter, or the order change: never per keystroke (D-175).
  let rowsMemo: { tree: WorkspaceTree; expanded: readonly string[]; collapsed: readonly string[]; filter: string; sort: FilesSort; rows: FileRow[] } | undefined;
  const rowsOf = (s: AppState): FileRow[] => {
    const f = s.ui.files;
    const t = s.workspace.tree;
    if (rowsMemo && rowsMemo.tree === t && rowsMemo.expanded === f.expanded && rowsMemo.collapsed === f.collapsed && rowsMemo.filter === f.filter && rowsMemo.sort === f.sort) return rowsMemo.rows;
    const rows = visibleRows(t, { expanded: new Set(f.expanded), collapsed: new Set(f.collapsed) }, f.filter, f.sort);
    rowsMemo = { tree: t, expanded: f.expanded, collapsed: f.collapsed, filter: f.filter, sort: f.sort, rows };
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
  // Opened before the workspace was first listed: the current note is revealed once it is. Focus was
  // asked for when it opened; it isn't asked again, since the person may have moved on meanwhile (Tab
  // to Recently deleted), and a key meant there would land in the tree (DEF-20). The tree takes it
  // then only if focus is still where it was (FileTree).
  let revealWhenListed = false;
  store.subscribe(() => {
    if (!revealWhenListed || !tree().roots.length) return;
    revealWhenListed = false;
    if (files().open) reveal(undefined, false);
  });
  /** Opens the panel with a note or folder shown and selected: the open note unless one is given (Spotlight's quick actions). */
  const reveal = (target?: string, focus = true) => {
    if (!tree().roots.length) revealWhenListed = true;
    const path = target ?? store.state.note.path;
    const add = path && findNode(tree(), path) ? ancestorsOf(tree(), path) : [];
    setFiles((f) => ({
      // Revealed again once listed, what the person did meanwhile (a filter typed) stays. Opened
      // without focus (docking again, D-187), no earlier request is left for its tree to meet.
      open: true, ...(focus ? { filter: "", edit: undefined, focusRequest: f.focusRequest + 1 } : f.open ? {} : { focusRequest: 0 }),
      expanded: [...new Set([...f.expanded, ...add])],
      collapsed: f.collapsed.filter((c) => !path || c !== rootRowId(rootOf(tree(), path)?.id ?? "local")),
      selection: path && findNode(tree(), path) ? { selected: [path], anchor: path, focus: path } : f.selection,
    }));
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    // The current note may be in a folder that only now shows; focus falls back to the first row.
    setFiles((f) => ({ selection: keepShowing(f.selection, rowsOf(store.state)) }));
  };
  const close = () => setFiles((f) => ({ open: false, edit: undefined, confirm: undefined, move: { ...f.move, open: false }, recent: { ...f.recent, open: false } }));
  /** Docked: pinned, with room beside the note (D-187). Undocked for room, it behaves as an unpinned panel. */
  const docked = () => files().pinned && files().fits;
  /** What would close an undocked panel (opening a note, a new note): docked, it stays (D-161, D-187). */
  const dismiss = () => { if (!docked()) close(); };
  /** Docked, Mod+O moves focus into the tree rather than closing it (D-161). */
  commands.register({
    id: "files.open", title: "command.files.open", icon: "open", enabled: () => Boolean(ws),
    run: () => (docked() && files().open ? setFiles((f) => ({ focusRequest: f.focusRequest + 1 })) : files().open ? close() : reveal()),
  });
  commands.register<{ path: string }>({
    id: "files.reveal", title: "command.files.reveal", shortcut: { default: "Mod+Shift+E" }, layer: "power", group: "files",
    enabled: () => Boolean(ws), run: ({ path }) => reveal(typeof path === "string" && path ? path : undefined),
  });
  // Sorting (FIL-11, D-175): by name or by last change, remembered per device.
  for (const order of ["name", "changed"] as const) {
    commands.register({
      id: `files.sort.${order}`, title: `command.files.sort.${order}`, group: "files",
      checked: (s) => s.ui.files.sort === order,
      run: async () => {
        setFiles(() => ({ sort: order }));
        await ctx.persistAppState({ filesSort: order === "changed" ? "changed" : undefined });
      },
    });
  }
  // Esc in the panel: docked, the caret goes back to the note and the panel stays (D-161).
  commands.register({ id: "files.close", title: "command.files.close", run: () => (docked() ? ctx.editorAction("edit.focus") : close()) });
  // Mod+O in the panel: back to the note when docked; closes it otherwise, as Mod+O always has.
  commands.register({
    id: "files.focusNote", title: "command.files.focusNote", shortcut: { default: "Mod+O", handledBy: "files" }, layer: "basic", group: "files",
    run: () => (docked() ? ctx.editorAction("edit.focus") : close()),
  });
  // ---- docking (D-161, D-187): kept on this device ----
  const setPinned = (pinned: boolean) => {
    setFiles(() => ({ pinned }));
    void ctx.persistAppState({ filesPinned: pinned ? true : undefined });
  };
  commands.register({
    id: "files.togglePin", title: "command.files.togglePin", icon: "pin", shortcut: { default: "Mod+Alt+P" }, layer: "power", group: "files",
    enabled: () => Boolean(ws), checked: () => files().pinned,
    run: () => {
      const on = !files().pinned;
      if (on && !files().open) reveal();
      setPinned(on);
      announce(catalog.format(on ? "files.pinnedNow" : "files.unpinnedNow"));
    },
  });
  // The repository and the account on GitHub, in the browser (D-189): only through the shell, as every web link.
  const github = (path: string) => `https://github.com/${path.split("/").map(encodeURIComponent).join("/")}`;
  commands.register({
    id: "files.openRepo", title: "command.files.openRepo", icon: "github", group: "files",
    enabled: (s) => Boolean(bridge.openLink) && Boolean(s.workspace.repo),
    run: () => { const r = store.state.workspace.repo; if (r) bridge.openLink?.(github(r)); },
  });
  commands.register({
    id: "files.openProfile", title: "command.files.openProfile", icon: "github", group: "files",
    enabled: (s) => Boolean(bridge.openLink) && Boolean(s.account.login),
    run: () => { const l = store.state.account.login; if (l) bridge.openLink?.(github(l)); },
  });
  // Open local folder (D-188): where the notes are saved, in the system's file manager.
  commands.register({
    id: "files.revealFolder", title: "command.files.revealFolder", icon: "open", group: "files",
    enabled: (s) => Boolean(ws?.reveal) && Boolean(s.workspace.folder),
    run: async () => {
      try {
        await ws!.reveal!();
      } catch {
        toast(catalog.format("toast.revealFolderFailed"), { tone: "error" });
      }
    },
  });
  // The window narrowed past what Files, the docked contents and the note's narrowest text need: Files
  // undocks first, closing as an undocked panel does; with room again, it docks and opens on its own,
  // without taking the caret (D-187). The canvas measures the room and says so.
  commands.register<{ fits: boolean }>({
    id: "files.setFits", title: "files.resize",
    run: ({ fits }) => {
      const next = fits !== false;
      if (next === files().fits) return;
      setFiles(() => ({ fits: next }));
      if (!files().pinned || !ws) return;
      if (!next && files().open) close();
      else if (next && !files().open) reveal(undefined, false);
    },
  });
  // Resized by dragging its edge or with the arrow keys on it (D-187): kept on this device.
  commands.register<{ width: number }>({
    id: "files.setWidth", title: "files.resize",
    run: ({ width }) => {
      if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return;
      const w = Math.round(width);
      setFiles(() => ({ width: w }));
      void ctx.persistAppState({ filesWidth: w });
    },
  });

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
    // Opening a note closes the panel (DD-FILES-01), unless it's pinned (D-161).
    dismiss();
    if (store.state.note.path !== row.path) await ctx.load(row.path);
  };
  commands.register<{ id: string }>({ id: "files.activate", title: "command.files.openItem", run: ({ id }) => activate(String(id)) });
  commands.register({
    id: "files.openItem", title: "command.files.openItem", shortcut: { macos: "Mod+Down", default: "Enter", handledBy: "filesTree" }, layer: "basic", group: "files",
    run: () => activate(files().selection.focus),
  });

  // ---- links that follow renames and moves (FIL-09, D-95) ----
  /**
   * The open note's text, for a batch that rewrites it: the editor's, which by now is what's saved.
   * Not saved (it changed outside and waits for a choice, or its save failed), a batch that would
   * rewrite it is refused: its links are never written from unsaved text, nor over the other version
   * (DEF-26).
   */
  const unsavedOpen = (): Error | undefined => {
    const n = store.state.note;
    return n.saveState === "saved" ? undefined : new Error(n.path && ctx.holds?.(n.path) ? "changed" : "failed");
  };
  const openText = (): Promise<string> => {
    const no = unsavedOpen();
    return no ? Promise.reject(no) : Promise.resolve(store.state.note.markdown);
  };
  /** A note's text for link updates. The open note's is the editor's (checked once planned: refusedIfOpen). */
  const readForLinks = (own?: { path: string; text: string }) => (p: string): Promise<string> =>
    own && p === own.path ? Promise.resolve(own.text) : p === store.state.note.path ? Promise.resolve(store.state.note.markdown) : bridge.readNote(p);
  /** Planned rewrites that include the open note while it isn't saved: the batch is refused. */
  const refusedIfOpen = (writes: readonly LinkWrite[]) => {
    const open = store.state.note.path;
    const no = open && writes.some((w) => w.from === open) ? unsavedOpen() : undefined;
    if (no) throw no;
  };
  /** Each rewrite carries the text it was made from: the shell writes nothing over a change since (DEF-26). */
  const writeOps = (writes: readonly LinkWrite[]): WorkspaceOp[] => writes.map((w) => ({ op: "write", path: w.path, text: w.text, before: w.before }));
  /** After the batch, the open note shows its new links, keeping anything typed while it was written. */
  const followLinks = (writes: readonly LinkWrite[], moves: readonly PathMove[], before: WorkspaceTree) => {
    const n = store.state.note;
    const w = writes.find((x) => x.path === n.path);
    if (!w) return;
    const same = n.markdown === w.before;
    ctx.sawOnDisk?.(w.path, w.text);
    const text = same ? w.text : rewriteLinks(n.markdown, w.from, w.path, moves, sameRootOf(before)).text;
    ctx.setNote({ key: `${w.path}#links-${Date.now()}`, initialMarkdown: text, markdown: text, saveState: same ? "saved" : "unsaved" });
    ctx.loaded(w.path, text);
  };
  /** The toast says how many other notes changed (UC-FILE-07). */
  const withLinks = (done: string, writes: readonly LinkWrite[]) => (writes.length ? catalog.format("files.linksUpdated", { done, count: writes.length }) : done);

  // ---- Undo (DD-FB-01): the toast's action puts the change back ----
  const undos = new Map<number, () => Promise<void>>();
  let undoId = 0;
  const undoAction = (fn: () => Promise<void>) => {
    undos.set(++undoId, fn);
    // Toasts with Undo stay 10 s and at most two show; older ones can't be undone any more.
    for (const k of [...undos.keys()].slice(0, -4)) undos.delete(k);
    return { command: "files.undo", label: catalog.format("files.undo"), args: { n: undoId } };
  };
  commands.register<{ n: number }>({
    id: "files.undo", title: "command.files.undo",
    run: async ({ n }) => {
      const fn = undos.get(Number(n));
      undos.delete(Number(n));
      if (fn) await fn();
    },
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
  async function perform(next: WorkspaceTree, ops: WorkspaceOp[], o: {
    touched: string[]; moves?: { from: string; to: string }[]; deletes?: string[]; select?: string[]; done: string; failed: (why: string) => string; open?: string[];
    /** Puts it back: offered as the toast's Undo once the change is saved (DD-FB-01). */
    undo?: () => Promise<void>;
  }) {
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
    const done = queue.catch(() => {}).then(() => ctx.exclusive(async (): Promise<LinkWrite[]> => {
      // Links in other notes, and in the moved notes themselves, change in the same batch (FIL-09).
      const writes = await planLinkWrites(before, moves, readForLinks());
      refusedIfOpen(writes);
      await ws!.apply!([...ops, ...writeOps(writes)]);
      if (moves.length) ctx.notesMoved?.(moves);
      // The open note follows a move; a deleted one is closed after.
      const p = store.state.note.path;
      if (p && moves.length) {
        const to = rebase(p, moves);
        if (to !== p) {
          ctx.moved?.(p, to);
          store.update((s) => ({ ...s, note: { ...s.note, path: to } }));
          if (sourceOf(to) !== "private") await ctx.persistAppState({ lastNotePath: to });
        }
      }
      followLinks(writes, moves, before);
      return writes;
    }));
    queue = done;
    try {
      const writes = await done;
      setFiles((f) => ({ pending: f.pending.filter((x) => !o.touched.includes(x)) }));
      const p = store.state.note.path;
      if (p && o.deletes?.some((d) => p === d || p.startsWith(d + "/") || p.startsWith(d + "\\"))) {
        // Nothing of the deleted note may be written again.
        ctx.setNote({ path: undefined, saveState: "saved" });
        await ctx.load(await bridge.defaultNotePath());
      }
      toast(withLinks(o.done, writes), o.undo ? { action: undoAction(o.undo) } : {});
      announce(withLinks(o.done, writes));
      // Recently deleted is listed again the next time it opens.
      if (o.deletes?.length) setFiles((f) => ({ recent: { ...f.recent, notes: undefined } }));
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
    // Into the other section changes who can see it, so it asks first (DD-FILES-08).
    const to = rootOf(tree(), dest)?.id;
    if (plan.crossesVisibility && (to === "public" || to === "private")) {
      return setFiles(() => ({ confirm: { kind: "visibility", to, paths, dest, name: what } }));
    }
    if (!plan.moves.length) return;
    void perform(plan.tree, plan.moves.map((m) => ({ op: "move" as const, from: m.from, to: m.to })), {
      touched: plan.moves.map((m) => m.to), moves: plan.moves, open: dest === rootOf(tree(), dest)?.path ? [] : [dest],
      done: catalog.format("files.moved", { what, where }),
      failed: (why) => catalog.format("files.moveFailed", { what, reason: why }),
      undo: () => moveBack(plan.moves, what),
    });
  }
  /** Undo for a move: each item back to the folder it came from, as one batch that updates links again. */
  async function moveBack(moves: readonly { from: string; to: string }[], what: string): Promise<void> {
    let t = tree();
    const back: { from: string; to: string }[] = [];
    for (const m of moves) {
      const p = planMove(t, [m.to], dirOf(m.from));
      if (p.kind === "refused") return void refused("files.undoFailed", { what }, p.reason);
      t = p.tree;
      back.push(...p.moves);
    }
    await perform(t, back.map((m) => ({ op: "move" as const, from: m.from, to: m.to })), {
      touched: back.map((m) => m.to), moves: back, done: catalog.format("files.movedBack", { what }),
      failed: (why) => catalog.format("files.undoFailed", { what, reason: why }),
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
      // Restore to… stays in the note's own section: a restore never changes who can see it (FIL-10).
      .filter((d) => !m.restore || d.root.id === from?.id)
      .map((d) => {
        const label = d.depth === 0 ? rootLabel(d.root.id) : d.name;
        const where = d.depth === 0 ? "" : rootLabel(d.root.id) + " · " + dirOf(d.path).slice(d.root.path.length).replace(/^[\\/:]+/, "").replace(/\\/g, "/");
        // Into the other section changes who can see it: said here, and confirmed after (DD-FILES-08).
        const other = from && d.root.id !== from.id;
        const description = where.replace(/ · $/, "");
        const item: { id: string; label: string; description: string; icon: string; disabled?: boolean } = {
          id: d.path, label, description: other ? catalog.format("files.otherRoot", { where: description || label }) : description, icon: d.depth === 0 ? "open" : "folder",
        };
        return item;
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
      const { paths, restore } = files().move;
      setFiles((f) => ({ move: { ...f.move, open: false, restore: undefined }, focusRequest: f.focusRequest + 1 }));
      if (restore) return void doRestore([restore], dest);
      doMove(paths, dest);
    },
  });
  commands.register({ id: "move.chooseActive", title: "command.move.choose", shortcut: { default: "Enter", handledBy: "moveField" }, layer: "power", group: "files", run: (_a, c) => c.run("move.choose", { id: "" }) });
  commands.register<{ open: boolean }>({ id: "move.setOpen", title: "command.files.moveTo", run: ({ open }) => { if (!open) setFiles((f) => ({ move: { ...f.move, open: false, restore: undefined }, focusRequest: f.focusRequest + 1 })); } });

  // ---- deleting (FIL-01, FIL-02) ----
  function doDelete(paths: string[]): void {
    const plan = planDelete(tree(), paths);
    const what = whatOf(paths);
    if (plan.kind === "refused") return void refused("files.deleteFailed", { what }, plan.reason);
    // Folders that go with it, parent first, so Undo can put notes back where they were.
    const folders = [...walk(tree())].filter((x) => x.node.kind === "folder" && paths.some((p) => isWithin(p, x.path))).map((x) => x.path).sort((a, b) => a.length - b.length);
    void perform(plan.tree, paths.map((path) => ({ op: "delete" as const, path })), {
      touched: [], deletes: paths,
      done: catalog.format(bridge.platform === "web" ? "files.deleted" : "files.trashed", { what }),
      failed: (why) => catalog.format("files.deleteFailed", { what, reason: why }),
      // With Git, a delete is a commit, so Undo restores it from history (FIL-10).
      ...(canRestore(store.state) ? { undo: () => undelete(paths, folders, what) } : {}),
    });
  }
  /** Undo for a delete: its folders made again, then its notes restored from history where they were. */
  async function undelete(paths: readonly string[], folders: readonly string[], what: string): Promise<void> {
    try {
      await ctx.exclusive(async () => {
        const ids = (await ws!.deleted!()).filter((d) => paths.some((p) => isWithin(p, d.path))).map((d) => d.id);
        if (folders.length) await ws!.apply!(folders.map((path) => ({ op: "createFolder" as const, path })));
        if (ids.length) await ws!.restore!(ids);
      });
      await rescan();
      setFiles((f) => ({ recent: { ...f.recent, notes: undefined } }));
      const done = catalog.format("files.restored", { what });
      toast(done);
      announce(done);
    } catch (e) {
      await rescan();
      refused("files.undoFailed", { what }, opErrorCode(e));
    }
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
      if (plan.ask) return setFiles(() => ({ confirm: { kind: "delete", paths, notes: plan.notes.length, name: what } }));
      doDelete(paths);
    },
  });
  commands.register({
    id: "files.confirm", title: "command.files.confirm",
    run: () => {
      const c = files().confirm;
      setFiles((f) => ({ confirm: undefined, focusRequest: f.focusRequest + 1 }));
      if (c?.kind === "delete") doDelete(c.paths);
      else if (c?.kind === "visibility") doVisibility(c.paths, c.to, c.dest);
    },
  });
  commands.register<{ open: boolean }>({ id: "files.setConfirmOpen", title: "command.files.confirm", run: ({ open }) => { if (!open) setFiles((f) => ({ confirm: undefined, focusRequest: f.focusRequest + 1 })); } });

  // ---- duplicating (FIL-11's duplicate, D-162) ----
  /**
   * The notes Duplicate copies: with the panel open, the selection's notes when the focused row is in it,
   * else the focused note; from elsewhere (Spotlight), the open note.
   */
  const duplicateTargets = (s: AppState): string[] => {
    const f = s.ui.files;
    if (!f.open) return s.note.path && findNode(s.workspace.tree, s.note.path) && !rootOf(s.workspace.tree, s.note.path)?.readOnly ? [s.note.path] : [];
    const rows = rowsOf(s);
    return actedOn(f.selection, f.selection.focus).map((id) => rows.find((r) => r.id === id)).filter((r): r is FileRow => r?.kind === "note" && !r.readOnly).map((r) => r.path);
  };
  async function doDuplicate(paths: string[]): Promise<void> {
    if (!paths.length || !canWrite(store.state)) return;
    const what = whatOf(paths);
    const failed = (why: string) => catalog.format("files.duplicateFailed", { what, reason: why });
    let t = tree();
    const copies: { path: string; title: string; text: string }[] = [];
    try {
      for (const p of paths) {
        const found = findNode(t, p);
        if (!found || found.node.kind !== "note") continue;
        // Clear of the titles beside it, copies made just now included.
        const beside = findNode(t, p)!.parent.filter((n) => n.kind === "note").map(titleOfNode);
        const title = copyTitle(titleOfNode(found.node), beside, (name, n) => catalog.format(n === 1 ? "files.copyTitle" : "files.copyTitleN", { title: name, n }));
        const plan = planCreateNote(t, dirOf(p), title);
        if (plan.kind === "refused") return void toast(failed(reason(plan.reason)), { tone: "error" });
        const text = p === store.state.note.path ? store.state.note.markdown : await bridge.readNote(p);
        t = applyChanges(plan.tree, [{ path: plan.path, kind: "note", exists: true, title }]);
        copies.push({ path: plan.path, title, text: retitle(withoutNoteId(text), title) });
      }
    } catch (e) {
      return void toast(failed(reason(opErrorCode(e))), { tone: "error" });
    }
    if (!copies.length) return;
    const made = copies.map((c) => c.path);
    await perform(t, copies.map((c) => ({ op: "create" as const, path: c.path, text: c.text })), {
      touched: made, select: made, done: catalog.format("files.duplicated", { what }), failed,
      undo: () => removeCopies(made),
    });
  }
  /** Undo for Duplicate: the copies go, as one more batch. */
  async function removeCopies(paths: readonly string[]): Promise<void> {
    const what = whatOf(paths);
    const plan = planDelete(tree(), paths);
    if (plan.kind === "refused") return void refused("files.undoFailed", { what }, plan.reason);
    await perform(plan.tree, paths.map((path) => ({ op: "delete" as const, path })), {
      touched: [], deletes: [...paths], done: catalog.format("files.copyRemoved", { what }),
      failed: (why) => catalog.format("files.undoFailed", { what, reason: why }),
    });
  }
  commands.register({
    id: "files.duplicate", title: "command.files.duplicate", icon: "copy", group: "files",
    enabled: (s) => canWrite(s) && duplicateTargets(s).length > 0,
    run: () => doDuplicate(duplicateTargets(store.state)),
  });

  // ---- importing files (FIL-15, D-210) ----
  /**
   * Import files…: the shell asks for Markdown, text, HTML or Word files and reads them; each becomes
   * a new note in the folder the menu opened on, as one batch with an Undo. Nothing is replaced: a
   * name that's taken is numbered.
   */
  async function doImport(): Promise<void> {
    const s = store.state;
    const toMarkdown = ctx.htmlToMarkdown;
    if (!canWrite(s) || !ws?.chooseImport || !ws.readImport || !toMarkdown) return;
    const folder = targetFolder(tree(), rowsOf(s), files().selection.focus, s.note.path);
    if (folder === undefined) return;
    const where = catalog.format("files.quoted", { name: folderLabel(folder) });
    const failed = (why: string) => catalog.format("files.importFailed", { where, reason: why });
    let read: { files: { name: string; kind: "markdown" | "text" | "html"; text: string }[]; skipped: string[] };
    try {
      const chosen = await ws.chooseImport();
      if (!chosen) return;
      const work = () => ws.readImport!(chosen.id);
      read = await (ctx.tracker ? ctx.tracker.run("files.import", "task.importing", work) : work());
    } catch (e) {
      return void toast(failed(reason(opErrorCode(e))), { tone: "error" });
    }
    const skipped = read.skipped.length === 1 ? catalog.format("files.quoted", { name: read.skipped[0]! }) : catalog.format("files.fileCount", { count: read.skipped.length });
    if (!read.files.length) return void toast(catalog.format("files.importNone", { what: skipped }), { tone: "error" });
    let t = tree();
    const made: { path: string; title: string; text: string }[] = [];
    for (const f of read.files) {
      const note = importedNote(f, toMarkdown, catalog.format("files.importUntitled"));
      const plan = planCreateNote(t, folder, note.title);
      if (plan.kind === "refused") return void toast(failed(reason(plan.reason)), { tone: "error" });
      t = applyChanges(plan.tree, [{ path: plan.path, kind: "note", exists: true, title: note.title }]);
      made.push({ path: plan.path, ...note });
    }
    const paths = made.map((m) => m.path);
    const what = made.length === 1 ? catalog.format("files.quoted", { name: made[0]!.title }) : catalog.format("files.noteCount", { count: made.length });
    const root = rootOf(t, folder);
    if (root && folder !== root.path) setExpanded(folder, true);
    else if (root) setExpanded(rootRowId(root.id), true);
    await perform(t, made.map((m) => ({ op: "create" as const, path: m.path, text: m.text })), {
      touched: paths, select: paths,
      done: read.skipped.length ? catalog.format("files.importedSome", { what, where, skipped }) : catalog.format("files.imported", { what, where }),
      failed, undo: () => removeCopies(paths),
    });
  }
  commands.register({
    id: "files.import", title: "command.files.import", icon: "import", group: "files",
    enabled: (s) => canWrite(s) && Boolean(ws?.chooseImport && ws.readImport && ctx.htmlToMarkdown),
    run: () => doImport(),
  });
  // Copy public link for the focused row (SHR-03): the same link and reasons as the open note's.
  const focusedPath = (s: AppState) => rowsOf(s).find((r) => r.id === s.ui.files.selection.focus)?.path;
  commands.register({
    id: "files.copyPublicLink", title: "command.note.copyPublicLink", icon: "link", group: "files",
    enabled: (s) => Boolean(bridge.copyText) && !publicLinkReason(s, focusedPath(s)),
    disabledReason: (s) => publicLinkReason(s, focusedPath(s)) ?? "spotlight.reason.noClipboard",
    run: async () => { await copyPublicLink({ store, commands, catalog, bridge, toast }, focusedPath(store.state)); },
  });
  // Open containing folder (D-192): a note, in the system's file manager at its folder, selected.
  // A folder or a section opens itself: Open in File Explorer, Finder or the file manager. One key does whichever fits.
  const focusedRow = (s: AppState) => rowsOf(s).find((r) => r.id === s.ui.files.selection.focus);
  const opensFolder = (r: FileRow | undefined) => Boolean(r && r.kind !== "note");
  const openFolderAt = async (path: string) => {
    try {
      await ws!.openFolder!(path);
    } catch {
      toast(catalog.format("toast.revealItemFailed"), { tone: "error" });
    }
  };
  commands.register<{ path?: string }>({
    id: "files.revealItem", title: "command.files.revealItem", icon: "open",
    shortcut: { macos: "Mod+Alt+R", default: "Shift+Alt+R", handledBy: "files" }, layer: "pro", group: "files",
    enabled: (s) => {
      const r = focusedRow(s);
      return Boolean(r) && (opensFolder(r) ? Boolean(ws?.openFolder) : Boolean(ws?.revealItem));
    },
    run: async (a) => {
      const r = focusedRow(store.state);
      const path = typeof a?.path === "string" && a.path ? a.path : r?.path;
      if (!path) return;
      if (!(typeof a?.path === "string" && a.path) && opensFolder(r)) {
        if (ws?.openFolder) await openFolderAt(path);
        return;
      }
      if (!ws?.revealItem) return;
      try {
        await ws.revealItem(path);
      } catch {
        toast(catalog.format("toast.revealItemFailed"), { tone: "error" });
      }
    },
  });
  const fileManager = bridge.platform === "macos" ? "macos" : bridge.platform === "linux" ? "linux" : "windows";
  commands.register<{ path?: string }>({
    id: "files.openFolderItem", title: `command.files.openFolderItem.${fileManager}`, icon: "open", group: "files",
    enabled: (s) => Boolean(ws?.openFolder) && opensFolder(focusedRow(s)),
    run: async (a) => {
      const path = typeof a?.path === "string" && a.path ? a.path : focusedRow(store.state)?.path;
      if (path && ws?.openFolder) await openFolderAt(path);
    },
  });
  // Copy, Copy as path and Copy text (D-192): what's acted on (the selection, else the focused row), as a file manager copies.
  const actedRows = (s: AppState): FileRow[] => {
    const rows = rowsOf(s);
    const focus = rows.find((r) => r.id === s.ui.files.selection.focus);
    if (!focus) return [];
    const acted = actedOn(s.ui.files.selection, focus.id).map((id) => rows.find((r) => r.id === id)).filter((r): r is FileRow => Boolean(r));
    return acted.length ? acted : [focus];
  };
  const rowsWhat = (rows: readonly FileRow[]) => (rows.length === 1
    ? catalog.format("files.quoted", { name: rows[0]!.kind === "root" ? rootLabel(rows[0]!.rootId) : rows[0]!.label })
    : catalog.format("files.items", { count: rows.length }));
  const fileRows = (s: AppState) => actedRows(s).filter((r) => r.kind !== "root");
  commands.register({
    id: "files.copyItem", title: "command.files.copyItem", icon: "copy",
    shortcut: { default: "Mod+C", handledBy: "filesTree" }, layer: "basic", group: "files",
    enabled: (s) => Boolean(ws?.copyItems) && fileRows(s).length > 0,
    run: async () => {
      const rows = fileRows(store.state);
      if (!rows.length || !ws?.copyItems) return;
      const work = () => ws.copyItems!(rows.map((r) => r.path));
      try {
        await (ctx.tracker ? ctx.tracker.run("files.copyItem", "task.copying", work) : work());
        toast(catalog.format("files.copiedItems", { what: rowsWhat(rows) }));
      } catch {
        toast(catalog.format("toast.copyItemsFailed"), { tone: "error" });
      }
    },
  });
  commands.register({
    id: "files.copyPath", title: "command.files.copyPath", icon: "copy",
    shortcut: { macos: "Mod+Alt+C", default: "Shift+Alt+C", handledBy: "files" }, layer: "pro", group: "files",
    enabled: (s) => Boolean(ws?.revealItem) && Boolean(bridge.copyText) && actedRows(s).length > 0,
    run: async () => {
      const rows = actedRows(store.state);
      if (!rows.length || !bridge.copyText) return;
      try {
        await bridge.copyText(rows.map((r) => r.path).join("\n"));
        toast(rows.length === 1 ? catalog.format("files.copiedPath", { what: rowsWhat(rows) }) : catalog.format("files.copiedPaths", { count: rows.length }));
      } catch {
        toast(catalog.format("toast.copyFailed"), { tone: "error" });
      }
    },
  });
  const textRow = (s: AppState) => {
    const rows = actedRows(s);
    return rows.length === 1 && rows[0]!.kind === "note" ? rows[0] : undefined;
  };
  commands.register({
    id: "files.copyText", title: "command.files.copyText", icon: "copy", group: "files",
    enabled: (s) => Boolean(bridge.copyText) && Boolean(textRow(s)),
    run: async () => {
      const row = textRow(store.state);
      if (!row || !bridge.copyText) return;
      try {
        // The open note's text is the editor's, unsaved edits too; the app's own `id` line stays behind.
        const note = store.state.note;
        const text = note.path === row.path ? note.markdown : await bridge.readNote(row.path);
        await bridge.copyText(withoutNoteId(text));
        toast(catalog.format("files.copiedText", { what: rowsWhat([row]) }));
      } catch {
        toast(catalog.format("toast.copyFailed"), { tone: "error" });
      }
    },
  });

  // ---- who can see a note: Make public, Make private (FIL-06, SHR-01, SHR-02) ----
  /** The items a visibility change acts on: the Files selection while the panel is open, else the open note. */
  // A public note held out of Git says so (D-158): not backed up yet, or kept on this computer.
  const publicDescription = (s: AppState, path: string) =>
    catalog.format(s.ui.held.held.waiting.includes(path) ? "held.pill.waiting" : s.ui.held.held.local.includes(path) ? "held.pill.local" : "files.public");
  const visibilityTargets = (s: AppState): string[] => {
    const f = s.ui.files;
    const t = s.workspace.tree;
    if (f.open) return topLevel(actedOn(f.selection, f.selection.focus)).filter((p) => findNode(t, p));
    return s.note.path && findNode(t, s.note.path) ? [s.note.path] : [];
  };
  /** Whether anything acted on can go to the other root: a workspace with both, written here. */
  const canMake = (s: AppState, to: "public" | "private") => {
    const t = s.workspace.tree;
    if (!canWrite(s) || !t.roots.some((r) => r.id === to && !r.readOnly)) return false;
    return visibilityTargets(s).some((p) => { const v = visibilityOf(t, p); return v !== undefined && v !== to && !(to === "private" && v === "shared"); });
  };
  /** Moves between the roots once confirmed: one batch, one commit in each repository, private first (D-97). */
  function doVisibility(paths: string[], to: "public" | "private", dest?: string): void {
    const what = whatOf(paths);
    const failed = (why: string) => catalog.format(to === "public" ? "files.makePublicFailed" : "files.makePrivateFailed", { what, reason: why });
    const plan = dest === undefined ? planVisibility(tree(), paths, to) : planMove(tree(), paths, dest);
    if (plan.kind === "refused") return void toast(failed(reason(plan.reason)), { tone: "error" });
    if (!plan.moves.length) return;
    void perform(plan.tree, plan.moves.map((m) => ({ op: "move" as const, from: m.from, to: m.to })), {
      touched: plan.moves.map((m) => m.to), moves: plan.moves,
      open: [...new Set(plan.moves.flatMap((m) => ancestorsOf(plan.tree, m.to)))],
      done: catalog.format(to === "public" ? "files.madePublic" : "files.madePrivate", { what }),
      failed,
    });
    // The section it went to opens, so it's seen where it is now.
    setFiles((f) => ({ collapsed: f.collapsed.filter((c) => c !== rootRowId(to)) }));
  }
  for (const to of ["public", "private"] as const) {
    commands.register({
      id: to === "public" ? "files.makePublic" : "files.makePrivate", title: to === "public" ? "command.files.makePublic" : "command.files.makePrivate",
      icon: to === "public" ? "share" : "lock", group: "files",
      enabled: (s) => canMake(s, to),
      run: () => {
        const t = tree();
        const paths = visibilityTargets(store.state).filter((p) => { const v = visibilityOf(t, p); return v !== undefined && v !== to; });
        if (!paths.length) return;
        // Always confirmed, whichever way (DD-FILES-08), so the audience never changes by accident.
        store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
        setFiles(() => ({ confirm: { kind: "visibility", to, paths, name: whatOf(paths) } }));
      },
    });
  }

  // ---- Recently deleted (FIL-10) ----
  /** Restoring needs Git history: a desktop workspace with a repository. */
  const canRestore = (s: AppState) => Boolean(ws?.deleted && ws.restore && ws.apply) && s.sync.git && s.workspace.access === "write";
  const recent = () => files().recent;
  const setRecent = (patch: Partial<FilesState["recent"]>) => setFiles((f) => ({ recent: { ...f.recent, ...patch } }));
  async function listDeleted(): Promise<void> {
    setRecent({ loading: true });
    const notes = await ws!.deleted!().catch(() => [] as DeletedNote[]);
    setRecent({ loading: false, notes });
  }
  commands.register({
    id: "files.showDeleted", title: "command.files.showDeleted", icon: "history",
    enabled: canRestore,
    run: async () => {
      if (!files().open) reveal();
      setFiles((f) => ({ edit: undefined, recent: { ...f.recent, open: true, focus: f.recent.focus + 1 } }));
      await listDeleted();
    },
  });
  commands.register({ id: "files.hideDeleted", title: "command.files.hideDeleted", run: () => setFiles((f) => ({ recent: { ...f.recent, open: false }, focusRequest: f.focusRequest + 1 })) });
  // The footer's button shows the list and goes back to the tree, so focus stays on it.
  commands.register({ id: "files.toggleDeleted", title: "command.files.showDeleted", enabled: canRestore, run: (_a, c) => c.run(recent().open ? "files.hideDeleted" : "files.showDeleted") });
  const deletedNote = (id: string) => recent().notes?.find((n) => n.id === id);
  /** Puts deleted notes back, in place or in a chosen folder of their section, in one commit (FIL-10). */
  async function doRestore(ids: string[], folder?: string): Promise<void> {
    const notes = ids.map(deletedNote).filter((n): n is DeletedNote => Boolean(n));
    const what = notes.length === 1 ? catalog.format("files.quoted", { name: notes[0]!.title }) : catalog.format("files.items", { count: ids.length });
    try {
      const back = await ctx.exclusive(() => ws!.restore!(ids, folder));
      setTree(applyChanges(tree(), back.map((r) => ({ path: r.path, kind: "note" as const, exists: true, title: r.title }))));
      // Back in the tree, where it was put, selected and focused (Files → Deleting and restoring).
      setFiles((f) => ({
        recent: { ...f.recent, open: false, notes: f.recent.notes?.filter((n) => !ids.includes(n.id)) },
        expanded: [...new Set([...f.expanded, ...back.flatMap((r) => ancestorsOf(tree(), r.path))])],
        selection: back[0] ? { selected: back.map((r) => r.path), anchor: back[0].path, focus: back[0].path } : f.selection,
        focusRequest: f.focusRequest + 1,
      }));
      const where = back[0] ? folderLabel(dirOf(back[0].path)) : "";
      const done = catalog.format("files.restoredTo", { what, where: catalog.format("files.quoted", { name: where }) });
      toast(done);
      announce(done);
    } catch (e) {
      refused("files.restoreFailed", { what }, opErrorCode(e));
    }
  }
  commands.register<{ id: string }>({ id: "files.restore", title: "command.files.restore", enabled: canRestore, run: ({ id }) => doRestore([String(id)]) });
  commands.register<{ id: string }>({
    id: "files.restoreTo", title: "command.files.restoreTo", enabled: canRestore,
    run: ({ id }) => {
      const n = deletedNote(String(id));
      if (!n) return;
      setMove({ open: true, query: "", paths: [n.path], restore: n.id, focus: files().move.focus + 1, activeId: "" });
      setMove({ activeId: firstEnabled(store.state) });
    },
  });

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
  /**
   * A note's name is its title: the H1 changes, and the file name follows unless published (FIL-07).
   * The new text, the new name, and the links to it are one batch (FIL-09).
   */
  async function renameNote(path: string, title: string): Promise<void> {
    let others: LinkWrite[] = [];
    try {
      await ctx.exclusive(async () => {
        const isOpen = store.state.note.path === path;
        const text = isOpen ? await openText() : await bridge.readNote(path);
        const next = retitle(text, title);
        const before = tree();
        const plan = planRename(before, path, title);
        const to = plan?.kind === "renamed" ? plan.to : path;
        const moves = to === path ? [] : [{ from: path, to }];
        const writes = await planLinkWrites(before, moves, readForLinks({ path, text: next }));
        refusedIfOpen(writes.filter((w) => w.from !== path));
        const own = writes.find((w) => w.from === path)?.text ?? next;
        others = writes.filter((w) => w.from !== path);
        await ws!.apply!([...moves.map((m) => ({ op: "move" as const, ...m })), { op: "write", path: to, text: own, before: text }, ...writeOps(others)]);
        if (moves.length) ctx.notesMoved?.(moves);
        if (plan?.kind === "renamed") setTree(plan.tree);
        setTree(applyChanges(tree(), [{ path: to, kind: "note", exists: true, title }]));
        setFiles((f) => ({ selection: { selected: [to], anchor: to, focus: to } }));
        if (isOpen) {
          ctx.setNote({ path: to, key: `${to}#${Date.now()}`, initialMarkdown: own, markdown: own, saveState: "saved" });
          ctx.sawOnDisk?.(to, own);
          ctx.loaded(to, own);
          if (sourceOf(to) !== "private") await ctx.persistAppState({ lastNotePath: to });
        } else followLinks(others, moves, before);
      });
      const done = withLinks(catalog.format("files.renamed", { what: catalog.format("files.quoted", { name: title }) }), others);
      // Other notes changed too: that's said where it's seen.
      if (others.length) toast(done);
      announce(done);
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
      ["accessory", { type: "number" as const }],
      ...["expanded", "hasChildren", "selected", "current", "pending", "readOnly", "draggable", "droppable", "editing"].map((k) => [k, { type: "boolean" as const }]),
    ]),
  };
  const NO_ITEM = { id: "", label: "", shortcut: "", disabled: false };
  const NO_SOURCE = { visible: false, icon: "folder", title: "", login: "", hasLogin: false, label: "", revealable: false, repoLink: false, repoLabel: "", profileLink: false, profileLabel: "", titlePlain: false, loginPlain: false };
  /**
   * Where the notes come from (D-188): the notes repository (its name alone when the signed-in account owns it), the account
   * as @login, and whether its folder can be opened. A folder without a GitHub repository shows the folder's name.
   */
  const whereFrom = (s: AppState) => {
    const login = s.account.login;
    const repo = s.workspace.repo ?? "";
    const [owner = "", name = ""] = repo.split("/");
    const folder = (s.workspace.folder ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";
    const title = repo ? (login && owner.toLowerCase() === login.toLowerCase() ? name : repo) : folder;
    if (!title) return NO_SOURCE;
    const at = login ? catalog.format("files.source.login", { login }) : "";
    return {
      visible: true, icon: repo ? "github" : "folder", title, login: at, hasLogin: Boolean(at),
      label: catalog.format(at ? "files.source.label" : "files.source.labelLocal", { where: repo || folder, login: at }),
      revealable: Boolean(ws?.reveal) && Boolean(s.workspace.folder),
      // The name opens the repository, @login the profile, on GitHub (D-189).
      repoLink: Boolean(repo && bridge.openLink), repoLabel: repo ? catalog.format("files.source.openRepo", { repo }) : "",
      profileLink: Boolean(login && bridge.openLink), profileLabel: login ? catalog.format("files.source.openProfile", { login }) : "", titlePlain: !(repo && bridge.openLink), loginPlain: Boolean(at) && !bridge.openLink,
    };
  };
  const CLOSED = { source: NO_SOURCE, open: false, pinned: false, docked: false, width: 0, pinIcon: "pin", pinLabel: "", pinShortcut: "", menu: [], menuLabel: "", focusRequest: 0, items: [], focusId: "", editValue: "", editError: "", editLabel: "", filter: "", empty: false, emptyText: "", selectedCount: 0, multi: false, selectionText: "", newNote: NO_ITEM, newFolder: NO_ITEM, canMakePublic: false, canMakePrivate: false };
  const newNoteShortcut = () => (ctx.describeItem("note.new").shortcut as string | undefined) ?? "";
  /** The focused row's menu (D-162): its items as the ⋯ menu shows commands, and its name. */
  const menuOf = (s: AppState, rows: readonly FileRow[]) => {
    const f = s.ui.files;
    const focus = rows.find((r) => r.id === f.selection.focus);
    if (!focus) return { menu: [], menuLabel: "" };
    const acted = actedOn(f.selection, focus.id).map((id) => rows.find((r) => r.id === id)).filter((r): r is FileRow => Boolean(r));
    const roots = s.workspace.tree.roots;
    const both = ["public", "private"].every((id) => roots.some((r) => r.id === id && !r.readOnly));
    const item = (id: string) => {
      const d = ctx.describeItem(id);
      if (id === "files.openItem") return { ...d, label: catalog.format("files.menu.open") };
      // New note runs the app's own, so it shows that shortcut, as the header's button does.
      if (id === "files.newNote" && newNoteShortcut()) return { ...d, shortcut: newNoteShortcut() };
      return d;
    };
    const menu = rowMenu(focus, acted, {
      both, reveal: Boolean(ws?.revealItem), openFolder: Boolean(ws?.openFolder), paths: Boolean(ws?.revealItem) && Boolean(bridge.copyText), copyFiles: Boolean(ws?.copyItems), copyText: Boolean(bridge.copyText),
      importFiles: Boolean(ws?.chooseImport && ws.readImport && ctx.htmlToMarkdown),
    }).map((ids, i) => ({ id: `rowMenu${i}`, items: ids.map(item) }));
    const what = acted.length > 1 ? catalog.format("files.items", { count: acted.length }) : catalog.format("files.quoted", { name: focus.kind === "root" ? rootLabel(focus.rootId) : focus.label });
    return { menu, menuLabel: catalog.format("files.menuLabel", { what }) };
  };
  viewModels.register({
    id: "vm.files",
    schema: {
      type: "object",
      properties: {
        source: { type: "object", properties: { visible: { type: "boolean" }, icon: { type: "string", enum: ["github", "folder"] }, title: { type: "string" }, login: { type: "string" }, hasLogin: { type: "boolean" }, repoLink: { type: "boolean" }, repoLabel: { type: "string" }, profileLink: { type: "boolean" }, profileLabel: { type: "string" }, titlePlain: { type: "boolean" }, loginPlain: { type: "boolean" }, label: { type: "string" }, revealable: { type: "boolean" } } },
        open: { type: "boolean" }, pinned: { type: "boolean" }, docked: { type: "boolean" }, width: { type: "number" }, pinIcon: { type: "string", enum: ["pin", "pinOff"] }, pinLabel: { type: "string" }, pinShortcut: { type: "string" },
        menu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } }, menuLabel: { type: "string" },
        focusRequest: { type: "number" }, items: { type: "array", items: TREE_ITEM }, focusId: { type: "string" },
        editValue: { type: "string" }, editError: { type: "string" }, editLabel: { type: "string" },
        filter: { type: "string" }, empty: { type: "boolean" }, emptyText: { type: "string" },
        selectedCount: { type: "number" }, multi: { type: "boolean" }, selectionText: { type: "string" },
        canMakePublic: { type: "boolean" }, canMakePrivate: { type: "boolean" },
        newNote: ctx.itemSchema, newFolder: ctx.itemSchema,
        sortLabel: { type: "string" }, sortMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } },
      },
    },
    setters: { filter: "files.setFilter", editValue: "files.setEditValue" },
    // The tree, the open note, and whether the workspace can be written (PRF-11). Cheap while closed.
    reads: ["ui.files", "workspace", "note.path", "ui.held", "account.login"],
    shows: (s) => (s.ui.files.open ? [{ kind: "tree" }] : []),
    select: (s) => {
      const f = s.ui.files;
      if (!f.open) return CLOSED;
      const rows = rowsOf(s);
      const selected = new Set(f.selection.selected);
      const pending = new Set(f.pending);
      const unsaved = new Set(f.unsaved);
      const writable = canWrite(s);
      const items: Record<string, unknown>[] = rows.map((r) => ({
        id: r.id, kind: r.kind === "root" ? "section" : r.kind, level: r.level,
        label: r.kind === "root" ? rootLabel(r.rootId) : r.label,
        description: r.readOnly ? catalog.format("files.readOnly") : r.kind === "note" && unsaved.has(r.path) ? catalog.format("files.unsaved")
          : r.rootId === "public" && r.kind === "note" ? publicDescription(s, r.path) : "",
        title: r.kind === "note" ? r.name : "", parent: r.parent ?? "",
        expanded: r.expanded, hasChildren: r.hasChildren, selected: selected.has(r.id), current: r.path === s.note.path && r.kind === "note",
        pending: pending.has(r.id), readOnly: r.readOnly,
        draggable: writable && !r.readOnly && r.kind !== "root", droppable: writable && !r.readOnly && r.kind !== "note",
        editing: f.edit?.kind === "rename" && f.edit.id === r.id,
        // Private and Public each carry their repository's backup at the trailing end (D-191).
        ...(r.kind === "root" && (r.rootId === "private" || r.rootId === "public") ? { accessory: r.rootId === "private" ? 0 : 1 } : {}),
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
      const pin = ctx.describeItem("files.togglePin");
      return {
        source: whereFrom(s),
        open: true, pinned: f.pinned, docked: f.pinned && f.fits, width: f.width ?? 0, pinIcon: f.pinned ? "pinOff" : "pin", pinLabel: catalog.format(f.pinned ? "files.unpin" : "files.pin"), pinShortcut: (pin.shortcut as string | undefined) ?? "",
        ...menuOf(s, rows),
        focusRequest: f.focusRequest, items, focusId: f.edit ? f.edit.id : f.selection.focus,
        editValue: f.edit?.value ?? "", editError: f.edit?.error ?? "",
        editLabel: catalog.format(f.edit?.kind === "newFolder" ? "files.folderName" : rows.find((r) => r.id === f.edit?.id)?.kind === "folder" ? "files.folderName" : "files.title"),
        filter: f.filter, empty: notes === 0,
        emptyText: f.filter.trim() ? catalog.format("files.noMatch", { query: f.filter.trim() }) : catalog.format("files.empty"),
        selectedCount: count, multi: count > 1, selectionText: catalog.format("files.selected", { count }),
        // The header's two buttons (D-123): New note shows the app's new-note shortcut it runs.
        newNote: { shortcut: "", ...ctx.describeItem("files.newNote"), ...(newNoteShortcut() ? { shortcut: newNoteShortcut() } : {}) },
        newFolder: { shortcut: "", ...ctx.describeItem("files.newFolder") },
        canMakePublic: canMake(s, "public"), canMakePrivate: canMake(s, "private"),
        // The header's sort button (D-175): Name or Last changed, the one in use checked.
        sortLabel: catalog.format("files.sortLabel", { order: catalog.format(`files.sort.${f.sort}`) }),
        sortMenu: [{ id: "sort", items: (["name", "changed"] as const).map((o) => ({ ...ctx.describeItem(`files.sort.${o}`), label: catalog.format(`files.sort.${o}`) })) }],
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
      const restoring = m.restore ? s.ui.files.recent.notes?.find((n) => n.id === m.restore) : undefined;
      const what = restoring ? catalog.format("files.quoted", { name: restoring.title }) : whatOf(m.paths);
      return {
        open: true, title: catalog.format(restoring ? "move.restoreTitle" : "move.title", { what }), query: m.query, activeId: m.activeId, focus: m.focus, items,
        summary: items.length ? catalog.format("move.count", { count: items.length }) : catalog.format("move.none"),
      };
    },
  });
  viewModels.register({
    id: "vm.confirm",
    schema: { type: "object", properties: { open: { type: "boolean" }, title: { type: "string" }, message: { type: "string" }, confirmLabel: { type: "string" }, danger: { type: "boolean" } } },
    reads: ["ui.files.confirm", "workspace.tree"],
    select: (s) => {
      const c = s.ui.files.confirm;
      if (!c) return { open: false, title: "", message: "", confirmLabel: "", danger: false };
      if (c.kind === "visibility") {
        // Making something public says who will read it; making it private says what it can't undo (Files and sharing → Changing visibility).
        const key = c.to === "public" ? "files.confirmPublic" : "files.confirmPrivate";
        return { open: true, title: catalog.format(`${key}.title`), message: catalog.format(`${key}.message`, { what: c.name }), confirmLabel: catalog.format(`${key}.action`), danger: false };
      }
      const pub = c.paths.some((p) => rootOf(s.workspace.tree, p)?.id === "public");
      return {
        open: true, title: catalog.format("files.confirm.title"), danger: true,
        message: catalog.format(pub ? "files.confirm.public" : "files.confirm.message", { what: c.name, notes: c.notes }),
        confirmLabel: catalog.format(pub ? "files.confirm.unpublish" : "files.confirm.delete", { notes: c.notes }),
      };
    },
  });

  // Recently deleted in the Files sheet: its footer, and the list that opens in place (Files → Deleting and restoring).
  const DELETED_NOTE = { type: "object" as const, properties: { id: { type: "string" as const }, title: { type: "string" as const }, description: { type: "string" as const } } };
  const dayLabel = (at: number, today: Date) => {
    const d = new Date(at);
    const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
    return days === 0 ? catalog.format("deleted.today") : days === 1 ? catalog.format("deleted.yesterday") : catalog.format("deleted.day", { at });
  };
  viewModels.register({
    id: "vm.deleted",
    schema: {
      type: "object",
      properties: {
        available: { type: "boolean" }, open: { type: "boolean" }, loading: { type: "boolean" }, footer: { type: "string" }, footerIcon: { type: "string", enum: ["history", "folder"] }, focus: { type: "number" },
        closed: { type: "boolean" },
        groups: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, notes: { type: "array", items: DELETED_NOTE } } } },
        empty: { type: "boolean" }, status: { type: "string" },
      },
    },
    reads: ["ui.files.recent", "ui.files.open", "sync.git", "workspace.access", "workspace.tree"],
    select: (s) => {
      const r = s.ui.files.recent;
      const available = s.ui.files.open && canRestore(s);
      const count = r.notes?.length;
      const footer = available ? catalog.format(count === undefined ? "deleted.footer" : "deleted.footerCount", { count: count ?? 0 }) : "";
      if (!available || !r.open) return { available, open: false, closed: true, loading: false, footer, footerIcon: "history", focus: r.focus, groups: [], empty: false, status: "" };
      const now = new Date();
      const groups = groupByDay(r.notes ?? []).map((g) => ({
        id: g.day, label: dayLabel(g.at, now),
        notes: g.notes.map((n) => ({
          id: n.id, title: n.title,
          description: n.folder ? catalog.format("deleted.where", { root: catalog.format(`files.root.${n.root}`), folder: n.folder, at: n.deletedAt })
            : catalog.format("deleted.whereRoot", { root: catalog.format(`files.root.${n.root}`), at: n.deletedAt }),
        })),
      }));
      return {
        // Back to the tree from the list (D-189): the footer says where it goes.
        available, open: true, closed: false, loading: r.loading, footer: catalog.format("deleted.browseFiles"), footerIcon: "folder", focus: r.focus, groups, empty: !r.loading && !groups.length,
        status: r.loading ? catalog.format("deleted.loading") : catalog.format("deleted.count", { count: count ?? 0 }),
      };
    },
  });

  return {
    /** At launch: the order chosen on this device (D-175). */
    restoreSort(sort: unknown): void {
      if (sort === "changed") setFiles(() => ({ sort: "changed" }));
    },
    /** At launch: a panel docked on this device opens, without taking the caret, at its width (D-161, D-187). */
    restorePinned(pinned: boolean | undefined, width?: number): void {
      if (typeof width === "number" && Number.isFinite(width) && width > 0) setFiles(() => ({ width: Math.round(width) }));
      if (!pinned || !ws) return;
      setFiles(() => ({ pinned: true }));
      reveal(undefined, false);
    },
    /** Where note.new puts a note while the panel is open, and closes it (Files → Creating). Undefined otherwise. */
    newNoteFolder(): string | undefined {
      const s = store.state;
      if (!s.ui.files.open) return undefined;
      const folder = targetFolder(tree(), rowsOf(s), s.ui.files.selection.focus, s.note.path);
      dismiss();
      return folder;
    },
    /** A note the app is about to write shows in the tree first (PRF-09). */
    created(path: string): void {
      setTree(applyChanges(tree(), [{ path, kind: "note", exists: true }]));
    },
    joinPath,
  };
}
