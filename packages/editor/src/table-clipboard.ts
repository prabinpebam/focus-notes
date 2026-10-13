/**
 * Tables and the clipboard (TBL-10, TBL-11, DD-TABLE-07): a copied cell range is tab-separated text
 * for spreadsheets, a GFM table for Markdown, and HTML for documents; a pasted range is read from a
 * spreadsheet's HTML table or its tab-separated text.
 */
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { blockToMarkdown, type PMNode as JsonNode } from "@focus-notes/markdown";
import type { Align, Grid } from "./table-schema.ts";

/**
 * Tab-separated text as rows of cells, or null when it isn't a range: every line has the same number
 * of tabs, at least one, and not every line starts with one (that's indented code).
 */
export function parseTsv(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const tabs = lines.map((l) => l.split("\t").length - 1);
  if (!lines.length || tabs[0]! < 1 || tabs.some((t) => t !== tabs[0]) || lines.every((l) => l.startsWith("\t"))) return null;
  return lines.map((l) => l.split("\t").map((c) => c.trim()));
}

/** A grid of plain text as inline fragments. */
export function textGrid(schema: Schema, rows: string[][]): Grid {
  const width = Math.max(...rows.map((r) => r.length));
  return {
    cells: rows.map((r) => Array.from({ length: width }, (_, c) => (r[c] ? Fragment.from(schema.text(r[c]!.replace(/\s+/g, " "))) : Fragment.empty))),
    align: Array.from({ length: width }, () => null),
  };
}

const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, " ");
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TAGS: Record<string, string> = { bold: "strong", italic: "em", strike: "s", code: "code" };
/** Inline content as HTML: the marks Markdown has, and links. */
function inlineHtml(content: Fragment): string {
  let out = "";
  content.forEach((n) => {
    let html = n.isText ? escapeHtml(n.text ?? "") : n.type.name === "hardBreak" ? " " : "";
    for (const m of [...n.marks].reverse()) {
      if (m.type.name === "link") html = `<a href="${escapeHtml(String(m.attrs.href ?? ""))}">${html}</a>`;
      else if (TAGS[m.type.name]) html = `<${TAGS[m.type.name]}>${html}</${TAGS[m.type.name]}>`;
    }
    out += html;
  });
  return out;
}

const fragmentText = (f: Fragment) => {
  let s = "";
  f.forEach((n) => { s += n.isText ? n.text : " "; });
  return s;
};

/** What a copied range puts on the clipboard (TBL-11). The first copied row is the Markdown header. */
export function clipboardFor(schema: Schema, cells: Fragment[][], align: Align[], headerFirst: boolean) {
  const tsv = cells.map((r) => r.map((c) => oneLine(fragmentText(c))).join("\t")).join("\n");
  const html = `<table><tbody>${cells.map((r, i) => `<tr>${r.map((c) => (i === 0 && headerFirst ? `<th>${inlineHtml(c)}</th>` : `<td>${inlineHtml(c)}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;
  // Exactly the copied rows: one copied row is a header-only table, which GFM allows.
  const n = schema.nodes;
  const table = n.table!.create(null, cells.map((r, i) => n.tableRow!.create(null, r.map((c, j) =>
    (i === 0 ? n.tableHeader! : n.tableCell!).create({ align: align[j] ?? null }, n.paragraph!.create(null, c))))));
  const markdown = blockToMarkdown(table.toJSON() as JsonNode);
  return { tsv, html, markdown };
}

/** The cells of a table node (a pasted HTML table) as a grid. */
export function nodeGrid(table: PMNode): Fragment[][] {
  const rows: Fragment[][] = [];
  table.forEach((row) => {
    const r: Fragment[] = [];
    row.forEach((cell) => r.push(cell.firstChild?.content ?? Fragment.empty));
    rows.push(r);
  });
  return rows;
}
