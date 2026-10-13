/** Where link destinations are written (FIL-09): exact source ranges, never inside code, HTML, or front matter. */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { linkDestinations } from "../src/index.ts";

const dests = (src: string) => linkDestinations(src).map((d) => [src.slice(d.start, d.end), d.angle]);

describe("linkDestinations", () => {
  it("finds inline links, images, and reference definitions with their exact ranges", () => {
    const src = "See [a](../a/b.md) and ![pic](img/p.png \"T\") and [r][id].\n\n[id]: notes/c.md \"Title\"\n";
    expect(dests(src)).toEqual([["../a/b.md", false], ["img/p.png", false], ["notes/c.md", false]]);
  });
  it("gives angle-bracket destinations without their brackets, and keeps escapes and fragments as written", () => {
    const src = "[x](<My Note.md#Part one>) [y](a\\(1\\).md) [z](b%20c.md?q=1#h) [e](<>)\n";
    expect(dests(src)).toEqual([["My Note.md#Part one", true], ["a\\(1\\).md", false], ["b%20c.md?q=1#h", false]]);
  });
  it("ignores code spans, code blocks, HTML, autolinks, and front matter", () => {
    const src = "---\nlink: [f](front.md)\n---\n\n`[c](code.md)`\n\n```\n[d](block.md)\n```\n\n    [i](indented.md)\n\n<a href=\"html.md\">h</a> <https://example.com/x.md>\n\n[real](real.md)\n";
    expect(dests(src)).toEqual([["real.md", false]]);
  });
  it("counts a byte-order mark and CRLF line endings in its offsets", () => {
    const src = "\uFEFF# T\r\n\r\nA [l](x.md)\r\n";
    expect(dests(src)).toEqual([["x.md", false]]);
  });
  it("finds links inside tables, lists, quotes, and emphasis", () => {
    const src = "| a | b |\n|---|---|\n| [t](t.md) | x |\n\n- [l](l.md)\n\n> **[q](q.md)**\n";
    expect(dests(src).map((d) => d[0])).toEqual(["t.md", "l.md", "q.md"]);
  });
  it("every range in the round-trip corpus is inside the file", () => {
    const dir = join(import.meta.dirname, "corpus");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const d of linkDestinations(src)) expect(d.start < d.end && d.end <= src.length).toBe(true);
    }
  });
});
