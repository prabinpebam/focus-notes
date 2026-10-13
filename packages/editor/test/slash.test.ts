// @vitest-environment happy-dom
/**
 * EDT-06: the slash menu's editor side. It opens on `/` at the start of a block or after a space,
 * never in code, follows the typed query, keeps the text on Esc, and inserts any registered block.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  closeSlashMenu, coreExtensions, EDITOR_OPTIONS, insertSlashEntry, MarkdownSession, registerBlock, slashCatalog, slashEntries, slashInfo,
  validSlashEntries, type PMNode,
} from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  return { editor, md: () => session.serialize(editor.getJSON() as PMNode) };
}

function caretAfter(editor: Editor, text?: string) {
  let at = editor.state.doc.content.size - 1;
  if (text) {
    let found = false;
    editor.state.doc.descendants((node, pos) => {
      const i = node.isText ? node.text!.indexOf(text) : -1;
      if (i >= 0 && !found) {
        found = true;
        at = pos + i + text.length;
      }
    });
  }
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}

/** Types like a keyboard: each character goes through text input handlers first. */
function type(editor: Editor, text: string) {
  const view = editor.view;
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

const backspace = (editor: Editor) => {
  const { from } = editor.state.selection;
  editor.view.dispatch(editor.state.tr.delete(from - 1, from));
};
const entry = (id: string) => slashEntries().find((e) => e.id === id)!;

describe("entries come from the block registry (EDT-06, EXT-01)", () => {
  it("lists every insertable block, grouped, with its icon and Markdown shortcut", () => {
    expect(slashCatalog()).toEqual([
      { id: "block.paragraph", title: "format.block.paragraph", group: "text", icon: "text", markdown: "" },
      { id: "block.heading1", title: "format.block.heading1", group: "text", icon: "heading1", markdown: "#" },
      { id: "block.heading2", title: "format.block.heading2", group: "text", icon: "heading2", markdown: "##" },
      { id: "block.heading3", title: "format.block.heading3", group: "text", icon: "heading3", markdown: "###" },
      { id: "block.bulletList", title: "format.block.bulletList", group: "lists", icon: "bulletList", markdown: "-" },
      { id: "block.orderedList", title: "format.block.orderedList", group: "lists", icon: "numberedList", markdown: "1." },
      { id: "block.taskList", title: "format.block.taskList", group: "lists", icon: "taskList", markdown: "[ ]" },
      { id: "block.quote", title: "format.block.quote", group: "text", icon: "quote", markdown: ">" },
      { id: "block.codeBlock", title: "format.block.codeBlock", group: "insert", icon: "code", markdown: "```" },
      { id: "block.divider", title: "format.block.divider", group: "insert", icon: "divider", markdown: "---" },
      { id: "block.table", title: "format.block.table", group: "insert", icon: "table", markdown: "|" },
    ]);
  });
  it("a block registered later appears by registration alone", () => {
    registerBlock({
      name: "testCallout", title: "block.testCallout", markdown: "native", insertable: true,
      slash: [{ id: "block.testCallout", title: "format.block.quote", group: "insert", icon: "info", insert: ({ commands }) => commands.setBlockquote() }],
    });
    registerBlock({ name: "testHidden", title: "block.testHidden", markdown: "native", insertable: false, slash: [{ id: "block.testHidden", title: "x", group: "insert", icon: "info", insert: () => true }] });
    const ids = slashCatalog().map((e) => e.id);
    expect(ids).toContain("block.testCallout");
    expect(ids).not.toContain("block.testHidden");
  });
});

describe("when it opens (EDT-06)", () => {
  it("opens at the start of a block and after a space, and follows the query", () => {
    const { editor } = open("Text\n");
    caretAfter(editor, "Text");
    type(editor, " /he");
    expect(slashInfo(editor.state)).toMatchObject({ open: true, query: "he" });
    type(editor, "a");
    expect(slashInfo(editor.state).query).toBe("hea");
    const fresh = open("");
    type(fresh.editor, "/");
    expect(slashInfo(fresh.editor.state)).toMatchObject({ open: true, from: 1, query: "" });
  });
  it("doesn't open inside a word, in a code block, or in inline code", () => {
    const { editor } = open("and\n");
    caretAfter(editor, "and");
    type(editor, "/or");
    expect(slashInfo(editor.state).open).toBe(false);
    const code = open("```\nx\n```\n");
    caretAfter(code.editor, "x");
    type(code.editor, " /");
    expect(slashInfo(code.editor.state).open).toBe(false);
    const inline = open("a `code` b\n");
    caretAfter(inline.editor, "cod");
    type(inline.editor, " /");
    expect(slashInfo(inline.editor.state).open).toBe(false);
  });
  it("closes when the / is deleted, after a space straight after it, or when the caret leaves", () => {
    const { editor } = open("");
    type(editor, "/h");
    backspace(editor);
    expect(slashInfo(editor.state).open).toBe(true);
    backspace(editor);
    expect(slashInfo(editor.state).open).toBe(false);
    type(editor, "/ ");
    expect(slashInfo(editor.state).open).toBe(false);
    const moved = open("First\n\nSecond\n");
    caretAfter(moved.editor, "Second");
    type(moved.editor, " /x");
    caretAfter(moved.editor, "First");
    expect(slashInfo(moved.editor.state).open).toBe(false);
  });
  it("Esc closes it and keeps what was typed, / included", () => {
    const { editor, md } = open("");
    type(editor, "/quo");
    expect(closeSlashMenu(editor)).toBe(true);
    expect(slashInfo(editor.state).open).toBe(false);
    expect(closeSlashMenu(editor)).toBe(false);
    type(editor, "te");
    expect(slashInfo(editor.state).open).toBe(false);
    expect(md()).toBe("/quote\n");
  });
});

describe("inserting (EDT-06)", () => {
  it("turns an empty block into the chosen one, with the caret inside", () => {
    const { editor, md } = open("");
    type(editor, "/h2");
    expect(insertSlashEntry(editor, entry("block.heading2"))).toBe(true);
    expect(slashInfo(editor.state).open).toBe(false);
    type(editor, "Title");
    expect(md()).toBe("## Title\n");
  });
  it("inserts the block below when the current one has text, and one undo brings the query back", () => {
    const { editor, md } = open("Intro\n");
    caretAfter(editor, "Intro");
    type(editor, " /quo");
    insertSlashEntry(editor, entry("block.quote"));
    editor.commands.undo();
    expect(md()).toBe("Intro /quo\n");
    editor.commands.redo();
    type(editor, "Said");
    expect(md()).toBe("Intro\n\n> Said\n");
  });
  it("inserts lists, code, and a divider", () => {
    for (const [id, typed, out] of [
      ["block.bulletList", "a", "- a\n"], ["block.orderedList", "b", "1. b\n"], ["block.taskList", "c", "- [ ] c\n"],
      ["block.codeBlock", "x = 1", "```\nx = 1\n```\n"], ["block.divider", "after", "---\n\nafter\n"], ["block.paragraph", "p", "p\n"],
    ] as const) {
      const { editor, md } = open("");
      type(editor, "/");
      insertSlashEntry(editor, entry(id));
      type(editor, typed);
      expect(md(), id).toBe(out);
    }
  });
  it("offers only the blocks valid where the / is (DD-FMT-08)", () => {
    const { editor } = open("- item\n");
    caretAfter(editor, "item");
    type(editor, " /");
    const valid = validSlashEntries(editor, slashEntries()).map((e) => e.id);
    expect(valid).not.toContain("block.heading1");
    expect(valid).toContain("block.bulletList");
    const plain = open("");
    type(plain.editor, "/");
    expect(validSlashEntries(plain.editor, slashEntries()).map((e) => e.id)).toEqual(slashEntries().map((e) => e.id));
    const heading = open("## Title\n");
    caretAfter(heading.editor, "Title");
    type(heading.editor, " /");
    expect(validSlashEntries(heading.editor, slashEntries()).map((e) => e.id)).toContain("block.heading2");
  });
});
