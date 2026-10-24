// @vitest-environment happy-dom
/**
 * EDT-03, EDT-12, EDT-13: inline marks (shortcuts' commands, input rules, Markdown output), what the
 * formatting toolbar shows for a selection, and creating, editing, opening, and removing links.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { applyLink, coreExtensions, EDITOR_ACTIONS, formatState, ghostRange, MarkdownSession, removeLink, selectLink, setSelectionGhost, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string, opts: Parameters<typeof coreExtensions>[1] = {}) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ extensions: coreExtensions([], opts), content: session.doc as object });
  editors.push(editor);
  const md = () => session.serialize(editor.getJSON() as PMNode);
  return { editor, md };
}

/** Selects the first occurrence of `text` in the document. */
function select(editor: Editor, text: string, length = text.length) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return;
    const i = node.text!.indexOf(text);
    if (i >= 0) at = pos + i;
  });
  if (at < 0) throw new Error(`"${text}" isn't in the note`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at, at + length)));
}

/** Types like a keyboard: each character goes through the input rules first (EDT-03). */
function type(editor: Editor, text: string) {
  const view = editor.view;
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

function paste(view: EditorView, text: string) {
  const event = { clipboardData: { getData: (t: string) => (t === "text/plain" ? text : "") }, preventDefault() {} } as unknown as ClipboardEvent;
  return view.someProp("handlePaste", (f) => f(view, event, Slice.empty));
}

describe("inline marks (EDT-03)", () => {
  it("each command toggles its mark and saves canonical Markdown", () => {
    const { editor, md } = open("one two three four five\n");
    for (const [word, id] of [["one", "format.bold"], ["two", "format.italic"], ["three", "format.strike"], ["four", "format.code"]] as const) {
      select(editor, word);
      expect(EDITOR_ACTIONS[id]!(editor)).toBe(true);
    }
    select(editor, "five");
    applyLink(editor, { href: "https://example.com" });
    expect(md()).toBe("**one** *two* ~~three~~ `four` [five](https://example.com)\n");
  });

  it("a mixed selection gets the mark everywhere, and a second press removes it (DD-FMT-06)", () => {
    const { editor, md } = open("one **two** three\n");
    select(editor, "one", "one two three".length);
    expect(formatState(editor.state).marks.bold).toBe("mixed");
    EDITOR_ACTIONS["format.bold"]!(editor);
    expect(formatState(editor.state).marks.bold).toBe("on");
    expect(md()).toBe("**one two three**\n");
    EDITOR_ACTIONS["format.bold"]!(editor);
    expect(formatState(editor.state).marks.bold).toBe("off");
    expect(md()).toBe("one two three\n");
  });

  it("each format is one undo step and keeps the selection", () => {
    const { editor, md } = open("keep this\n");
    select(editor, "this");
    const before = editor.state.selection.toJSON();
    EDITOR_ACTIONS["format.italic"]!(editor);
    expect(editor.state.selection.toJSON()).toEqual(before);
    EDITOR_ACTIONS["format.bold"]!(editor);
    editor.commands.undo();
    expect(md()).toBe("keep *this*\n");
  });

  it("Markdown input rules make marks as you type", () => {
    const { editor, md } = open("\n");
    editor.commands.focus("end");
    type(editor, "a **bold** and *it* and ~~gone~~ and `x` and [site](https://example.com) end");
    expect(md()).toBe("a **bold** and *it* and ~~gone~~ and `x` and [site](https://example.com) end\n");
  });

  it("a typed web address becomes a link after a space", () => {
    const { editor, md } = open("\n");
    editor.commands.focus("end");
    type(editor, "see https://example.com ok");
    expect(md()).toBe("see <https://example.com> ok\n");
  });
});

describe("what the formatting toolbar shows (EDT-12)", () => {
  it("is for non-empty text selections only", () => {
    const { editor } = open("Hello world\n");
    editor.commands.setTextSelection(3);
    expect(formatState(editor.state).text).toBe(false);
    select(editor, "world");
    expect(formatState(editor.state)).toMatchObject({ text: true, block: "block.paragraph", oneBlock: true, codeBlock: false, inlineCode: false, link: null });
  });

  it("names the block type, or Mixed across types", () => {
    const { editor } = open("# Title\n\n- item\n\n1. first\n\n- [ ] task\n\n> quote\n\n## Two\n");
    const block = (text: string) => {
      select(editor, text);
      return formatState(editor.state).block;
    };
    expect(block("Title")).toBe("block.heading1");
    expect(block("item")).toBe("block.bulletList");
    expect(block("first")).toBe("block.orderedList");
    expect(block("task")).toBe("block.taskList");
    expect(block("quote")).toBe("block.quote");
    expect(block("Two")).toBe("block.heading2");
    // Title through item: two types.
    let from = 0;
    editor.state.doc.descendants((n, pos) => { if (n.isText && n.text === "Title") from = pos; });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + 12)));
    expect(formatState(editor.state)).toMatchObject({ block: "mixed", oneBlock: false });
  });

  it("knows code blocks, inline code, and links", () => {
    const { editor } = open("```\ncode here\n```\n\nSome `inline` and [a link](https://e.com) text\n");
    select(editor, "code here");
    expect(formatState(editor.state)).toMatchObject({ codeBlock: true, block: "block.codeBlock" });
    select(editor, "inline");
    expect(formatState(editor.state)).toMatchObject({ inlineCode: true });
    expect(formatState(editor.state).marks.code).toBe("on");
    select(editor, "link");
    expect(formatState(editor.state).link).toMatchObject({ href: "https://e.com" });
    // The caret inside a link is enough for the hover card.
    select(editor, "link", 0);
    expect(formatState(editor.state).link?.href).toBe("https://e.com");
  });

  it("turns blocks into other types in one undo step", () => {
    const { editor, md } = open("one\n\ntwo\n");
    editor.commands.selectAll();
    EDITOR_ACTIONS["block.heading2"]!(editor);
    expect(md()).toBe("## one\n\n## two\n");
    editor.commands.undo();
    expect(md()).toBe("one\n\ntwo\n");
  });
});

describe("links (EDT-13)", () => {
  it("applies to the selection and keeps it, edits in place, and removes", () => {
    const { editor, md } = open("Read the docs today\n");
    select(editor, "the docs");
    const sel = editor.state.selection.toJSON();
    expect(applyLink(editor, { href: "https://a.com" })).toBe(true);
    expect(editor.state.selection.toJSON()).toEqual(sel);
    expect(md()).toBe("Read [the docs](https://a.com) today\n");
    // Edit: with the caret in the link, select it and apply a new address.
    select(editor, "docs", 0);
    expect(selectLink(editor)).toBe(true);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("the docs");
    applyLink(editor, { href: "https://b.com" });
    expect(md()).toBe("Read [the docs](https://b.com) today\n");
    select(editor, "docs", 0);
    expect(removeLink(editor)).toBe(true);
    expect(md()).toBe("Read the docs today\n");
  });

  it("the link editor keeps the range it opened on, through edits and a lost selection (DEF-28)", () => {
    const { editor } = open("Read the docs today\n");
    select(editor, "docs");
    setSelectionGhost(editor, true);
    // An edit before it moves the range with the words; the selection then reads back collapsed.
    editor.view.dispatch(editor.state.tr.insertText("Do ", 1));
    editor.commands.setTextSelection(1);
    setSelectionGhost(editor, false);
    const r = ghostRange(editor.state)!;
    expect(editor.state.doc.textBetween(r.from, r.to)).toBe("docs");
    // A caret is kept as a caret.
    select(editor, "today", 0);
    setSelectionGhost(editor, true);
    expect(ghostRange(editor.state)).toEqual({ from: editor.state.selection.from, to: editor.state.selection.from });
  });

  it("inserts a new link at the caret with its text, or the address as text", () => {
    const { editor, md } = open("Go\n");
    editor.commands.focus("end");
    type(editor, " ");
    applyLink(editor, { href: "https://a.com", text: "there" });
    expect(md()).toBe("Go [there](https://a.com)\n");
    editor.commands.focus("end");
    type(editor, " ");
    applyLink(editor, { href: "https://b.com" });
    expect(md()).toBe("Go [there](https://a.com) <https://b.com>\n");
  });

  it("pasting a web address over selected text links it; one undo pastes the address instead (DD-FMT-07)", () => {
    const { editor, md } = open("Read the docs today\n");
    select(editor, "the docs");
    expect(paste(editor.view, "https://example.com/guide")).toBe(true);
    expect(md()).toBe("Read [the docs](https://example.com/guide) today\n");
    editor.commands.undo();
    // The address itself, as typed addresses are: it links to itself.
    expect(md()).toBe("Read <https://example.com/guide> today\n");
    expect(editor.state.doc.textContent).toBe("Read https://example.com/guide today");
  });

  it("pasting text that isn't one web address is an ordinary paste", () => {
    const { editor } = open("Read the docs\n");
    select(editor, "docs");
    expect(paste(editor.view, "two words")).toBeFalsy();
    expect(paste(editor.view, "javascript:alert(1)")).toBeFalsy();
  });

  it("Mod+click opens a link through the shell; a plain click only places the caret", () => {
    const opened: string[] = [];
    const { editor } = open("A [link](https://e.com) here\n", { openLink: (href) => opened.push(href) });
    let pos = 0;
    editor.state.doc.descendants((n, p) => { if (n.isText && n.text === "link") pos = p + 1; });
    const view = editor.view;
    const click = (mods: Partial<MouseEvent>) => view.someProp("handleClick", (f) => f(view, pos, { ctrlKey: false, metaKey: false, ...mods } as MouseEvent));
    expect(click({})).toBeFalsy();
    expect(opened).toEqual([]);
    expect(click({ ctrlKey: true })).toBe(true);
    expect(click({ metaKey: true })).toBe(true);
    expect(opened).toEqual(["https://e.com", "https://e.com"]);
  });
});
