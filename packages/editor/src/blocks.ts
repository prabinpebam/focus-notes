/**
 * Whole-block commands (Keyboard shortcuts → Blocks, Power layer): move the block with the caret up
 * or down, duplicate it, or delete it. A block is a list item inside a list, and otherwise a block
 * of the note. In a table the table's own keys run first (move and delete a row).
 */
import type { Editor } from "@tiptap/core";
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
