/**
 * Rewrite in place (AI Rewrite): the selection is replaced by a streamed answer. While it streams the
 * note is read-only, the text being rewritten carries a decoration (the shimmer, then the rainbow of
 * the new text), and every chunk is a transaction outside the history. The answer is Markdown and
 * shows formatted as it arrives: syntax still open mid-stream (`**`, a code span or fence, a link)
 * is closed for display only, and only the blocks that changed are touched, so nothing flickers.
 * When it finishes, the note goes back to the original for an instant and the provider's whole
 * answer goes in as ONE undo step: Ctrl+Z restores the selection, Ctrl+Y brings the rewrite back. A
 * failure or Esc restores the original exactly. The decoration's classes come from the host
 * (packages/ui); nothing here is styled.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Fragment, Slice, type Node as ProseNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { closeHistory } from "@tiptap/pm/history";
import { pastedMarkdownBlocks } from "./paste.ts";

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

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** A last line of nothing but block markers so far (`#`, `-`, `>`, `1.`, `---`): held back until it has text. */
const MARKERS_ONLY = /^\s*(?:[#>*+\-=_`~|:]|\d+[.)]?)+\s*$/;

/** The open emphasis, code span and link at the end of a block, closed (a link's `[` is dropped until its `]` comes). */
function closeInline(s: string): string {
  const open: { tok: string; at: number }[] = [];
  const last = (tok: string) => {
    for (let k = open.length - 1; k >= 0; k--) if (open[k]!.tok === tok) return k;
    return -1;
  };
  const toggle = (tok: string, at: number) => {
    const k = last(tok);
    if (k >= 0) open.splice(k);
    else open.push({ tok, at });
  };
  let code = "";
  let url = false;
  for (let i = 0; i < s.length;) {
    const c = s[i]!;
    let run = 1;
    while (s[i + run] === c) run++;
    if (code) {
      if (c === "`" && run === code.length) code = "";
    } else if (c === "\\") {
      i += 2;
      continue;
    } else if (url) {
      if (c === ")") url = false;
    } else if (c === "`") {
      code = s.slice(i, i + run);
    } else if (c === "*") {
      const bullet = run === 1 && s[i + 1] === " " && /(^|\n)[ \t]*$/.test(s.slice(0, i));
      if (!bullet) {
        if (run >= 2) toggle("**", i);
        if (run % 2 === 1) toggle("*", i);
      }
    } else if (c === "_") {
      if (!(/\w/.test(s[i - 1] ?? "") && /\w/.test(s[i + run] ?? ""))) {
        if (run >= 2) toggle("__", i);
        if (run % 2 === 1) toggle("_", i);
      }
    } else if (c === "~" && run >= 2) {
      toggle("~~", i);
    } else if (c === "[") {
      open.push({ tok: "[", at: i });
      run = 1;
    } else if (c === "]") {
      const k = last("[");
      if (k >= 0) open.splice(k, 1);
      if (s[i + 1] === "(") {
        url = true;
        i += 2;
        continue;
      }
      run = 1;
    }
    i += run;
  }
  let out = s + code + (url ? ")" : "") + open.filter((o) => o.tok !== "[").reverse().map((o) => o.tok).join("");
  for (const o of [...open].reverse()) if (o.tok === "[") out = out.slice(0, o.at) + out.slice(o.at + 1);
  return out;
}

/**
 * The Markdown streamed so far, made to render as it will when complete: an open code fence is
 * closed, a last line of only markers is held back (no `#` paragraph turning into a heading, no
 * `-` turning the line above into one), and open inline syntax in the last block is closed. Display
 * only: the note gets the provider's text itself.
 */
export function streamingMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/(^|[ \t])(?:[*_~]+|`{1,2})$/, "$1").split("\n");
  let fence = "";
  let block = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = FENCE.exec(line);
    if (fence) {
      if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && !line.slice(m[0].length).trim()) {
        fence = "";
        block = i + 1;
      }
      continue;
    }
    if (m && !(m[1]![0] === "`" && line.slice(m[0].length).includes("`"))) fence = m[1]!;
    else if (!line.trim()) block = i + 1;
  }
  if (fence) {
    if (lines.length > 1 && new RegExp(`^ {0,3}\\${fence[0]}+$`).test(lines[lines.length - 1]!)) lines.pop();
    return `${lines.join("\n")}\n${fence}`;
  }
  if (MARKERS_ONLY.test(lines[lines.length - 1]!)) lines.pop();
  const at = Math.min(block, lines.length);
  const head = lines.slice(0, at).join("\n");
  const tail = closeInline(lines.slice(at).join("\n").trimEnd());
  return head && tail ? `${head}\n${tail}` : head + tail;
}

const quiet = (tr: Transaction) => tr.setMeta("addToHistory", false);

export interface RewriteClasses { pending: string; streaming: string; fading: string }

interface Target { doc: ProseNode; from: number; to: number }

export class RewriteStream {
  readonly #editor: Editor;
  readonly #classes: RewriteClasses;
  readonly #original: ProseNode;
  readonly #from: number;
  readonly #to: number;
  readonly #wasEditable: boolean;
  #text = "";
  #shown = false;
  #done = false;

  /** Locks the note and marks the selection as being rewritten. */
  constructor(editor: Editor, target: { from: number; to: number }, classes: RewriteClasses) {
    this.#editor = editor;
    this.#classes = classes;
    this.#original = editor.state.doc;
    this.#from = target.from;
    this.#to = target.to;
    this.#wasEditable = editor.isEditable;
    editor.setEditable(false, false);
    this.#mark(quiet(editor.state.tr), classes.pending, target.from, target.to);
  }

  get active(): boolean {
    return !this.#done;
  }

  #mark(tr: Transaction, cls: string | null, from = 0, to = 0): void {
    tr.setMeta(REWRITE_DECORATION, cls && to > from ? { from, to, cls } : null);
    this.#editor.view.dispatch(tr);
  }

  /** The original note with `markdown`'s blocks in place of the selection, and where they sit. A paragraph at either end joins the text around it. */
  #target(markdown: string): Target | null {
    const blocks = pastedMarkdownBlocks(markdown);
    if (!blocks.length) return null;
    const content = Fragment.fromJSON(this.#original.type.schema, blocks);
    const open = (n: ProseNode | null) => (n?.type.name === "paragraph" ? 1 : 0);
    const tf = new Transform(this.#original).replaceRange(this.#from, this.#to, new Slice(content, open(content.firstChild), open(content.lastChild)));
    return { doc: tf.doc, from: tf.mapping.map(this.#from, -1), to: tf.mapping.map(this.#to, 1) };
  }

  /** A transaction that turns the note on screen into `doc`, replacing only what differs so unchanged blocks keep their DOM. */
  #toward(doc: ProseNode): Transaction {
    const { state } = this.#editor;
    const tr = state.tr;
    const start = state.doc.content.findDiffStart(doc.content);
    if (start == null) return tr;
    let { a, b } = state.doc.content.findDiffEnd(doc.content)!;
    const adjust = Math.max(0, start - Math.min(a, b));
    a += adjust;
    b += adjust;
    tr.replace(start, a, doc.slice(start, b));
    if (!tr.doc.eq(doc)) tr.replaceWith(0, tr.doc.content.size, doc.content);
    return tr;
  }

  /** More of the answer: the note shows all of it so far, formatted, outside the history. */
  push(chunk: string): void {
    if (this.#done || !chunk) return;
    this.#text += chunk;
    const target = this.#target(streamingMarkdown(this.#text.replace(/^\s+/, "")));
    if (!target) return;
    this.#shown = true;
    this.#mark(quiet(this.#toward(target.doc)), this.#classes.streaming, target.from, target.to);
  }

  /** The answer is complete: one undo step from the original to the provider's Markdown, and the rainbow starts to fade. False if nothing came. */
  finish(): boolean {
    if (this.#done) return false;
    const text = this.#text.trim();
    const target = this.#shown && text ? this.#target(text) : null;
    if (!target) {
      this.abort();
      return false;
    }
    this.#done = true;
    const editor = this.#editor;
    // Back to the original outside the history, then the whole answer as one step.
    const back = quiet(this.#toward(this.#original));
    back.setMeta(REWRITE_DECORATION, null);
    editor.view.dispatch(back);
    const tr = closeHistory(this.#toward(target.doc));
    tr.setSelection(Selection.near(tr.doc.resolve(target.to), -1)).scrollIntoView();
    this.#mark(tr, this.#classes.fading, target.from, target.to);
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.setEditable(this.#wasEditable, false);
    return true;
  }

  /** Failure or Esc: the original note exactly, with the selection as it was, outside the history, and the note unlocked. */
  abort(): void {
    if (this.#done) return;
    this.#done = true;
    const tr = quiet(this.#toward(this.#original));
    if (tr.docChanged) tr.setSelection(TextSelection.between(tr.doc.resolve(this.#from), tr.doc.resolve(this.#to)));
    this.#mark(tr, null);
    this.#editor.setEditable(this.#wasEditable, false);
  }

  /** The fade has run: the text is ordinary again. */
  clear(): void {
    if (REWRITE_DECORATION.getState(this.#editor.state)) this.#mark(quiet(this.#editor.state.tr), null);
  }
}

