// @vitest-environment happy-dom
/** AI Rewrite in place: streamed chunks never enter the history; the finished rewrite is one undo step. */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { coreExtensions, MarkdownSession, REWRITE_DECORATION, RewriteStream, streamingMarkdown, type PMNode } from "../src/index.ts";

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
    expect(md()).toContain("Keep this. New Keep that.");
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

  const answer = [
    "# A heading",
    "",
    "Some **bold**, *italic*, `code` and [a link](https://example.com/a).",
    "",
    "- one",
    "- two **strong**",
    "",
    "1. first",
    "2. second",
    "",
    "> quoted",
    "",
    "```js",
    "const a = 1;",
    "```",
    "",
    "Last line.",
  ].join("\n");

  it("shows the Markdown formatted while it streams, and the note ends with the provider's bytes as one undo step", () => {
    const { editor, target, md, run } = open("Old paragraph to replace.\n", "Old paragraph to replace.");
    const stream = new RewriteStream(editor, target, classes);
    const text = () => editor.getText();
    // Uneven chunks that split every kind of syntax.
    for (let i = 0; i < answer.length; i += 3) {
      stream.push(answer.slice(i, i + 3));
      // Display only ever shows formatted text: no Markdown markers leak into the note's text.
      expect(text()).not.toMatch(/\*\*|```|^#|\]\(/m);
    }
    const json = JSON.stringify(editor.getJSON());
    for (const t of ["heading", "bulletList", "orderedList", "blockquote", "codeBlock", "\"bold\"", "\"italic\"", "\"code\"", "\"link\""]) expect(json).toContain(t);
    expect(stream.finish()).toBe(true);
    expect(md()).toBe(answer);
    expect(run(undo)).toBe(true);
    expect(md()).toBe("Old paragraph to replace.");
    expect(run(undo)).toBe(false);
    expect(run(redo)).toBe(true);
    expect(md()).toBe(answer);
  });

  it("open syntax mid-stream renders as it will when complete", () => {
    const { editor, target } = open("Before.\n\nX\n\nAfter.\n", "X");
    const stream = new RewriteStream(editor, target, classes);
    const blocks = () => (editor.getJSON() as PMNode).content ?? [];
    const marks = () => (blocks() ?? []).flatMap((b) => b.content ?? []).flatMap((n) => (n.marks ?? []).map((m) => `${m.type}:${n.text}`));
    stream.push("Make it **bo");
    expect(editor.getText()).toContain("Make it bo");
    expect(marks()).toContain("bold:bo");
    stream.push("ld** and `co");
    expect(marks()).toEqual(expect.arrayContaining(["bold:bold", "code:co"]));
    stream.push("de`\n\n```py\nprint(1)");
    expect(blocks().some((b) => b.type === "codeBlock" && b.content?.[0]?.text === "print(1)")).toBe(true);
    stream.push("\n``");
    expect(blocks().find((b) => b.type === "codeBlock")?.content?.[0]?.text).toBe("print(1)");
    stream.abort();
    expect(editor.getText()).toBe("Before.\n\nX\n\nAfter.");
  });

  it("Esc mid-stream restores the original exactly, even inside a list and a fence", () => {
    const { editor, target, md, run } = open("# T\n\n- a\n- b\n\nKeep **this** and that.\n", "this");
    const before = md();
    const doc = editor.state.doc;
    const stream = new RewriteStream(editor, target, classes);
    stream.push("new\n\n- x\n- y\n\n```\ncode");
    stream.abort();
    expect(editor.state.doc.eq(doc)).toBe(true);
    expect(md()).toBe(before);
    expect(run(undo)).toBe(false);
  });
});

describe("streamingMarkdown", () => {
  it.each([
    ["**bo", "**bo**"],
    ["a *it", "a *it*"],
    ["a **b *c", "a **b *c***"],
    ["x `co", "x `co`"],
    ["see [the li", "see the li"],
    ["see [the link](https://ex", "see [the link](https://ex)"],
    ["snake_case word", "snake_case word"],
    ["~~gone", "~~gone~~"],
    ["Hello **", "Hello"],
    ["Para\n\n#", "Para\n"],
    ["Para\n-", "Para"],
    ["- item\n- ", "- item"],
    ["* item *em", "* item *em*"],
    ["```js\nconst a", "```js\nconst a\n```"],
    ["```js\nx\n``", "```js\nx\n```"],
    ["```\nx\n```\n\nafter **b", "```\nx\n```\n\nafter **b**"],
    ["done **bold** text", "done **bold** text"],
  ])("%j shows as %j", (input, shown) => {
    expect(streamingMarkdown(input)).toBe(shown);
  });
});
