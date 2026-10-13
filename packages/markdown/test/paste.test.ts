/**
 * EDT-09, SEC-02: pasted Markdown becomes blocks, and what the editor can't represent yet degrades
 * to plain text instead of a read-only raw block.
 */
import { describe, expect, it } from "vitest";
import { blocksFromMdast, markdownToBlocks, plainTextBlocks, type PMNode } from "../src/index.ts";

const types = (nodes: PMNode[]) => nodes.map((n) => n.type);
const text = (n: PMNode): string => n.text ?? (n.content ?? []).map(text).join("");

describe("pasted Markdown (EDT-09)", () => {
  it("parses blocks and marks", () => {
    const nodes = markdownToBlocks("# Title\n\n- one\n- two\n\nSome **bold** text.\n");
    expect(types(nodes)).toEqual(["heading", "bulletList", "paragraph"]);
    expect(nodes[2]!.content!.find((n) => n.marks)?.marks).toEqual([{ type: "bold" }]);
  });
  it("degrades a table (until WP-1.5) to its text, one paragraph per line", () => {
    const nodes = markdownToBlocks("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(types(nodes)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(nodes.map(text)).toEqual(["| a | b |", "| - | - |", "| 1 | 2 |"]);
  });
  it("shows raw HTML as text, never as markup (SEC-02)", () => {
    const nodes = markdownToBlocks("<img src=x onerror=alert(1)>\n\nA <b>bold</b> word.\n");
    expect(types(nodes)).toEqual(["paragraph", "paragraph"]);
    expect(nodes.map(text)).toEqual(["<img src=x onerror=alert(1)>", "A <b>bold</b> word."]);
  });
  it("is empty for whitespace", () => {
    expect(markdownToBlocks("  \n\n")).toEqual([]);
    expect(plainTextBlocks("a\r\n\r\nb")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ]);
  });
});

describe("converted HTML as Markdown (EDT-09)", () => {
  it("converts supported mdast and degrades the rest to its Markdown text", () => {
    const nodes = blocksFromMdast({
      type: "root",
      children: [
        { type: "heading", depth: 2, children: [{ type: "text", value: "Heading" }] },
        { type: "table", align: [], children: [
          { type: "tableRow", children: [{ type: "tableCell", children: [{ type: "text", value: "A" }] }, { type: "tableCell", children: [{ type: "text", value: "B" }] }] },
          { type: "tableRow", children: [{ type: "tableCell", children: [{ type: "text", value: "1" }] }, { type: "tableCell", children: [{ type: "text", value: "2" }] }] },
        ] },
      ],
    });
    expect(types(nodes)).toEqual(["heading", "paragraph", "paragraph", "paragraph"]);
    expect(nodes.slice(1).map(text)).toEqual(["| A | B |", "| - | - |", "| 1 | 2 |"]);
  });
});
