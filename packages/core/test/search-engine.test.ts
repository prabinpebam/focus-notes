/**
 * The search index's engine (WP-4.1): what it reads from notes, how it ranks (Spotlight → Ranking),
 * and how it follows changes. SPT-07's time budgets are the benchmark's (tools/bench); these check
 * that the answers are right, including on the 5,000-note fixture.
 */
import { describe, expect, it } from "vitest";
import { SearchEngine, editsFor, rank } from "../src/search/engine.ts";
import { extractNote } from "../src/search/extract.ts";
import type { IndexOp, SearchHit, SearchQuery } from "../src/search/types.ts";
import { fixtureNotes } from "../../../tools/bench/fixtures.ts";

const note = (path: string, title?: string, root: "local" | "public" | "private" = "local"): IndexOp => ({ op: "note", path, rel: path.replace(/^(public|private):/, ""), root, ...(title ? { title } : {}) });
const text = (path: string, markdown: string | null): IndexOp => ({ op: "text", path, markdown });
function engineWith(notes: Record<string, string>, root: "local" | "public" | "private" = "local") {
  const e = new SearchEngine();
  e.apply(Object.entries(notes).flatMap(([p, md]) => [note(p, undefined, root), text(p, md)]));
  e.flush();
  return e;
}
const titles = (e: SearchEngine, q: string, more: Partial<SearchQuery> = {}) => e.query({ text: q, scope: "titles", ...more }).hits;
const full = (e: SearchEngine, q: string, more: Partial<SearchQuery> = {}) => e.query({ text: q, scope: "text", ...more }).hits;
const keys = (hits: SearchHit[]) => hits.map((h) => h.key);

describe("what the index reads from a note", () => {
  it("takes the title, every heading outside code and front matter, the front matter's id, and the words without marks", () => {
    const f = extractNote([
      "---", "id: 01HZX", "tags: [a]", "---", "", "# On *focus*", "", "Intro with a [link](x.md) and `code`.", "",
      "## Why it **matters**", "", "- [ ] a task", "> a quote", "", "```", "# not a heading", "```", "", "Setext", "------", "",
      "| a | b |", "| --- | --- |", "| c | d |",
    ].join("\n"));
    expect(f.title).toBe("On focus");
    expect(f.id).toBe("01HZX");
    expect(f.headings).toEqual([{ text: "On focus", level: 1 }, { text: "Why it matters", level: 2 }, { text: "Setext", level: 2 }]);
    expect(f.text).toContain("Intro with a link and code.");
    expect(f.text).toContain("a task");
    expect(f.text).toContain("a quote");
    expect(f.text).toContain("# not a heading");
    expect(f.text).toContain("c d");
    expect(f.text).not.toMatch(/tags|\*\*|\]\(|---/);
  });
});

describe("ranking (Spotlight → Ranking)", () => {
  const e = engineWith({
    "essays/focus.md": "# Focus\n\nPlain.\n",
    "essays/focus-sessions.md": "# Focus sessions\n\nPlain.\n",
    "journal/deep-work.md": "# Deep work and focus\n\nPlain.\n",
    "journal/focal-length.md": "# Focal length\n\nPlain.\n",
    "ideas.md": "# Ideas\n\n## Focus mode notes\n\nOne line at a time, in focus, for the writer.\n",
  });
  it("puts the exact title first, then the title's start, the start of a word, fuzzy titles, headings, then full text", () => {
    const hits = titles(e, "focus");
    expect(hits.map((h) => [h.key, h.tier])).toEqual([
      ["essays/focus.md", "exact"],
      ["essays/focus-sessions.md", "prefix"],
      ["journal/deep-work.md", "word"],
      ["ideas.md#1", "heading"],
    ]);
    expect(keys(full(e, "writer"))).toEqual(["ideas.md"]);
    expect(full(e, "writer")[0]!.tier).toBe("text");
  });
  it("tolerates one typo from 4 to 7 characters and two from 8, and none in shorter words", () => {
    expect([editsFor("foc"), editsFor("focu"), editsFor("focused"), editsFor("focussed")]).toEqual([0, 1, 1, 2]);
    expect(titles(e, "focis").map((h) => [h.key, h.tier])).toContainEqual(["essays/focus.md", "fuzzy"]);
    expect(keys(titles(e, "sesions"))).toEqual(["essays/focus-sessions.md"]);
    expect(keys(titles(e, "fcs"))).toEqual([]);
    expect(keys(titles(e, "focal lenght"))).toEqual(["journal/focal-length.md"]);
    // Two neighbouring letters swapped count as one typo.
    expect(titles(e, "focsu").map((h) => [h.key, h.tier])).toContainEqual(["essays/focus.md", "fuzzy"]);
    expect(keys(full(e, "wirter"))).toEqual(["ideas.md"]);
  });
  it("matches as you type: every word, the last one as a prefix", () => {
    expect(keys(titles(e, "foc"))).toContain("essays/focus.md");
    expect(keys(titles(e, "focus ses"))).toEqual(["essays/focus-sessions.md"]);
    expect(keys(titles(e, "fo se"))).toEqual(["essays/focus-sessions.md"]);
  });
  it("finds notes by file name, path, and front-matter id, and ignores case and accents", () => {
    const f = engineWith({ "travel/caf\u00e9-list.md": "---\nid: trip42\n---\n# Places to eat\n", "Untitled.md": "No title here.\n" });
    expect(keys(titles(f, "cafe"))).toEqual(["travel/caf\u00e9-list.md"]);
    expect(keys(titles(f, "CAF\u00c9"))).toEqual(["travel/caf\u00e9-list.md"]);
    expect(keys(titles(f, "travel"))).toEqual(["travel/caf\u00e9-list.md"]);
    expect(keys(titles(f, "trip42"))).toEqual(["travel/caf\u00e9-list.md"]);
    expect(titles(f, "untitled")[0]).toMatchObject({ key: "Untitled.md", label: "Untitled", tier: "exact" });
  });
  it("marks the matching characters in the label", () => {
    expect(titles(e, "focus ses")[0]!.highlights).toEqual([[0, 5], [6, 9]]);
  });
  it("gives full-text hits a one-line snippet around the first match, marked", () => {
    const [hit] = full(e, "time");
    expect(hit!.snippet!.text).toBe("One line at a time, in focus, for the writer.");
    const [s, t] = hit!.snippet!.highlights[0]!;
    expect(hit!.snippet!.text.slice(s, t)).toBe("time");
    const long = engineWith({ "a.md": `# A\n\n${"word ".repeat(60)}needle ${"after ".repeat(60)}\n` });
    const snip = full(long, "needle")[0]!.snippet!.text;
    expect(snip.startsWith("\u2026")).toBe(true);
    expect(snip.endsWith("\u2026")).toBe(true);
    expect(snip).toContain("needle");
    expect(snip.length).toBeLessThan(160);
  });
  it("lets frecency and context reorder within a tier, never across tiers", () => {
    const f = engineWith({ "a/plan-one.md": "# Plan one\n", "b/plan-two.md": "# Plan two\n", "plan.md": "# Plan\n" });
    expect(keys(titles(f, "plan"))[0]).toBe("plan.md");
    const boosted = titles(f, "plan", { boost: { frecency: { "b/plan-two.md": 3 } } });
    expect(keys(boosted)).toEqual(["plan.md", "b/plan-two.md", "a/plan-one.md"]);
    expect(keys(titles(f, "plan", { boost: { folder: "a" } }))).toEqual(["plan.md", "a/plan-one.md", "b/plan-two.md"]);
  });
  it("searches commands and settings by name and synonyms, and filters by kind, root, and folder", () => {
    const f = engineWith({ "essays/dark-room.md": "# Dark room\n" });
    f.apply([
      { op: "items", kind: "command", items: [{ id: "theme.toggle", title: "Switch theme", keywords: ["dark", "night"] }] },
      { op: "items", kind: "setting", items: [{ id: "appearance.mode", title: "Appearance", keywords: ["dark mode"] }] },
    ]);
    expect(keys(titles(f, "night"))).toEqual(["command:theme.toggle"]);
    expect(keys(titles(f, "dark")).sort()).toEqual(["command:theme.toggle", "essays/dark-room.md", "setting:appearance.mode"]);
    expect(keys(titles(f, "dark", { kinds: ["command"] }))).toEqual(["command:theme.toggle"]);
    expect(keys(titles(f, "dark", { roots: ["local"] }))).toEqual(["essays/dark-room.md"]);
    expect(keys(titles(f, "dark", { within: "journal/" }))).toEqual([]);
    expect(keys(titles(f, "dark", { within: "essays" }))).toEqual(["essays/dark-room.md"]);
    // Replacing the commands drops the old ones.
    f.apply([{ op: "items", kind: "command", items: [] }]);
    expect(keys(titles(f, "night"))).toEqual([]);
  });
  it("finds an exact phrase in full text, in order", () => {
    const f = engineWith({ "a.md": "# A\n\none line at a time\n", "b.md": "# B\n\ntime at a line one\n" });
    expect(keys(full(f, "one line at a time")).sort()).toEqual(["a.md", "b.md"]);
    expect(keys(full(f, "one line at a time", { phrase: true }))).toEqual(["a.md"]);
  });
  it("orders by tier, then score, then the shorter label", () => {
    const h = (key: string, tier: SearchHit["tier"], score: number): SearchHit => ({ kind: "note", key, label: key, highlights: [], tier, score });
    expect(keys(rank([h("bb", "word", 2), h("a", "heading", 9), h("c", "word", 2), h("d", "exact", 0.1)]))).toEqual(["d", "c", "bb", "a"]);
  });
});

describe("following changes", () => {
  it("knows titles at once and full text once it's indexed, with status for the footer", () => {
    const e = new SearchEngine();
    e.apply([note("a.md", "Alpha"), note("b.md", "Bravo"), text("a.md", "# Alpha\n\nzebra\n"), text("b.md", "# Bravo\n\nyak\n")]);
    expect(keys(titles(e, "alpha"))).toEqual(["a.md"]);
    expect(full(e, "zebra")).toEqual([]);
    expect(e.status()).toMatchObject({ notes: 2, indexed: 0, pending: 2 });
    e.flush();
    expect(keys(full(e, "zebra"))).toEqual(["a.md"]);
    expect(e.status()).toMatchObject({ notes: 2, indexed: 2, pending: 0 });
  });
  it("updates a note's text, title, and headings, and forgets the old ones", () => {
    const e = engineWith({ "a.md": "# Alpha\n\n## Old part\n\nzebra\n" });
    e.apply([text("a.md", "# Omega\n\n## New part\n\nyak\n")]);
    e.flush();
    expect(full(e, "zebra")).toEqual([]);
    expect(keys(full(e, "yak"))).toEqual(["a.md"]);
    expect(keys(titles(e, "alpha"))).toEqual([]);
    expect(titles(e, "omega")[0]).toMatchObject({ key: "a.md", label: "Omega" });
    expect(keys(titles(e, "old part"))).toEqual([]);
    expect(titles(e, "new part")[0]).toMatchObject({ kind: "heading", key: "a.md#1", heading: { level: 2, index: 1, note: "Omega" } });
  });
  it("only the newest text waiting for a note is indexed", () => {
    const e = engineWith({ "a.md": "# A\n" });
    e.apply([text("a.md", "# A\n\nfirst\n"), text("a.md", "# A\n\nsecond\n")]);
    expect(e.status().pending).toBe(1);
    e.flush();
    expect(full(e, "first")).toEqual([]);
    expect(keys(full(e, "second"))).toEqual(["a.md"]);
  });
  it("deletes a note with its headings and text, including text still waiting", () => {
    const e = engineWith({ "a.md": "# Alpha\n\n## Part\n\nzebra\n", "b.md": "# Bravo\n" });
    e.apply([text("b.md", "# Bravo\n\nyak\n"), { op: "remove", path: "a.md" }, { op: "remove", path: "b.md" }]);
    e.flush();
    for (const q of ["alpha", "part", "bravo"]) expect(titles(e, q)).toEqual([]);
    for (const q of ["zebra", "yak"]) expect(full(e, q)).toEqual([]);
    expect(e.status()).toMatchObject({ notes: 0, indexed: 0, pending: 0 });
  });
  it("moves and renames a note with its text, without reading it again", () => {
    const e = engineWith({ "a/one.md": "# One\n\n## Part\n\nzebra\n" });
    e.apply([{ op: "move", from: "a/one.md", to: "b/uno.md", rel: "b/uno.md" }]);
    expect(e.status()).toMatchObject({ notes: 1, indexed: 1, pending: 0 });
    expect(full(e, "zebra")[0]).toMatchObject({ key: "b/uno.md", rel: "b/uno.md" });
    expect(keys(titles(e, "one"))).toEqual(["b/uno.md"]);
    expect(keys(titles(e, "uno"))).toEqual(["b/uno.md"]);
    expect(titles(e, "part")[0]).toMatchObject({ key: "b/uno.md#1", path: "b/uno.md" });
    expect(keys(titles(e, "a", { kinds: ["note"], within: "a" }))).toEqual([]);
  });
  it("moves a waiting text with its note", () => {
    const e = new SearchEngine();
    e.apply([note("a.md"), text("a.md", "# A\n\nzebra\n"), { op: "move", from: "a.md", to: "b.md", rel: "b.md" }]);
    e.flush();
    expect(keys(full(e, "zebra"))).toEqual(["b.md"]);
  });
  it("indexes folders by name and path, and moves and removes them", () => {
    const e = new SearchEngine();
    e.apply([{ op: "folder", path: "essays", rel: "essays", root: "local" }, { op: "folder", path: "essays/drafts", rel: "essays/drafts", root: "local" }]);
    expect(titles(e, "drafts")[0]).toMatchObject({ kind: "folder", key: "essays/drafts", label: "drafts", tier: "exact" });
    e.apply([{ op: "move", from: "essays/drafts", to: "old", rel: "old" }]);
    expect(keys(titles(e, "drafts"))).toEqual([]);
    expect(keys(titles(e, "old"))).toEqual(["old"]);
    e.apply([{ op: "remove", path: "old" }]);
    expect(keys(titles(e, "old"))).toEqual([]);
  });
  it("drops everything under a path at once: the browser's private notes when the vault locks (D-90)", () => {
    const e = new SearchEngine();
    e.apply([note("public:p.md", "Plan public", "public"), note("private:Plans/x.md", "Plan secret", "private"), note("Mine.md", "Plan mine")]);
    e.apply([text("public:p.md", "# Plan public\n\nshared words\n"), text("private:Plans/x.md", "# Plan secret\n\nhidden words\n")]);
    e.flush();
    e.apply([text("private:Plans/x.md", "# Plan secret\n\nnewer hidden words\n")]);
    e.apply([{ op: "removeWithin", path: "private:" }]);
    e.flush();
    expect(keys(titles(e, "plan")).sort()).toEqual(["Mine.md", "public:p.md"]);
    expect(full(e, "hidden")).toEqual([]);
    expect(keys(full(e, "words"))).toEqual(["public:p.md"]);
  });
  it("cleans out removed notes in one go when enough have piled up, and keeps answering right", () => {
    const notes = fixtureNotes(600);
    const e = new SearchEngine();
    e.apply(notes.flatMap((n) => [note(n.path), text(n.path, n.markdown)]));
    e.flush();
    expect(e.tidy()).toBe(false);
    e.apply(notes.slice(0, 400).map((n) => ({ op: "remove", path: n.path })));
    expect(e.tidy()).toBe(true);
    expect(e.tidy()).toBe(false);
    const kept = notes[500]!;
    expect(keys(titles(e, extractNote(kept.markdown).title!))).toContain(kept.path);
    expect(keys(titles(e, extractNote(notes[0]!.markdown).title!))).not.toContain(notes[0]!.path);
  });
  it("counts a note it couldn't read as done, with its title from the tree", () => {
    const e = new SearchEngine();
    e.apply([note("a.md", "Alpha"), text("a.md", null)]);
    e.flush();
    expect(e.status()).toMatchObject({ notes: 1, indexed: 1 });
    expect(keys(titles(e, "alpha"))).toEqual(["a.md"]);
  });
  it("indexes in slices, so a query in between is answered from what's indexed so far", () => {
    const e = new SearchEngine();
    const notes = fixtureNotes(400);
    e.apply(notes.flatMap((n) => [note(n.path), text(n.path, n.markdown)]));
    let slices = 0;
    while (e.work(2)) slices++;
    expect(slices).toBeGreaterThan(1);
    expect(e.status()).toMatchObject({ notes: 400, indexed: 400, pending: 0 });
  });
});

describe("the 5,000-note fixture (SPT-07)", () => {
  const notes = fixtureNotes();
  it("is the same on every run, with titles, headings, folders, and full text", () => {
    expect(notes).toHaveLength(5000);
    expect(new Set(notes.map((n) => n.path)).size).toBe(5000);
    expect(fixtureNotes(5000)[1234]).toEqual(notes[1234]);
    const words = notes.reduce((n, x) => n + x.markdown.split(/\s+/).length, 0);
    expect(words).toBeGreaterThan(5000 * 150);
    expect(new Set(notes.map((n) => n.path.split("/").slice(0, -1).join("/"))).size).toBeGreaterThan(30);
  });
  it("is searched by title and full text, each title finding its own note first", () => {
    const e = new SearchEngine();
    e.apply(notes.flatMap((n) => [note(n.path), text(n.path, n.markdown)]));
    e.flush();
    expect(e.status()).toMatchObject({ notes: 5000, indexed: 5000 });
    for (const n of [notes[0]!, notes[2500]!, notes[4999]!]) {
      const title = extractNote(n.markdown).title!;
      const hits = titles(e, title);
      expect(hits[0]).toMatchObject({ tier: "exact" });
      expect(hits.filter((h) => h.tier === "exact").map((h) => h.key)).toContain(n.path);
    }
    const line = extractNote(notes[42]!.markdown).text.split("\n").find((l) => l.split(" ").length > 8)!;
    const phrase = line.split(" ").slice(2, 5).join(" ");
    expect(keys(full(e, phrase, { phrase: true, limit: 200 }))).toContain(notes[42]!.path);
  });
});
