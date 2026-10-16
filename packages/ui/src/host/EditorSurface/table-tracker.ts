/**
 * The table controls' editor side (IA-CMP-TABLE, Tables → Interactions): follows the pointer over
 * tables (and the caret in one), finds the row, column, and nearest edge boundary, and publishes
 * where the handles, insertion point, and edge bars go. It reports what they're for (`table` event)
 * only when that changes, and measures in one animation frame, so typing in a big table stays fast.
 */
import type { Editor } from "@tiptap/react";
import { COLUMN_MIN_CH, tableInfo } from "@focus-notes/editor";
import { chOf } from "./table-view.ts";
import { tableGeometry, type Box, type TableGeometry } from "../../behaviors/table-geometry.ts";

export interface TablePayload {
  inTable: boolean;
  table: number;
  row: number;
  col: number;
  rows: number;
  cols: number;
  header: string;
  align: string;
  insertAxis: string;
  insertIndex: number;
  selection: string;
  /** Fit to column or Bleed to edge (D-182). */
  layout: string;
}
const NONE: TablePayload = { inTable: false, table: -1, row: 0, col: 0, rows: 0, cols: 0, header: "", align: "", insertAxis: "", insertIndex: 0, selection: "none", layout: "fit" };

/** Hover lingers this long after leaving. The insertion point shows at once (D-182). */
const LEAVE_DELAY_MS = 200;

export interface TableVars {
  /** How far outside the table's left and top edges the handles and insertion points reach. */
  gutter: string;
  /** The band centred on an inner border where the insertion point shows (12 px, D-182). */
  boundary: string;
  /** How far below and right of the table the edge bars stay (24 px). */
  reach: string;
}

const box = (r: DOMRect | Box): Box => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
const varName = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/** The index of the span containing `v`, clamped to the first and last (binary search over boxes). */
function indexAt(count: number, v: number, start: (i: number) => number): number {
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (start(mid) <= v) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/**
 * The inner border the pointer is on, if any (D-182): within `half` of a column's left border along
 * the table's height (or above it, where the column handles are), or of a row's top border along its
 * width (or left of it, where the row handles are). Only the borders next to the hovered row and
 * column are measured; the header row's top and the first column's left edge aren't inner borders.
 */
export function borderAt(
  p: { x: number; y: number }, f: Box,
  rows: ArrayLike<{ getBoundingClientRect(): { top: number } }>, header: ArrayLike<{ getBoundingClientRect(): { left: number } }>,
  row: number, col: number, half: number, gutter: number,
): TableGeometry["insert"] {
  let best: { axis: "row" | "column"; index: number; at: number; d: number } | null = null;
  if (p.y >= f.top - gutter && p.y <= f.bottom) {
    for (const i of [col, col + 1]) {
      if (i < 1 || i >= header.length) continue;
      const x = header[i]!.getBoundingClientRect().left;
      const d = Math.abs(p.x - x);
      if (d <= half && x >= f.left && x <= f.right && (!best || d < best.d)) best = { axis: "column", index: i, at: x, d };
    }
  }
  if (p.x >= f.left - gutter && p.x <= f.right) {
    for (const i of [row, row + 1]) {
      if (i < 1 || i >= rows.length) continue;
      const y = rows[i]!.getBoundingClientRect().top;
      const d = Math.abs(p.y - y);
      if (d <= half && (!best || d < best.d)) best = { axis: "row", index: i, at: y, d };
    }
  }
  return best ? { axis: best.axis, index: best.index, at: best.at } : null;
}

export interface TableTracker {
  /** The context menu was asked for: the controls follow the caret's cell until the pointer moves. */
  menu(): void;
  dispose(): void;
}

export function trackTables(editor: Editor, scroller: HTMLElement, vars: TableVars, emit: (p: TablePayload) => void): TableTracker {
  const view = editor.view;
  let pointer: { x: number; y: number } | null = null;
  let pinnedAt: { x: number; y: number } | null = null;
  let hoverWrap: HTMLElement | null = null;
  /** The hovered cell, kept while the pointer is on the controls (it isn't over the note then). */
  let lastCell: { row: number; col: number } | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  let leaving = false;
  let insert: TableGeometry["insert"] = null;
  let frame = 0;
  let last = "";
  const px = { gutter: 40, boundary: 12, reach: 24, columnMin: COLUMN_MIN_CH };
  const readVars = () => {
    const cs = getComputedStyle(scroller);
    const read = (v: string, d: number) => parseFloat(cs.getPropertyValue(varName(v))) || d;
    px.gutter = read(vars.gutter, 40);
    px.boundary = read(vars.boundary, 12);
    px.reach = read(vars.reach, 24);
  };
  const coarse = () => globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;

  const publish = (payload: TablePayload) => {
    const key = JSON.stringify(payload);
    if (key === last) return;
    last = key;
    emit(payload);
  };
  const clear = () => {
    tableGeometry.set(null);
    publish(NONE);
  };

  /** The visible part of the table: it's clipped by its frame when it scrolls sideways. */
  const frameOf = (wrap: HTMLElement, table: HTMLTableElement): Box => {
    const t = table.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    return { top: t.top, bottom: t.bottom, left: Math.max(t.left, w.left), right: Math.min(t.right, w.right) };
  };
  const within = (b: Box, p: { x: number; y: number }, left: number, top: number, right: number, bottom: number) =>
    p.x >= b.left - left && p.x <= b.right + right && p.y >= b.top - top && p.y <= b.bottom + bottom;

  const measure = () => {
    frame = 0;
    if (editor.isDestroyed) return;
    if (!editor.isEditable) return clear();
    const pin = pinnedAt !== null;
    // The table under the pointer, with room for the handles above and left and the edge bars below and right.
    let wrap: HTMLElement | null = null;
    if (pointer && !pin) {
      for (const w of view.dom.querySelectorAll<HTMLElement>("[data-table]")) {
        const t = w.querySelector("table");
        if (t && within(frameOf(w, t), pointer, px.gutter, px.gutter, px.reach, px.reach)) { wrap = w; break; }
      }
    }
    if (!wrap && hoverWrap?.isConnected && (tableGeometry.held || leaving)) wrap = hoverWrap;
    if (!wrap && hoverWrap && !leaving && !pin) {
      // Leaving: the controls stay a moment, so the pointer can reach a handle.
      leaving = true;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        leaving = false;
        if (!tableGeometry.held) hoverWrap = null;
        schedule();
      }, LEAVE_DELAY_MS);
      wrap = hoverWrap;
    }
    if (wrap && wrap !== hoverWrap) leaving = false;
    if (wrap && pointer && !pin && within(frameOf(wrap, wrap.querySelector("table")!), pointer, px.gutter, px.gutter, px.reach, px.reach)) {
      leaving = false;
      clearTimeout(leaveTimer);
    }
    hoverWrap = pin ? hoverWrap : wrap;
    const hovering = Boolean(wrap) && !pin;

    let info;
    let tableEl: HTMLTableElement | null;
    if (wrap) {
      tableEl = wrap.querySelector("table");
      info = tableInfo(editor.state, { table: view.posAtDOM(wrap, 0) });
    } else {
      // No hover: the caret's table, while the note has focus.
      info = tableInfo(editor.state);
      if (!info.inTable || !(view.hasFocus() || pin)) { insert = null; return clear(); }
      const dom = view.nodeDOM(info.table) as HTMLElement | null;
      wrap = dom?.matches?.("[data-table]") ? dom : null;
      tableEl = wrap?.querySelector("table") ?? null;
    }
    if (!info.inTable || !wrap || !tableEl) return clear();
    const rowsEl = tableEl.rows;
    const header = rowsEl[0]?.cells;
    if (!rowsEl.length || !header?.length) return clear();
    const f = frameOf(wrap, tableEl);
    let row = info.row;
    let col = info.col;
    const over = pointer && within(f, pointer, px.gutter, px.gutter, px.reach, px.reach);
    if (hovering && over) {
      row = indexAt(rowsEl.length, pointer!.y, (i) => rowsEl[i]!.getBoundingClientRect().top);
      col = indexAt(header.length, pointer!.x, (i) => header[i]!.getBoundingClientRect().left);
      lastCell = { row, col };
    } else if (hovering && lastCell) ({ row, col } = { row: Math.min(lastCell.row, rowsEl.length - 1), col: Math.min(lastCell.col, header.length - 1) });
    if (hovering) info = tableInfo(editor.state, { table: info.table, row, col });
    else lastCell = null;
    const rb = rowsEl[Math.min(row, rowsEl.length - 1)]!.getBoundingClientRect();
    const cb = header[Math.min(col, header.length - 1)]!.getBoundingClientRect();

    // The + insertion point (D-182, as in Microsoft Loop): anywhere along an inner border, within the
    // insert zone centred on it (12 px), or on the handles' side of it, the border is offered at once;
    // the nearer border wins where a column's and a row's meet.
    insert = hovering && pointer && over ? borderAt(pointer, f, rowsEl, header, row, col, px.boundary / 2, px.gutter) : null;

    // The selected range's outline and the active cell, from the cells' own boxes.
    let selection: Box | null = null;
    let cell: Box | null = null;
    const caret = tableInfo(editor.state);
    const cellBox = (pos: number) => {
      const el = view.nodeDOM(pos) as HTMLElement | null;
      return el?.getBoundingClientRect ? box(el.getBoundingClientRect()) : null;
    };
    if (caret.inTable && caret.table === info.table && caret.anchorCell >= 0) {
      const a = cellBox(caret.anchorCell);
      const b = cellBox(caret.headCell);
      if (a && b) selection = { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) };
      cell = b;
    } else if (caret.inTable && caret.table === info.table) {
      const r = rowsEl[caret.row]?.cells[caret.col];
      if (r) cell = box(r.getBoundingClientRect());
    }
    tableGeometry.set({
      table: info.table, frame: f, rows: info.rows, cols: info.cols, row, col,
      rowBox: { top: rb.top, bottom: rb.bottom, left: f.left, right: f.right },
      colBox: { top: f.top, bottom: f.bottom, left: cb.left, right: cb.right },
      hovering, handles: hovering || pin || coarse(), insert: hovering ? insert : null, selection, cell,
    });
    publish({
      inTable: true, table: info.table, row, col, rows: info.rows, cols: info.cols, header: info.header, align: info.align ?? "",
      insertAxis: hovering && insert ? insert.axis : "", insertIndex: hovering && insert ? insert.index : 0, selection: info.selection.kind,
      layout: wrap.getAttribute("data-layout") === "bleed" ? "bleed" : "fit",
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    pointer = { x: e.clientX, y: e.clientY };
    if (pinnedAt && Math.hypot(pointer.x - pinnedAt.x, pointer.y - pinnedAt.y) > 4) pinnedAt = null;
    schedule();
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    // Onto the table's own controls (the offered border, a handle): still where it was over the table.
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest("[data-table-controls]")) return;
    pointer = null;
    schedule();
  };
  const onTransaction = () => schedule();
  const onResize = () => { readVars(); schedule(); };
  editor.on("transaction", onTransaction);
  editor.on("focus", onTransaction);
  editor.on("blur", onTransaction);
  scroller.addEventListener("pointermove", onMove, { passive: true });
  scroller.addEventListener("pointerleave", onLeave);
  scroller.addEventListener("scroll", schedule, { passive: true });
  // A wide table's frame scrolls sideways on its own.
  view.dom.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", onResize);
  tableGeometry.refresh = schedule;
  tableGeometry.edges = () => {
    const wrap = hoverWrap ?? (view.nodeDOM(tableInfo(editor.state).table) as HTMLElement | null);
    const t = wrap?.querySelector?.("table");
    if (!t) return null;
    const rows = [...t.rows].map((r) => r.getBoundingClientRect().top);
    if (t.rows.length) rows.push(t.rows[t.rows.length - 1]!.getBoundingClientRect().bottom);
    const cells = [...(t.rows[0]?.cells ?? [])];
    const cols = cells.map((c) => c.getBoundingClientRect().left);
    if (cells.length) cols.push(cells.at(-1)!.getBoundingClientRect().right);
    return { rows, cols };
  };
  tableGeometry.columns = () => {
    const wrap = hoverWrap ?? (view.nodeDOM(tableInfo(editor.state).table) as HTMLElement | null);
    const t = wrap?.querySelector?.("table");
    const cells = t?.rows[0] ? [...t.rows[0].cells] : [];
    if (!t || !cells.length) return null;
    const ch = chOf(cells[0]!);
    const cols = [...t.querySelectorAll(":scope > colgroup > col")] as HTMLElement[];
    const kept = cols.map((c) => c.style.width);
    const keptTable = t.style.width;
    return {
      widths: cells.map((c) => c.getBoundingClientRect().width),
      ch,
      min: px.columnMin * ch,
      show: (widths) => {
        cols.forEach((c, i) => { c.style.width = widths ? `${widths[i]}px` : kept[i]!; });
        // Bled out, the table follows its columns; fitted, it stays the column's width.
        if (widths && wrap!.getAttribute("data-layout") === "bleed") { t.style.width = `${widths.reduce((a, w) => a + w, 0)}px`; t.style.tableLayout = "fixed"; }
        if (!widths) { t.style.width = keptTable; t.style.removeProperty("table-layout"); }
      },
    };
  };
  readVars();
  schedule();

  return {
    menu() {
      pinnedAt = pointer ?? { x: -1e6, y: -1e6 };
      cancelAnimationFrame(frame);
      measure();
    },
    dispose() {
      cancelAnimationFrame(frame);
      clearTimeout(leaveTimer);
      tableGeometry.refresh = () => {};
      editor.off("transaction", onTransaction);
      editor.off("focus", onTransaction);
      editor.off("blur", onTransaction);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerleave", onLeave);
      scroller.removeEventListener("scroll", schedule);
      view.dom.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", onResize);
      tableGeometry.edges = () => null;
      tableGeometry.columns = () => null;
      tableGeometry.set(null);
    },
  };
}
