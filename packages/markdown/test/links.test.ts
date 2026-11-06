/** Where link destinations are written (FIL-09): exact source ranges, never inside code, HTML, or front matter. */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { imageDestinations, linkDestinations } from "../src/index.ts";

const dests = (src: string) => linkDestinations(src).map((d) => [src.slice(d.start, d.end), d.angle]);

describe("linkDestinations", () => {
  it("IMG-05: an image's encoded kept original is an image destination, never one in code", () => {
    const src = "<!-- image: wide original=..%2Fassets%2Fimages%2Fo%2520x.png size=4x3 -->\n![A](../assets/images/c.png)\n\n```\n<!-- image: original=code.png -->\n```\n";
    expect(imageDestinations(src).map(d => [src.slice(d.start, d.end), d.encoding])).toEqual([["..%2Fassets%2Fimages%2Fo%2520x.png", "component"], ["../assets/images/c.png", undefined]]);
    expect(dests(src)).toEqual([["..%2Fassets%2Fimages%2Fo%2520x.png", false], ["../assets/images/c.png", false]]);
  });
  it("IMG-05: selects only image resources and their referenced definitions, preserving exact source offsets", () => {
    const src = '\uFEFF# Images\r\n\r\n![A](<p x.png> "Caption") ![B][ref] [note](note.md)\r\n\r\n[ref]: second.png "Title"\r\n[unused]: missing.png\r\n';
    expect(imageDestinations(src).map(d => [src.slice(d.start, d.end), d.angle])).toEqual([["p x.png", true], ["second.png", false]]);
    expect(dests(src)).toHaveLength(4);
  });
  it("IMG-05: ignores image syntax in code, HTML and front matter without treating note links as media", () => {
    const src = '---\nimage: ![f](front.png)\n---\n\n`![c](code.png)`\n\n```\n![b](block.png)\n```\n\n<img src="html.png">\n\n[link](missing.md)\n';
    expect(imageDestinations(src)).toEqual([]);
  });
  it("finds encoded original provenance only on actual image settings", () => {
    const src = "\uFEFF<!-- image: rounded original=assets%2Fold%2520photo.png -->\r\n![crop](assets/crop.png)\r\n";
    expect(dests(src)).toEqual([["assets%2Fold%2520photo.png", false], ["assets/crop.png", false]]);
    expect(linkDestinations(src)[0]?.encoding).toBe("component");
    expect(imageDestinations(src)).toEqual(linkDestinations(src));
    const ignored = "```\n<!-- image: original=code.png -->\n![crop](code.png)\n```\n\n<!-- image: original=unrelated.png -->\n\nText.\n\n<!-- image: original=bad%ZZ -->\n![crop](crop.png)\n";
    expect(dests(ignored)).toEqual([["crop.png", false]]);
  });
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
