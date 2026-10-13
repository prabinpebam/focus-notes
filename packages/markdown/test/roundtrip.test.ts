import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, serializeMarkdown, blockToMarkdown, type PMNode } from "../src/index.ts";

const corpusDir = join(import.meta.dirname, "corpus");
const corpus = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));

describe("round-trip corpus (EDT-10)", () => {
  it("has a corpus", () => expect(corpus.length).toBeGreaterThanOrEqual(20));
  for (const file of corpus) {
    it(`${file} is byte-for-byte identical after open and save`, () => {
      const src = readFileSync(join(corpusDir, file), "utf8");
      const parsed = parseMarkdown(src);
      expect(serializeMarkdown(parsed.doc, parsed)).toBe(src);
    });
  }
});

describe("editing keeps untouched blocks verbatim", () => {
  const edit = (src: string, f: (doc: PMNode) => void) => {
    const parsed = parseMarkdown(src);
    const doc = structuredClone(parsed.doc);
    f(doc);
    return serializeMarkdown(doc, parsed);
  };
  const para = (text: string): PMNode => ({ type: "paragraph", content: [{ type: "text", text }] });

  it("keeps a byte-order mark and every neighbouring character when editing (review issue 1)", () => {
    const src = "\uFEFF# Title\n\nHello world\n\nThird para\n";
    expect(serializeMarkdown(parseMarkdown(src).doc, parseMarkdown(src))).toBe(src);
    expect(edit(src, (d) => { d.content![2] = para("Third para!"); })).toBe("\uFEFF# Title\n\nHello world\n\nThird para!\n");
    expect(edit(src, (d) => { d.content!.splice(1, 1); })).toBe("\uFEFF# Title\n\nThird para\n");
  });

  it("never drops a paragraph holding only an empty link (review issue 2)", () => {
    const src = "Intro\n\n[](https://example.com/anchor)\n\nOutro\n";
    expect(serializeMarkdown(parseMarkdown(src).doc, parseMarkdown(src))).toBe(src);
    expect(edit(src, (d) => { d.content![2] = para("Outro!"); })).toBe("Intro\n\n[](https://example.com/anchor)\n\nOutro!\n");
  });

  it("keeps the file's line endings in generated text (review issue 6)", () => {
    const src = "# Title\r\n\r\nHello\r\nworld\r\n\r\nLast\r\n";
    expect(edit(src, (d) => { d.content![1] = para("Hello world!"); })).toBe("# Title\r\n\r\nHello world!\r\n\r\nLast\r\n");
    expect(edit(src, (d) => { d.content!.push({ type: "bulletList", content: [{ type: "listItem", content: [para("a")] }, { type: "listItem", content: [para("b")] }] }); }))
      .toBe("# Title\r\n\r\nHello\r\nworld\r\n\r\nLast\r\n\r\n- a\r\n- b\r\n");
  });

  it("rewrites only the changed block", () => {
    const src = "Intro with *star* emphasis.\n\n* star list\n* item\n\nOld text.\n";
    const parsed = parseMarkdown(src);
    const doc = structuredClone(parsed.doc);
    doc.content![2] = { type: "paragraph", content: [{ type: "text", text: "New text." }] };
    expect(serializeMarkdown(doc, parsed)).toBe("Intro with *star* emphasis.\n\n* star list\n* item\n\nNew text.\n");
  });

  it("keeps raw blocks it can't represent (EXT-05)", () => {
    const src = "<!-- a comment -->\n\n<div>html</div>\n";
    const parsed = parseMarkdown(src);
    expect(parsed.doc.content!.map((n) => n.type)).toEqual(["rawMarkdown", "rawMarkdown"]);
    const doc = structuredClone(parsed.doc);
    doc.content!.push({ type: "paragraph", content: [{ type: "text", text: "Added." }] });
    expect(serializeMarkdown(doc, parsed)).toBe(src.replace(/\n$/, "") + "\n\nAdded.\n");
  });

  it("ignores editor-only attributes when matching blocks", () => {
    const src = "## Heading\n\nSee [docs](https://example.com).\n";
    const parsed = parseMarkdown(src);
    const doc = structuredClone(parsed.doc);
    doc.content![0]!.attrs = { ...doc.content![0]!.attrs, textAlign: null, id: "x" };
    const link = doc.content![1]!.content![1]!;
    link.marks = [{ type: "link", attrs: { href: "https://example.com", title: null, target: "_blank", rel: "noopener", class: null } }];
    expect(serializeMarkdown(doc, parsed)).toBe(src);
  });
});

describe("serializing new content", () => {
  const md = (node: PMNode) => blockToMarkdown(node);
  it("writes headings, marks, and links", () => {
    expect(md({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] })).toBe("## Hi");
    expect(
      md({
        type: "paragraph",
        content: [
          { type: "text", text: "a " },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: " and " },
          { type: "text", text: "both", marks: [{ type: "bold" }, { type: "italic" }] },
          { type: "text", text: " " },
          { type: "text", text: "x", marks: [{ type: "code" }] },
          { type: "text", text: " " },
          { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://e.com" } }] },
        ],
      }),
    ).toBe("a **bold** and **_both_** `x` [site](https://e.com)");
  });
  it("writes lists and code", () => {
    const list: PMNode = { type: "bulletList", content: [1, 2].map((n) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `item ${n}` }] }] })) };
    expect(md(list)).toBe("- item 1\n- item 2");
    expect(md({ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "let x = 1" }] })).toBe("```ts\nlet x = 1\n```");
  });
  it("escapes Markdown syntax typed as text", () => {
    expect(md({ type: "paragraph", content: [{ type: "text", text: "*not emphasis* and # not heading" }] })).toBe("\\*not emphasis\\* and # not heading");
  });
  it("drops empty paragraphs, which Markdown can't represent", () => {
    const doc: PMNode = { type: "doc", content: [{ type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "x" }] }, { type: "paragraph" }] };
    expect(serializeMarkdown(doc)).toBe("x\n");
  });
});
