/**
 * The workspace model, shared by every shell: the workspace's roots as one tree of notes and
 * folders, and every operation on it as a pure plan (content-model.md, desktop-and-git.md).
 *
 * Desktop: the workspace folder, with public notes in `notes/` and private ones in the `private/`
 * submodule's `notes/` (D-84), or one root for a folder that isn't a workspace yet (D-92). Browser:
 * its own notes, plus the instance's read-only `public:` and `private:` notes (D-90).
 *
 * Nodes don't store their paths, so a plan keeps everything it didn't change as the same objects:
 * a moved note is the same object in its new place, which is how a view tells a move from a copy
 * (Desktop and Git → Changes shown before they're saved). Paths are the shell's own (`readNote`).
 */
import { clipName, compareNames, fileStemForTitle, hasForbiddenChars, MAX_NAME_CHARS, RESERVED_WINDOWS } from "./text.ts";
import { parseAtx, stripLinks, stripUnderscores } from "./scan.ts";

export type RootId = "local" | "public" | "private";
export interface NoteNode {
  readonly kind: "note";
  readonly name: string;
  /** Pushed at least once (set by sync from M3). Its file name then stays fixed (FIL-07). */
  readonly published: boolean;
  /** Its first H1, when the shell read it: the Files panel shows titles, not file names (D-94). */
  readonly title?: string;
  /** When it last changed (ms), as the shell read it when listing the workspace: for sorting by last change (D-175). */
  readonly changed?: number;
}
export interface FolderNode {
  readonly kind: "folder";
  readonly name: string;
  readonly children: readonly TreeNode[];
}
export type TreeNode = NoteNode | FolderNode;
export interface WorkspaceRoot {
  readonly id: RootId;
  /** The root's own path: a folder on the desktop, `""` or `public:` in the browser. */
  readonly path: string;
  readonly readOnly: boolean;
  readonly children: readonly TreeNode[];
}
export interface WorkspaceTree {
  readonly roots: readonly WorkspaceRoot[];
}
export const EMPTY_TREE: WorkspaceTree = { roots: [] };

/** What a shell reports: its roots and every note and folder in them, in any order. */
export interface WorkspaceScan {
  /** The workspace folder (desktop), or `""` (browser). */
  folder: string;
  roots: { id: RootId; path: string; readOnly: boolean }[];
  entries: WorkspaceEntry[];
}
export interface WorkspaceEntry {
  path: string;
  kind: "note" | "folder";
  published?: boolean;
  title?: string;
  /** A note's modification time (ms), for sorting by last change (D-175). */
  changed?: number;
}
/** One change the file watcher saw. `format` is `.focus-notes/workspace.json` (DST-05). */
export interface WorkspaceChange {
  path: string;
  kind: "note" | "folder" | "format";
  exists: boolean;
  /** A note's title as it is now, when the shell read it. */
  title?: string;
}

export type RefusalReason = "notFound" | "readOnly" | "invalid" | "taken" | "intoItself";
export type Refusal = { kind: "refused"; reason: RefusalReason };
const refuse = (reason: Refusal["reason"]): Refusal => ({ kind: "refused", reason });

// ---- paths ----

const PREFIXED = /^(public|private):/;
const sepOf = (p: string) => (p.includes("\\") && !p.includes("/") ? "\\" : "/");
/** A child's path: the separator the parent already uses, none after a `public:` style prefix. */
export function joinPath(dir: string, name: string): string {
  return dir === "" || /[:\\/]$/.test(dir) ? `${dir}${name}` : `${dir}${sepOf(dir)}${name}`;
}
function within(base: string, path: string): boolean {
  if (base === "") return !PREFIXED.test(path);
  if (path === base) return true;
  return path.startsWith(base) && (/[:\\/]$/.test(base) || path[base.length] === "/" || path[base.length] === "\\");
}
/** Whether a path is in a folder (or is it), for the shell's own paths. */
export const isWithin = within;
const partsOf = (base: string, path: string) => path.slice(base.length).split(/[\\/]/).filter(Boolean);
const pathOf = (root: { path: string }, parts: readonly string[]) => parts.reduce(joinPath, root.path);

/** The folder (or root) a path is in, in the shell's own spelling: `a/b.md` → `a`, `public:b.md` → `public:`. */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i >= 0) return path.slice(0, i);
  const m = PREFIXED.exec(path);
  return m ? m[0] : "";
}

/** The root a path is in: the longest root that contains it. */
export function rootOf<R extends { path: string }>(tree: { roots: readonly R[] }, path: string): R | undefined {
  let best: R | undefined;
  for (const r of tree.roots) if (within(r.path, path) && (!best || r.path.length > best.path.length)) best = r;
  return best;
}

// ---- names and titles ----

const nameKey = (name: string) => name.normalize("NFC").toLowerCase();
export const stemOf = (name: string) => name.replace(/\.(md|markdown)$/i, "");
const isNumbered = (stem: string, base: string) => stem.startsWith(`${base}-`) && /^\d+$/.test(stem.slice(base.length + 1));

/** A free name in a folder: `stem.md`, else `stem-2.md`, `stem-3.md`, ignoring case and Unicode form. */
export function uniqueName(stem: string, taken: Iterable<string>, ext = ".md"): string {
  const keys = new Set([...taken].map(nameKey));
  if (!keys.has(nameKey(stem + ext))) return stem + ext;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const name = `${clipName(stem, MAX_NAME_CHARS - suffix.length)}${suffix}${ext}`;
    if (!keys.has(nameKey(name))) return name;
  }
}

/**
 * A file name follows its title (FIL-07) when it's the title's name, a numbered clash of it, or
 * untitled. A name that was chosen by hand ("Welcome.md" for "Welcome to Focus Notes") doesn't.
 */
export function followsTitle(fileName: string, title: string): boolean {
  const s = fileStemForTitle(stemOf(fileName));
  const t = fileStemForTitle(title);
  return s === t || isNumbered(s, t) || /^untitled(-\d+)?$/.test(s);
}

const inline = (s: string) =>
  stripUnderscores(stripLinks(s).replace(/[*`]|~~/g, "")).replace(/\s+/g, " ").trim();

/** A note's title: its first H1, outside front matter and code (content-model.md → A note file). */
export function titleOfMarkdown(markdown: string): string | undefined {
  return findTitle(markdown.replace(/^\uFEFF/, "").split(/\r?\n/))?.text;
}

/**
 * A note's text with a new title (Files → Renaming): its first H1 is replaced, or one is added at
 * the top (after front matter) when it has none. Everything else stays byte for byte.
 */
export function retitle(markdown: string, title: string): string {
  const bom = markdown.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = markdown.slice(bom.length);
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r?\n/);
  const heading = `# ${title.replace(/\s+/g, " ").trim()}`;
  const found = findTitle(lines);
  if (found) lines.splice(found.line, found.setext ? 2 : 1, heading);
  else {
    const at = frontMatterEnd(lines);
    const rest = lines.slice(at);
    const empty = rest.every((l) => !l.trim());
    lines.splice(at, lines.length - at, heading, ...(empty ? [""] : ["", ...rest]));
  }
  return bom + lines.join(eol);
}

function frontMatterEnd(lines: readonly string[]): number {
  if (lines[0] !== "---") return 0;
  const end = lines.findIndex((l, n) => n > 0 && (l === "---" || l === "..."));
  return end > 0 ? end + 1 : 0;
}

function findTitle(lines: readonly string[]): { line: number; setext: boolean; text: string } | undefined {
  let i = frontMatterEnd(lines);
  let fence = "";
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f) fence = "";
      continue;
    }
    if (f) {
      fence = f;
      continue;
    }
    const atx = parseAtx(line);
    if (atx?.level === 1) {
      const t = inline(atx.text ?? "");
      if (t) return { line: i, setext: false, text: t };
      continue;
    }
    if (line.trim() && /^ {0,3}=+[ \t]*$/.test(lines[i + 1] ?? "") && !/^ {0,3}([-*+>#]|\d+[.)])/.test(line)) {
      const t = inline(line);
      if (t) return { line: i, setext: true, text: t };
    }
  }
  return undefined;
}

// ---- building and finding ----

const byKindAndName = (a: TreeNode, b: TreeNode) => (a.kind === b.kind ? compareNames(a.name, b.name) : a.kind === "folder" ? -1 : 1);
const insertSorted = (children: readonly TreeNode[], node: TreeNode): readonly TreeNode[] => {
  const i = children.findIndex((c) => byKindAndName(node, c) < 0);
  return i < 0 ? [...children, node] : [...children.slice(0, i), node, ...children.slice(i)];
};

interface Building { kind: "folder"; name: string; children: Map<string, Building | NoteNode> }
const freeze = (b: Building): readonly TreeNode[] =>
  [...b.children.values()].map((c): TreeNode => (c.kind === "note" ? c : { kind: "folder", name: c.name, children: freeze(c) })).sort(byKindAndName);

/** The tree for a scan: each root's folders first, then notes, in the reader's language order. */
export function buildTree(scan: WorkspaceScan): WorkspaceTree {
  const tops = scan.roots.map((r) => ({ root: r, top: { kind: "folder", name: "", children: new Map() } as Building }));
  for (const e of scan.entries) {
    const r = rootOf({ roots: tops.map((t) => t.root) }, e.path);
    const parts = r ? partsOf(r.path, e.path) : [];
    if (!r || parts.length === 0) continue;
    let at = tops.find((t) => t.root === r)!.top;
    for (const part of parts.slice(0, -1)) {
      let next = at.children.get(part);
      if (!next || next.kind !== "folder") at.children.set(part, (next = { kind: "folder", name: part, children: new Map() }));
      at = next;
    }
    const name = parts.at(-1)!;
    if (e.kind === "note") at.children.set(name, { kind: "note", name, published: Boolean(e.published), ...(e.title ? { title: e.title } : {}), ...(typeof e.changed === "number" ? { changed: e.changed } : {}) });
    else if (at.children.get(name)?.kind !== "folder") at.children.set(name, { kind: "folder", name, children: new Map() });
  }
  return { roots: tops.map(({ root, top }) => ({ id: root.id, path: root.path, readOnly: root.readOnly, children: freeze(top) })) };
}

export interface Found { root: WorkspaceRoot; node: TreeNode; path: string; parent: readonly TreeNode[] }

/** The note or folder at a path, with its root and the list it's in. */
export function findNode(tree: WorkspaceTree, path: string): Found | undefined {
  const root = rootOf(tree, path);
  const parts = root ? partsOf(root.path, path) : [];
  if (!root || parts.length === 0) return undefined;
  let list = root.children;
  for (let i = 0; i < parts.length; i++) {
    const node = list.find((n) => n.name === parts[i]);
    if (!node) return undefined;
    if (i === parts.length - 1) return { root, node, path, parent: list };
    if (node.kind !== "folder") return undefined;
    list = node.children;
  }
  return undefined;
}

/** Every note and folder, depth first, in tree order. */
export function* walk(tree: WorkspaceTree): Generator<{ root: WorkspaceRoot; node: TreeNode; path: string }> {
  function* go(root: WorkspaceRoot, nodes: readonly TreeNode[], dir: string): Generator<{ root: WorkspaceRoot; node: TreeNode; path: string }> {
    for (const node of nodes) {
      const path = joinPath(dir, node.name);
      yield { root, node, path };
      if (node.kind === "folder") yield* go(root, node.children, path);
    }
  }
  for (const r of tree.roots) yield* go(r, r.children, r.path);
}

/** A root or folder to put things in. */
function container(tree: WorkspaceTree, path: string): { root: WorkspaceRoot; parts: string[]; children: readonly TreeNode[] } | undefined {
  const root = rootOf(tree, path);
  if (!root) return undefined;
  const parts = partsOf(root.path, path);
  if (parts.length === 0) return { root, parts, children: root.children };
  const found = findNode(tree, path);
  return found?.node.kind === "folder" ? { root, parts, children: found.node.children } : undefined;
}

// ---- changing, keeping everything else as the same objects ----

type Edit = (children: readonly TreeNode[]) => readonly TreeNode[];
function editList(children: readonly TreeNode[], parts: readonly string[], fn: Edit, create: boolean): readonly TreeNode[] | undefined {
  if (parts.length === 0) return fn(children);
  const [head, ...rest] = parts as [string, ...string[]];
  const i = children.findIndex((n) => n.kind === "folder" && n.name === head);
  if (i < 0) {
    if (!create) return undefined;
    return insertSorted(children, { kind: "folder", name: head, children: editList([], rest, fn, create)! });
  }
  const folder = children[i] as FolderNode;
  const inner = editList(folder.children, rest, fn, create);
  if (inner === undefined || inner === folder.children) return inner === undefined ? undefined : children;
  const copy = children.slice();
  copy[i] = { ...folder, children: inner };
  return copy;
}
/** Applies `fn` to the list at `parts` in a root. The same tree when nothing changed. */
function edit(tree: WorkspaceTree, root: WorkspaceRoot, parts: readonly string[], fn: Edit, create = false): WorkspaceTree {
  const children = editList(root.children, parts, fn, create);
  if (children === undefined || children === root.children) return tree;
  return { roots: tree.roots.map((r) => (r === root ? { ...root, children } : r)) };
}
const without = (name: string): Edit => (list) => {
  const i = list.findIndex((n) => n.name === name);
  return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
};
const withNode = (node: TreeNode): Edit => (list) => insertSorted(without(node.name)(list), node);
/** The current root object for a root found in an earlier version of the tree. */
const sameRoot = (tree: WorkspaceTree, root: WorkspaceRoot) => tree.roots.find((r) => r.id === root.id && r.path === root.path)!;

/** Applies what the file watcher saw. The same tree when none of it is in the tree's roots. */
export function applyChanges(tree: WorkspaceTree, changes: readonly WorkspaceChange[]): WorkspaceTree {
  let t = tree;
  for (const c of changes) {
    if (c.kind === "format") continue;
    const root = rootOf(t, c.path);
    const parts = root ? partsOf(root.path, c.path) : [];
    if (!root || parts.length === 0) continue;
    const name = parts.at(-1)!;
    const dir = parts.slice(0, -1);
    if (!c.exists) {
      t = edit(t, root, dir, without(name));
      continue;
    }
    t = edit(t, root, dir, (list) => {
      const old = list.find((n) => n.name === name);
      if (old?.kind === "note" && c.kind === "note" && c.title !== undefined && c.title !== old.title) return withNode({ ...old, title: c.title })(list);
      if (old?.kind === c.kind) return list;
      return withNode(c.kind === "note" ? { kind: "note", name, published: false, ...(c.title ? { title: c.title } : {}) } : { kind: "folder", name, children: [] })(list);
    }, true);
  }
  return t;
}

/** Marks notes as published, so their file names stay fixed (FIL-07). Sync sets this from M3. */
export function markPublished(tree: WorkspaceTree, paths: Iterable<string>): WorkspaceTree {
  let t = tree;
  for (const path of paths) {
    const found = findNode(t, path);
    if (found?.node.kind !== "note" || found.node.published) continue;
    const parts = partsOf(found.root.path, path);
    t = edit(t, found.root, parts.slice(0, -1), withNode({ ...found.node, published: true }));
  }
  return t;
}

// ---- operations as pure plans ----

/** A new note in a folder (or a root), named from its title. */
export function planCreateNote(tree: WorkspaceTree, folder: string, title: string): Refusal | { kind: "created"; path: string; tree: WorkspaceTree } {
  const c = container(tree, folder);
  if (!c) return refuse("notFound");
  if (c.root.readOnly) return refuse("readOnly");
  const name = uniqueName(fileStemForTitle(title), c.children.map((n) => n.name));
  return { kind: "created", path: joinPath(folder, name), tree: edit(tree, c.root, c.parts, withNode({ kind: "note", name, published: false })) };
}

/** A folder name as typed, made tidy, or undefined if it can't be one. Case is kept: it's chosen by hand. */
export function cleanFolderName(name: string): string | undefined {
  const n = name.normalize("NFC").trim().replace(/[. ]+$/, "");
  if (!n || n.startsWith(".") || hasForbiddenChars(n) || RESERVED_WINDOWS.test(n.split(".")[0]!) || [...n].length > MAX_NAME_CHARS) return undefined;
  return n;
}

export function planCreateFolder(tree: WorkspaceTree, parent: string, name: string): Refusal | { kind: "created"; path: string; tree: WorkspaceTree } {
  const c = container(tree, parent);
  if (!c) return refuse("notFound");
  if (c.root.readOnly) return refuse("readOnly");
  const n = cleanFolderName(name);
  if (!n) return refuse("invalid");
  if (c.children.some((x) => nameKey(x.name) === nameKey(n))) return refuse("taken");
  return { kind: "created", path: joinPath(parent, n), tree: edit(tree, c.root, c.parts, withNode({ kind: "folder", name: n, children: [] })) };
}

export type RenamePlan = { kind: "renamed"; from: string; to: string; tree: WorkspaceTree } | { kind: "unchanged" } | { kind: "blocked"; reason: "published" | "readOnly" };

/**
 * A note's file name for a new title (FIL-07): it follows the title until the note is published,
 * then stays fixed unless renamed on purpose (`explicit`, with the URL warning in Files).
 * Undefined for a path that isn't a note in the workspace.
 */
export function planRename(tree: WorkspaceTree, path: string, title: string, opts: { explicit?: boolean } = {}): RenamePlan | undefined {
  const found = findNode(tree, path);
  if (found?.node.kind !== "note") return undefined;
  if (found.root.readOnly) return { kind: "blocked", reason: "readOnly" };
  const wanted = fileStemForTitle(title);
  const current = fileStemForTitle(stemOf(found.node.name));
  if (current === wanted || isNumbered(current, wanted)) return { kind: "unchanged" };
  if (found.node.published && !opts.explicit) return { kind: "blocked", reason: "published" };
  const node = found.node;
  const name = uniqueName(wanted, found.parent.filter((n) => n !== node).map((n) => n.name));
  const parts = partsOf(found.root.path, path).slice(0, -1);
  const tree2 = edit(tree, found.root, parts, (list) => withNode({ ...node, name })(without(node.name)(list)));
  return { kind: "renamed", from: path, to: pathOf(found.root, [...parts, name]), tree: tree2 };
}

export function planRenameFolder(tree: WorkspaceTree, path: string, name: string): Refusal | { kind: "renamed"; from: string; to: string; tree: WorkspaceTree } {
  const found = findNode(tree, path);
  if (found?.node.kind !== "folder") return refuse("notFound");
  if (found.root.readOnly) return refuse("readOnly");
  const n = cleanFolderName(name);
  if (!n) return refuse("invalid");
  const node = found.node;
  if (found.parent.some((x) => x !== node && nameKey(x.name) === nameKey(n))) return refuse("taken");
  const parts = partsOf(found.root.path, path).slice(0, -1);
  const tree2 = edit(tree, found.root, parts, (list) => withNode({ ...node, name: n })(without(node.name)(list)));
  return { kind: "renamed", from: path, to: pathOf(found.root, [...parts, n]), tree: tree2 };
}

/**
 * Moves notes and folders into a folder (or a root). Moved items stay the same objects unless a
 * clash gives them a new name. `crossesVisibility` means the move needs the visibility confirmation.
 */
export function planMove(tree: WorkspaceTree, paths: readonly string[], dest: string):
  Refusal | { kind: "moved"; moves: { from: string; to: string }[]; crossesVisibility: boolean; tree: WorkspaceTree } {
  const target = container(tree, dest);
  if (!target) return refuse("notFound");
  let t = tree;
  const moves: { from: string; to: string }[] = [];
  let crosses = false;
  for (const path of paths) {
    const found = findNode(t, path);
    if (!found) return refuse("notFound");
    if (found.root.readOnly || target.root.readOnly) return refuse("readOnly");
    if (found.node.kind === "folder" && within(path, dest)) return refuse("intoItself");
    const parts = partsOf(found.root.path, path);
    const fromDir = pathOf(found.root, parts.slice(0, -1));
    if (fromDir === dest) continue;
    crosses ||= found.root.id !== target.root.id;
    t = edit(t, sameRoot(t, found.root), parts.slice(0, -1), without(found.node.name));
    const destNow = container(t, dest)!;
    const ext = found.node.kind === "note" ? found.node.name.slice(stemOf(found.node.name).length) : "";
    const name = destNow.children.some((n) => nameKey(n.name) === nameKey(found.node.name))
      ? uniqueName(stemOf(found.node.name), destNow.children.map((n) => n.name), ext)
      : found.node.name;
    const node = name === found.node.name ? found.node : { ...found.node, name };
    t = edit(t, destNow.root, destNow.parts, withNode(node));
    moves.push({ from: path, to: joinPath(dest, name) });
  }
  return { kind: "moved", moves, crossesVisibility: crosses, tree: t };
}

// ---- who can read a note (SHR-01, SHR-02) ----

/**
 * Who can read a note: its root says so. A public note lives in the instance repository's
 * `notes/`, a private one in the private repository's `notes/` (D-84). Shared is a private note
 * with an audience, which arrives with grants (M5): `shared` says which private notes have one.
 */
export type Visibility = "private" | "shared" | "public";
export function visibilityOf(tree: WorkspaceTree, path: string, shared?: (path: string) => boolean): Visibility | undefined {
  const id = rootOf(tree, path)?.id;
  if (id === "public") return "public";
  if (id === "private") return shared?.(path) ? "shared" : "private";
  return undefined;
}

/**
 * Where a new note goes (SHR-01, safe by default): the folder chosen in Files; else the open
 * note's folder when it's private; else the Private root. Undefined without a writable Private
 * root (a folder before setup, the browser), where it goes next to the open note as before.
 */
export function newNoteFolder(tree: WorkspaceTree, chosen: string | undefined, current: string | undefined): string | undefined {
  if (chosen !== undefined) return chosen;
  const priv = tree.roots.find((r) => r.id === "private" && !r.readOnly);
  if (!priv) return undefined;
  return current && rootOf(tree, current) === priv && findNode(tree, current) ? dirOf(current) : priv.path;
}

/**
 * Make public or Make private (FIL-06): each item moves to the same folder path in the other root,
 * whose missing folders are created, so links between notes that move together still work
 * (Files and sharing → Changing visibility). Items already there are left; a clash is numbered.
 */
export function planVisibility(tree: WorkspaceTree, paths: readonly string[], to: "public" | "private"):
  Refusal | { kind: "moved"; moves: { from: string; to: string }[]; tree: WorkspaceTree } {
  const target = tree.roots.find((r) => r.id === to);
  if (!target) return refuse("notFound");
  let t = tree;
  const moves: { from: string; to: string }[] = [];
  for (const path of paths) {
    const found = findNode(t, path);
    if (!found) return refuse("notFound");
    if (found.root.readOnly || target.readOnly) return refuse("readOnly");
    if (found.root.id === to) continue;
    if (found.root.id !== "public" && found.root.id !== "private") return refuse("invalid");
    const parts = partsOf(found.root.path, path);
    const dir = parts.slice(0, -1);
    t = edit(t, sameRoot(t, found.root), dir, without(found.node.name));
    const there = findNode(t, pathOf(target, dir));
    const taken = dir.length === 0 ? sameRoot(t, target).children : there?.node.kind === "folder" ? there.node.children : [];
    const ext = found.node.kind === "note" ? found.node.name.slice(stemOf(found.node.name).length) : "";
    const name = taken.some((n) => nameKey(n.name) === nameKey(found.node.name)) ? uniqueName(stemOf(found.node.name), taken.map((n) => n.name), ext) : found.node.name;
    t = edit(t, sameRoot(t, target), dir, withNode(name === found.node.name ? found.node : { ...found.node, name }), true);
    moves.push({ from: path, to: pathOf(target, [...dir, name]) });
  }
  return { kind: "moved", moves, tree: t };
}

/**
 * Deletes notes and folders. `notes` lists every note that goes, and `ask` says whether to ask
 * first: a folder with notes, five or more items, or any public note (Files → Deleting).
 */
export function planDelete(tree: WorkspaceTree, paths: readonly string[]): Refusal | { kind: "deleted"; notes: string[]; ask: boolean; tree: WorkspaceTree } {
  let t = tree;
  const notes: string[] = [];
  let ask = paths.length >= 5;
  for (const path of paths) {
    const found = findNode(t, path);
    if (!found) return refuse("notFound");
    if (found.root.readOnly) return refuse("readOnly");
    const inside = found.node.kind === "note"
      ? [path]
      : [...walk({ roots: [{ ...found.root, path, children: found.node.children }] })].filter((e) => e.node.kind === "note").map((e) => e.path);
    if (found.node.kind === "folder" && inside.length) ask = true;
    if (found.root.id === "public" && inside.length) ask = true;
    notes.push(...inside);
    const parts = partsOf(found.root.path, path);
    t = edit(t, found.root, parts.slice(0, -1), without(found.node.name));
  }
  return { kind: "deleted", notes, ask, tree: t };
}
