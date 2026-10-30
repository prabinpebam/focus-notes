// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { acceptEditorRewrite, coreExtensions, MarkdownSession } from "../src/index.ts";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));
it("accepts only a captured unchanged editor target, with native selection-preserving undo", () => {
  const session = new MarkdownSession("Before\n\nOriginal words\n\nAfter");
  const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 9, 17)));
  const baseline = editor.state.doc;
  const selection = editor.state.selection;
  const captured = session.rewriteTarget(editor.getJSON(), selection.from, selection.to);
  acceptEditorRewrite(editor, session, baseline, selection, captured, "New");
  expect(session.serialize(editor.getJSON())).toBe("Before\n\nNew words\n\nAfter");
  expect(editor.commands.undo()).toBe(true);
  expect(session.serialize(editor.getJSON())).toBe(captured.source);
  expect(editor.state.selection.from).toBe(selection.from);
  expect(editor.state.selection.to).toBe(selection.to);
});
it("refuses stale/outside edits without replacing any content", () => {
  const session = new MarkdownSession("Original\n\nAfter");
  const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  const baseline = editor.state.doc, selection = editor.state.selection;
  const captured = session.rewriteTarget(editor.getJSON(), selection.from, selection.to);
  editor.view.dispatch(editor.state.tr.insertText("!", editor.state.doc.content.size - 1));
  const outsideEdit = session.serialize(editor.getJSON());
  expect(() => acceptEditorRewrite(editor, session, baseline, selection, captured, "New")).toThrow("stale-target");
  expect(session.serialize(editor.getJSON())).toBe(outsideEdit);
  expect(outsideEdit).toContain("After!");
});
