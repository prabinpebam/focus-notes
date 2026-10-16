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

// ---- the row menu and Duplicate (D-162) ----

/**
 * A row's menu (Files → Row menu): sections of command IDs, for what's acted on. `focus` is the row
 * it opened on; `acted` is what an operation acts on (the selection when the row is in it). A section
 * row acts on nothing but takes new things. A read-only section offers only what can be done there.
 * `both`: the workspace has a public and a private section, so visibility can change.
 */
export function rowMenu(focus: FileRow, acted: readonly FileRow[], o: { both: boolean }): string[][] {
  const vis = (rows: readonly FileRow[]) => (o.both ? [
    ...(rows.some((r) => r.rootId === "private") ? ["files.makePublic"] : []),
    ...(rows.some((r) => r.rootId === "public") ? ["files.makePrivate"] : []),
  ] : []);
  const out = (sections: string[][]) => sections.filter((s) => s.length);
  if (focus.kind === "root" && !acted.length) return focus.readOnly ? [] : [["files.newNote", "files.newFolder"]];
  if (!acted.length) return [];
  if (acted.some((r) => r.readOnly)) {
    if (acted.length !== 1 || acted[0]!.kind !== "note") return [];
    return out([["files.openItem"], acted[0]!.rootId === "public" ? ["files.copyPublicLink"] : []]);
  }
  if (acted.length > 1) {
    return out([[...(acted.some((r) => r.kind === "note") ? ["files.duplicate"] : []), "files.moveTo"], vis(acted), ["files.delete"]]);
  }
  const r = acted[0]!;
  if (r.kind === "folder") return out([["files.newNote", "files.newFolder"], ["files.rename", "files.moveTo"], vis(acted), ["files.delete"]]);
  return out([["files.openItem"], ["files.rename", "files.duplicate", "files.moveTo"], [...vis(acted), ...(r.rootId === "public" ? ["files.copyPublicLink"] : [])], ["files.delete"]]);
}

/** A copy's title: `name(title, 1)` ("Ideas copy"), else the first of `name(title, 2)`, … not among `taken`, ignoring case. */
export function copyTitle(title: string, taken: Iterable<string>, name: (title: string, n: number) => string): string {
  const keys = new Set([...taken].map((t) => t.normalize("NFC").toLocaleLowerCase()));
  for (let n = 1; ; n++) {
    const t = name(title, n);
    if (!keys.has(t.normalize("NFC").toLocaleLowerCase())) return t;
  }
}

/**
 * A note's text without its front matter `id` (the one key the app writes): a copy is a new note, so a
 * share by ID never reaches it. Front matter left empty goes; everything else stays byte for byte.
 */
export function withoutNoteId(markdown: string): string {
  const fm = /^(\uFEFF?)---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!fm) return markdown;
  const eol = fm[2]!;
  const lines = fm[3]!.split(/\r?\n/);
  const kept = lines.filter((l) => !/^id:/.test(l));
  if (kept.length === lines.length) return markdown;
  const rest = markdown.slice(fm[0].length);
  return kept.length ? `${fm[1]}---${eol}${kept.join(eol)}${eol}---${eol}${rest}` : fm[1] + rest;
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
