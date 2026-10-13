/**
 * TBL-06, TBL-01, TBL-10: GFM pipe tables in the Markdown bridge. They open as editable tables,
 * untouched tables are written back byte for byte, and edited ones are written as padded, aligned
 * GFM with pipes escaped. Cells hold inline content only, as GFM does.
 */
import { describe, expect, it } from "vitest";
import { blockToMarkdown, blocksFromMdast, markdownToBlocks, parseMarkdown, serializeMarkdown, type PMNode } from "../src/index.ts";

const text = (n: PMNode): string => n.text ?? (n.content ?? []).map(text).join("");
const cells = (table: PMNode) => (table.content ?? []).map((row) => (row.content ?? []).map(text));
const cell = (type: "tableHeader" | "tableCell", value: string | PMNode[], align: string | null = null): PMNode => ({
  type, attrs: { align },
  content: [typeof value === "string" ? (value ? { type: "paragraph", content: [{ type: "text", text: value }] } : { type: "paragraph" }) : { type: "paragraph", content: value }],
});
const row = (...c: PMNode[]): PMNode => ({ type: "tableRow", content: c });

describe("opening a GFM table (TBL-06)", () => {
  it("becomes a table: a header row of header cells, body rows of cells, alignment on every cell", () => {
    const { doc } = parseMarkdown("| A | B | C |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n");
    const table = doc.content![0]!;
    expect(table.type).toBe("table");
    expect(table.content!.map((r) => r.content!.map((c) => c.type))).toEqual([["tableHeader", "tableHeader", "tableHeader"], ["tableCell", "tableCell", "tableCell"]]);
    expect(table.content![1]!.content!.map((c) => c.attrs?.align)).toEqual(["left", "center", "right"]);
    expect(cells(table)).toEqual([["A", "B", "C"], ["1", "2", "3"]]);
  });

  it("keeps inline formatting in cells, and an escaped pipe is a pipe", () => {
    const { doc } = parseMarkdown("| **Bold** | `a\\|b` |\n| --- | --- |\n| [x](https://e.com) | a \\| b |\n");
    const table = doc.content![0]!;
    expect(table.content![0]!.content![0]!.content![0]!.content![0]!.marks).toEqual([{ type: "bold" }]);
    expect(cells(table)).toEqual([["Bold", "a|b"], ["x", "a | b"]]);
  });

  it("fills short rows with empty cells and drops cells past the header, as GFM does", () => {
    const { doc } = parseMarkdown("| a | b | c |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |\n");
    expect(cells(doc.content![0]!)).toEqual([["a", "b", "c"], ["1", "", ""], ["1", "2", "3"]]);
  });

  it("keeps a table it can't edit (inline HTML in a cell) verbatim", () => {
    const { doc } = parseMarkdown("| a<br>b | c |\n|---|---|\n| 1 | 2 |\n");
    expect(doc.content![0]!.type).toBe("rawMarkdown");
  });
});

describe("saving tables (TBL-06, EDT-10)", () => {
  it("writes an untouched table back exactly, even when it isn't in canonical style", () => {
    const src = "Intro.\n\n|a|b|\n|-|:-:|\n|1|2|\n| x |  y  |\n\nAfter.\n";
    const parsed = parseMarkdown(src);
    const doc = structuredClone(parsed.doc);
    doc.content![2] = { type: "paragraph", content: [{ type: "text", text: "After!" }] };
    expect(serializeMarkdown(parsed.doc, parsed)).toBe(src);
    expect(serializeMarkdown(doc, parsed)).toBe("Intro.\n\n|a|b|\n|-|:-:|\n|1|2|\n| x |  y  |\n\nAfter!\n");
  });

  it("ignores editor-only cell attributes when matching (colspan, rowspan, colwidth)", () => {
    const src = "| a | b |\n| - | - |\n| 1 | 2 |\n";
    const parsed = parseMarkdown(src);
    const doc = structuredClone(parsed.doc);
    for (const r of doc.content![0]!.content!) for (const c of r.content!) c.attrs = { ...c.attrs, colspan: 1, rowspan: 1, colwidth: null };
    expect(serializeMarkdown(doc, parsed)).toBe(src);
  });

  it("writes an edited table as a padded, aligned GFM table", () => {
    const table: PMNode = {
      type: "table",
      content: [
        row(cell("tableHeader", "Task", "left"), cell("tableHeader", "Owner", "center"), cell("tableHeader", "Status"), cell("tableHeader", "Due", "right")),
        row(cell("tableCell", "Draft intro", "left"), cell("tableCell", "Me", "center"), cell("tableCell", "Doing"), cell("tableCell", "Mon", "right")),
      ],
    };
    expect(blockToMarkdown(table)).toBe([
      "| Task        | Owner | Status | Due |",
      "| :---------- | :---: | ------ | --: |",
      "| Draft intro |   Me  | Doing  | Mon |",
    ].join("\n"));
  });

  it("escapes pipes in text and in code, and writes formatting", () => {
    const table: PMNode = {
      type: "table",
      content: [
        row(cell("tableHeader", "a|b"), cell("tableHeader", [{ type: "text", text: "x|y", marks: [{ type: "code" }] }])),
        row(cell("tableCell", [{ type: "text", text: "bold", marks: [{ type: "bold" }] }]), cell("tableCell", "")),
      ],
    };
    const md = blockToMarkdown(table);
    // (Columns are padded to the text before escaping, so an escaped pipe in code sits one space wider.)
    expect(md).toBe(["| a\\|b     | `x\\|y` |", "| -------- | ------ |", "| **bold** |        |"].join("\n"));
    // And it reads back as the same table.
    expect(cells(parseMarkdown(md).doc.content![0]!)).toEqual([["a|b", "x|y"], ["bold", ""]]);
  });

  it("never writes a line break inside a cell: a stray break becomes a space", () => {
    const table: PMNode = { type: "table", content: [row(cell("tableHeader", [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }])), row(cell("tableCell", "1"))] };
    expect(blockToMarkdown(table)).toBe("| a b |\n| --- |\n| 1   |");
  });

  it("round-trips an edited table through save and open", () => {
    const src = "# Plan\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
    const parsed = parseMarkdown(src);
    const doc = structuredClone(parsed.doc);
    doc.content![1]!.content!.push(row(cell("tableCell", "3"), cell("tableCell", "4")));
    const out = serializeMarkdown(doc, parsed);
    expect(out).toBe("# Plan\n\n| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n");
    expect(cells(parseMarkdown(out).doc.content![1]!)).toEqual([["A", "B"], ["1", "2"], ["3", "4"]]);
  });
});

describe("pasting tables (TBL-10)", () => {
  it("pasted GFM Markdown becomes a table, no longer its text", () => {
    const nodes = markdownToBlocks("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(nodes.map((n) => n.type)).toEqual(["table"]);
    expect(cells(nodes[0]!)).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("an HTML table (as mdast) becomes a table, its first row the header", () => {
    const nodes = blocksFromMdast({
      type: "root",
      children: [{ type: "table", align: [], children: [
        { type: "tableRow", children: [{ type: "tableCell", children: [{ type: "text", value: "A" }] }, { type: "tableCell", children: [{ type: "text", value: "B" }] }] },
        { type: "tableRow", children: [{ type: "tableCell", children: [{ type: "text", value: "1" }] }] },
      ] }],
    });
    expect(nodes.map((n) => n.type)).toEqual(["table"]);
    expect(cells(nodes[0]!)).toEqual([["A", "B"], ["1", ""]]);
    expect(nodes[0]!.content![0]!.content![0]!.type).toBe("tableHeader");
  });
  it("a table that is only a header row still gets a body row, since a table always has one", () => {
    const nodes = blocksFromMdast({ type: "root", children: [{ type: "table", align: [], children: [{ type: "tableRow", children: [{ type: "tableCell", children: [{ type: "text", value: "A" }] }] }] }] });
    expect(cells(nodes[0]!)).toEqual([["A"], [""]]);
  });
});
