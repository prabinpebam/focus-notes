import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../src/index.ts";
import { resolveRewriteTarget, spliceRewriteTarget } from "../src/rewrite.ts";

const resolve = (source: string, from: number, to = from) => resolveRewriteTarget(source, parseMarkdown(source).doc, from, to);

describe("RWR-21/RWR-22: source-shape corpus", () => {
  it("maps a plain leaf by position, including duplicate blocks and Unicode", () => {
    const source = "\uFEFF---\r\nid: keep\r\n---\r\n\r\nSame 😀 words\r\n\r\nSame 😀 words";
    const parsed = parseMarkdown(source);
    const rawSize = 1;
    const paragraphSize = "Same 😀 words".length + 2;
    const target = resolve(source, rawSize + paragraphSize + 1, rawSize + paragraphSize + 5);
    expect(target.original).toBe("Same");
    expect(target.expanded).toBe(false);
    expect(target.startByte).toBe(new TextEncoder().encode(source.slice(0, target.from)).length);
    expect(spliceRewriteTarget(source, target, "Other")).toBe(source.replace(/Same 😀 words$/, "Other 😀 words"));
    expect(parsed.bom).toBe(true);
  });

  it("maps unmarked text beside emphasis without searching for matching words", () => {
    const target = resolve("same **same** same", 11, 15);
    expect(target.original).toBe("same");
    expect(target.from).toBe(14);
    expect(spliceRewriteTarget("same **same** same", target, "new")).toBe("same **same** new");
  });

  it.each([
    ["# Heading", 2, 4, "ea", false],
    ["A **bold** word", 4, 6, "A **bold** word", true],
    ["A &amp; B", 3, 4, "A &amp; B", true],
    ["A \\* B", 3, 4, "A \\* B", true],
    ["- one\n- two", 3, 5, "- one\n- two", true],
    ["- [x] one\n- [ ] two", 4, 6, "- [x] one\n- [ ] two", true],
    ["> quoted", 3, 5, "> quoted", true],
    ["```js\nlet x = 1;\n```", 2, 5, "```js\nlet x = 1;\n```", true],
    ['[label](https://example.test "title")', 2, 4, '[label](https://example.test "title")', true],
    ["<!-- table: layout=bleed -->\n| a | b |\n| - | - |\n| c | d |", 4, 5, "<!-- table: layout=bleed -->\n| a | b |\n| - | - |\n| c | d |", true],
  ] as const)("resolves %s safely", (source, from, to, original, expanded) => {
    expect(resolve(source, from, to)).toMatchObject({ original, expanded });
  });

  it("uses the current block for a caret and excludes a block at the half-open end", () => {
    expect(resolve("first\n\nsecond", 3)).toMatchObject({ original: "first", expanded: true });
    expect(resolve("first\n\nsecond", 1, 7).original).toBe("first");
    expect(resolve("first\n\nsecond", 1, 10).original).toBe("first\n\nsecond");
  });

  it.each(["![alt](image.png)", "<script>bad()</script>", "---\nid: keep\n---", "[ref]: https://example.test"])("refuses unsupported targets: %s", (source) => {
    expect(() => resolve(source, 0, 1)).toThrow("unsupported-target");
  });

  it("refuses stale editor/source correspondence and split surrogate boundaries", () => {
    expect(() => resolveRewriteTarget("same", parseMarkdown("different").doc, 1, 2)).toThrow("stale-target");
    expect(() => resolve("😀 word", 2, 3)).toThrow("unsupported-target");
  });
});

describe("RWR-22/RWR-27: outside-byte identity and untrusted output", () => {
  const source = "\uFEFF# Keep\r\n\r\nOriginal words  \r\n\r\n<!-- untouched -->";
  const target = () => resolve(source, 9, 17);
  it("preserves BOM, CRLF, raw neighbors, spaces and absent final newline", () => {
    const t = target();
    const result = spliceRewriteTarget(source, t, "New\nwords");
    expect(result.slice(0, t.from)).toBe(source.slice(0, t.from));
    expect(result.endsWith(source.slice(t.to))).toBe(true);
    expect(result).toContain("New\r\nwords");
  });
  it.each(["", "  ", "<script>bad()</script>", "![x](https://example.test/x)", "---\nid: bad\n---", "bad\u0000text", "\uD800"])("rejects unsafe output %j", (output) => {
    expect(() => spliceRewriteTarget(source, target(), output)).toThrow("invalid-output");
  });
  it("does not merge a replacement with an untouched neighbor", () => {
    const s = "hello\n\nworld";
    expect(() => spliceRewriteTarget(s, resolve(s, 1, 6), "hello\n\n---")).toThrow("invalid-output");
  });
  it("rejects changed target bytes", () => {
    expect(() => spliceRewriteTarget(source.replace("Original", "Modified"), target(), "new")).toThrow("stale-target");
  });
  it("rejects an unsafe link assembled from an otherwise plain-text partial replacement", () => {
    const s = "[text](java script:bad)";
    const from = s.indexOf("java") + 1;
    expect(() => spliceRewriteTarget(s, resolve(s, from, from + "java script".length), "javascript")).toThrow("invalid-output");
  });
  it("also bounds bytes after CRLF normalization", () => {
    const s = "Original\r\n\r\nOutside";
    const t = resolve(s, 1, 9);
    expect(() => spliceRewriteTarget(s, t, "x\n".repeat(12_000))).toThrow("too-large");
  });
  it("preserves safe link destinations/titles unless explicit policy permits changes", () => {
    const s = '[old](https://example.test "kept")';
    const t = resolve(s, 2, 4);
    expect(spliceRewriteTarget(s, t, '[new](https://example.test "kept")')).toContain("[new]");
    expect(spliceRewriteTarget(s, t, '[**new** label](https://example.test "kept")')).toContain("**new**");
    expect(() => spliceRewriteTarget(s, t, "[new](https://other.test)")).toThrow("invalid-output");
    expect(spliceRewriteTarget(s, t, "[new](https://other.test)", { allowLinkChanges: true })).toContain("other.test");
    expect(() => spliceRewriteTarget(s, t, "[new](javascript:bad)", { allowLinkChanges: true })).toThrow("invalid-output");
  });
  it.each([
    ["- [x] done\n- [ ] later", "- [ ] done\n- [ ] later"],
    ["3. one\n4. two", "1. one\n2. two"],
    ["```js\none\n```", "```sh\ntwo\n```"],
  ])("retains immutable structural markers", (s, output) => {
    expect(() => spliceRewriteTarget(s, resolve(s, 1, 2), output)).toThrow("invalid-output");
  });
});
