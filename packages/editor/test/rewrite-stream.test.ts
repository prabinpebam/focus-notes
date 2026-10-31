// @vitest-environment happy-dom
/** AI Rewrite in place: streamed chunks never enter the history; the finished rewrite is one undo step. */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { coreExtensions, MarkdownSession, REWRITE_DECORATION, RewriteStream, type PMNode } from "../src/index.ts";

const classes = { pending: "p", streaming: "s", fading: "f" };
let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string, selected: string) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text!.includes(selected)) from = pos + node.text!.indexOf(selected);
  });
  const md = () => session.serialize(editor.getJSON() as PMNode).trim();
  const run = (cmd: typeof undo) => cmd(editor.state, editor.view.dispatch);
  return { editor, target: { from, to: from + selected.length }, md, run };
}

describe("RewriteStream", () => {
  it("streams in place, locked, then Ctrl+Z restores the selection and Ctrl+Y the rewrite", () => {
    const { editor, target, md, run } = open("# Title\n\nKeep this. Change this part. Keep that.\n", "Change this part.");
    const stream = new RewriteStream(editor, target, classes);
    expect(editor.isEditable).toBe(false);
    expect(REWRITE_DECORATION.getState(editor.state)?.cls).toBe("p");
    stream.push("New ");
    expect(md()).toContain("Keep this. New  Keep that.");
    expect(REWRITE_DECORATION.getState(editor.state)?.cls).toBe("s");
    stream.push("words here.");
    expect(md()).toContain("Keep this. New words here. Keep that.");
    expect(stream.finish()).toBe(true);
    expect(editor.isEditable).toBe(true);
    expect(md()).toBe("# Title\n\nKeep this. New words here. Keep that.");
    expect(REWRITE_DECORATION.getState(editor.state)?.cls).toBe("f");
    expect(run(undo)).toBe(true);
    expect(md()).toBe("# Title\n\nKeep this. Change this part. Keep that.");
    // Only one step: nothing of the stream is left in the history.
    expect(run(undo)).toBe(false);
    expect(run(redo)).toBe(true);
    expect(md()).toBe("# Title\n\nKeep this. New words here. Keep that.");
    stream.clear();
    expect(REWRITE_DECORATION.getState(editor.state)).toBeNull();
  });

  it("splits paragraphs at blank lines", () => {
    const { editor, target, md } = open("One two three.\n", "two");
    const stream = new RewriteStream(editor, target, classes);
    stream.push("2\n\nand ");
    stream.push("more");
    stream.finish();
    expect(md()).toBe("One 2\n\nand more three.");
  });

  it("a stop or failure puts the original back exactly and unlocks the note", () => {
    const { editor, target, md, run } = open("Alpha beta gamma.\n", "beta");
    const before = md();
    const stream = new RewriteStream(editor, target, classes);
    stream.push("BETA BETA");
    stream.abort();
    expect(md()).toBe(before);
    expect(editor.isEditable).toBe(true);
    expect(REWRITE_DECORATION.getState(editor.state)).toBeNull();
    expect(run(undo)).toBe(false);
  });

  it("no text at all is a failure, not an empty replacement", () => {
    const { editor, target, md } = open("Alpha beta gamma.\n", "beta");
    const stream = new RewriteStream(editor, target, classes);
    stream.push("  ");
    expect(stream.finish()).toBe(false);
    expect(md()).toBe("Alpha beta gamma.");
  });
});
