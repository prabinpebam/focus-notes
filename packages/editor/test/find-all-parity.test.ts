/**
 * FND-04: Find in all notes lists a note's matches in the same order and number as the find bar
 * counts them once the note is open, so a match's `index` selects exactly that match in the editor.
 * The search index (packages/core) and the editor share the matcher (@focus-notes/markdown/match);
 * this checks the text each one searches agrees, block by block, on notes of every kind of block.
 */
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { lineKey } from "@focus-notes/markdown/match";
import { getMatchHighlights, search, setSearchState } from "prosemirror-search";
import { buildQuery, coreExtensions, findTargetRange, MarkdownSession, type FindOptions } from "../src/index.ts";
import { SearchEngine } from "../../core/src/search/engine.ts";

const schema = getSchema(coreExtensions());

function editorState(markdown: string, o: FindOptions): EditorState {
  const session = new MarkdownSession(markdown);
  const state = EditorState.create({ doc: schema.nodeFromJSON(session.doc), plugins: [search()] });
  return state.apply(setSearchState(state.tr, buildQuery(o)));
}
/** The find bar's matches, in order, as the text they cover. */
const editorMatches = (markdown: string, o: FindOptions) => {
  const state = editorState(markdown, o);
  return getMatchHighlights(state).find().map((d) => state.doc.textBetween(d.from, d.to));
};
/** Find in all notes' matches for the same note. */
function listed(markdown: string, o: FindOptions) {
  const e = new SearchEngine();
  e.apply([{ op: "note", path: "n.md", rel: "n.md", root: "local" }, { op: "text", path: "n.md", markdown }]);
  e.flush();
  return e.find({ text: o.query, caseSensitive: o.caseSensitive, wholeWord: o.wholeWord, regex: o.regex }).notes[0];
}
function indexMatches(markdown: string, o: FindOptions): { texts: string[]; indexes: number[]; count: number } {
  const n = listed(markdown, o);
  return { texts: n?.matches.map((m) => m.snippet.text.slice(...m.snippet.highlights[0]!)) ?? [], indexes: n?.matches.map((m) => m.index) ?? [], count: n?.count ?? 0 };
}
const opts = (query: string, o: Partial<FindOptions> = {}): FindOptions => ({ query, replace: "", caseSensitive: false, wholeWord: false, regex: false, ...o });

const NOTE = [
  "# The garden plan", "",
  "Plant the *garden* early; a **Garden** needs care. See [the garden log](log.md).", "",
  "## Gardening, week by week", "",
  "- Dig the garden beds", "  - nested garden item", "", "Then:", "", "- [ ] Water the gardens", "",
  "1. First garden step", "", "> A quote about the garden.", "",
  "```", "garden = plant(garden)", "```", "",
  "| Bed | Garden |", "| --- | --- |", "| North | garden peas |", "",
  "Café cafe CAFÉ garden_path gardener", "",
].join("\n");

describe("find in all notes agrees with the find bar", () => {
  const cases: [string, FindOptions][] = [
    ["plain text, any case", opts("garden")],
    ["match case", opts("Garden", { caseSensitive: true })],
    ["whole word", opts("garden", { wholeWord: true })],
    ["accents ignored", opts("cafe")],
    ["an accented query", opts("café")],
    ["a regular expression", opts("garden\\w*", { regex: true })],
    ["a regular expression, whole word, case", opts("[Gg]arden", { regex: true, wholeWord: true, caseSensitive: true })],
    ["across formatting", opts("garden early")],
  ];
  for (const [name, o] of cases) {
    it(name, () => {
      const bar = editorMatches(NOTE, o);
      const all = indexMatches(NOTE, o);
      expect(bar.length).toBeGreaterThan(0);
      expect(all.count).toBe(bar.length);
      expect(all.texts).toEqual(bar);
      // The nth match listed is the find bar's nth: the index is its place in the count.
      expect(all.indexes).toEqual(bar.map((_, i) => i));
    });
  }
});

describe("a match from Find in all notes selects that match in the note", () => {
  // A list mixing tasks and items is shown as raw Markdown, which the find bar doesn't search; a
  // table's cells are blocks of their own; a code block and a line break hold more than one line.
  const MIXED = [
    "# Otters", "", "- an otter list", "- [ ] otter task", "",
    "| Otter | Notes |", "| --- | --- |", "| sea otter | otter pups |", "",
    "```", "otter = 1", "otters = otter + 1", "```", "",
    "First otter line\\", "second otter line", "",
    "An otter, then another otter.", "", "An otter, then another otter.", "",
  ].join("\n");
  it("finds every match it can on its own line, where the place in the count alone would be off", () => {
    const o = opts("otter");
    const state = editorState(MIXED, o);
    const note = listed(MIXED, o)!;
    // The raw list's two matches aren't the find bar's to count, so the counts differ by two.
    expect(note.count).toBe(getMatchHighlights(state).find().length + 2);
    /** Which text block a position is in (in order, from 0), and how far into it. */
    const blockAt = (pos: number) => {
      let n = -1;
      let at: [number, number] = [-1, -1];
      state.doc.descendants((node, p) => {
        if (!node.isTextblock) return true;
        n++;
        if (pos > p && pos <= p + node.nodeSize - 1) at = [n, pos - p - 1];
        return false;
      });
      return at;
    };
    const places = note.matches.map((m) => {
      const r = findTargetRange(state, { index: m.index, lineKey: m.lineKey, lineNth: m.lineNth, occurrence: m.occurrence })!;
      return { line: m.line, text: state.doc.textBetween(r.from, r.to), at: blockAt(r.from) };
    });
    for (const { text } of places) expect(text.toLowerCase()).toBe("otter");
    // Lines 1 and 2 (the raw list) and 3 and 4 (the table) aren't lines the editor has; every other
    // match is found on its own line, at its own place: the heading, the code block's two lines, both
    // sides of the line break, and both matches on each of two paragraphs that read the same.
    expect(places.filter((p) => p.line === 0 || p.line > 4).map((p) => p.at)).toEqual([
      [0, 0], [5, 0], [5, 10], [5, 19], [6, 6], [6, 24], [7, 3], [7, 23], [8, 3], [8, 23],
    ]);
  });
  it("falls back to the place in the count when no line reads the same", () => {
    const state = editorState("One lark. Two larks.\n", opts("lark"));
    const second = getMatchHighlights(state).find()[1]!;
    expect(findTargetRange(state, { index: 1, lineKey: 12345, lineNth: 0, occurrence: 0 })).toEqual({ from: second.from, to: second.to });
    expect(findTargetRange(state, { index: 9 })).toEqual({ from: second.from, to: second.to });
  });
});
