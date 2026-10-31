// @vitest-environment happy-dom
/** AI Rewrite in place: streamed chunks never enter the history; the finished rewrite is one undo step. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { coreExtensions, MarkdownSession, REWRITE_DECORATION, REWRITE_MEASURES, rewriteLocked, RewriteStream, streamingMarkdown, type PMNode } from "../src/index.ts";

const classes = { pending: "p", streaming: "s", fading: "f" };
/** Every chunk rendered at once, so each step can be checked. */
const now = { frame: 0 };
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
  const raw = () => session.serialize(editor.getJSON() as PMNode);
  const md = () => raw().trim();
  const run = (cmd: typeof undo) => cmd(editor.state, editor.view.dispatch);
  return { editor, target: { from, to: from + selected.length }, md, raw, run };
}

describe("RewriteStream", () => {
  it("streams in place, locked, then Ctrl+Z restores the selection and Ctrl+Y the rewrite", () => {
    const { editor, target, md, run } = open("# Title\n\nKeep this. Change this part. Keep that.\n", "Change this part.");
    const stream = new RewriteStream(editor, target, classes, now);
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
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("2\n\nand ");
    stream.push("more");
    stream.finish();
    expect(md()).toBe("One 2\n\nand more three.");
  });

  it("a stop or failure puts the original back exactly and unlocks the note", () => {
    const { editor, target, md, run } = open("Alpha beta gamma.\n", "beta");
    const before = md();
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("BETA BETA");
    stream.abort();
    expect(md()).toBe(before);
    expect(editor.isEditable).toBe(true);
    expect(REWRITE_DECORATION.getState(editor.state)).toBeNull();
    expect(run(undo)).toBe(false);
  });

  it("no text at all is a failure, not an empty replacement", () => {
    const { editor, target, md } = open("Alpha beta gamma.\n", "beta");
    const stream = new RewriteStream(editor, target, classes, now);
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
    const stream = new RewriteStream(editor, target, classes, now);
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
    const stream = new RewriteStream(editor, target, classes, now);
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
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("new\n\n- x\n- y\n\n```\ncode");
    stream.abort();
    expect(editor.state.doc.eq(doc)).toBe(true);
    expect(md()).toBe(before);
    expect(run(undo)).toBe(false);
  });
});

describe("RewriteStream hardening", () => {
  it("locks the note: no command, undo or insert changes it while it streams, and the note says it's busy", () => {
    const { editor, target, md, run } = open("Alpha beta gamma.\n", "beta");
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("BETA");
    expect(rewriteLocked(editor.state)).toBe(true);
    expect(editor.view.dom.getAttribute("aria-busy")).toBe("true");
    const during = md();
    editor.commands.insertContent("typed");
    editor.chain().selectAll().toggleBold().run();
    editor.commands.clearContent();
    run(undo);
    expect(md()).toBe(during);
    stream.push(" more");
    expect(md()).toBe("Alpha BETA more gamma.");
    stream.finish();
    expect(rewriteLocked(editor.state)).toBe(false);
    expect(editor.view.dom.getAttribute("aria-busy")).toBeNull();
    editor.commands.insertContentAt(1, "Z");
    expect(md()).toBe("ZAlpha BETA more gamma.");
  });

  it.each(["abort", "finish-empty"])("the lock is released on %s", (how) => {
    const { editor, target } = open("Alpha beta gamma.\n", "beta");
    const stream = new RewriteStream(editor, target, classes, now);
    if (how === "abort") stream.abort();
    else stream.finish();
    expect(rewriteLocked(editor.state)).toBe(false);
    expect(editor.isEditable).toBe(true);
  });

  it("a second rewrite is its own undo step: Ctrl+Z twice gives the original, Ctrl+Y twice both rewrites", () => {
    const { editor, md, run } = open("One two three.\n", "two");
    const at = (word: string) => {
      let from = -1;
      editor.state.doc.descendants((n, pos) => { if (from < 0 && n.isText && n.text!.includes(word)) from = pos + n.text!.indexOf(word); });
      return { from, to: from + word.length };
    };
    const first = new RewriteStream(editor, at("two"), classes, now);
    first.push("2");
    first.finish();
    first.clear();
    const second = new RewriteStream(editor, at("three"), classes, now);
    second.push("**3**");
    second.finish();
    expect(md()).toBe("One 2 **3**.");
    expect(run(undo)).toBe(true);
    expect(md()).toBe("One 2 three.");
    expect(run(undo)).toBe(true);
    expect(md()).toBe("One two three.");
    expect(run(undo)).toBe(false);
    run(redo);
    run(redo);
    expect(md()).toBe("One 2 **3**.");
  });

  it("an error mid-stream puts back the exact bytes of a CRLF note with front matter", () => {
    const note = "---\r\ntitle: T\r\n---\r\n\r\n# Head\r\n\r\nKeep *this*  and that.\r\n\r\n- a\r\n- b\r\n";
    const { editor, target, raw } = open(note, "and that.");
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("new\n\n```\nopen fence");
    expect(raw()).not.toBe(note);
    stream.abort();
    expect(raw()).toBe(note);
  });

  it("a CRLF answer is read as lines, and the note keeps its own line ends", () => {
    const note = "# Head\r\n\r\nOld.\r\n";
    const { editor, target, raw } = open(note, "Old.");
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("New **one**.\r\n\r\n- x\r\n- y");
    stream.finish();
    expect(raw()).toBe("# Head\r\n\r\nNew **one**.\r\n\r\n- x\r\n- y\r\n");
  });

  it("the whole note, selected", () => {
    const { editor, md, run } = open("# A\n\nB and C.\n\n- d\n", "A");
    const stream = new RewriteStream(editor, { from: 0, to: editor.state.doc.content.size }, classes, now);
    stream.push("## New\n\nAll **new**.");
    stream.finish();
    expect(md()).toBe("## New\n\nAll **new**.");
    run(undo);
    expect(md()).toBe("# A\n\nB and C.\n\n- d");
  });

  it("a selection from a paragraph into a code fence, and one inside a table cell", () => {
    const fence = open("Before text.\n\n```js\nconst a = 1;\n```\n\nAfter.\n", "text.");
    let end = -1;
    fence.editor.state.doc.descendants((n, pos) => { if (end < 0 && n.isText && n.text!.includes("const")) end = pos + 5; });
    const s1 = new RewriteStream(fence.editor, { from: fence.target.from, to: end }, classes, now);
    s1.push("words.");
    s1.finish();
    // As typing over the same selection would: the fence's rest joins the paragraph.
    expect(fence.md()).toBe("Before words. a = 1;\n\nAfter.");
    fence.run(undo);
    expect(fence.md()).toBe("Before text.\n\n```js\nconst a = 1;\n```\n\nAfter.");

    const table = open("| H1 | H2 |\n| --- | --- |\n| cell one | two |\n", "one");
    const s2 = new RewriteStream(table.editor, table.target, classes, now);
    s2.push("**1**");
    s2.finish();
    expect(table.md()).toMatch(/^\| H1 +\| H2 +\|\n\| -+ \| -+ \|\n\| cell \*\*1\*\* \| two +\|$/);
  });

  it("a long answer streamed in small chunks renders a frame at a time and ends with the exact text", () => {
    vi.useFakeTimers();
    try {
      const { editor, target, md } = open("Old.\n", "Old.");
      const stream = new RewriteStream(editor, target, classes);
      const para = (i: number) => `Paragraph ${i} has **bold ${i}**, *italic*, \`code\` and a [link](https://example.com/${i}).`;
      const answer = Array.from({ length: 300 }, (_, i) => (i % 25 === 0 ? `## Part ${i}` : para(i))).join("\n\n");
      let renders = 0;
      const dispatch = editor.view.dispatch.bind(editor.view);
      editor.view.dispatch = (tr) => { renders++; dispatch(tr); };
      for (let i = 0; i < answer.length; i += 8) {
        stream.push(answer.slice(i, i + 8));
        vi.advanceTimersByTime(1);
      }
      // About one render per 16 ms of chunks, not one per chunk.
      expect(renders).toBeLessThan(answer.length / 8 / 10);
      expect(stream.finish()).toBe(true);
      expect(md()).toBe(answer);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records its waits on the timeline: the lock, the first text, each render and the whole stream", () => {
    performance.clearMeasures();
    const { editor, target } = open("Alpha beta.\n", "beta");
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push(" ");
    stream.push("one");
    stream.push(" two");
    stream.finish();
    const count = (name: string) => performance.getEntriesByName(name, "measure").length;
    expect(count(REWRITE_MEASURES.lock)).toBe(1);
    expect(count(REWRITE_MEASURES.firstText)).toBe(1);
    expect(count(REWRITE_MEASURES.render)).toBe(2);
    expect(count(REWRITE_MEASURES.stream)).toBe(1);
  });

  it("an answer's images and raw HTML never become elements that fetch, and unsafe links are dropped", () => {
    const { editor, target } = open("Alpha beta gamma.\n", "beta");
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("![x](https://example.com/x.png) <img src=\"https://example.com/y.png\"> [bad](javascript:alert(1))\n\n<iframe src=\"https://example.com\"></iframe>");
    stream.finish();
    const dom = editor.view.dom;
    expect(dom.querySelector("img, iframe, script, video, audio, source, object, embed")).toBeNull();
    expect([...dom.querySelectorAll("a")].map((a) => a.getAttribute("href"))).not.toContain("javascript:alert(1)");
  });

  it("an answer in another Markdown style is saved in the note's canonical style, with the same content (RWR-84)", () => {
    const { editor, target, md } = open("Old.\n", "Old.");
    const stream = new RewriteStream(editor, target, classes, now);
    stream.push("Some __bold__ and _it_.\n\n* one\n* two");
    stream.finish();
    expect(md()).toBe("Some **bold** and *it*.\n\n- one\n- two");
  });

  it("an answer that hasn't rendered yet still finishes, and a stream after the editor is gone does nothing", () => {
    const { editor, target, md } = open("Alpha beta.\n", "beta");
    const stream = new RewriteStream(editor, target, classes, { frame: 1000 });
    stream.push("one");
    stream.push(" two");
    expect(stream.finish()).toBe(true);
    expect(md()).toBe("Alpha one two.");
    const other = open("Alpha beta.\n", "beta");
    const gone = new RewriteStream(other.editor, other.target, classes, now);
    other.editor.destroy();
    expect(() => { gone.push("x"); gone.abort(); gone.clear(); }).not.toThrow();
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
