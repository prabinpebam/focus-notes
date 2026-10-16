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

describe("the block handle's commands, by position (EDT-07, D-160)", () => {
  /** The position of the block whose text starts with `text`: a list item, or a top-level block. */
  const blockPos = (editor: Editor, text: string) => {
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at >= 0) return false;
      if ((node.type.name === "listItem" || node.type.name === "taskItem") && node.textContent.startsWith(text)) { at = pos; return false; }
      if (editor.state.doc.resolve(pos).depth === 0 && node.textContent.startsWith(text) && node.type.name !== "bulletList") { at = pos; return false; }
      return true;
    });
    return at;
  };
  it("moves a block to a boundary between blocks, as one undo step, with the caret at its start", () => {
    const { editor, md } = open("one\n\ntwo\n\nthree\n", "one");
    const three = blockPos(editor, "three");
    expect(EDITOR_ACTIONS["block.moveTo"]!(editor, { block: blockPos(editor, "one"), to: three + editor.state.doc.nodeAt(three)!.nodeSize })).toBe(true);
    expect(md()).toBe("two\n\nthree\n\none\n");
    expect(editor.state.selection.$from.parent.textContent).toBe("one");
    expect(editor.state.selection.$from.parentOffset).toBe(0);
    editor.commands.undo();
    expect(md()).toBe("one\n\ntwo\n\nthree\n");
  });
  it("moves a list item only between the items of its list, and refuses a drop where it already is", () => {
    const { editor, md } = open("- a\n- b\n- c\n\nafter\n", "a");
    const a = blockPos(editor, "a");
    const c = blockPos(editor, "c");
    expect(EDITOR_ACTIONS["block.moveTo"]!(editor, { block: a, to: c + editor.state.doc.nodeAt(c)!.nodeSize })).toBe(true);
    expect(md()).toBe("- b\n- c\n- a\n\nafter\n");
    const moved = blockPos(editor, "a");
    // Out of its list, onto the note's top level: refused.
    expect(EDITOR_ACTIONS["block.moveTo"]!(editor, { block: moved, to: editor.state.doc.content.size })).toBe(false);
    // Onto its own start or end: nothing to do.
    expect(EDITOR_ACTIONS["block.moveTo"]!(editor, { block: moved, to: moved })).toBe(false);
    expect(EDITOR_ACTIONS["block.moveTo"]!(editor, { block: moved, to: moved + editor.state.doc.nodeAt(moved)!.nodeSize })).toBe(false);
  });
  it("runs the block menu's actions on the handle's block, wherever the caret is", () => {
    const { editor, md } = open("one\n\ntwo\n\nthree\n", "three");
    expect(EDITOR_ACTIONS["block.duplicate"]!(editor, { block: blockPos(editor, "one") })).toBe(true);
    expect(md()).toBe("one\n\none\n\ntwo\n\nthree\n");
    expect(EDITOR_ACTIONS["block.delete"]!(editor, { block: blockPos(editor, "two") })).toBe(true);
    expect(md()).toBe("one\n\none\n\nthree\n");
    expect(EDITOR_ACTIONS["block.moveUp"]!(editor, { block: blockPos(editor, "three") })).toBe(true);
    expect(md()).toBe("one\n\nthree\n\none\n");
    expect(EDITOR_ACTIONS["block.heading2"]!(editor, { block: blockPos(editor, "three") })).toBe(true);
    expect(md()).toBe("one\n\n## three\n\none\n");
  });
});
