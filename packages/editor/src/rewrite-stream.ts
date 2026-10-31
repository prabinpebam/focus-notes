/**
 * Rewrite in place (AI Rewrite): the selection is replaced by a streamed answer. While it streams the
 * note is read-only, the text being rewritten carries a decoration (the shimmer, then the rainbow of
 * the new text), and every chunk is a transaction outside the history. When it finishes, the note
 * goes back to the original for an instant and the whole answer goes in as ONE undo step: Ctrl+Z
 * restores the selection, Ctrl+Y brings the rewrite back. A failure or Esc restores the original
 * exactly. The decoration's classes come from the host (packages/ui); nothing here is styled.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Fragment, Slice } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";

interface Mark { from: number; to: number; cls: string }
export const REWRITE_DECORATION = new PluginKey<Mark | null>("rewriteDecoration");

/** The decoration over text being rewritten; mapped through every change, set by `RewriteStream`. */
export const RewriteDecoration = Extension.create({
  name: "rewriteDecoration",
  addProseMirrorPlugins() {
    return [new Plugin<Mark | null>({
      key: REWRITE_DECORATION,
      state: {
        init: () => null,
        apply(tr, value) {
          const meta = tr.getMeta(REWRITE_DECORATION) as Mark | null | undefined;
          if (meta !== undefined) return meta;
          if (!value || !tr.docChanged) return value;
          const from = tr.mapping.map(value.from, -1);
          const to = tr.mapping.map(value.to, 1);
          return to > from ? { ...value, from, to } : null;
        },
      },
      props: {
        decorations(state) {
          const m = REWRITE_DECORATION.getState(state);
          return m && m.to > m.from ? DecorationSet.create(state.doc, [Decoration.inline(m.from, m.to, { class: m.cls })]) : null;
        },
      },
    })];
  },
});

/** The answer's text as paragraphs (split at blank lines), open at both ends so it joins the text around it. */
function slice(editor: Editor, text: string): Slice {
  const { schema } = editor.state;
  const paragraph = schema.nodes.paragraph!;
  const parts = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " "));
  const nodes = parts.map((p) => paragraph.create(null, p ? schema.text(p) : null));
  return new Slice(Fragment.fromArray(nodes), 1, 1);
}
const quiet = (tr: Transaction) => tr.setMeta("addToHistory", false);

export interface RewriteClasses { pending: string; streaming: string; fading: string }

export class RewriteStream {
  readonly #editor: Editor;
  readonly #classes: RewriteClasses;
  readonly #from: number;
  readonly #original: Slice;
  readonly #wasEditable: boolean;
  #end: number;
  #text = "";
  #started = false;
  #done = false;

  /** Locks the note and marks the selection as being rewritten. */
  constructor(editor: Editor, target: { from: number; to: number }, classes: RewriteClasses) {
    this.#editor = editor;
    this.#classes = classes;
    this.#from = target.from;
    this.#end = target.to;
    this.#original = editor.state.doc.slice(target.from, target.to);
    this.#wasEditable = editor.isEditable;
    editor.setEditable(false, false);
    this.#mark(quiet(editor.state.tr), classes.pending);
  }

  get active(): boolean {
    return !this.#done;
  }

  #mark(tr: Transaction, cls: string | null, to = this.#end): void {
    tr.setMeta(REWRITE_DECORATION, cls ? { from: this.#from, to, cls } : null);
    this.#editor.view.dispatch(tr);
  }

  /** More of the answer: the selection (first time) or the text so far is replaced, outside the history. */
  push(chunk: string): void {
    if (this.#done || !chunk) return;
    this.#text += chunk;
    const text = this.#started ? this.#text : this.#text.replace(/^\s+/, "");
    if (!text) return;
    const tr = quiet(this.#editor.state.tr).replace(this.#from, this.#end, slice(this.#editor, text));
    this.#end = tr.mapping.map(this.#end);
    this.#started = true;
    this.#mark(tr, this.#classes.streaming);
  }

  /** The answer is complete: one undo step from the original to it, and the rainbow starts to fade. False if nothing came. */
  finish(): boolean {
    if (this.#done) return false;
    const text = this.#text.trim();
    if (!this.#started || !text) {
      this.abort();
      return false;
    }
    this.#done = true;
    const editor = this.#editor;
    // Back to the original outside the history, then the whole answer as one step.
    const back = quiet(editor.state.tr).replace(this.#from, this.#end, this.#original);
    const originalEnd = back.mapping.map(this.#end);
    back.setMeta(REWRITE_DECORATION, null);
    editor.view.dispatch(back);
    const tr = closeHistory(editor.state.tr).replace(this.#from, originalEnd, slice(editor, text));
    this.#end = tr.mapping.map(originalEnd);
    tr.setSelection(TextSelection.create(tr.doc, this.#end)).scrollIntoView();
    this.#mark(tr, this.#classes.fading);
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.setEditable(this.#wasEditable, false);
    return true;
  }

  /** Failure or Esc: the original text exactly, outside the history, and the note unlocked. */
  abort(): void {
    if (this.#done) return;
    this.#done = true;
    const tr = quiet(this.#editor.state.tr);
    if (this.#started) tr.replace(this.#from, this.#end, this.#original);
    this.#mark(tr, null);
    this.#editor.setEditable(this.#wasEditable, false);
  }

  /** The fade has run: the text is ordinary again. */
  clear(): void {
    if (REWRITE_DECORATION.getState(this.#editor.state)) this.#mark(quiet(this.#editor.state.tr), null);
  }
}
