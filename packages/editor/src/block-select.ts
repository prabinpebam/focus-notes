/**
 * Block selection mode (Keyboard shortcuts → Blocks, Pro layer, KEY-04, D-160). Esc while typing
 * selects the caret's block; ↑/↓ move between blocks and Shift+↑/↓ extend; Backspace, Delete, and
 * Mod+Shift+K delete the selected blocks; Mod+C copies them; Enter goes back to typing at the first
 * one's start; Esc again goes back to where the caret was. Typing leaves the mode without replacing
 * anything. The caret stays in the head block, so the block keys (move, duplicate, turn into) act on it.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { blockHooks, blockInfo, blockTextStart } from "./blocks.ts";

interface Mode { anchor: number; head: number; caret: { anchor: number; head: number } }
const key = new PluginKey<Mode | null>("blockSelection");

export const blockSelection = (state: EditorState): Mode | null => key.getState(state) ?? null;

/** The selected blocks, first to last: their positions and the range they cover. */
export function selectedBlocks(state: EditorState): { from: number; to: number; blocks: number[] } | null {
  const m = key.getState(state);
  if (!m) return null;
  const $a = state.doc.resolve(m.anchor);
  const parent = $a.parent;
  const start = $a.start();
  const lo = Math.min(m.anchor, m.head);
  const hi = Math.max(m.anchor, m.head);
  const blocks: number[] = [];
  let to = lo;
  parent.forEach((node, offset) => {
    const pos = start + offset;
    if (pos >= lo && pos <= hi) {
      blocks.push(pos);
      to = pos + node.nodeSize;
    }
  });
  return { from: lo, to, blocks };
}

const inTable = (state: EditorState) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return true;
  return false;
};

/** The sibling block before or after the block at `pos`, if there is one. */
function sibling(state: EditorState, pos: number, dir: 1 | -1): number | null {
  const $p = state.doc.resolve(pos);
  const index = $p.index();
  const target = index + dir;
  if (target < 0 || target >= $p.parent.childCount) return null;
  let at = $p.start();
  for (let i = 0; i < target; i++) at += $p.parent.child(i).nodeSize;
  return at;
}

/** Puts the caret at the start of the block at `pos`'s text (or near it, for a divider). */
function caretInto(tr: Transaction, pos: number): Transaction {
  const text = blockTextStart({ doc: tr.doc } as EditorState, pos);
  return tr.setSelection(text !== null ? TextSelection.create(tr.doc, text) : Selection.near(tr.doc.resolve(pos)));
}

function enter(editor: Editor): boolean {
  const { state } = editor;
  if (!editor.isEditable || inTable(state) || key.getState(state)) return false;
  const info = blockInfo(state);
  if (!info) return false;
  const { anchor, head } = state.selection;
  editor.view.dispatch(state.tr.setMeta(key, { anchor: info.block, head: info.block, caret: { anchor, head } }).setMeta("addToHistory", false));
  return true;
}

function leave(editor: Editor, caret?: number | { anchor: number; head: number }): void {
  const tr = editor.state.tr.setMeta(key, null).setMeta("addToHistory", false);
  if (typeof caret === "number") caretInto(tr, caret);
  else if (caret) tr.setSelection(TextSelection.create(tr.doc, Math.min(caret.anchor, tr.doc.content.size), Math.min(caret.head, tr.doc.content.size)));
  editor.view.dispatch(tr.scrollIntoView());
}

function deleteSelected(editor: Editor): boolean {
  const { state } = editor;
  const sel = selectedBlocks(state);
  if (!sel) return false;
  const $a = state.doc.resolve(sel.from);
  const all = sel.blocks.length === $a.parent.childCount;
  const tr = state.tr.setMeta(key, null);
  if (all && $a.depth === 0) tr.replaceWith(0, state.doc.content.size, state.schema.nodes.paragraph!.create());
  else if (all) tr.delete($a.before(), $a.after());
  else tr.delete(sel.from, sel.to);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(all && $a.depth > 0 ? $a.before() : sel.from, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export const BlockSelection = Extension.create<{ className: string }>({
  name: "blockSelection",
  // Before the app's keymap: in the mode, the arrows, Enter, Backspace, and Esc are the mode's.
  priority: 1000,
  addOptions: () => ({ className: "" }),
  addProseMirrorPlugins() {
    const editor = this.editor;
    const className = this.options.className;
    return [new Plugin<Mode | null>({
      key,
      state: {
        init: () => null,
        apply(tr, prev, _old, state) {
          const meta = tr.getMeta(key) as Mode | null | undefined;
          if (meta !== undefined) return meta;
          // The caret moved some other way (Mod+Home, a click, a find): the mode ends.
          if (prev && tr.selectionSet && !tr.docChanged) return null;
          if (!prev || !tr.docChanged) return prev;
          // One block selected: it's the caret's, which the block keys move, duplicate, or turn into another type.
          if (prev.anchor === prev.head) {
            const b = blockInfo(state)?.block;
            return b === undefined ? null : { ...prev, anchor: b, head: b };
          }
          // Moving or duplicating the head block with its keys: the selection follows it.
          const anchor = tr.mapping.map(prev.anchor, 1);
          const head = tr.mapping.map(prev.head, 1);
          const $a = tr.doc.resolve(Math.min(anchor, tr.doc.content.size));
          const $h = tr.doc.resolve(Math.min(head, tr.doc.content.size));
          return $a.depth === $h.depth && $a.start() === $h.start() && tr.doc.nodeAt(anchor) && tr.doc.nodeAt(head) ? { ...prev, anchor, head } : null;
        },
      },
      view: () => ({
        // Each change in how many blocks are selected is announced politely ("2 blocks selected", KEY-04).
        update(view, prevState) {
          const now = selectedBlocks(view.state)?.blocks.length ?? 0;
          const before = selectedBlocks(prevState)?.blocks.length ?? 0;
          if (now !== before) blockHooks(editor).onSelect?.(now);
        },
      }),
      props: {
        decorations(state) {
          const sel = selectedBlocks(state);
          if (!sel || !className) return null;
          return DecorationSet.create(state.doc, sel.blocks.map((pos) => Decoration.node(pos, pos + state.doc.nodeAt(pos)!.nodeSize, { class: className, "data-block-selected": "" })));
        },
        handleKeyDown(view, event) {
          const m = key.getState(view.state);
          if (!m || event.isComposing) return false;
          const mod = event.ctrlKey || event.metaKey;
          const plain = !mod && !event.altKey;
          if (event.key === "Escape" && plain && !event.shiftKey) { leave(editor, m.caret); return true; }
          if (event.key === "Enter" && plain && !event.shiftKey) {
            const sel = selectedBlocks(view.state);
            leave(editor, sel ? sel.blocks[0] : undefined);
            return true;
          }
          if ((event.key === "ArrowUp" || event.key === "ArrowDown") && plain) {
            const next = sibling(view.state, m.head, event.key === "ArrowUp" ? -1 : 1);
            if (next === null) return true;
            const tr = view.state.tr.setMeta(key, { ...m, anchor: event.shiftKey ? m.anchor : next, head: next }).setMeta("addToHistory", false);
            view.dispatch(caretInto(tr, next).scrollIntoView());
            return true;
          }
          if ((event.key === "Backspace" || event.key === "Delete") && plain) return deleteSelected(editor);
          if (mod && event.shiftKey && event.key.toLowerCase() === "k") return deleteSelected(editor);
          if (mod && !event.shiftKey && event.key.toLowerCase() === "c") {
            // The browser copies the selected blocks: the selection covers them for the copy.
            const sel = selectedBlocks(view.state);
            if (sel) view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(sel.from), view.state.doc.resolve(sel.to))).setMeta(key, m).setMeta("addToHistory", false));
            return false;
          }
          // Typing a character leaves the mode, replacing nothing: it goes in at the caret.
          if (plain && event.key.length === 1) leave(editor);
          return false;
        },
        handleDOMEvents: {
          mousedown: () => {
            if (key.getState(editor.state)) leave(editor);
            return false;
          },
        },
      },
    })];
  },
});

export const BLOCK_SELECT: Readonly<Record<string, (editor: Editor) => boolean>> = { "block.select": enter };
