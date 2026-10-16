/**
 * Tables as the design system draws them (D-182): the editor's node view for a table (its frame, a
 * colgroup, and the body), with the table's layout and set column widths, and the measurements the
 * editor's width commands and the resize drag use. Widths are characters (`ch`) of the note's font,
 * written through the CSS object model.
 */
import { COLUMN_OPTIMAL_CH, type TableHooks } from "@focus-notes/editor";
type PMNode = Parameters<NonNullable<TableHooks["view"]>>[0];

type Widths = (number | null)[] | null;
const key = (node: PMNode) => `${node.attrs.layout}|${(node.attrs.widths as Widths)?.join(",") ?? ""}|${node.firstChild?.childCount ?? 0}`;

/** Sizes a table's columns from its widths; bled out with every width set, the table is their sum. */
export function sizeColumns(table: HTMLTableElement, cols: HTMLElement[], widths: Widths, bleed: boolean): void {
  cols.forEach((c, i) => {
    const w = widths?.[i];
    if (w) c.style.width = `${w}ch`;
    else c.style.removeProperty("width");
  });
  const all = Boolean(widths) && cols.length > 0 && cols.every((_c, i) => widths![i]);
  if (all && bleed) table.style.width = `${cols.reduce((a, _c, i) => a + (widths![i] ?? 0), 0)}ch`;
  else table.style.removeProperty("width");
}

/** The editor's node view for a table (TableHooks.view). */
export function tableView(initial: PMNode) {
  const dom = document.createElement("div");
  dom.setAttribute("data-table", "");
  const table = document.createElement("table");
  const colgroup = document.createElement("colgroup");
  const tbody = document.createElement("tbody");
  table.append(colgroup, tbody);
  dom.append(table);
  let shown = "";
  const draw = (node: PMNode) => {
    const k = key(node);
    if (k === shown) return;
    shown = k;
    const widths = (node.attrs.widths as Widths) ?? null;
    const bleed = node.attrs.layout === "bleed";
    if (bleed) dom.setAttribute("data-layout", "bleed");
    else dom.removeAttribute("data-layout");
    if (widths) dom.setAttribute("data-widths", widths.map((w) => w ?? "-").join(","));
    else dom.removeAttribute("data-widths");
    const cols = Array.from({ length: node.firstChild?.childCount ?? 0 }, () => document.createElement("col"));
    colgroup.replaceChildren(...cols);
    sizeColumns(table, cols, widths, bleed);
  };
  draw(initial);
  return {
    dom,
    contentDOM: tbody,
    update: (node: PMNode) => {
      if (node.type !== initial.type) return false;
      draw(node);
      return true;
    },
    // The frame's attributes and the colgroup are the view's own, never the document's.
    ignoreMutation: (m: unknown) => {
      const r = m as { type: string; target: Node };
      return r.type === "attributes" || r.target === colgroup || colgroup.contains(r.target) || r.target === table && r.type !== "childList";
    },
  };
}

/** A character's width (`ch`) in an element's font, in pixels. */
export function chOf(el: Element): number {
  const probe = document.createElement("span");
  probe.textContent = "0000000000";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  el.append(probe);
  const w = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return w > 0 ? w : 8;
}

/** A drawn table's columns (TableHooks.columns): widths in pixels, a character's width, and a column's aim. */
export function measureColumns(frame: HTMLElement): { widths: number[]; ch: number; optimal(col: number): number } | null {
  const rows = frame.querySelector("table")?.rows;
  const header = rows?.[0];
  if (!rows || !header?.cells.length) return null;
  const ch = chOf(header.cells[0]!);
  return {
    widths: [...header.cells].map((c) => c.getBoundingClientRect().width),
    ch,
    optimal(col) {
      const cell = header.cells[col];
      if (!cell) return COLUMN_OPTIMAL_CH.min;
      const cs = getComputedStyle(cell);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      let longest = 0;
      for (const row of rows) {
        const p = row.cells[col]?.querySelector("p");
        if (!p) continue;
        const range = document.createRange();
        range.selectNodeContents(p);
        longest = Math.max(longest, range.getBoundingClientRect().width);
      }
      return Math.min(COLUMN_OPTIMAL_CH.max, Math.max(COLUMN_OPTIMAL_CH.min, Math.ceil((longest + pad) / ch)));
    },
  };
}
