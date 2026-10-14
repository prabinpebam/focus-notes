// @vitest-environment happy-dom
/** KEY-03 (Power layer, Blocks): moving, duplicating, and deleting the block with the caret. */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { coreExtensions, EDITOR_ACTIONS, MarkdownSession, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string, caretIn: string) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(caretIn)) at = pos + node.text!.indexOf(caretIn);
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at + 1)));
  const md = () => session.serialize(editor.getJSON() as PMNode);
  const run = (id: string) => EDITOR_ACTIONS[id]!(editor);
  const caretText = () => editor.state.selection.$from.parent.textContent;
  return { editor, md, run, caretText };
}

describe("block commands (KEY-03)", () => {
  it("moves a paragraph up and down, keeping the caret in it", () => {
    const { md, run, caretText } = open("one\n\ntwo\n\nthree\n", "two");
    expect(run("block.moveUp")).toBe(true);
    expect(md()).toBe("two\n\none\n\nthree\n");
    expect(caretText()).toBe("two");
    expect(run("block.moveUp")).toBe(false);
    expect(run("block.moveDown")).toBe(true);
    expect(run("block.moveDown")).toBe(true);
    expect(md()).toBe("one\n\nthree\n\ntwo\n");
    expect(run("block.moveDown")).toBe(false);
  });
  it("moves list items within their list", () => {
    const { md, run } = open("- a\n- b\n- c\n", "c");
    expect(run("block.moveUp")).toBe(true);
    expect(md()).toBe("- a\n- c\n- b\n");
  });
  it("duplicates the block below and puts the caret in the copy", () => {
    const { editor, md, run } = open("# Title\n\nbody\n", "Title");
    const before = editor.state.selection.from;
    expect(run("block.duplicate")).toBe(true);
    expect(md()).toBe("# Title\n\n# Title\n\nbody\n");
    expect(editor.state.selection.from).toBeGreaterThan(before);
  });
  it("deletes the block, a list with its last item, and leaves an empty note an empty paragraph", () => {
    const { md, run } = open("one\n\ntwo\n", "two");
    expect(run("block.delete")).toBe(true);
    expect(md()).toBe("one\n");
    const list = open("before\n\n- only\n", "only");
    expect(list.run("block.delete")).toBe(true);
    expect(list.md()).toBe("before\n");
    const single = open("alone\n", "alone");
    expect(single.run("block.delete")).toBe(true);
    expect(single.md().trim()).toBe("");
  });
});
