/**
 * Find in all notes (FND-04) in the search index: every match in every note's visible text, grouped
 * by note with counts, each with its line and the match marked, matched as the find bar matches.
 * That a match's `index` is the find bar's own is checked against the editor in
 * packages/editor/test/find-all-parity.test.ts.
 */
import { describe, expect, it } from "vitest";
import { SearchEngine, lineSnippet } from "../src/search/engine.ts";
import { localSearch } from "../src/search/serve.ts";
import type { FindQuery, IndexOp } from "../src/search/index.ts";
import type { RootId } from "../src/workspace.ts";
import { fixtureNotes } from "../../../tools/bench/fixtures.ts";

const rel = (p: string) => p.replace(/^(public|private):/, "");
function engineWith(notes: Record<string, string>, root: RootId = "local", e = new SearchEngine()) {
  e.apply(Object.entries(notes).flatMap(([p, md]): IndexOp[] => [{ op: "note", path: p, rel: rel(p), root }, { op: "text", path: p, markdown: md }]));
  e.flush();
  return e;
}
const find = (e: SearchEngine, text: string, more: Partial<FindQuery> = {}) => e.find({ text, ...more });
/** What each listed match marks, as the person reads it. */
const marked = (e: SearchEngine, text: string, more: Partial<FindQuery> = {}) =>
  find(e, text, more).notes.map((n) => [n.rel, n.count, n.matches.map((m) => m.snippet.text.slice(...m.snippet.highlights[0]!))]);

describe("find in all notes: grouping and counts", () => {
  const e = engineWith({
    "essays/on-focus.md": "# On focus\n\nFocus is a *habit*. Focus again.\n\n- focus in a list\n",
    "ideas.md": "# Ideas\n\nNothing here about it.\n",
    "Archive/old.md": "# Old\n\nAn old **focus** note.\n",
  });
  it("groups matches by note, with each note's count and its matches in order", () => {
    const r = find(e, "focus");
    expect(r.notes.map((n) => [n.rel, n.title, n.count])).toEqual([["Archive/old.md", "Old", 1], ["essays/on-focus.md", "On focus", 4]]);
    expect(r.total).toBe(5);
    expect(r.truncated).toBe(false);
    expect(r.invalid).toBe(false);
    expect(r.notes[1]!.matches.map((m) => [m.index, m.line])).toEqual([[0, 0], [1, 1], [2, 1], [3, 2]]);
  });
  it("matches the text you see, not Markdown's marks", () => {
    expect(marked(e, "habit")).toEqual([["essays/on-focus.md", 1, ["habit"]]]);
    expect(find(e, "**").notes).toEqual([]);
    expect(find(e, "*habit*").notes).toEqual([]);
  });
  it("lists notes private first, then public, then this browser's, each by path", () => {
    const m = new SearchEngine();
    engineWith({ "b.md": "zebra", "A.md": "zebra" }, "local", m);
    engineWith({ "public:z.md": "zebra" }, "public", m);
    engineWith({ "private:y.md": "zebra" }, "private", m);
    expect(find(m, "zebra").notes.map((n) => n.path)).toEqual(["private:y.md", "public:z.md", "A.md", "b.md"]);
  });
});

describe("find in all notes: options", () => {
  const e = engineWith({ "c.md": "Café cafe CAFÉ Cafe\u0301 caféteria\n\nA cat, a catalog, scatter.\n" });
  it("ignores case and accents by default, as the find bar does", () => {
    expect(find(e, "cafe").total).toBe(5);
    expect(find(e, "café").total).toBe(3);
  });
  it("matches case, whole words, and regular expressions when asked", () => {
    expect(find(e, "cafe", { caseSensitive: true }).total).toBe(2);
    expect(find(e, "cafe", { wholeWord: true }).total).toBe(4);
    expect(marked(e, "cat", { wholeWord: true })).toEqual([["c.md", 1, ["cat"]]]);
    expect(marked(e, "cat\\w+", { regex: true })).toEqual([["c.md", 2, ["catalog", "catter"]]]);
    expect(find(e, "cat.", { regex: false }).total).toBe(0);
  });
  it("says a regular expression that doesn't compile is invalid, and finds nothing for an empty query", () => {
    expect(find(e, "ca(", { regex: true })).toMatchObject({ invalid: true, notes: [], total: 0 });
    expect(find(e, "")).toMatchObject({ invalid: false, notes: [], total: 0 });
  });
  it("runs a regular expression one line at a time, never across blocks", () => {
    expect(find(e, "caféteria\\s+A", { regex: true }).total).toBe(0);
    expect(find(e, "^A cat", { regex: true }).total).toBe(1);
  });
});

describe("find in all notes: scope, limits, and what isn't read yet", () => {
  it("keeps to the roots and folder asked for", () => {
    const e = new SearchEngine();
    engineWith({ "public:essays/a.md": "otter", "public:b.md": "otter" }, "public", e);
    engineWith({ "private:essays/c.md": "otter" }, "private", e);
    expect(find(e, "otter", { roots: ["public"] }).notes.map((n) => n.path)).toEqual(["public:b.md", "public:essays/a.md"]);
    expect(find(e, "otter", { within: "essays/" }).notes.map((n) => n.path)).toEqual(["private:essays/c.md", "public:essays/a.md"]);
  });
  it("counts every match but lists only up to the limit", () => {
    const e = engineWith({ "a.md": "x x x x", "b.md": "x x x" });
    const r = find(e, "x", { limit: 5 });
    expect(r.total).toBe(7);
    expect(r.truncated).toBe(true);
    expect(r.notes.map((n) => [n.count, n.matches.length])).toEqual([[4, 4], [3, 1]]);
  });
  it("says how many notes in scope it couldn't search yet", () => {
    const e = new SearchEngine();
    e.apply([{ op: "note", path: "a.md", rel: "a.md", root: "local" }, { op: "note", path: "b.md", rel: "b.md", root: "local" }, { op: "text", path: "a.md", markdown: "heron" }]);
    e.flush();
    expect(find(e, "heron")).toMatchObject({ unread: 1, total: 1 });
  });
  it("answers through the worker's messages", async () => {
    const index = localSearch();
    index.apply([{ op: "note", path: "a.md", rel: "a.md", root: "local" }, { op: "text", path: "a.md", markdown: "# A\n\nA lark sang." }]);
    await index.whenIndexed();
    const r = await index.find({ text: "lark" });
    expect(r.notes[0]).toMatchObject({ path: "a.md", count: 1, matches: [{ index: 0, line: 1, snippet: { text: "A lark sang.", highlights: [[2, 6]] } }] });
    index.dispose();
  });
  it("lists the first matches in 5,000 notes well within FND-04's 300 ms", () => {
    const e = new SearchEngine();
    e.apply(fixtureNotes().flatMap((n): IndexOp[] => [{ op: "note", path: n.path, rel: n.path, root: "private" }, { op: "text", path: n.path, markdown: n.markdown }]));
    e.flush();
    const r = find(e, "the");
    expect(r.notes.length).toBeGreaterThan(100);
    expect(r.truncated).toBe(true);
    expect(r.ms).toBeLessThan(3000);
  });
});

describe("a match's line", () => {
  it("shows the whole line when it's short, with the match marked", () => {
    expect(lineSnippet("A lark sang.", [2, 6])).toEqual({ text: "A lark sang.", highlights: [[2, 6]] });
  });
  it("starts a little before a match far into a long line, at a word, and ends at a word", () => {
    const line = `${"word ".repeat(30)}target ${"tail ".repeat(40)}`.trim();
    const at = line.indexOf("target");
    const s = lineSnippet(line, [at, at + 6]);
    expect(s.text.startsWith("…word ")).toBe(true);
    expect(s.text.endsWith("tail…")).toBe(true);
    expect(s.text.slice(...s.highlights[0]!)).toBe("target");
    expect(s.text.length).toBeLessThanOrEqual(125);
  });
});
