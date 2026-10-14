/**
 * Feeds the search index from the workspace model (Spotlight → Index and privacy, D-92): every note
 * and folder in the workspace's roots, kept current by the tree's changes (creates, deletes, moves,
 * and renames, a moved note keeping its indexed text), by changes made outside the app (the
 * desktop's file watcher), and by the app's own saves. Titles are indexed at once and full text as
 * each note is read, a few at a time.
 *
 * In the browser the instance's private notes are indexed only while the vault is unlocked: locking
 * drops them from the index before anything else is asked of it, and a read that finishes after the
 * lock is thrown away (D-90, SPT-08). Nothing here talks to the network or keeps anything on disk.
 */
import type { Store } from "../store.ts";
import type { AppState } from "../app.ts";
import type { PlatformBridge } from "../bridge.ts";
import { sourceOf } from "../notes.ts";
import { buildTree, walk, type RootId, type TreeNode, type WorkspaceRoot, type WorkspaceTree } from "../workspace.ts";
import type { FindQuery, FindResults, IndexOp, IndexStatus, SearchIndexClient, SearchItem, SearchQuery, SearchResults } from "./types.ts";

export interface SearchHost {
  store: Store<AppState>;
  bridge: PlatformBridge;
}

/** The search index as the app uses it: what Spotlight (WP-4.2) and Find in all notes (WP-4.3) call. */
export interface SearchService {
  query(query: SearchQuery): Promise<SearchResults>;
  /** Find in all notes (FND-04): every exact match in the notes indexed so far, by note. */
  find(query: FindQuery): Promise<FindResults>;
  /** How far indexing has got, for "Indexing 1,240 / 5,000". */
  status(): IndexStatus;
  onStatus(listener: (status: IndexStatus) => void): () => void;
  /** Commands or settings, as Spotlight lists them. */
  setItems(kind: "command" | "setting", items: readonly SearchItem[]): void;
  /** Resolves once every note known so far has been read and indexed. */
  whenIndexed(): Promise<IndexStatus>;
  /** Stops following the workspace and drops the index. */
  stop(): void;
}

export interface SearchFeedOptions {
  /** Notes read at once where the shell reads one per call (4). */
  concurrency?: number;
  /** Notes per call where it reads several (`readNotes`, 32), one call at a time. */
  batch?: number;
}
const READ_BATCH = 32;

interface Entry {
  kind: "note" | "folder";
  path: string;
  rel: string;
  root: RootId;
  title?: string;
  node: TreeNode;
}

/** A path relative to its root, with `/`: what Spotlight shows and `in:` filters on. */
export const relativeTo = (root: { path: string }, path: string) => path.slice(root.path.length).replace(/\\/g, "/").replace(/^\/+/, "");

function entriesOf(trees: readonly WorkspaceTree[], allowed: (path: string) => boolean): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const t of trees) {
    for (const { root, node, path } of walk(t)) {
      if (out.has(path) || !allowed(path)) continue;
      out.set(path, { kind: node.kind, path, rel: relativeTo(root, path), root: root.id, ...(node.kind === "note" && node.title ? { title: node.title } : {}), node });
    }
  }
  return out;
}

const noteOp = (e: Entry): IndexOp => ({ op: "note", path: e.path, rel: e.rel, root: e.root, ...(e.title ? { title: e.title } : {}) });
const folderOp = (e: Entry): IndexOp => ({ op: "folder", path: e.path, rel: e.rel, root: e.root });

/**
 * What changed between two listings, as index changes: removals, then moves, then additions, and
 * the notes whose text must be read. A node that is the same object at a new path moved (the
 * workspace model keeps moved nodes as they were), so its text moves without being read again.
 */
export function diffEntries(before: ReadonlyMap<string, Entry>, after: ReadonlyMap<string, Entry>): { ops: IndexOp[]; read: string[] } {
  const removes: IndexOp[] = [];
  const moves: IndexOp[] = [];
  const adds: IndexOp[] = [];
  const read: string[] = [];
  const pathOfNode = new Map<TreeNode, string>();
  for (const [p, e] of before) pathOfNode.set(e.node, p);
  const movedFrom = new Set<string>();
  for (const [p, e] of after) {
    const old = before.get(p);
    if (old?.kind === e.kind) {
      if (e.kind === "note" && old.title !== e.title) adds.push(noteOp(e));
      continue;
    }
    if (old) removes.push({ op: "remove", path: p });
    const from = old ? undefined : pathOfNode.get(e.node);
    if (from !== undefined && !after.has(from) && !movedFrom.has(from)) {
      movedFrom.add(from);
      moves.push({ op: "move", from, to: p, rel: e.rel });
      if (e.kind === "note" && before.get(from)!.title !== e.title) adds.push(noteOp(e));
      continue;
    }
    adds.push(e.kind === "note" ? noteOp(e) : folderOp(e));
    if (e.kind === "note") read.push(p);
  }
  for (const p of before.keys()) if (!after.has(p) && !movedFrom.has(p)) removes.push({ op: "remove", path: p });
  return { ops: [...removes, ...moves, ...adds], read };
}

/**
 * Starts feeding `index` from the app's workspace. Call it once the app is ready (after `start()`),
 * so building never delays the first caret: a start-up warm-up can call it at idle time.
 */
export function startSearch(host: SearchHost, index: SearchIndexClient, options: SearchFeedOptions = {}): SearchService {
  const { store, bridge } = host;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  // Reading several notes per call (`readNotes`) keeps the calls, and what each leaves behind, few.
  const perCall = bridge.readNotes ? Math.max(1, options.batch ?? READ_BATCH) : 1;
  const calls = bridge.readNotes ? 1 : concurrency;
  const unlocked = () => store.state.instance.vault === "unlocked";
  /** The browser's private notes only while the vault is open (D-90). The desktop's are files of its own. */
  const allowed = (path: string) => sourceOf(path) !== "private" || unlocked();

  let known = new Map<string, Entry>();
  let tree = store.state.workspace.tree;
  let vault = store.state.instance.vault;
  /** The browser's private notes, listed when the vault opens after the tree was made. */
  let vaultTree: WorkspaceTree | undefined;
  /** Bumped on every lock: a private note's read that started before it is thrown away. */
  let lockGen = 0;
  let stopped = false;

  // ---- reading notes' text, a few at a time ----
  const queue = new Set<string>();
  let active = 0;
  let out: IndexOp[] = [];
  let flushing = false;
  let idle: (() => void)[] = [];
  const send = (ops: readonly IndexOp[]) => { if (!stopped && ops.length) index.apply(ops); };
  const flush = () => {
    flushing = false;
    const ops = out;
    out = [];
    send(ops);
    settle();
  };
  const push = (op: IndexOp) => {
    out.push(op);
    if (!flushing) {
      flushing = true;
      setTimeout(flush, 0);
    }
  };
  const settle = () => {
    if (queue.size || active || out.length) return;
    const done = idle;
    idle = [];
    for (const r of done) r();
  };
  /**
   * Several notes per call where the shell reads several at once. One note (a change the watcher
   * saw, often the app's own save) goes through `readNote`, which the save has already answered.
   */
  const read = (paths: string[]): Promise<(string | null)[]> =>
    bridge.readNotes && paths.length > 1
      ? bridge.readNotes(paths).then((t) => t, () => paths.map(() => null))
      : bridge.readNote(paths[0]!).then((t) => [t], () => [null]);
  function pump(): void {
    while (!stopped && active < calls && queue.size) {
      const paths: string[] = [];
      for (const p of queue) {
        queue.delete(p);
        if (known.has(p)) paths.push(p);
        if (paths.length >= perCall) break;
      }
      if (!paths.length) continue;
      const gen = lockGen;
      active++;
      void read(paths).then((texts) => {
        active--;
        paths.forEach((path, i) => {
          const current = known.has(path) && (sourceOf(path) !== "private" || (gen === lockGen && unlocked()));
          if (!stopped && current) push({ op: "text", path, markdown: texts[i] ?? null });
        });
        pump();
      });
    }
    settle();
  }
  const enqueue = (paths: readonly string[]) => {
    for (const p of paths) queue.add(p);
    pump();
  };

  // ---- the workspace's notes and folders ----
  function sync(): void {
    const next = entriesOf(vaultTree ? [tree, vaultTree] : [tree], allowed);
    const { ops, read } = diffEntries(known, next);
    known = next;
    send(ops);
    enqueue(read);
  }
  async function listVault(): Promise<void> {
    const gen = lockGen;
    const scan = await bridge.workspace?.scan().catch(() => undefined);
    if (stopped || !scan || gen !== lockGen || !unlocked()) return;
    const t = buildTree(scan);
    vaultTree = { roots: t.roots.filter((r: WorkspaceRoot) => r.id === "private" && sourceOf(r.path) === "private") };
    sync();
  }
  function lock(): void {
    lockGen++;
    vaultTree = undefined;
    // First, before any later query: the index forgets every private note at once.
    send([{ op: "removeWithin", path: "private:" }]);
    out = out.filter((op) => !("path" in op) || sourceOf(op.path) !== "private");
    for (const p of [...queue]) if (sourceOf(p) === "private") queue.delete(p);
    for (const p of [...known.keys()]) if (sourceOf(p) === "private") known.delete(p);
  }

  let lastSaved: string | undefined;
  const unsubscribe = store.subscribe(() => {
    const s = store.state;
    if (s.instance.vault !== vault) {
      const was = vault;
      vault = s.instance.vault;
      if (was === "unlocked") lock();
      if (vault === "unlocked") void listVault();
      sync();
    }
    if (s.workspace.tree !== tree) {
      tree = s.workspace.tree;
      sync();
    }
    // The app's own saves: the text is here already, so nothing is read.
    const n = s.note;
    if (n.path && n.status === "ready" && n.saveState === "saved" && n.markdown !== lastSaved) {
      lastSaved = n.markdown;
      if (known.has(n.path)) {
        queue.delete(n.path);
        push({ op: "text", path: n.path, markdown: n.markdown });
      }
    }
  });
  // Changes made outside the app (the desktop's watcher): the tree follows them; the text is read again.
  const unwatch = bridge.workspace?.onChange?.((changes) => {
    const notes = changes.filter((c) => c.kind === "note" && c.exists).map((c) => c.path);
    if (notes.length) setTimeout(() => enqueue(notes.filter((p) => known.has(p))), 0);
  });

  sync();
  if (unlocked()) void listVault();

  return {
    query: (q) => index.query(q),
    find: (q) => index.find(q),
    status: () => index.status(),
    onStatus: (l) => index.onStatus(l),
    setItems: (kind, items) => send([{ op: "items", kind, items }]),
    async whenIndexed() {
      await new Promise<void>((resolve) => {
        idle.push(resolve);
        settle();
      });
      return index.whenIndexed();
    },
    stop() {
      stopped = true;
      unsubscribe();
      unwatch?.();
      queue.clear();
      index.dispose();
    },
  };
}
