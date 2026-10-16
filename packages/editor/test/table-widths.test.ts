// @vitest-environment jsdom
/**
 * D-182: a table's layout and set column widths, the editor side. Resizing (Fit to column: the
 * neighbour gives the difference, down to a minimum; Bleed to edge: the table grows), the keys' step,
 * resetting to the optimal width, widths following inserted, moved and deleted columns, and the
 * Markdown comment that keeps them, through open and save.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { coreExtensions, COLUMN_MIN_CH, EDITOR_ACTIONS, EDITOR_OPTIONS, MarkdownSession, type CoreOptions, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => { for (const e of editors) e.destroy(); editors = []; });

/** A note with one table; columns measure 100 px each, 10 px a character, unless set. */
function open(markdown: string, measured = [100, 100, 100]) {
  const opts: CoreOptions = { tableColumns: () => ({ widths: measured, ch: 10, optimal: (col) => [30, 42, 75][col] ?? 30 }) };
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions([], opts), content: session.doc as object });
  editors.push(editor);
  return { editor, md: () => session.serialize(editor.getJSON() as PMNode) };
}
const table = (e: Editor) => (e.getJSON() as PMNode).content!.find((n) => n.type === "table")!;
const run = (e: Editor, id: string, args: Record<string, unknown> = {}) => EDITOR_ACTIONS[id]!(e, { table: tablePos(e), ...args });
const tablePos = (e: Editor) => { let at = -1; e.state.doc.descendants((n, p) => { if (at < 0 && n.type.name === "table") at = p; return at < 0; }); return at; };
function caretInCol(e: Editor, col: number) {
  let at = -1; let c = -1;
  e.state.doc.descendants((n, p) => {
    if (at >= 0) return false;
    if (n.type.name === "tableHeader") { c++; if (c === col) at = p + 2; return false; }
    return true;
  });
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, at)));
}
const SRC = "| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n";

describe("D-182: resizing a column", () => {
  it("Fit to column: the column on its right gives the difference, never below the minimum", () => {
    const { editor, md } = open(SRC);
    expect(run(editor, "table.resizeColumn", { col: 0, width: 14 })).toBe(true);
    expect(table(editor).attrs).toMatchObject({ layout: "fit", widths: [14, 6, 10] });
    run(editor, "table.resizeColumn", { col: 0, width: 40 });
    expect(table(editor).attrs!.widths).toEqual([16, COLUMN_MIN_CH, 10]);
    expect(md()).toBe("<!-- table: widths=16,4,10 -->\n| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n");
  });
  it("Bleed to edge: the table grows with the column; the layout is kept in the note", () => {
    const { editor, md } = open(SRC);
    run(editor, "table.bleedToEdge");
    run(editor, "table.resizeColumn", { col: 1, width: 25 });
    expect(table(editor).attrs).toMatchObject({ layout: "bleed", widths: [10, 25, 10] });
    expect(md()).toBe("<!-- table: layout=bleed widths=10,25,10 -->\n| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n");
    run(editor, "table.fitToColumn");
    expect(table(editor).attrs!.layout).toBe("fit");
  });
  it("the keys widen and narrow the caret's column a step; reset sets its optimal width", () => {
    const { editor } = open(SRC);
    caretInCol(editor, 1);
    expect(EDITOR_ACTIONS["table.widenColumn"]!(editor, {})).toBe(true);
    expect(table(editor).attrs!.widths).toEqual([10, 12, 8]);
    EDITOR_ACTIONS["table.narrowColumn"]!(editor, {});
    expect(table(editor).attrs!.widths).toEqual([10, 10, 10]);
    run(editor, "table.resetColumnWidth", { col: 2 });
    expect(table(editor).attrs!.widths).toEqual([10, 10, 75]);
  });
  it("set widths follow inserted, moved, and deleted columns, and survive open and save", () => {
    const { editor, md } = open("<!-- table: widths=12,20,30 -->\n| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(table(editor).attrs).toMatchObject({ widths: [12, 20, 30] });
    run(editor, "table.insertColumnAt", { index: 1 });
    expect(table(editor).attrs!.widths).toEqual([12, 12, 20, 30]);
    run(editor, "table.moveColumn", { from: 3, to: 0 });
    expect(table(editor).attrs!.widths).toEqual([30, 12, 12, 20]);
    run(editor, "table.deleteColumn", { col: 1 });
    expect(table(editor).attrs!.widths).toEqual([30, 12, 20]);
    expect(md()).toContain("<!-- table: widths=30,12,20 -->\n");
  });
  it("a table without settings saves exactly as it was", () => {
    const { md } = open(SRC);
    expect(md()).toBe(SRC);
  });
});
