// @vitest-environment happy-dom
/**
 * QLT-06: recovered text replaces the note's text as one undo step, keeps its own formatting, and one
 * undo reads back exactly the text on disk.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { coreExtensions, MarkdownSession, replaceDocument, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  const md = () => session.serialize(editor.getJSON() as PMNode);
  return { editor, session, md };
}

const DISK = "# Plan\n\n* one\n* two\n\nSome *words* here.\n";
const RECOVERED = "# Plan\n\n- one\n- two\n- three\n\nSome _words_ here, and more.\n";

describe("QLT-06: recovered text in the editor", () => {
  it("shows the recovered text as written, and one undo goes back to the disk's text exactly", () => {
    const { editor, session, md } = open(DISK);
    expect(md()).toBe(DISK);
    replaceDocument(editor, session, RECOVERED);
    expect(md()).toBe(RECOVERED);
    expect(editor.commands.undo()).toBe(true);
    expect(md()).toBe(DISK);
    expect(editor.commands.redo()).toBe(true);
    expect(md()).toBe(RECOVERED);
  });

  it("typing after the recovery is its own undo step", () => {
    const { editor, session, md } = open(DISK);
    replaceDocument(editor, session, RECOVERED);
    editor.commands.focus("end");
    editor.commands.insertContent("!");
    expect(md()).toMatch(/^# Plan\n\n- one\n- two\n- three\n\nSome .words. here, and more\.!\n$/);
    editor.commands.undo();
    expect(md()).toBe(RECOVERED);
    editor.commands.undo();
    expect(md()).toBe(DISK);
  });
});
