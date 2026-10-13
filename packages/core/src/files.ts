/**
 * The Files panel's model (WP-2.4, Files panel): the rows it shows, the selection, and what an
 * operation acts on. Pure functions over the workspace tree, so every rule here is unit-tested.
 */
import { dirOf, findNode, isWithin, joinPath, rootOf, stemOf, type RootId, type TreeNode, type WorkspaceRoot, type WorkspaceTree } from "./workspace.ts";

/** One row of the tree: a root's section label, a folder, or a note. */
export interface FileRow {
  /** A path, or `root:<id>` for a root's section row. */
  id: string;
  /** The folder's or note's path, or the root's own path. */
  path: string;
  kind: "root" | "folder" | "note";
  rootId: RootId;
  /** 1 for a root, 2 for what's directly in it, and so on (aria-level). */
  level: number;
  /** The file or folder name; empty for a root. */
  name: string;
  /** A note's title (its first H1, else its file name without the extension) or a folder's name. */
  label: string;
  readOnly: boolean;
  published: boolean;
  /** Folders and roots: shown open. */
  expanded: boolean;
  hasChildren: boolean;
  /** The row ID of the folder or root it's in. */
  parent?: string;
}

export const rootRowId = (id: RootId) => `root:${id}`;
export const isRootRow = (id: string) => id.startsWith("root:");
export const titleOfNode = (node: TreeNode) => (node.kind === "note" ? node.title || stemOf(node.name) : node.name);

/** Which folders are open: folder paths in `expanded`, and roots unless their row is in `collapsed`. */
export interface Openness {
  expanded: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
}

/**
 * The rows to show, in tree order. With a filter, only notes and folders whose label contains it
 * (ignoring case) show, with their ancestors open; roots always show as section labels.
 */
export function visibleRows(tree: WorkspaceTree, open: Openness, filter = ""): FileRow[] {
  const q = filter.trim().toLocaleLowerCase();
  const rows: FileRow[] = [];
  const matches = (node: TreeNode, path: string): boolean => {
    if (titleOfNode(node).toLocaleLowerCase().includes(q)) return true;
    return node.kind === "folder" && node.children.some((c) => matches(c, joinPath(path, c.name)));
  };
  const add = (root: WorkspaceRoot, nodes: readonly TreeNode[], dir: string, level: number, parent: string) => {
    for (const node of nodes) {
      const path = joinPath(dir, node.name);
      if (q && !matches(node, path)) continue;
      const expanded = node.kind === "folder" && (q ? node.children.some((c) => matches(c, joinPath(path, c.name))) : open.expanded.has(path));
      rows.push({
        id: path, path, kind: node.kind, rootId: root.id, level, name: node.name, label: titleOfNode(node), readOnly: root.readOnly,
        published: node.kind === "note" && node.published, expanded, hasChildren: node.kind === "folder" && node.children.length > 0, parent,
      });
      if (node.kind === "folder" && expanded) add(root, node.children, path, level + 1, path);
    }
  };
  for (const root of tree.roots) {
    const id = rootRowId(root.id);
    const expanded = !open.collapsed.has(id);
    rows.push({ id, path: root.path, kind: "root", rootId: root.id, level: 1, name: "", label: "", readOnly: root.readOnly, published: false, expanded, hasChildren: root.children.length > 0 });
    if (expanded) add(root, root.children, root.path, 2, id);
  }
  return rows;
}

/** The folders to open so a path shows: every folder it's in. */
export function ancestorsOf(tree: WorkspaceTree, path: string): string[] {
  const root = rootOf(tree, path);
  const out: string[] = [];
  if (!root) return out;
  for (let d = dirOf(path); d !== root.path && isWithin(root.path, d) && d !== ""; d = dirOf(d)) out.unshift(d);
  return out;
}

// ---- selection (Files → Selection) ----

export interface Selection {
  /** Selected row IDs, in the order they were selected. */
  selected: readonly string[];
  /** Where a Shift range starts. */
  anchor: string;
  /** The focused row: the tree's one tab stop. */
  focus: string;
}
export const NO_SELECTION: Selection = { selected: [], anchor: "", focus: "" };

/**
 * A click or arrow key: `replace` selects only this row, `toggle` adds or removes it (Mod+click),
 * `range` selects from the anchor to it in the order shown (Shift+click, Shift+arrows), and
 * `focus` only moves focus (Mod+arrows).
 */
export function select(sel: Selection, rows: readonly FileRow[], id: string, mode: "replace" | "toggle" | "range" | "focus"): Selection {
  if (!rows.some((r) => r.id === id)) return sel;
  if (mode === "focus") return { ...sel, focus: id };
  if (mode === "replace") return { selected: [id], anchor: id, focus: id };
  if (mode === "toggle") {
    const on = sel.selected.includes(id);
    return { selected: on ? sel.selected.filter((x) => x !== id) : [...sel.selected, id], anchor: id, focus: id };
  }
  const ids = rows.map((r) => r.id);
  const from = ids.indexOf(sel.anchor || sel.focus || id);
  const to = ids.indexOf(id);
  if (from < 0) return { selected: [id], anchor: id, focus: id };
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { selected: ids.slice(a, b + 1), anchor: sel.anchor || ids[from]!, focus: id };
}

/** Mod+A: every row showing, except the section labels. */
export const selectAll = (sel: Selection, rows: readonly FileRow[]): Selection => ({ ...sel, selected: rows.filter((r) => r.kind !== "root").map((r) => r.id) });

/** After the tree changes: forget rows that are gone; focus falls back to the first row. */
export function keepShowing(sel: Selection, rows: readonly FileRow[]): Selection {
  const ids = new Set(rows.map((r) => r.id));
  const selected = sel.selected.filter((x) => ids.has(x));
  const focus = ids.has(sel.focus) ? sel.focus : (selected[0] ?? rows[0]?.id ?? "");
  const anchor = ids.has(sel.anchor) ? sel.anchor : focus;
  if (selected.length === sel.selected.length && focus === sel.focus && anchor === sel.anchor) return sel;
  return { selected, anchor, focus };
}

/** What an operation acts on: the selection if the row is in it, else just the row. Section labels never. */
export function actedOn(sel: Selection, id: string): string[] {
  const ids = id && !sel.selected.includes(id) ? [id] : sel.selected;
  return ids.filter((x) => !isRootRow(x));
}

/** Drops paths inside another path in the list: moving or deleting a folder takes what's in it. */
export function topLevel(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)];
  return unique.filter((p) => !unique.some((q) => q !== p && isWithin(q, p)));
}

/** Where a path ends up after moves (a moved folder takes everything in it). */
export function rebase(path: string, moves: readonly { from: string; to: string }[]): string {
  for (const m of moves) if (isWithin(m.from, path)) return m.to + path.slice(m.from.length);
  return path;
}

/**
 * Where something new goes (Files → Creating): into the focused folder or root, else next to the
 * focused note, else next to the open note, else the first root that can be written.
 */
export function targetFolder(tree: WorkspaceTree, rows: readonly FileRow[], focus: string, notePath?: string): string | undefined {
  const writable = (p: string) => {
    const r = rootOf(tree, p);
    return r && !r.readOnly && (p === r.path || findNode(tree, p)?.node.kind === "folder") ? p : undefined;
  };
  const row = rows.find((r) => r.id === focus);
  const fromRow = row ? (row.kind === "note" ? dirOf(row.path) : row.path) : undefined;
  const fromNote = notePath && findNode(tree, notePath) ? dirOf(notePath) : undefined;
  return (fromRow !== undefined ? writable(fromRow) : undefined) ?? (fromNote !== undefined ? writable(fromNote) : undefined) ?? tree.roots.find((r) => !r.readOnly)?.path;
}

/** Folders (and roots) things can be moved into, for Move to…, with whether each changes visibility. */
export function destinations(tree: WorkspaceTree, moving: readonly string[]): { path: string; root: WorkspaceRoot; depth: number; name: string }[] {
  const out: { path: string; root: WorkspaceRoot; depth: number; name: string }[] = [];
  const add = (root: WorkspaceRoot, nodes: readonly TreeNode[], dir: string, depth: number) => {
    for (const n of nodes) {
      if (n.kind !== "folder") continue;
      const path = joinPath(dir, n.name);
      // Never into a folder that's moving, or one inside it.
      if (moving.some((m) => isWithin(m, path))) continue;
      out.push({ path, root, depth, name: n.name });
      add(root, n.children, path, depth + 1);
    }
  };
  for (const r of tree.roots) {
    if (r.readOnly) continue;
    out.push({ path: r.path, root: r, depth: 0, name: "" });
    add(r, r.children, r.path, 1);
  }
  return out;
}
