// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { spliceRewriteTarget } from "@focus-notes/markdown";
import { coreExtensions, MarkdownSession, RewriteRange } from "../src/index.ts";

const editors: Editor[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });

describe("RWR-24: fixture canonical Accept undo boundary", () => {
  it("keeps navigation/discard out of history and Accept undo preserves older outside typing", () => {
    const original = "\uFEFFBefore\r\n\r\nOriginal\r\n\r\nAfter";
    const session = new MarkdownSession(original);
    const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
    editors.push(editor);
    const read = () => session.serialize(editor.getJSON());
    editor.view.dispatch(editor.state.tr.insertText("!", editor.state.doc.content.size - 1));
    const baseline = read();
    const range = new RewriteRange(editor.state.doc, 9, 17);
    const replacement = (s: string) => new Slice(Fragment.from(editor.state.schema.text(s)), 0, 0);
    range.show(replacement("First"));
    range.show(replacement("Second"));
    expect(read()).toBe(baseline);
    expect(range.discard().eq(editor.state.doc)).toBe(true);

    range.show(replacement("New words"));
    const captured = session.rewriteTarget(editor.getJSON(), 9, 17);
    const acceptedSource = spliceRewriteTarget(captured.source, captured.target, "New words");
    const accepted = range.accept();
    expect(accepted.steps).toHaveLength(1);
    session.adopt(acceptedSource, editor.getJSON());
    const tr = closeHistory(editor.state.tr);
    for (const step of accepted.steps) tr.step(step);
    editor.view.dispatch(tr);
    editor.view.dispatch(closeHistory(editor.state.tr));
    expect(read()).toBe(acceptedSource);
    expect(editor.commands.undo()).toBe(true);
    expect(read()).toBe(baseline);
    expect(read()).toContain("After!");
    expect(editor.commands.redo()).toBe(true);
    expect(read()).toBe(acceptedSource);

    editor.view.dispatch(editor.state.tr.insertText("?", editor.state.doc.content.size - 1));
    expect(editor.commands.undo()).toBe(true);
    expect(read()).toBe(acceptedSource);
    expect(editor.commands.undo()).toBe(true);
    expect(read()).toBe(baseline);
  });
});
