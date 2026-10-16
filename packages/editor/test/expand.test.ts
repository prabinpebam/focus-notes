// @vitest-environment jsdom
/**
 * KEY-04: expand and shrink selection (Keyboard shortcuts → Everyday editing, D-160): word, sentence,
 * block, note; shrink retraces the steps; moving the caret forgets them; a table cell is the limit.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { coreExtensions, EDITOR_ACTIONS, EDITOR_OPTIONS, MarkdownSession } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});
function open(markdown: string) {
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions(), content: new MarkdownSession(markdown).doc as object });
  editors.push(editor);
  return editor;
}
/** Puts the caret just before the first occurrence of `text`, plus `offset`. */
function caretAt(editor: Editor, text: string, offset = 0) {
  let at = -1;
  editor.state.doc.descendants((n, pos) => {
    if (at >= 0 || !n.isText) return at < 0;
    const i = n.text!.indexOf(text);
    if (i >= 0) at = pos + i + offset;
    return false;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}
const selected = (e: Editor) => e.state.doc.textBetween(e.state.selection.from, e.state.selection.to, "|");
const expand = (e: Editor) => EDITOR_ACTIONS["edit.expandSelection"]!(e);
const shrink = (e: Editor) => EDITOR_ACTIONS["edit.shrinkSelection"]!(e);

describe("expand and shrink selection (KEY-04)", () => {
  it("grows word → sentence → block (the item, then its list) → note, and shrinks back through the same steps", () => {
    const e = open("# Title\n\n- First item. It has two sentences.\n- Second item\n\nLast paragraph.\n");
    caretAt(e, "two", 1);
    expand(e);
    expect(selected(e)).toBe("two");
    expand(e);
    expect(selected(e)).toBe("It has two sentences.");
    expand(e);
    expect(selected(e)).toBe("First item. It has two sentences.");
    // The whole list: the item's top-level block.
    expand(e);
    expect(selected(e)).toBe("First item. It has two sentences.|Second item");
    expand(e);
    expect(selected(e)).toBe("Title|First item. It has two sentences.|Second item|Last paragraph.");
    expect(expand(e)).toBe(false);
    shrink(e);
    shrink(e);
    expect(selected(e)).toBe("First item. It has two sentences.");
    shrink(e);
    shrink(e);
    expect(selected(e)).toBe("two");
    shrink(e);
    expect(e.state.selection.empty).toBe(true);
    expect(shrink(e)).toBe(false);
  });
  it("skips a step that selects nothing more (a one-sentence paragraph)", () => {
    const e = open("Just one sentence here\n\nNext.\n");
    caretAt(e, "one", 1);
    expand(e);
    expand(e);
    expect(selected(e)).toBe("Just one sentence here");
    expand(e);
    expect(selected(e)).toBe("Just one sentence here|Next.");
  });
  it("forgets its steps when the caret moves", () => {
    const e = open("Alpha beta gamma.\n");
    caretAt(e, "beta", 1);
    expand(e);
    caretAt(e, "gamma", 1);
    expect(shrink(e)).toBe(false);
    expand(e);
    expect(selected(e)).toBe("gamma");
  });
  it("stops at a table cell", () => {
    const e = open("| a | b |\n| - | - |\n| one two | x |\n");
    caretAt(e, "two", 1);
    expand(e);
    expect(selected(e)).toBe("two");
    expand(e);
    expect(selected(e)).toBe("one two");
    expect(expand(e)).toBe(false);
    expect(selected(e)).toBe("one two");
  });
});
