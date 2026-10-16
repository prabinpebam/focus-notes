import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown, parseTableNote, tableNote, type PMNode } from "../src/index.ts";

describe("D-182: a table's layout and set column widths", () => {
  it("are read from the comment on the line before it", () => {
    const p = parseMarkdown("<!-- table: layout=bleed widths=24,-,40 -->\n| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(p.doc.content).toHaveLength(1);
    expect(p.doc.content![0]).toMatchObject({ type: "table", attrs: { layout: "bleed", widths: [24, null, 40] } });
  });
  it("are written only when they aren't the default, and survive a change to the table", () => {
    const src = "Intro.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    const p = parseMarkdown(src);
    const doc = structuredClone(p.doc);
    const table = doc.content![1]! as PMNode;
    table.attrs = { layout: "fit", widths: null };
    expect(serializeMarkdown(doc, p)).toBe(src);
    table.attrs = { layout: "bleed", widths: [20, null] };
    const out = serializeMarkdown(doc, p);
    expect(out).toBe("Intro.\n\n<!-- table: layout=bleed widths=20,- -->\n| a | b |\n| - | - |\n| 1 | 2 |\n");
    const again = parseMarkdown(out);
    expect(again.doc.content![1]).toMatchObject({ attrs: { layout: "bleed", widths: [20, null] } });
    expect(serializeMarkdown(again.doc, again)).toBe(out);
  });
  it("a malformed or foreign comment is no settings", () => {
    expect(parseTableNote("<!-- nothing -->")).toBeUndefined();
    expect(parseTableNote("<!-- table: layout=sideways widths=a,b -->")).toEqual({ layout: "fit", widths: null });
    expect(tableNote({ layout: "fit", widths: null })).toBeUndefined();
  });
});
