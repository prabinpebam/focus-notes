// @vitest-environment jsdom
/**
 * FND-03: find in selection (Find and replace → Find in selection, D-160). The text selected when
 * the bar opened is the scope; with the option on, nothing outside it is counted, stepped to, or
 * replaced, and the scope follows edits.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  captureFindScope, clearFindScope, coreExtensions, EDITOR_ACTIONS, EDITOR_OPTIONS, findFromCaret, findScope, findStatus, MarkdownSession, setFind,
  type FindOptions, type PMNode,
} from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

const NOTE = "One note about notes.\n\nA second note, with a note in it.\n\nThe last note.\n";
function open(markdown = NOTE) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions([], { findScopeClass: "scope" }), content: session.doc as object });
  editors.push(editor);
  return { editor, md: () => session.serialize(editor.getJSON() as PMNode) };
}
const opts = (query: string, o: Partial<FindOptions> = {}): FindOptions => ({ query, replace: "", caseSensitive: false, wholeWord: true, regex: false, ...o });
/** Selects the whole of the nth paragraph (counting from 0). */
function selectParagraph(editor: Editor, n: number) {
  let from = -1;
  let to = -1;
  let i = 0;
  editor.state.doc.forEach((node, offset) => {
    if (i++ === n) { from = offset + 1; to = offset + node.nodeSize - 1; }
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
  return { from, to };
}
const run = (editor: Editor, id: string) => EDITOR_ACTIONS[id]!(editor);

describe("find in selection (FND-03)", () => {
  it("captures the selection as the scope, and counts only matches inside it when on", () => {
    const { editor } = open();
    const para = selectParagraph(editor, 1);
    expect(captureFindScope(editor)).toBe(true);
    expect(findScope(editor.state)).toEqual(para);
    setFind(editor, opts("note"));
    expect(findStatus(editor.state).count).toBe(4);
    setFind(editor, opts("note", { inSelection: true }));
    expect(findStatus(editor.state).count).toBe(2);
    // Off again: the whole note, with the scope kept for turning it back on.
    setFind(editor, opts("note"));
    expect(findStatus(editor.state).count).toBe(4);
    expect(findScope(editor.state)).toEqual(para);
  });
  it("steps and wraps inside the scope only", () => {
    const { editor } = open();
    const para = selectParagraph(editor, 1);
    captureFindScope(editor);
    setFind(editor, opts("note", { inSelection: true }));
    findFromCaret(editor);
    const seen = new Set<number>();
    for (let i = 0; i < 6; i++) {
      run(editor, "find.next");
      const { from, to } = editor.state.selection;
      expect(from).toBeGreaterThanOrEqual(para.from);
      expect(to).toBeLessThanOrEqual(para.to);
      seen.add(from);
    }
    expect(seen.size).toBe(2);
    for (let i = 0; i < 3; i++) {
      run(editor, "find.prev");
      expect(editor.state.selection.from).toBeGreaterThanOrEqual(para.from);
    }
  });
  it("replace all changes only the matches inside, as one undo step", () => {
    const { editor, md } = open();
    selectParagraph(editor, 1);
    captureFindScope(editor);
    setFind(editor, opts("note", { inSelection: true, replace: "memo" }));
    run(editor, "find.replaceAll");
    expect(md()).toBe("One note about notes.\n\nA second memo, with a memo in it.\n\nThe last note.\n");
    editor.commands.undo();
    expect(md()).toBe(NOTE);
  });
  it("follows edits made outside and inside the scope", () => {
    const { editor } = open();
    selectParagraph(editor, 1);
    captureFindScope(editor);
    editor.view.dispatch(editor.state.tr.insertText("Note ", 1));
    setFind(editor, opts("note", { inSelection: true }));
    expect(findStatus(editor.state).count).toBe(2);
    expect(editor.state.doc.textBetween(findScope(editor.state)!.from, findScope(editor.state)!.to)).toBe("A second note, with a note in it.");
  });
  it("has no scope without a selection, and tints the scope only while the option is on", () => {
    const { editor } = open();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));
    expect(captureFindScope(editor)).toBe(false);
    setFind(editor, opts("note", { inSelection: true }));
    expect(findStatus(editor.state).count).toBe(4);
    selectParagraph(editor, 2);
    captureFindScope(editor);
    expect(editor.view.dom.querySelector(".scope")).toBeNull();
    setFind(editor, opts("note", { inSelection: true }));
    // The match highlight splits the tint into spans; together they are the scope.
    expect([...editor.view.dom.querySelectorAll(".scope")].map((e) => e.textContent).join("")).toBe("The last note.");
    clearFindScope(editor);
    expect(findScope(editor.state)).toBeNull();
    expect(editor.view.dom.querySelector(".scope")).toBeNull();
  });
});
