/**
 * Table commands (TBL-02, TBL-03, TBL-08, TBL-11): rows and columns by index (from handles, menus,
 * and insertion points) or at the caret (keys), moving between cells, and cell ranges. A structural
 * change rebuilds the table from its grid in one transaction: one undo step, GFM shape guaranteed.
 */
import type { CommandProps, Editor } from "@tiptap/core";
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { buildTable, cellTextPos, emptyGrid, isCell, readGrid, toAlign, type Align, type Grid } from "./table-schema.ts";
import { clipboardFor } from "./table-clipboard.ts";
import { sortOrder } from "./table-sort.ts";

/** A structural change, reported so it can be announced (Tables → Accessibility). Indexes count from 1. */
export interface TableChange {
  kind: "rowInserted" | "columnInserted" | "rowMoved" | "columnMoved" | "rowDeleted" | "columnDeleted" | "rowDuplicated" | "cleared" | "aligned" | "sortedAscending" | "sortedDescending" | "tableDeleted" | "tableInserted" | "tableDuplicated";
  index?: number;
  align?: string;
}
/** What the surface hears from tables: changes, copies of whole tables, and the context menu. */
export interface TableHooks {
  onChange?: (change: TableChange) => void;
  onCopyText?: (text: string, format: "markdown" | "tsv") => void;
  onContextMenu?: () => void;
  onNotice?: (kind: string, args: Record<string, number>) => void;
  /**
   * What an empty header cell shows and is called ("Column 3"), drawn by the design system. A header
   * with no text would name nothing for its column (A11Y-01, axe empty-table-header).
   */
  emptyHeader?: (index: number) => HTMLElement;
}
const hooks = new WeakMap<object, TableHooks>();
export const setTableHooks = (editor: object, h: TableHooks): void => void hooks.set(editor, h);
export const tableHooks = (editor: object): TableHooks => hooks.get(editor) ?? {};

export interface Located {
  pos: number;
  node: PMNode;
  map: TableMap;
}

/** The table at a position (a handle's table), or around the selection. */
export function locateTable(state: EditorState, at?: unknown): Located | null {
  const doc = state.doc;
  const find = (p: number) => {
    const n = doc.nodeAt(p);
    if (n?.type.name === "table") return { pos: p, node: n };
    const $p = doc.resolve(p);
    for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === "table") return { pos: $p.before(d), node: $p.node(d) };
    return null;
  };
  let found;
  if (at === undefined || at === null) found = find(state.selection.from);
  else if (typeof at === "number" && Number.isInteger(at) && at >= 0 && at <= doc.content.size) found = find(at);
  return found ? { ...found, map: TableMap.get(found.node) } : null;
}

/** The row and column of the caret's cell (the head cell of a range). */
export function currentCell(state: EditorState, loc: Located): { row: number; col: number } | null {
  const sel = state.selection;
  let cellPos = -1;
  if (sel instanceof CellSelection) cellPos = sel.$headCell.pos;
  else {
    const $p = sel.$head;
    for (let d = $p.depth; d > 0; d--) if (isCell($p.node(d))) { cellPos = $p.before(d); break; }
  }
  if (cellPos <= loc.pos || cellPos >= loc.pos + loc.node.nodeSize) return null;
  try {
    const rect = loc.map.findCell(cellPos - loc.pos - 1);
    return { row: rect.top, col: rect.left };
  } catch {
    return null;
  }
}

export interface Rect { top: number; left: number; bottom: number; right: number }
export function selectionRect(state: EditorState, loc: Located): Rect | null {
  const sel = state.selection;
  if (!(sel instanceof CellSelection) || sel.$anchorCell.pos < loc.pos || sel.$anchorCell.pos > loc.pos + loc.node.nodeSize) return null;
  const start = loc.pos + 1;
  return loc.map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start);
}

type Focus = { row: number; col: number; end?: boolean } | { rect: Rect } | null;

function place(tr: Transaction, pos: number, table: PMNode, focus: Focus) {
  if (!focus) return;
  if ("rect" in focus) {
    const map = TableMap.get(table);
    const at = (r: number, c: number) => pos + 1 + map.map[r * map.width + c]!;
    tr.setSelection(CellSelection.create(tr.doc, at(focus.rect.top, focus.rect.left), at(focus.rect.bottom - 1, focus.rect.right - 1)));
  } else tr.setSelection(TextSelection.create(tr.doc, cellTextPos(pos, table, focus.row, focus.col, focus.end)));
}

/** Ends the undo step, so typing straight after a structural change is its own step (EDT-08). */
const endStep = (editor: Editor) => editor.view.dispatch(closeHistory(editor.state.tr));

function commit(editor: Editor, loc: Located, grid: Grid, focus: Focus, change?: TableChange): boolean {
  // A read-only note's tables can be moved through, never changed.
  if (!editor.isEditable) return false;
  const table = buildTable(editor.schema, grid);
  const tr = closeHistory(editor.state.tr).replaceWith(loc.pos, loc.pos + loc.node.nodeSize, table);
  place(tr, loc.pos, table, focus);
  editor.view.dispatch(tr.scrollIntoView());
  endStep(editor);
  if (change) tableHooks(editor).onChange?.(change);
  return true;
}

const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) ? v : undefined);
const clone = (g: Grid): Grid => ({ cells: g.cells.map((r) => [...r]), align: [...g.align] });
const blank = (w: number) => Array.from({ length: w }, () => Fragment.empty);

type Args = Record<string, unknown> | undefined;
interface Ctx { loc: Located; grid: Grid; h: number; w: number; cur: { row: number; col: number } | null; keyboard: boolean }
function withTable(editor: Editor, args: Args, f: (c: Ctx) => boolean): boolean {
  const loc = locateTable(editor.state, args?.table);
  if (!loc) return false;
  const grid = readGrid(loc.node);
  const cur = currentCell(editor.state, loc);
  return f({ loc, grid, h: grid.cells.length, w: grid.align.length, cur, keyboard: args?.table === undefined });
}
const rowOf = (c: Ctx, args: Args) => int(args?.row) ?? c.cur?.row;
const colOf = (c: Ctx, args: Args) => int(args?.col) ?? c.cur?.col;

function insertRow(editor: Editor, c: Ctx, index: number): boolean {
  if (index < 1 || index > c.h) return false;
  const g = clone(c.grid);
  g.cells.splice(index, 0, blank(c.w));
  return commit(editor, c.loc, g, { row: index, col: 0 }, { kind: "rowInserted", index: index + 1 });
}
function insertColumn(editor: Editor, c: Ctx, index: number): boolean {
  if (index < 0 || index > c.w) return false;
  const g = clone(c.grid);
  for (const r of g.cells) r.splice(index, 0, Fragment.empty);
  g.align.splice(index, 0, null);
  return commit(editor, c.loc, g, { row: 0, col: index }, { kind: "columnInserted", index: index + 1 });
}
function moveRow(editor: Editor, c: Ctx, from: number, to: number): boolean {
  if (from < 1 || to < 1 || from >= c.h || to >= c.h || from === to) return false;
  const g = clone(c.grid);
  const [row] = g.cells.splice(from, 1);
  g.cells.splice(to, 0, row!);
  const focus: Focus = c.keyboard ? { row: to, col: c.cur?.col ?? 0, end: true } : { rect: { top: to, bottom: to + 1, left: 0, right: c.w } };
  return commit(editor, c.loc, g, focus, { kind: "rowMoved", index: to + 1 });
}
function moveColumn(editor: Editor, c: Ctx, from: number, to: number): boolean {
  if (from < 0 || to < 0 || from >= c.w || to >= c.w || from === to) return false;
  const g = clone(c.grid);
  for (const r of g.cells) r.splice(to, 0, r.splice(from, 1)[0]!);
  g.align.splice(to, 0, g.align.splice(from, 1)[0]!);
  const focus: Focus = c.keyboard ? { row: c.cur?.row ?? 0, col: to, end: true } : { rect: { top: 0, bottom: c.h, left: to, right: to + 1 } };
  return commit(editor, c.loc, g, focus, { kind: "columnMoved", index: to + 1 });
}
function deleteRow(editor: Editor, c: Ctx, row: number): boolean {
  if (row < 1 || row >= c.h) return false;
  const g = clone(c.grid);
  // A table always has a body row: deleting the last one leaves it empty.
  if (c.h === 2) g.cells[1] = blank(c.w);
  else g.cells.splice(row, 1);
  return commit(editor, c.loc, g, { row: Math.min(row, g.cells.length - 1), col: c.cur?.col ?? 0, end: true }, { kind: "rowDeleted", index: row + 1 });
}
function deleteColumn(editor: Editor, c: Ctx, col: number): boolean {
  if (col < 0 || col >= c.w) return false;
  if (c.w === 1) return deleteTable(editor, c.loc);
  const g = clone(c.grid);
  for (const r of g.cells) r.splice(col, 1);
  g.align.splice(col, 1);
  return commit(editor, c.loc, g, { row: c.cur?.row ?? 0, col: Math.min(col, c.w - 2), end: true }, { kind: "columnDeleted", index: col + 1 });
}
function clearRect(editor: Editor, c: Ctx, rect: Rect): boolean {
  const g = clone(c.grid);
  for (let r = rect.top; r < rect.bottom; r++) for (let k = rect.left; k < rect.right; k++) g.cells[r]![k] = Fragment.empty;
  const focus: Focus = rect.bottom - rect.top === 1 && rect.right - rect.left === 1 ? { row: rect.top, col: rect.left } : { rect };
  return commit(editor, c.loc, g, focus, { kind: "cleared" });
}
function deleteTable(editor: Editor, loc: Located): boolean {
  if (!editor.isEditable) return false;
  const tr = closeHistory(editor.state.tr);
  const only = tr.doc.childCount === 1 && tr.doc.firstChild === loc.node;
  if (only) tr.replaceWith(loc.pos, loc.pos + loc.node.nodeSize, editor.schema.nodes.paragraph!.create());
  else tr.delete(loc.pos, loc.pos + loc.node.nodeSize);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(loc.pos, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
  endStep(editor);
  tableHooks(editor).onChange?.({ kind: "tableDeleted" });
  return true;
}
function goTo(editor: Editor, loc: Located, row: number, col: number): boolean {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, cellTextPos(loc.pos, loc.node, row, col, true))).scrollIntoView());
  return true;
}
function selectRect(editor: Editor, loc: Located, rect: Rect): boolean {
  const at = (r: number, k: number) => loc.pos + 1 + loc.map.map[r * loc.map.width + k]!;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, at(rect.top, rect.left), at(rect.bottom - 1, rect.right - 1))));
  return true;
}
/** Below the table, on a new line: an empty paragraph there, or a new one (Enter in the last row). */
function leaveBelow(editor: Editor, loc: Located): boolean {
  const after = loc.pos + loc.node.nodeSize;
  const tr = editor.state.tr;
  const next = tr.doc.resolve(after).nodeAfter;
  if (!(next?.type.name === "paragraph" && next.content.size === 0)) tr.insert(after, editor.schema.nodes.paragraph!.create());
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  return true;
}
function align(editor: Editor, args: Args, value: Align): boolean {
  return withTable(editor, args, (c) => {
    const col = colOf(c, args);
    if (col === undefined || col < 0 || col >= c.w) return false;
    const g = clone(c.grid);
    g.align[col] = value;
    return commit(editor, c.loc, g, c.cur ? { ...c.cur, end: true } : null, { kind: "aligned", index: col + 1, align: value ?? "left" });
  });
}
/**
 * Sorts the body rows by a column, once (TBL-09): the header stays, each row moves whole, and the
 * caret's cell moves with its row. A table already in that order is left alone: no undo step.
 */
function sortBy(editor: Editor, args: Args, direction: "ascending" | "descending"): boolean {
  return withTable(editor, args, (c) => {
    const col = colOf(c, args);
    if (col === undefined || col < 0 || col >= c.w || c.h < 2) return false;
    const body = c.grid.cells.slice(1);
    const order = sortOrder(body.map((r) => r[col]!.textBetween(0, r[col]!.size, " ")), direction);
    const change: TableChange = { kind: direction === "ascending" ? "sortedAscending" : "sortedDescending", index: col + 1 };
    if (order.every((from, to) => from === to)) {
      tableHooks(editor).onChange?.(change);
      return true;
    }
    const g = clone(c.grid);
    g.cells = [g.cells[0]!, ...order.map((i) => body[i]!)];
    const focus: Focus = c.cur
      ? { row: c.cur.row === 0 ? 0 : order.indexOf(c.cur.row - 1) + 1, col: c.cur.col, end: true }
      : { rect: { top: 0, bottom: c.h, left: col, right: col + 1 } };
    return commit(editor, c.loc, g, focus, change);
  });
}

/** Copy or cut the selected cells (or the caret's cell) through the clipboard, from a menu. */
function clipboardAction(editor: Editor, kind: "copy" | "cut"): boolean {
  const loc = locateTable(editor.state);
  if (!loc) return false;
  if (!(editor.state.selection instanceof CellSelection)) {
    const cur = currentCell(editor.state, loc);
    if (!cur) return false;
    selectRect(editor, loc, { top: cur.row, bottom: cur.row + 1, left: cur.col, right: cur.col + 1 });
  }
  editor.view.focus();
  return document.execCommand(kind);
}

/** Inserts an empty table (the slash menu's Table, TBL-01): a header row and two body rows, the caret in its first cell. */
export function insertTable({ tr, state, dispatch }: CommandProps, rows = 3, cols = 3): boolean {
  const $from = tr.selection.$from;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return false;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code || $from.depth < 1) return false;
  const type = state.schema.nodes.table!;
  const parent = $from.node(-1);
  const index = $from.index(-1);
  const empty = $from.parent.content.size === 0;
  const replace = empty && parent.canReplaceWith(index, index + 1, type);
  if (!replace && !parent.canReplaceWith(index + 1, index + 1, type)) return false;
  if (dispatch) {
    const table = buildTable(state.schema, emptyGrid(rows, cols));
    const start = replace ? $from.before() : $from.after();
    tr.replaceWith(start, replace ? $from.after() : start, table);
    const after = start + table.nodeSize;
    if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, state.schema.nodes.paragraph!.create());
    tr.setSelection(TextSelection.create(tr.doc, start + 4));
  }
  return true;
}

/** Every table command by ID. Handles and menus pass `table` (its position) and a row or column. */
export const TABLE_ACTIONS: Readonly<Record<string, (editor: Editor, args?: Record<string, unknown>) => boolean>> = {
  "table.nextCell": (e) => withTable(e, undefined, (c) => {
    if (!c.cur) return false;
    const { row, col } = c.cur;
    if (col + 1 < c.w) return goTo(e, c.loc, row, col + 1);
    if (row + 1 < c.h) return goTo(e, c.loc, row + 1, 0);
    return insertRow(e, c, c.h);
  }),
  "table.prevCell": (e) => withTable(e, undefined, (c) => {
    if (!c.cur) return false;
    const { row, col } = c.cur;
    if (col > 0) return goTo(e, c.loc, row, col - 1);
    return row > 0 ? goTo(e, c.loc, row - 1, c.w - 1) : true;
  }),
  "table.cellBelow": (e) => withTable(e, undefined, (c) => {
    if (!c.cur) return false;
    if (e.state.selection instanceof CellSelection) return goTo(e, c.loc, c.cur.row, c.cur.col);
    return c.cur.row + 1 < c.h ? goTo(e, c.loc, c.cur.row + 1, c.cur.col) : leaveBelow(e, c.loc);
  }),
  "table.cellAbove": (e) => withTable(e, undefined, (c) => (c.cur ? (c.cur.row > 0 ? goTo(e, c.loc, c.cur.row - 1, c.cur.col) : true) : false)),
  "table.addRowBelow": (e) => withTable(e, undefined, (c) => (c.cur ? insertRow(e, c, c.cur.row + 1) : false)),
  "table.addRowAbove": (e) => withTable(e, undefined, (c) => (c.cur ? insertRow(e, c, Math.max(1, c.cur.row)) : false)),
  "table.insertRowAbove": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && insertRow(e, c, Math.max(1, r)); }),
  "table.insertRowBelow": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && insertRow(e, c, r + 1); }),
  "table.insertColumnLeft": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && insertColumn(e, c, k); }),
  "table.insertColumnRight": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && insertColumn(e, c, k + 1); }),
  "table.insertRowAt": (e, a) => withTable(e, a, (c) => insertRow(e, c, int(a?.index) ?? -1)),
  "table.insertColumnAt": (e, a) => withTable(e, a, (c) => insertColumn(e, c, int(a?.index) ?? -1)),
  "table.appendRow": (e, a) => withTable(e, a, (c) => insertRow(e, c, c.h)),
  "table.appendColumn": (e, a) => withTable(e, a, (c) => insertColumn(e, c, c.w)),
  "table.moveRowUp": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && moveRow(e, c, r, r - 1); }),
  "table.moveRowDown": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && moveRow(e, c, r, r + 1); }),
  "table.moveColumnLeft": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && moveColumn(e, c, k, k - 1); }),
  "table.moveColumnRight": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && moveColumn(e, c, k, k + 1); }),
  "table.moveRow": (e, a) => withTable(e, a, (c) => moveRow(e, c, int(a?.from) ?? -1, int(a?.to) ?? -1)),
  "table.moveColumn": (e, a) => withTable(e, a, (c) => moveColumn(e, c, int(a?.from) ?? -1, int(a?.to) ?? -1)),
  "table.duplicateRow": (e, a) => withTable(e, a, (c) => {
    const r = rowOf(c, a);
    if (r === undefined || r < 1 || r >= c.h) return false;
    const g = clone(c.grid);
    g.cells.splice(r + 1, 0, [...g.cells[r]!]);
    return commit(e, c.loc, g, { row: r + 1, col: 0, end: true }, { kind: "rowDuplicated", index: r + 2 });
  }),
  "table.clearRow": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && r >= 0 && r < c.h && clearRect(e, c, { top: r, bottom: r + 1, left: 0, right: c.w }); }),
  "table.clearColumn": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && k >= 0 && k < c.w && clearRect(e, c, { top: 0, bottom: c.h, left: k, right: k + 1 }); }),
  "table.clearCells": (e, a) => withTable(e, a, (c) => {
    const rect = selectionRect(e.state, c.loc) ?? (c.cur ? { top: c.cur.row, bottom: c.cur.row + 1, left: c.cur.col, right: c.cur.col + 1 } : null);
    return rect ? clearRect(e, c, rect) : false;
  }),
  "table.deleteRow": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && deleteRow(e, c, r); }),
  "table.deleteColumn": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && deleteColumn(e, c, k); }),
  "table.deleteSelection": (e, a) => withTable(e, a, (c) => {
    const rect = selectionRect(e.state, c.loc);
    if (!rect) return TABLE_ACTIONS["table.clearCells"]!(e, a);
    const rows = rect.left === 0 && rect.right === c.w;
    const cols = rect.top === 0 && rect.bottom === c.h;
    if (rows && cols) return deleteTable(e, c.loc);
    if (cols) {
      const g = clone(c.grid);
      for (const r of g.cells) r.splice(rect.left, rect.right - rect.left);
      g.align.splice(rect.left, rect.right - rect.left);
      return commit(e, c.loc, g, { row: 0, col: Math.min(rect.left, g.align.length - 1), end: true }, { kind: "columnDeleted", index: rect.left + 1 });
    }
    if (rows) {
      const g = clone(c.grid);
      // The header row stays (cleared if it was selected); a body row always remains.
      if (rect.top === 0) g.cells[0] = blank(c.w);
      g.cells.splice(Math.max(1, rect.top), rect.bottom - Math.max(1, rect.top));
      if (g.cells.length < 2) g.cells.push(blank(c.w));
      return commit(e, c.loc, g, { row: Math.min(Math.max(1, rect.top), g.cells.length - 1), col: 0, end: true }, { kind: "rowDeleted", index: rect.top + 1 });
    }
    return clearRect(e, c, rect);
  }),
  "table.alignLeft": (e, a) => align(e, a, "left"),
  "table.alignCenter": (e, a) => align(e, a, "center"),
  "table.alignRight": (e, a) => align(e, a, "right"),
  "table.sortAscending": (e, a) => sortBy(e, a, "ascending"),
  "table.sortDescending": (e, a) => sortBy(e, a, "descending"),
  "table.selectRow": (e, a) => withTable(e, a, (c) => { const r = rowOf(c, a); return r !== undefined && r >= 0 && r < c.h && selectRect(e, c.loc, { top: r, bottom: r + 1, left: 0, right: c.w }); }),
  "table.selectColumn": (e, a) => withTable(e, a, (c) => { const k = colOf(c, a); return k !== undefined && k >= 0 && k < c.w && selectRect(e, c.loc, { top: 0, bottom: c.h, left: k, right: k + 1 }); }),
  "table.selectTable": (e, a) => withTable(e, a, (c) => selectRect(e, c.loc, { top: 0, bottom: c.h, left: 0, right: c.w })),
  // Esc: cell selection mode, and Esc again (or Enter) goes back to typing (Keyboard shortcuts → Tables).
  "table.selectCells": (e) => withTable(e, undefined, (c) => {
    if (!c.cur) return false;
    if (e.state.selection instanceof CellSelection) return goTo(e, c.loc, c.cur.row, c.cur.col);
    return selectRect(e, c.loc, { top: c.cur.row, bottom: c.cur.row + 1, left: c.cur.col, right: c.cur.col + 1 });
  }),
  "table.contextMenu": (e) => {
    if (!locateTable(e.state)) return false;
    tableHooks(e).onContextMenu?.();
    return true;
  },
  "table.copy": (e) => clipboardAction(e, "copy"),
  "table.cut": (e) => clipboardAction(e, "cut"),
  "table.copyMarkdown": (e, a) => withTable(e, a, (c) => { tableHooks(e).onCopyText?.(clipboardFor(e.schema, c.grid.cells, c.grid.align, true).markdown, "markdown"); return true; }),
  "table.copyTsv": (e, a) => withTable(e, a, (c) => { tableHooks(e).onCopyText?.(clipboardFor(e.schema, c.grid.cells, c.grid.align, true).tsv, "tsv"); return true; }),
  "table.duplicateTable": (e, a) => withTable(e, a, (c) => {
    if (!e.isEditable) return false;
    const after = c.loc.pos + c.loc.node.nodeSize;
    const tr = closeHistory(e.state.tr).insert(after, c.loc.node.copy(c.loc.node.content));
    e.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, cellTextPos(after, c.loc.node, 0, 0, true))).scrollIntoView());
    endStep(e);
    tableHooks(e).onChange?.({ kind: "tableDuplicated" });
    return true;
  }),
  "table.deleteTable": (e, a) => withTable(e, a, (c) => deleteTable(e, c.loc)),
};

export interface TableInfo {
  inTable: boolean;
  /** The table's position, which handles and menus pass back in their actions. */
  table: number;
  row: number;
  col: number;
  rows: number;
  cols: number;
  /** The column's header text, for its handle's name. */
  header: string;
  align: Align;
  selection: { kind: "none" | "cells" | "row" | "column" | "table" } & Partial<Rect>;
  /** A cell range's anchor and head cells (their positions), for its outline; -1 without one. */
  anchorCell: number;
  headCell: number;
}
const NO_TABLE: TableInfo = { inTable: false, table: -1, row: -1, col: -1, rows: 0, cols: 0, header: "", align: null, selection: { kind: "none" }, anchorCell: -1, headCell: -1 };

/** Where the caret (or a handle) is in a table, for the table controls (IA-CMP-TABLE). */
export function tableInfo(state: EditorState, at: { table?: number; row?: number; col?: number } = {}): TableInfo {
  const loc = locateTable(state, at.table);
  if (!loc) return NO_TABLE;
  const cur = currentCell(state, loc);
  const row = at.row ?? cur?.row ?? 0;
  const col = at.col ?? cur?.col ?? 0;
  const { width, height } = loc.map;
  const headerCell = loc.node.firstChild!.maybeChild(col);
  const rect = selectionRect(state, loc);
  let selection: TableInfo["selection"] = { kind: "none" };
  if (rect) {
    const rows = rect.left === 0 && rect.right === width;
    const cols = rect.top === 0 && rect.bottom === height;
    selection = { kind: rows && cols ? "table" : rows ? "row" : cols ? "column" : "cells", ...rect };
  }
  const cells = rect && state.selection instanceof CellSelection ? { anchorCell: state.selection.$anchorCell.pos, headCell: state.selection.$headCell.pos } : { anchorCell: -1, headCell: -1 };
  return { inTable: true, table: loc.pos, row, col, rows: height, cols: width, header: headerCell?.textContent ?? "", align: toAlign(headerCell?.attrs.align), selection, ...cells };
}
