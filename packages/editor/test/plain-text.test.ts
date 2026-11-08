// @vitest-environment happy-dom
import { Editor, getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { coreExtensions, MarkdownSession, insertPlainText } from "../src/index.ts";

describe("PRJ-09: literal text editing", () => {
  const extensions = () => coreExtensions([], { plainText: true });
  for (const text of ["", "one", "one\n", "\n\n", "one\r\ntwo\nthree\rfour", "---\r\nid: literal\r\n---\r\n# H **bold** [link](x) <tag>\r\n"]) {
    it(`preserves literal lines ${JSON.stringify(text)}`, () => {
      const session = new MarkdownSession(text, true);
      const doc = getSchema(extensions()).nodeFromJSON(session.doc);
      doc.check();
      expect(session.serialize(doc.toJSON())).toBe(text);
      expect(doc.content.content.every(node => node.type.name === "paragraph")).toBe(true);
    });
  }
  it("typing and Enter preserve CRLF without Markdown syntax or front matter", () => {
    const session = new MarkdownSession("# not a heading\r\n**literal**\r\n", true);
    const editor = new Editor({ extensions: extensions(), content: session.doc });
    try {
      editor.commands.setTextSelection(3);
      editor.commands.insertContent("X");
      expect(session.serialize(editor.getJSON())).toBe("# Xnot a heading\r\n**literal**\r\n");
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.splitBlock();
      editor.commands.insertContent("new line");
      expect(session.serialize(editor.getJSON())).toBe("# Xnot a heading\r\n**literal**\r\n\r\nnew line");
      expect(editor.state.schema.nodes.heading).toBeUndefined();
      expect(editor.state.schema.nodes.image).toBeUndefined();
      expect(editor.state.schema.marks.bold).toBeUndefined();
    } finally { editor.destroy(); }
  });
  it("recovery replaces text as literal paragraphs, and undo serialization retains its separators", () => {
    const session = new MarkdownSession("disk\r\n", true);
    expect(session.serialize(session.adopt("# recovered **literally**\r\n", session.doc))).toBe("# recovered **literally**\r\n");
  });
  it("literal paste retains untouched mixed separators around its insertion", () => {
    const session = new MarkdownSession("A\r\nB\nC\rD", true);
    const editor = new Editor({ extensions: extensions(), content: session.doc });
    try {
      editor.commands.setTextSelection(5);
      insertPlainText(editor, "**paste**\r\nnext");
      expect(session.serialize(editor.getJSON())).toBe("A\r\nB**paste**\r\nnext\nC\rD");
      editor.commands.undo();
      expect(session.serialize(editor.getJSON())).toBe("A\r\nB\nC\rD");
      editor.commands.selectAll();
      insertPlainText(editor, "# literal\n\n");
      expect(session.serialize(editor.getJSON())).toBe("# literal\n\n");
    } finally { editor.destroy(); }
  });
});
