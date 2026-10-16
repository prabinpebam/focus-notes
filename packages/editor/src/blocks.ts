/**
 * Whole-block commands (Keyboard shortcuts → Blocks, Power layer): move the block with the caret up
 * or down, duplicate it, or delete it. A block is a list item inside a list, and otherwise a block
 * of the note. In a table the table's own keys run first (move and delete a row).
 */
import { Extension, type Editor } from "@tiptap/core";
import { Selection, TextSelection, type EditorState } from "@tiptap/pm/state";

const ITEMS = new Set(["listItem", "taskItem"]);

/** The depth of the block with the caret: the innermost list item, or the note's top-level block. */
function blockDepth(state: EditorState): number {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if (ITEMS.has($from.node(d).type.name)) return d;
  return $from.depth > 0 ? 1 : 0;
}

/** Puts the selection back where it was, shifted with the block it was in. */
function shifted(state: EditorState, delta: number, end: number): { anchor: number; head: number } {
  const { anchor, head, from, to } = state.selection;
  // A selection reaching past the block can't move with it, so it collapses to its start.
  if (to > end) return { anchor: from + delta, head: from + delta };
  return { anchor: anchor + delta, head: head + delta };
}

function moveBlock(editor: Editor, dir: 1 | -1): boolean {
  const { state } = editor;
  const d = blockDepth(state);
  if (!d) return false;
  const $from = state.selection.$from;
  const parent = $from.node(d - 1);
  const index = $from.index(d - 1);
  const target = index + dir;
  if (target < 0 || target >= parent.childCount) return false;
  const node = $from.node(d);
  const start = $from.before(d);
  const end = start + node.nodeSize;
  const neighbour = parent.child(target);
  const delta = dir < 0 ? -neighbour.nodeSize : neighbour.nodeSize;
  const tr = state.tr.delete(start, end).insert(start + (dir < 0 ? -neighbour.nodeSize : neighbour.nodeSize), node);
  const { anchor, head } = shifted(state, delta, end);
  tr.setSelection(TextSelection.create(tr.doc, anchor, head)).scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

function duplicateBlock(editor: Editor): boolean {
  const { state } = editor;
  const d = blockDepth(state);
  if (!d) return false;
  const $from = state.selection.$from;
  const node = $from.node(d);
  const end = $from.after(d);
  // The caret goes into the copy, as copying a line down does in code editors.
  const { anchor, head } = shifted(state, node.nodeSize, end);
  const tr = state.tr.insert(end, node);
  tr.setSelection(TextSelection.create(tr.doc, anchor, head)).scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

function deleteBlock(editor: Editor): boolean {
  const { state } = editor;
  let d = blockDepth(state);
  if (!d) return false;
  const $from = state.selection.$from;
  // The last item of a list takes its list with it.
  while (d > 1 && $from.node(d - 1).childCount === 1) d--;
  const start = $from.before(d);
  const end = $from.after(d);
  const tr = state.tr;
  if (d === 1 && state.doc.childCount === 1) tr.replaceWith(0, state.doc.content.size, state.schema.nodes.paragraph!.create());
  else tr.delete(start, end);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(start, tr.doc.content.size)))).scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

export const BLOCK_ACTIONS: Readonly<Record<string, (editor: Editor) => boolean>> = {
  "block.moveUp": (e) => moveBlock(e, -1),
  "block.moveDown": (e) => moveBlock(e, 1),
  "block.duplicate": duplicateBlock,
  "block.delete": deleteBlock,
};

/**
 * The block handle's moves (EDT-07, D-160): a block, named by its position, dropped at a boundary
 * between the blocks of its parent (a list item stays in its list). One transaction: one undo step.
 */
function moveBlockTo(editor: Editor, args?: Record<string, unknown>): boolean {
  const pos = args?.block;
  const to = args?.to;
  if (typeof pos !== "number" || typeof to !== "number" || !Number.isInteger(pos) || !Number.isInteger(to)) return false;
  const { doc } = editor.state;
  if (pos < 0 || pos >= doc.content.size || to < 0 || to > doc.content.size) return false;
  const node = doc.nodeAt(pos);
  if (!node) return false;
  const $pos = doc.resolve(pos);
  if (!ITEMS.has(node.type.name) && $pos.depth !== 0) return false;
  const $to = doc.resolve(to);
  if ($to.depth !== $pos.depth || $to.start() !== $pos.start() || to === pos || to === pos + node.nodeSize) return false;
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  const at = tr.mapping.map(to);
  tr.insert(at, node);
  tr.setSelection(Selection.near(tr.doc.resolve(at + 1))).scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/** Puts the caret in the block at `pos` (a list item or a top-level block), as the handle's menu acts on it. */
function placeIn(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;
  if (!Number.isInteger(pos) || pos < 0 || pos >= doc.content.size) return false;
  const node = doc.nodeAt(pos);
  if (!node || (!ITEMS.has(node.type.name) && doc.resolve(pos).depth !== 0)) return false;
  editor.view.dispatch(editor.state.tr.setSelection(Selection.near(doc.resolve(pos + 1))));
  return true;
}

type Action = (editor: Editor, args?: Record<string, unknown>) => boolean;
/** A block command that also takes `block`, the handle's block, to act on instead of the caret's. */
export const atBlock = (f: Action): Action => (editor, args) => {
  if (typeof args?.block === "number" && !placeIn(editor, args.block)) return false;
  return f(editor, args);
};

export const BLOCK_MOVE_TO: Readonly<Record<string, Action>> = { "block.moveTo": moveBlockTo };

/** What the surface hears from the block commands: the block menu was asked for (Shift+F10 outside a table). */
export interface BlockHooks {
  onMenu?: () => void;
  /** Block selection mode selected this many blocks (0: it ended), to announce (KEY-04). */
  onSelect?: (count: number) => void;
}
const hooks = new WeakMap<object, BlockHooks>();
export const blockHooks = (editor: object): BlockHooks => hooks.get(editor) ?? {};
export const BlockKit = Extension.create<BlockHooks>({
  name: "blockKit",
  addOptions: () => ({}),
  // Kept as the editor is built (an editor never mounted, in tests, has no create event).
  addProseMirrorPlugins() {
    hooks.set(this.editor, this.options);
    return [];
  },
});

/** A block as the block handle names and acts on it (EDT-07). */
export interface BlockInfo {
  /** Its position, passed back with every action. */
  block: number;
  /** Its node type: paragraph, heading, listItem, taskItem, blockquote, codeBlock, table, horizontalRule, … */
  kind: string;
  /** A heading's level, else 0. */
  level: number;
  /** First or last among its siblings: it can't move up or down. */
  first: boolean;
  last: boolean;
  /** A heading's text, for its link. */
  text: string;
}

/** The block at `pos` (a list item or a top-level block), or the caret's block. */
export function blockInfo(state: EditorState, pos?: number): BlockInfo | null {
  let at = pos;
  if (at === undefined) {
    const d = blockDepth(state);
    if (!d) return null;
    at = state.selection.$from.before(d);
  }
  if (!Number.isInteger(at) || at < 0 || at >= state.doc.content.size) return null;
  const node = state.doc.nodeAt(at);
  if (!node) return null;
  const $at = state.doc.resolve(at);
  if (!ITEMS.has(node.type.name) && $at.depth !== 0) return null;
  const index = $at.index();
  return {
    block: at, kind: node.type.name, level: node.type.name === "heading" ? Number(node.attrs.level) || 1 : 0,
    first: index === 0, last: index === $at.parent.childCount - 1, text: node.type.name === "heading" ? node.textContent : "",
  };
}

export const BLOCK_MENU: Readonly<Record<string, Action>> = {
  "block.contextMenu": (editor) => {
    const h = hooks.get(editor);
    if (!h?.onMenu || !blockInfo(editor.state)) return false;
    h.onMenu();
    return true;
  },
};

/** The first text position inside the block at `pos`, which the block handle is level with; null for a leaf. */
export function blockTextStart(state: EditorState, pos: number): number | null {
  const node = state.doc.nodeAt(pos);
  if (!node || node.isLeaf) return null;
  const sel = Selection.near(state.doc.resolve(pos + 1));
  return sel.from > pos && sel.from < pos + node.nodeSize ? sel.from : null;
}
