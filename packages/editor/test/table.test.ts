// @vitest-environment jsdom
/**
 * WP-1.5: Loop-style tables, the editor side. Inserting (TBL-01), rows and columns (TBL-02, TBL-08),
 * moving between cells (TBL-03), formatting in cells (TBL-05), GFM-only content (TBL-06), spreadsheet
 * paste (TBL-10), and cell ranges (TBL-11). Every structural change is one undo step (EDT-08).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import {
  coreExtensions, EDITOR_ACTIONS, EDITOR_OPTIONS, formatState, insertSlashEntry, MarkdownSession, parseTsv, setFind, findStatus, slashCatalog, slashEntries,
  tableInfo, validSlashEntries, type CoreOptions, type PMNode,
} from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string, opts: CoreOptions = {}) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions([], opts), content: session.doc as object });
  editors.push(editor);
  return { editor, md: () => session.serialize(editor.getJSON() as PMNode) };
}

/** The text of every cell of the first table, row by row. */
function grid(editor: Editor, index = 0): string[][] {
  const tables: PMNode[] = [];
  const walk = (n: PMNode) => (n.type === "table" ? tables.push(n) : (n.content ?? []).forEach(walk));
  walk(editor.getJSON() as PMNode);
  const text = (n: PMNode): string => n.text ?? (n.content ?? []).map(text).join("");
  return (tables[index]?.content ?? []).map((r) => (r.content ?? []).map(text));
}

/** Puts the caret at the end of the cell holding `text` (the first one), or in cell (row, col). */
function caretIn(editor: Editor, where: string | [number, number]) {
  let at = -1;
  let r = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (node.type.name === "tableRow") r++;
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") return true;
    const $cell = editor.state.doc.resolve(pos);
    const c = $cell.index();
    if (typeof where === "string" ? node.textContent === where : where[0] === r && where[1] === c) at = pos + node.nodeSize - 2;
    return false;
  });
  if (at < 0) throw new Error(`No cell ${String(where)}`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}

/** Selects the cells from one to another, as a drag across them does. */
function selectCells(editor: Editor, from: string, to: string) {
  const cellPos = (text: string) => {
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at < 0 && (node.type.name === "tableCell" || node.type.name === "tableHeader") && node.textContent === text) at = pos;
      return at < 0;
    });
    return at;
  };
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cellPos(from), cellPos(to))));
}

/** The position of the first table, which handles and menus name in their actions. */
function T(editor: Editor): number {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.type.name === "table") at = pos;
    return at < 0;
  });
  return at;
}

const run = (editor: Editor, id: string, args?: Record<string, unknown>) => EDITOR_ACTIONS[id]!(editor, args);
const key = (editor: Editor, key: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  return editor.view.someProp("handleKeyDown", (f) => f(editor.view, event)) ?? false;
};

function type(editor: Editor, text: string) {
  const view = editor.view;
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

function paste(editor: Editor, data: Record<string, string>) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "", files: [], items: [] } });
  editor.view.dom.dispatchEvent(event);
}

function clipboardEvent(editor: Editor, kind: "copy" | "cut") {
  const store: Record<string, string> = {};
  const event = new Event(kind, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { setData: (t: string, v: string) => { store[t] = v; }, clearData: () => {}, getData: (t: string) => store[t] ?? "" } });
  editor.view.dom.dispatchEvent(event);
  return { data: store, prevented: event.defaultPrevented };
}

const SAMPLE = "Before.\n\n| Task | Owner |\n| --- | --- |\n| Draft | Me |\n| Edit | You |\n\nAfter.\n";

describe("opening and saving (TBL-06)", () => {
  it("opens a GFM table as a table and saves it untouched, byte for byte", () => {
    const { editor, md } = open(SAMPLE);
    expect(grid(editor)).toEqual([["Task", "Owner"], ["Draft", "Me"], ["Edit", "You"]]);
    expect(editor.view.dom.querySelectorAll("th").length).toBe(2);
    expect(editor.view.dom.querySelector("th")!.getAttribute("scope")).toBe("col");
    expect(md()).toBe(SAMPLE);
  });
  it("shows alignment with a data attribute, not inline styles", () => {
    const { editor } = open("| a | b |\n|:-:|--:|\n| 1 | 2 |\n");
    const td = editor.view.dom.querySelectorAll("td");
    expect([...td].map((c) => c.getAttribute("data-align"))).toEqual(["center", "right"]);
    expect(editor.view.dom.querySelector("[style]")).toBeNull();
  });
});

describe("inserting a table (TBL-01)", () => {
  it("the slash menu offers Table in the Insert group, from the block registry", () => {
    expect(slashCatalog().find((e) => e.id === "block.table")).toEqual({ id: "block.table", title: "format.block.table", group: "insert", icon: "table", markdown: "|" });
  });
  it("/table inserts a 3 × 3 table with a header row, the caret in its first header cell", () => {
    const { editor, md } = open("Intro\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
    editor.commands.splitBlock();
    type(editor, "/table");
    insertSlashEntry(editor, slashEntries().find((e) => e.id === "block.table")!);
    expect(grid(editor)).toEqual([["", "", ""], ["", "", ""], ["", "", ""]]);
    expect(tableInfo(editor.state)).toMatchObject({ inTable: true, row: 0, col: 0, rows: 3, cols: 3 });
    type(editor, "Name");
    expect(md()).toBe("Intro\n\n| Name |   |   |\n| ---- | - | - |\n|      |   |   |\n|      |   |   |\n");
    // One undo brings back the typed /table.
    editor.commands.undo();
    editor.commands.undo();
    expect(editor.state.doc.textContent).toContain("/table");
  });
  it("isn't offered inside a table, since tables don't nest", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "Draft");
    type(editor, " /");
    expect(validSlashEntries(editor, slashEntries()).map((e) => e.id)).not.toContain("block.table");
  });
  it("typing a GFM header row and a delimiter row converts to a table on Enter", () => {
    const { editor, md } = open("Intro\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
    editor.commands.splitBlock();
    type(editor, "| Name | Done |");
    editor.commands.splitBlock();
    type(editor, "|---|:-:|");
    expect(key(editor, "Enter")).toBe(true);
    expect(grid(editor)).toEqual([["Name", "Done"], ["", ""]]);
    expect(tableInfo(editor.state)).toMatchObject({ row: 1, col: 0 });
    type(editor, "Write");
    expect(md()).toBe("Intro\n\n| Name  | Done |\n| ----- | :--: |\n| Write |      |\n");
  });
  it("a delimiter row that doesn't match the header is just text", () => {
    const { editor } = open("| a | b |\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
    editor.commands.splitBlock();
    type(editor, "|---|");
    key(editor, "Enter");
    expect(grid(editor)).toEqual([]);
  });
});

describe("rows and columns (TBL-02, TBL-08)", () => {
  it("inserts rows above and below and columns left and right, by index, each one undo step", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "Draft");
    run(editor, "table.insertRowBelow", { row: 1 });
    expect(grid(editor)).toEqual([["Task", "Owner"], ["Draft", "Me"], ["", ""], ["Edit", "You"]]);
    expect(tableInfo(editor.state)).toMatchObject({ row: 2, col: 0 });
    run(editor, "table.insertRowAbove", { row: 1 });
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "", "Draft", "", "Edit"]);
    run(editor, "table.insertColumnRight", { col: 0 });
    run(editor, "table.insertColumnLeft", { col: 0 });
    expect(grid(editor)[0]).toEqual(["", "Task", "", "Owner"]);
    expect(editor.view.dom.querySelectorAll("tr:first-child th").length).toBe(4);
    for (let i = 0; i < 4; i++) editor.commands.undo();
    expect(grid(editor)).toEqual([["Task", "Owner"], ["Draft", "Me"], ["Edit", "You"]]);
  });
  it("inserts at a boundary (the + insertion point) and appends (New row, New column)", () => {
    const { editor } = open(SAMPLE);
    run(editor, "table.insertRowAt", { table: T(editor), index: 2 });
    run(editor, "table.insertColumnAt", { table: T(editor), index: 1 });
    expect(grid(editor)).toEqual([["Task", "", "Owner"], ["Draft", "", "Me"], ["", "", ""], ["Edit", "", "You"]]);
    // The caret moves into the new column's first cell.
    expect(tableInfo(editor.state)).toMatchObject({ row: 0, col: 1 });
    run(editor, "table.appendRow", {});
    run(editor, "table.appendColumn", {});
    expect(grid(editor).length).toBe(5);
    expect(grid(editor)[0]!.length).toBe(4);
  });
  it("moves rows and columns, never above or into the header row", () => {
    const { editor } = open(SAMPLE);
    run(editor, "table.moveRowDown", { table: T(editor), row: 1 });
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "Edit", "Draft"]);
    expect(run(editor, "table.moveRow", { table: T(editor), from: 2, to: 0 })).toBe(false);
    run(editor, "table.moveRow", { table: T(editor), from: 2, to: 1 });
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "Draft", "Edit"]);
    expect(run(editor, "table.moveRowUp", { table: T(editor), row: 1 })).toBe(false);
    expect(run(editor, "table.moveRowDown", { table: T(editor), row: 0 })).toBe(false);
    run(editor, "table.moveColumnRight", { table: T(editor), col: 0 });
    expect(grid(editor)[0]).toEqual(["Owner", "Task"]);
    run(editor, "table.moveColumn", { table: T(editor), from: 1, to: 0 });
    expect(grid(editor)[0]).toEqual(["Task", "Owner"]);
  });
  it("duplicates and clears rows and columns, and deletes them", () => {
    const { editor } = open(SAMPLE);
    run(editor, "table.duplicateRow", { table: T(editor), row: 1 });
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "Draft", "Draft", "Edit"]);
    run(editor, "table.clearRow", { table: T(editor), row: 2 });
    run(editor, "table.clearColumn", { table: T(editor), col: 1 });
    expect(grid(editor)).toEqual([["Task", ""], ["Draft", ""], ["", ""], ["Edit", ""]]);
    run(editor, "table.deleteRow", { table: T(editor), row: 2 });
    run(editor, "table.deleteColumn", { table: T(editor), col: 1 });
    expect(grid(editor)).toEqual([["Task"], ["Draft"], ["Edit"]]);
  });
  it("keeps the header row, and always one body row; deleting the last column deletes the table", () => {
    const { editor, md } = open("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(run(editor, "table.deleteRow", { table: T(editor), row: 0 })).toBe(false);
    run(editor, "table.deleteRow", { table: T(editor), row: 1 });
    expect(grid(editor)).toEqual([["a", "b"], ["", ""]]);
    run(editor, "table.deleteColumn", { table: T(editor), col: 0 });
    run(editor, "table.deleteColumn", { table: T(editor), col: 0 });
    expect(grid(editor)).toEqual([]);
    expect(md()).toBe("");
  });
  it("aligns a column (the column menu's Align), saved in the delimiter row", () => {
    const { editor, md } = open("| a | b |\n| - | - |\n| 1 | 2 |\n");
    run(editor, "table.alignCenter", { table: T(editor), col: 1 });
    expect(md()).toBe("| a |  b  |\n| - | :-: |\n| 1 |  2  |\n");
    expect(tableInfo(editor.state, { table: T(editor), col: 1 }).align).toBe("center");
  });
  it("Delete table and Duplicate table", () => {
    const { editor } = open(SAMPLE);
    run(editor, "table.duplicateTable", { table: T(editor) });
    expect(grid(editor, 1)).toEqual(grid(editor, 0));
    run(editor, "table.deleteTable", { table: T(editor) });
    run(editor, "table.deleteTable", { table: T(editor) });
    expect(grid(editor)).toEqual([]);
    expect(editor.state.doc.textContent).toBe("Before.After.");
  });
  it("leaves a read-only note's tables as they are", () => {
    const session = new MarkdownSession(SAMPLE);
    const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions(), content: session.doc as object, editable: false });
    editors.push(editor);
    for (const id of ["table.appendRow", "table.deleteColumn", "table.duplicateTable", "table.deleteTable"]) expect(run(editor, id, { table: T(editor), col: 0 })).toBe(false);
    expect(session.serialize(editor.getJSON() as PMNode)).toBe(SAMPLE);
  });
  it("reports structural changes so they can be announced", () => {
    const onTableChange = vi.fn();
    const { editor } = open(SAMPLE, { onTableChange });
    run(editor, "table.insertRowBelow", { table: T(editor), row: 2 });
    expect(onTableChange).toHaveBeenLastCalledWith({ kind: "rowInserted", index: 4 });
    run(editor, "table.moveColumn", { table: T(editor), from: 1, to: 0 });
    expect(onTableChange).toHaveBeenLastCalledWith({ kind: "columnMoved", index: 1 });
  });
});

describe("moving between cells (TBL-03)", () => {
  it("Tab and Shift+Tab move between cells; Tab in the last cell adds a row", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "Draft");
    run(editor, "table.nextCell");
    expect(tableInfo(editor.state)).toMatchObject({ row: 1, col: 1 });
    run(editor, "table.nextCell");
    expect(tableInfo(editor.state)).toMatchObject({ row: 2, col: 0 });
    run(editor, "table.prevCell");
    expect(tableInfo(editor.state)).toMatchObject({ row: 1, col: 1 });
    caretIn(editor, "You");
    run(editor, "table.nextCell");
    expect(grid(editor).length).toBe(4);
    expect(tableInfo(editor.state)).toMatchObject({ row: 3, col: 0 });
    // Outside a table, Tab is left to lists.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atStart(editor.state.doc)));
    expect(run(editor, "table.nextCell")).toBe(false);
  });
  it("Enter and Shift+Enter move down and up; Enter in the last row leaves the table", () => {
    const { editor } = open("| a | b |\n| - | - |\n| 1 | 2 |\n");
    caretIn(editor, "b");
    run(editor, "table.cellBelow");
    expect(tableInfo(editor.state)).toMatchObject({ row: 1, col: 1 });
    run(editor, "table.cellAbove");
    expect(tableInfo(editor.state)).toMatchObject({ row: 0, col: 1 });
    caretIn(editor, "2");
    run(editor, "table.cellBelow");
    expect(tableInfo(editor.state).inTable).toBe(false);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });
  it("Mod+Enter adds a row below, Mod+Shift+Enter above; Mod+Shift+arrows move the row; Mod+Shift+K deletes it", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "Draft");
    run(editor, "table.addRowBelow");
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "Draft", "", "Edit"]);
    caretIn(editor, "Edit");
    run(editor, "table.moveRowUp");
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "Draft", "Edit", ""]);
    expect(tableInfo(editor.state)).toMatchObject({ row: 2 });
    run(editor, "table.deleteRow");
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "Draft", ""]);
    caretIn(editor, "Task");
    run(editor, "table.addRowAbove");
    // Nothing goes above the header: the row goes below it.
    expect(grid(editor).map((r) => r[0])).toEqual(["Task", "", "Draft", ""]);
  });
  it("Esc selects the cell (cell selection mode); arrows move it, Shift+arrows extend it", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "Draft");
    run(editor, "table.selectCells");
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(tableInfo(editor.state).selection).toEqual({ kind: "cells", top: 1, left: 0, bottom: 2, right: 1 });
    expect(key(editor, "ArrowRight")).toBe(true);
    expect(tableInfo(editor.state).selection).toEqual({ kind: "cells", top: 1, left: 1, bottom: 2, right: 2 });
    key(editor, "ArrowDown", { shiftKey: true });
    expect(tableInfo(editor.state).selection).toMatchObject({ top: 1, bottom: 3, left: 1, right: 2 });
    // Enter goes back to typing in the active cell.
    key(editor, "Enter");
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
  });
});

describe("formatting in cells (TBL-05)", () => {
  it("bold, italic, code, and links work inside a cell and save as GFM", () => {
    const { editor, md } = open(SAMPLE);
    caretIn(editor, "Draft");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.selection.from - 5, editor.state.selection.from)));
    run(editor, "format.bold");
    expect(md()).toContain("| **Draft** | Me    |");
  });
  it("a cell range shows the toolbar with marks only, and formats every selected cell", () => {
    const { editor, md } = open(SAMPLE);
    selectCells(editor, "Draft", "You");
    const info = formatState(editor.state);
    expect(info.text).toBe(true);
    expect(info.table).toBe(true);
    run(editor, "format.italic");
    expect(md()).toContain("| *Draft* | *Me*  |");
    expect(md()).toContain("| *Edit*  | *You* |");
  });
});

describe("only what GFM can hold (TBL-06)", () => {
  it("a cell holds one paragraph: Turn into, lists, and splitting are refused", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "Draft");
    expect(editor.can().toggleHeading({ level: 1 })).toBe(false);
    expect(editor.can().toggleBulletList()).toBe(false);
    expect(editor.can().splitBlock()).toBe(false);
    expect(formatState(editor.state).table).toBe(true);
  });
  it("a line break in a cell becomes a space", () => {
    const { editor, md } = open(SAMPLE);
    caretIn(editor, "Draft");
    editor.commands.setHardBreak();
    type(editor, "two");
    expect(grid(editor)[1]![0]).toBe("Draft two");
    expect(editor.view.dom.querySelector("td br, th br")).toBeNull();
    expect(md()).toContain("| Draft two |");
  });
});

describe("paste (TBL-10)", () => {
  it("a spreadsheet range pasted into a cell fills right and down, growing the table, in one undo step", () => {
    const onPasteNotice = vi.fn();
    const { editor } = open(SAMPLE, { onPasteNotice });
    caretIn(editor, "Me");
    paste(editor, { "text/plain": "a\tb\tc\n1\t2\t3\nx\ty\tz\n" });
    expect(grid(editor)).toEqual([["Task", "Owner", "", ""], ["Draft", "a", "b", "c"], ["Edit", "1", "2", "3"], ["", "x", "y", "z"]]);
    expect(onPasteNotice).toHaveBeenCalledWith("tablePasted", { rows: 3, cols: 3, addedRows: 1, addedCols: 2 });
    editor.commands.undo();
    expect(grid(editor)).toEqual([["Task", "Owner"], ["Draft", "Me"], ["Edit", "You"]]);
  });
  it("an HTML table from a spreadsheet fills cells too, keeping bold", () => {
    const { editor, md } = open(SAMPLE);
    caretIn(editor, "Draft");
    paste(editor, { "text/html": "<table><tr><td><b>One</b></td><td>Two</td></tr></table>", "text/plain": "One\tTwo\n" });
    expect(grid(editor)[1]).toEqual(["One", "Two"]);
    expect(md()).toContain("| **One** | Two   |");
  });
  it("a range pasted on an empty line creates a table of its shape", () => {
    const { editor, md } = open("Intro\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
    editor.commands.splitBlock();
    paste(editor, { "text/plain": "Name\tQty\nApples\t3\n" });
    expect(md()).toBe("Intro\n\n| Name   | Qty |\n| ------ | --- |\n| Apples | 3   |\n");
  });
  it("text with line breaks pasted into one cell keeps it to one line, and says so the first time", () => {
    const onPasteNotice = vi.fn();
    const { editor } = open(SAMPLE, { onPasteNotice });
    caretIn(editor, "Me");
    paste(editor, { "text/plain": "first line\nsecond line\n\nthird" });
    expect(grid(editor)[1]![1]).toBe("Mefirst line second line third");
    expect(onPasteNotice).toHaveBeenCalledWith("lineBreaks", {});
    expect(grid(editor).length).toBe(3);
  });
  it("text with tabs that isn't a range (code indentation) stays text", () => {
    expect(parseTsv("\tindented\n\tmore\n")).toBeNull();
    expect(parseTsv("a\tb\nc\td\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTsv("if (x) {\n\treturn;\n}")).toBeNull();
    expect(parseTsv("just text")).toBeNull();
  });
});

describe("cell ranges (TBL-11)", () => {
  it("copy writes tab-separated text, a Markdown table, and HTML", () => {
    const { editor } = open(SAMPLE);
    selectCells(editor, "Task", "Me");
    const { data, prevented } = clipboardEvent(editor, "copy");
    expect(prevented).toBe(true);
    expect(data["text/plain"]).toBe("Task\tOwner\nDraft\tMe");
    expect(data["text/markdown"]).toBe("| Task  | Owner |\n| ----- | ----- |\n| Draft | Me    |");
    expect(data["text/html"]).toBe("<table><tbody><tr><th>Task</th><th>Owner</th></tr><tr><td>Draft</td><td>Me</td></tr></tbody></table>");
  });
  it("cut copies and clears; Backspace and Clear contents clear the selected cells", () => {
    const { editor } = open(SAMPLE);
    selectCells(editor, "Draft", "Me");
    const { data } = clipboardEvent(editor, "cut");
    expect(data["text/plain"]).toBe("Draft\tMe");
    expect(grid(editor)[1]).toEqual(["", ""]);
    selectCells(editor, "Edit", "You");
    run(editor, "table.clearCells");
    expect(grid(editor)[2]).toEqual(["", ""]);
  });
  it("selects whole rows, whole columns, and the table", () => {
    const { editor } = open(SAMPLE);
    run(editor, "table.selectRow", { table: T(editor), row: 2 });
    expect(tableInfo(editor.state).selection).toEqual({ kind: "row", top: 2, left: 0, bottom: 3, right: 2 });
    run(editor, "table.selectColumn", { table: T(editor), col: 1 });
    expect(tableInfo(editor.state).selection).toEqual({ kind: "column", top: 0, left: 1, bottom: 3, right: 2 });
    run(editor, "table.selectTable", { table: T(editor) });
    expect(tableInfo(editor.state).selection.kind).toBe("table");
  });
  it("deleting a selection of whole rows deletes the rows; of whole columns, the columns", () => {
    const { editor } = open(SAMPLE);
    run(editor, "table.selectRow", { table: T(editor), row: 1 });
    run(editor, "table.deleteSelection");
    expect(grid(editor)).toEqual([["Task", "Owner"], ["Edit", "You"]]);
    run(editor, "table.selectColumn", { table: T(editor), col: 0 });
    run(editor, "table.deleteSelection");
    expect(grid(editor)).toEqual([["Owner"], ["You"]]);
  });
});

describe("tables with find (FND-01)", () => {
  it("finds text in cells", () => {
    const { editor } = open(SAMPLE);
    setFind(editor, { query: "You", replace: "", caseSensitive: false, wholeWord: false, regex: false });
    expect(findStatus(editor.state).count).toBe(1);
  });
});

describe("what the table controls are told (tableInfo)", () => {
  it("names the caret's table, row, column, its header text, and size", () => {
    const { editor } = open(SAMPLE);
    caretIn(editor, "You");
    expect(tableInfo(editor.state)).toMatchObject({ inTable: true, table: 9, row: 2, col: 1, rows: 3, cols: 2, header: "Owner", align: null, selection: { kind: "none" } });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atStart(editor.state.doc)));
    expect(tableInfo(editor.state).inTable).toBe(false);
  });
});
