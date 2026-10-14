/**
 * The workspace in the app (WP-2.3): its format (DST-05), file names that follow titles (FIL-07),
 * and changes made outside the app reaching only the views that show them (PRF-11).
 */
import type { Store } from "./store.ts";
import type { CommandRegistry } from "./commands.ts";
import type { ViewModelRegistry, Content } from "./view-models.ts";
import type { MessageCatalog } from "./messages.ts";
import type { AppStateFile, PlatformBridge } from "./bridge.ts";
import type { AppState, ToastState } from "./app.ts";
import { isReadOnlyPath, sourceOf } from "./notes.ts";
import {
  applyChanges, buildTree, EMPTY_TREE, followsTitle, isWithin, planRename, stemOf, titleOfMarkdown,
  type WorkspaceChange, type WorkspaceTree,
} from "./workspace.ts";
import { planLinkWrites, rewriteLinks } from "./links.ts";
import { formatWorkspaceFile, migrateWorkspaceFile, MIGRATIONS, readWorkspaceFormat, WORKSPACE_FORMAT, type Migrations, type WorkspaceAccess, type WorkspaceFile } from "./workspace-format.ts";

export interface WorkspaceState {
  /** The workspace folder (desktop), `""` (browser), or undefined where the shell has none. */
  folder?: string;
  /** What this app may do with it (DST-05). Anything but "write" makes its notes read-only. */
  access: WorkspaceAccess;
  /** The newer format version found, for the message. */
  found?: number;
  tree: WorkspaceTree;
}
export const NO_WORKSPACE: WorkspaceState = { access: "write", tree: EMPTY_TREE };

/** The workspace format this app writes, and how to migrate older ones. Tests pass their own. */
export interface WorkspaceFormatOptions { current: number; migrations: Migrations }

/** Whether the open note can't be changed: an instance note (D-90), or a workspace this app mustn't write (DST-05). */
export function noteReadOnly(s: AppState): boolean {
  const path = s.note.path;
  if (isReadOnlyPath(path)) return true;
  return s.workspace.access !== "write" && s.workspace.folder !== undefined && path !== undefined && isWithin(s.workspace.folder, path);
}

const nameOf = (path: string) => path.split(/[\\/:]/).at(-1) ?? path;

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: ToastState["tone"]; action?: ToastState["action"] }) => number;
  setNote: (patch: Partial<AppState["note"]>) => void;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  format?: WorkspaceFormatOptions;
  /** The open note changed outside while it has unsaved edits: both versions go to the resolver (FIL-12). */
  outside?: (path: string, mine: string, theirs: string) => void;
  /** Asks the editor for text it hasn't handed over yet, at once (QLT-03). */
  handOver?: () => void;
}

export function registerWorkspaceFeatures(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge, toast, setNote, persistAppState } = ctx;
  const ws = bridge.workspace;
  const { current, migrations } = ctx.format ?? { current: WORKSPACE_FORMAT, migrations: MIGRATIONS };
  const setWorkspace = (patch: Partial<WorkspaceState>) => store.update((s) => ({ ...s, workspace: { ...s.workspace, ...patch } }));
  let pending: WorkspaceFile | undefined;

  // ---- the format (DST-05) ----
  const explain = () => {
    const w = store.state.workspace;
    if (w.access === "newer") toast(catalog.format("toast.workspaceNewer", { found: w.found ?? 0 }), { tone: "error" });
    else if (w.access === "unreadable") toast(catalog.format("toast.workspaceUnreadable"), { tone: "error" });
    // An older format is migrated only when the person agrees (DST-05).
    else if (w.access === "migrate") toast(catalog.format("toast.workspaceOlder"), { action: { command: "workspace.migrate", label: catalog.format("toast.workspaceUpdate") } });
  };
  async function checkFormat(): Promise<void> {
    if (!ws) return;
    const info = await ws.info().catch(() => undefined);
    // A workspace whose format can't even be asked for is treated as unreadable: nothing is written.
    const f = info ? readWorkspaceFormat(info.format, current, migrations) : { access: "unreadable" as const };
    pending = f.access === "migrate" ? f.file : undefined;
    const before = store.state.workspace;
    const found = f.access === "newer" ? f.found : undefined;
    if (before.access === f.access && before.found === found && before.folder === info?.folder) return;
    setWorkspace({ access: f.access, found, ...(info ? { folder: info.folder } : {}) });
    explain();
  }
  commands.register({
    id: "workspace.migrate", title: "command.workspace.migrate",
    enabled: (s) => s.workspace.access === "migrate",
    run: async () => {
      if (!ws || !pending) return;
      try {
        await ws.writeFormat(formatWorkspaceFile(migrateWorkspaceFile(pending, current, migrations)));
      } catch {
        toast(catalog.format("toast.workspaceUpdateFailed"), { tone: "error" });
        return;
      }
      pending = undefined;
      setWorkspace({ access: "write", found: undefined });
      toast(catalog.format("toast.workspaceUpdated"));
    },
  });
  // The bottom-left Read only pill: copy an instance note, update an older workspace, or say why.
  commands.register({
    id: "note.readOnlyAction", title: "command.note.readOnlyAction",
    run: async (_a, c) => {
      if (isReadOnlyPath(store.state.note.path)) return c.run("note.copyToLocal");
      if (store.state.workspace.access === "migrate") return c.run("workspace.migrate");
      explain();
    },
  });

  // ---- the tree and outside changes (PRF-11) ----
  let queued: WorkspaceChange[] | undefined = [];
  let lastWritten: { path: string; text: string } | undefined;
  let outside = 0;
  const setTree = (tree: WorkspaceTree) => { if (tree !== store.state.workspace.tree) setWorkspace({ tree }); };

  async function reconcile(path: string): Promise<void> {
    const text = await bridge.readNote(path).catch(() => undefined);
    if (text === undefined) return;
    // Typing the editor hasn't handed over yet is unsaved too: it must never be replaced (D-92).
    ctx.handOver?.();
    const n = store.state.note;
    if (n.path !== path || text === n.markdown) return;
    // What the app knows is on disk: its last save of the note, or the text it opened. The watcher
    // reports the app's own writes too (a save, or a new note's empty file): those changed nothing.
    if (text === (lastWritten?.path === path ? lastWritten.text : n.initialMarkdown)) return;
    if (n.saveState === "saved") {
      setNote({ key: `${path}#outside-${++outside}`, initialMarkdown: text, markdown: text });
      loaded(path, text);
      return;
    }
    // Unsaved edits are kept, and the next save waits for a choice between the two versions (FIL-12).
    if (ctx.outside) ctx.outside(path, n.markdown, text);
    else toast(catalog.format("toast.changedOutside", { note: stemOf(nameOf(path)) }));
  }

  function onChange(changes: WorkspaceChange[]): void {
    if (queued) queued.push(...changes);
    else setTree(applyChanges(store.state.workspace.tree, changes));
    if (changes.some((c) => c.kind === "format")) void checkFormat();
    // Only content some view model shows is read again; anything else does no work at all.
    const notes: Content[] = changes.filter((c) => c.kind === "note" && c.exists).map((c) => ({ kind: "note", path: c.path }));
    if (!notes.length || !viewModels.showing(notes, store.state).length) return;
    const open = store.state.note.path;
    if (open && notes.some((c) => c.kind === "note" && c.path === open)) void reconcile(open);
  }

  // ---- file names that follow titles (FIL-07) ----
  let follows = false;
  let title: string | undefined;
  function loaded(path: string, markdown: string): void {
    const name = nameOf(path);
    title = titleOfMarkdown(markdown);
    follows = followsTitle(name, title ?? stemOf(name));
  }
  async function written(path: string, markdown: string): Promise<void> {
    lastWritten = { path, text: markdown };
    if (!ws || queued || store.state.workspace.access !== "write") return;
    // Notes the app creates are in the tree before the watcher (if any) reports them, with their titles.
    const next = titleOfMarkdown(markdown);
    setTree(applyChanges(store.state.workspace.tree, [{ path, kind: "note", exists: true, ...(next ? { title: next } : {}) }]));
    if (!follows || !next || next === title) return;
    const plan = planRename(store.state.workspace.tree, path, next);
    if (plan?.kind === "unchanged") title = next;
    if (plan?.kind !== "renamed") return;
    const moves = [{ from: path, to: plan.to }];
    let own: string | undefined;
    try {
      if (ws.apply) {
        // Links to it in other notes change in the same batch as the name (FIL-09).
        const writes = await planLinkWrites(store.state.workspace.tree, moves, (p) => (p === path ? Promise.resolve(markdown) : bridge.readNote(p)));
        own = writes.find((w) => w.from === path)?.text;
        await ws.apply([{ op: "move", from: path, to: plan.to }, ...writes.map((w) => ({ op: "write" as const, path: w.path, text: w.text }))]);
      } else await ws.renameNote(path, plan.to);
    } catch {
      return; // The name is taken or locked: it's tried again on the next save.
    }
    title = next;
    lastWritten = { path: plan.to, text: own ?? markdown };
    // The editor keeps its note: only the path changes, not the key, unless it links to itself by name.
    store.update((s) => ({ ...s, workspace: { ...s.workspace, tree: plan.tree }, note: s.note.path === path ? { ...s.note, path: plan.to } : s.note }));
    if (own !== undefined && store.state.note.path === plan.to) {
      const text = rewriteLinks(store.state.note.markdown, path, plan.to, moves).text;
      setNote({ key: `${plan.to}#links-${Date.now()}`, initialMarkdown: text, markdown: text });
      loaded(plan.to, text);
    }
    if (sourceOf(plan.to) !== "private") await persistAppState({ lastNotePath: plan.to });
  }

  return {
    /** Reads the format before the first note opens, so nothing is written to a workspace that mustn't be. */
    prepare: () => checkFormat(),
    /** Lists the tree and follows outside changes. Never makes the first note wait. */
    start(): void {
      if (!ws) return;
      ws.onChange?.(onChange);
      void ws.scan().then((scan) => {
        const changes = queued ?? [];
        queued = undefined;
        setTree(applyChanges(buildTree(scan), changes));
      }, () => { queued = undefined; });
    },
    loaded,
    written,
  };
}
