/**
 * Expand and shrink selection (Keyboard shortcuts → Everyday editing, Pro layer, KEY-04, D-160).
 * Each expand grows the selection one step: the word at the caret, its sentence, its text block, its
 * block (a list item or the note's top-level block, as the block keys count them), then the note.
 * A step selecting nothing more is skipped. Shrink retraces the steps; moving the caret forgets them.
 * Inside a table cell the cell's text is the last step.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";

type Range = { from: number; to: number };
interface Steps { stack: { anchor: number; head: number }[]; at: Range | null }
const key = new PluginKey<Steps>("expandSelection");
const ITEMS = new Set(["listItem", "taskItem"]);
const CELLS = new Set(["tableCell", "tableHeader"]);
const WORD = /[\p{L}\p{N}_'’]/u;

/** Remembers the steps expand took, while the selection is still the one it made. */
export const expandSelectionPlugin = () => new Plugin<Steps>({
  key,
  state: {
    init: () => ({ stack: [], at: null }),
    apply(tr, prev, _old, state) {
      const meta = tr.getMeta(key) as Steps | undefined;
      if (meta) return meta;
      if (!prev.at) return prev;
      const { from, to } = state.selection;
      return from === prev.at.from && to === prev.at.to && !tr.docChanged ? prev : { stack: [], at: null };
    },
  },
});

/** The extension that keeps expand's steps. */
export const ExpandSelection = Extension.create({ name: "expandSelection", addProseMirrorPlugins: () => [expandSelectionPlugin()] });

function candidates(state: EditorState): Range[] {
  const { $from, $to, from, to } = state.selection;
  const out: Range[] = [];
  const block = $from.parent;
  if (block.isTextblock && $from.sameParent($to)) {
    const start = $from.start();
    const text = block.textBetween(0, block.content.size, "\ufffc", "\ufffc");
    const a = from - start;
    const b = to - start;
    // The word: grow over word characters on either side.
    let ws = a;
    let we = b;
    while (ws > 0 && WORD.test(text[ws - 1]!)) ws--;
    while (we < text.length && WORD.test(text[we]!)) we++;
    if (we > ws) out.push({ from: start + ws, to: start + we });
    // The sentence: from after the previous sentence end to just past the next one.
    let ss = a;
    while (ss > 0 && !/[.!?]\s/.test(text.slice(ss - 2, ss))) ss--;
    while (ss < a && /\s/.test(text[ss]!)) ss++;
    const rest = text.slice(b).search(/[.!?](\s|$)/);
    const se = rest < 0 ? text.length : b + rest + 1;
    out.push({ from: start + ss, to: start + Math.min(se, text.length) });
    out.push({ from: start, to: start + block.content.size });
  }
  // A table cell is the limit.
  for (let d = $from.depth; d > 0; d--) if (CELLS.has($from.node(d).type.name)) return out;
  for (let d = $from.depth; d > 0; d--) {
    if (ITEMS.has($from.node(d).type.name) || d === 1) {
      const s = TextSelection.between(state.doc.resolve($from.before(d) + 1), state.doc.resolve($from.after(d) - 1));
      out.push({ from: Math.min(s.from, from), to: Math.max(s.to, to) });
      if (d === 1) break;
    }
  }
  const all = TextSelection.between(state.doc.resolve(0), state.doc.resolve(state.doc.content.size));
  out.push({ from: all.from, to: all.to });
  return out;
}

function expand(editor: Editor): boolean {
  const { state } = editor;
  const { from, to, anchor, head } = state.selection;
  const next = candidates(state).find((r) => r.from <= from && r.to >= to && (r.from < from || r.to > to));
  if (!next) return false;
  const prev = key.getState(state) ?? { stack: [], at: null };
  const tr = state.tr.setSelection(TextSelection.create(state.doc, next.from, next.to));
  tr.setMeta(key, { stack: [...prev.stack, { anchor, head }], at: next });
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function shrink(editor: Editor): boolean {
  const { state } = editor;
  const steps = key.getState(state);
  const last = steps?.stack.at(-1);
  if (!steps?.at || !last) return false;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, last.anchor, last.head));
  const stack = steps.stack.slice(0, -1);
  tr.setMeta(key, { stack, at: stack.length ? { from: tr.selection.from, to: tr.selection.to } : null });
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export const EXPAND_ACTIONS: Readonly<Record<string, (editor: Editor) => boolean>> = {
  "edit.expandSelection": expand,
  "edit.shrinkSelection": shrink,
};
