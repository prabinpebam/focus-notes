/**
 * Tables, the schema and grid model (WP-1.5, IA-CMP-TABLE, TBL-06). A table is GFM's shape: a header
 * row of header cells, then body rows, every row as wide as the header, each cell one paragraph of
 * inline content, alignment per column. The normalizer keeps every table that shape, whatever the
 * edit, so a table can always be written as a GFM pipe table.
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";

export type Align = "left" | "center" | "right" | null;
const ALIGNS = ["left", "center", "right"];
export const toAlign = (v: unknown): Align => (ALIGNS.includes(String(v)) ? (v as Align) : null);

const CELL_ATTRS = {
  // Alignment shows through a data attribute and the design system's styles, never an inline style.
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => toAlign(el.getAttribute("data-align") ?? el.getAttribute("align") ?? el.style?.textAlign),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.align ? { "data-align": attrs.align } : {}),
  },
  // prosemirror-tables reads these; GFM has no spans or widths, so they're always 1, 1, and none.
  colspan: { default: 1, parseHTML: () => 1, renderHTML: () => ({}) },
  rowspan: { default: 1, parseHTML: () => 1, renderHTML: () => ({}) },
  colwidth: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
};

/** How a table is sized (D-182): within the text column (fit, the default), or out to the window (bleed). */
export type TableLayout = "fit" | "bleed";
/** A column's width set by the person, in characters of the note's font (`ch`), or none. */
export type ColumnWidth = number | null;
/** The narrowest a column can be set, in characters, and the step the keys change it by (D-182). */
export const COLUMN_MIN_CH = 4;
export const COLUMN_STEP_CH = 2;
/** The width a column aims for when its width is reset: 30 to 75 characters a line (D-182). */
export const COLUMN_OPTIMAL_CH = { min: 30, max: 75 } as const;

/** Widths from an attribute: numbers of characters, or null; anything else is no widths at all. */
export function toWidths(v: unknown): ColumnWidth[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out = v.map((w) => (typeof w === "number" && Number.isFinite(w) && w > 0 ? Math.max(COLUMN_MIN_CH, Math.round(w * 10) / 10) : null));
  return out.some((w) => w !== null) ? out : null;
}
const parseWidths = (s: string | null) => toWidths((s ?? "").split(",").map((w) => (w.trim() && w.trim() !== "-" ? Number(w) : null)));

export const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  addAttributes: () => ({
    layout: {
      default: "fit",
      parseHTML: (el: HTMLElement) => (el.closest("[data-table]")?.getAttribute("data-layout") === "bleed" ? "bleed" : "fit"),
      renderHTML: () => ({}),
    },
    widths: {
      default: null,
      parseHTML: (el: HTMLElement) => parseWidths(el.closest("[data-table]")?.getAttribute("data-widths") ?? null),
      renderHTML: () => ({}),
    },
  }),
  parseHTML: () => [{ tag: "table" }],
  // The frame scrolls sideways when the table is wider than the page (Tables → Size and wide tables).
  // Its layout and column widths (D-182) are data attributes here; the view draws them (tableView).
  renderHTML: ({ node, HTMLAttributes }) => ["div", {
    "data-table": "",
    ...(node.attrs.layout === "bleed" ? { "data-layout": "bleed" } : {}),
    ...(node.attrs.widths ? { "data-widths": (node.attrs.widths as ColumnWidth[]).map((w) => w ?? "-").join(",") } : {}),
  }, ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]]],
});

export const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)*",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", HTMLAttributes, 0],
});
export const TableHeader = Node.create({
  name: "tableHeader",
  // One paragraph: a GFM cell can't hold more (TBL-06).
  content: "paragraph",
  isolating: true,
  addAttributes: () => CELL_ATTRS,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", mergeAttributes(HTMLAttributes, { scope: "col" }), 0],
});
export const TableCell = Node.create({
  name: "tableCell",
  content: "paragraph",
  isolating: true,
  addAttributes: () => CELL_ATTRS,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", HTMLAttributes, 0],
});

const ROLES: Record<string, string> = { table: "table", tableRow: "row", tableCell: "cell", tableHeader: "header_cell" };
/** Tells prosemirror-tables which node plays which part. */
export const TableRoles = Extension.create({
  name: "tableRoles",
  extendNodeSchema: (extension) => (ROLES[extension.name] ? { tableRole: ROLES[extension.name] } : {}),
});

export const isCell = (node: PMNode | null | undefined): boolean => node?.type.name === "tableCell" || node?.type.name === "tableHeader";

/** A table as rows of cell contents (inline fragments) and the alignment of each column. */
export interface Grid {
  cells: Fragment[][];
  align: Align[];
  /** How it's sized and the columns' set widths (D-182), carried through every change. */
  layout?: TableLayout;
  widths?: ColumnWidth[] | null;
}

/** Every cell's inline content: paragraphs joined by a space, line breaks as spaces. */
export function cellInline(schema: Schema, cell: PMNode): Fragment {
  const out: PMNode[] = [];
  cell.forEach((block, _o, i) => {
    if (i > 0) out.push(schema.text(" "));
    block.forEach((n) => out.push(n.type.name === "hardBreak" ? schema.text(" ", n.marks) : n));
  });
  return Fragment.fromArray(out.filter((n) => !n.isText || n.text));
}

export function readGrid(table: PMNode): Grid {
  const schema = table.type.schema;
  const cells: Fragment[][] = [];
  table.forEach((row) => {
    const r: Fragment[] = [];
    row.forEach((cell) => r.push(cellInline(schema, cell)));
    cells.push(r);
  });
  const header = table.firstChild;
  const width = Math.max(1, ...cells.map((r) => r.length));
  const align = Array.from({ length: width }, (_, c) => (header && c < header.childCount ? toAlign(header.child(c).attrs.align) : null));
  const widths = toWidths(table.attrs.widths);
  return { cells, align, layout: table.attrs.layout === "bleed" ? "bleed" : "fit", widths: widths ? Array.from({ length: width }, (_, c) => widths[c] ?? null) : null };
}

/** A GFM-shaped table from a grid: rows filled to the widest, a body row added if there's none. */
export function buildTable(schema: Schema, grid: Grid): PMNode {
  const width = Math.max(1, grid.align.length, ...grid.cells.map((r) => r.length));
  const rows = grid.cells.length ? [...grid.cells] : [[]];
  if (rows.length < 2) rows.push([]);
  const n = schema.nodes;
  const widths = grid.widths ? toWidths(Array.from({ length: width }, (_, c) => grid.widths![c] ?? null)) : null;
  return n.table!.create({ layout: grid.layout === "bleed" ? "bleed" : "fit", widths }, rows.map((r, i) => n.tableRow!.create(null, Array.from({ length: width }, (_, c) =>
    (i === 0 ? n.tableHeader! : n.tableCell!).create({ align: grid.align[c] ?? null }, n.paragraph!.create(null, r[c] ?? Fragment.empty))))));
}

export const emptyGrid = (rows: number, cols: number): Grid => ({ cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => Fragment.empty)), align: Array.from({ length: cols }, () => null) });

/** Whether a table already has GFM's shape (TBL-06). */
function wellFormed(table: PMNode): boolean {
  const header = table.firstChild;
  const width = header?.childCount ?? 0;
  if (!width || table.childCount < 2) return false;
  let ok = true;
  table.forEach((row, _o, r) => {
    if (!ok || row.childCount !== width) { ok = false; return; }
    row.forEach((cell, _c, c) => {
      if (!ok) return;
      const header = r === 0;
      if ((cell.type.name === "tableHeader") !== header || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1 || cell.childCount !== 1) ok = false;
      else if (r > 0 && cell.attrs.align !== table.firstChild!.child(c).attrs.align) ok = false;
    });
  });
  return ok;
}

/** Where a cell's text starts or ends, by row and column. */
export function cellTextPos(tablePos: number, table: PMNode, row: number, col: number, end = false): number {
  const map = TableMap.get(table);
  const r = Math.max(0, Math.min(row, map.height - 1));
  const c = Math.max(0, Math.min(col, map.width - 1));
  const cellPos = tablePos + 1 + map.map[r * map.width + c]!;
  const cell = table.nodeAt(cellPos - tablePos - 1)!;
  return end ? cellPos + cell.nodeSize - 2 : cellPos + 2;
}

/** The ranges a set of transactions changed, in the final document. */
function changedRanges(trs: readonly Transaction[]): [number, number][] {
  const out: [number, number][] = [];
  trs.forEach((tr, i) => {
    if (!tr.docChanged) return;
    const maps = tr.mapping.maps;
    maps.forEach((m, j) => m.forEach((_a, _b, start, end) => {
      let from = start;
      let to = end;
      for (let k = j + 1; k < maps.length; k++) { from = maps[k]!.map(from, -1); to = maps[k]!.map(to, 1); }
      for (let t = i + 1; t < trs.length; t++) { from = trs[t]!.mapping.map(from, -1); to = trs[t]!.mapping.map(to, 1); }
      out.push([from, to]);
    }));
  });
  return out;
}

/**
 * Keeps every table GFM-shaped after any change (TBL-06): a line break in a cell becomes a space,
 * and a table that lost its shape (a paste, a merge) is rebuilt with the caret where it was.
 */
export const TableNormalizer = Extension.create({
  name: "tableNormalizer",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("tableNormalizer"),
      appendTransaction(trs, _old, state: EditorState) {
        if (!trs.some((t) => t.docChanged)) return null;
        const tables = new Map<number, PMNode>();
        const size = state.doc.content.size;
        for (const [from, to] of changedRanges(trs)) {
          state.doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (node, pos) => {
            if (node.type.name === "table") { tables.set(pos, node); return false; }
            return !node.isTextblock;
          });
        }
        if (!tables.size) return null;
        const tr = state.tr;
        const schema = state.schema;
        // Line breaks first, in place and only where things changed, so the caret stays where it is
        // and typing in a large table stays cheap.
        const fixes: { from: number; to: number; node: PMNode }[] = [];
        for (const [from, to] of changedRanges(trs)) {
          state.doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (n, p, parent) => {
            if (!parent || !isCell(state.doc.resolve(p).node(-1))) return true;
            if (n.type.name === "hardBreak") fixes.push({ from: p, to: p + 1, node: schema.text(" ", n.marks) });
            else if (n.isText && /[\r\n]/.test(n.text!)) fixes.push({ from: p, to: p + n.nodeSize, node: schema.text(n.text!.replace(/[\r\n]+/g, " "), n.marks) });
            return true;
          });
        }
        const seen = new Set<number>();
        for (const f of fixes.sort((a, b) => b.from - a.from)) {
          if (seen.has(f.from)) continue;
          seen.add(f.from);
          tr.replaceWith(f.from, f.to, f.node);
        }
        for (const [pos0] of [...tables].sort((a, b) => b[0] - a[0])) {
          const pos = tr.mapping.map(pos0);
          const table = tr.doc.nodeAt(pos);
          if (!table || table.type.name !== "table" || wellFormed(table)) continue;
          const sel = tr.selection;
          let at: { row: number; col: number } | null = null;
          if (sel.from > pos && sel.from < pos + table.nodeSize) {
            const map = TableMap.get(table);
            const $cell = tr.doc.resolve(sel.from);
            for (let d = $cell.depth; d > 0; d--) {
              if (isCell($cell.node(d))) {
                try {
                  const rect = map.findCell($cell.before(d) - pos - 1);
                  at = { row: rect.top, col: rect.left };
                } catch { /* not a cell of this table */ }
                break;
              }
            }
          }
          const fixed = buildTable(schema, readGrid(table));
          tr.replaceWith(pos, pos + table.nodeSize, fixed);
          if (at) tr.setSelection(TextSelection.create(tr.doc, cellTextPos(pos, fixed, at.row, at.col, true)));
        }
        return tr.docChanged ? tr : null;
      },
    })];
  },
});
