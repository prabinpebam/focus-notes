/** FND-01, FND-02: matching on visible text, accent folding, and replace-all as one undo step. */
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { search, setSearchState, findNext, replaceAll, replaceNext } from "prosemirror-search";
import { buildQuery, coreExtensions, findStatus, foldedPattern, MarkdownSession, serializeMarkdown, type FindOptions } from "../src/index.ts";

const schema = getSchema(coreExtensions());
const opts = (query: string, o: Partial<FindOptions> = {}): FindOptions => ({ query, replace: "", caseSensitive: false, wholeWord: false, regex: false, ...o });

function stateOf(markdown: string, o: FindOptions) {
  const session = new MarkdownSession(markdown);
  let state = EditorState.create({ doc: schema.nodeFromJSON(session.doc), plugins: [search(), history()] });
  state = state.apply(setSearchState(state.tr, buildQuery(o)).setMeta("addToHistory", false));
  return { state, session };
}
const run = (state: EditorState, cmd: (s: EditorState, d: (tr: import("@tiptap/pm/state").Transaction) => void) => boolean) => {
  let next = state;
  cmd(state, (tr) => (next = state.apply(tr)));
  return next;
};
const md = (state: EditorState, session: MarkdownSession) => session.serialize(state.doc.toJSON());

describe("find in the note", () => {
  it("matches the visible text, not Markdown syntax, and crosses formatting", () => {
    const { state } = stateOf("Some **bold** text and f**oo**.\n", opts("bold"));
    expect(findStatus(state).count).toBe(1);
    expect(findStatus(stateOf("Some **bold** text.\n", opts("**")).state).count).toBe(0);
    expect(findStatus(stateOf("f**oo**\n", opts("foo")).state).count).toBe(1);
  });
  it("ignores case and accents by default, and respects the toggles", () => {
    const text = "Café cafe CAFÉ Cafe\u0301 caféteria\n";
    expect(findStatus(stateOf(text, opts("cafe")).state).count).toBe(5);
    expect(findStatus(stateOf(text, opts("cafe", { wholeWord: true })).state).count).toBe(4);
    expect(findStatus(stateOf(text, opts("cafe", { caseSensitive: true })).state).count).toBe(2);
    // An accented letter in the query matches exactly.
    expect(findStatus(stateOf(text, opts("café")).state).count).toBe(3);
  });
  it("treats special characters as text unless regex is on", () => {
    expect(findStatus(stateOf("a.b axb (c)\n", opts("a.b")).state).count).toBe(1);
    expect(findStatus(stateOf("a.b axb (c)\n", opts("a.b", { regex: true })).state).count).toBe(2);
    expect(findStatus(stateOf("a.b axb (c)\n", opts("(c)")).state).count).toBe(1);
    expect(findStatus(stateOf("x\n", opts("(", { regex: true })).state).invalid).toBe(true);
    expect(() => new RegExp(foldedPattern("[a-z]/\\-"), "u")).not.toThrow();
  });
  it("steps through matches, wrapping, and reports which one is selected", () => {
    let { state } = stateOf("one two one two one\n", opts("one"));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    state = run(state, findNext);
    expect(findStatus(state)).toEqual({ count: 3, current: 1, invalid: false });
    state = run(state, findNext);
    state = run(state, findNext);
    expect(findStatus(state).current).toBe(3);
    state = run(state, findNext);
    expect(findStatus(state).current).toBe(1);
  });
});

describe("replace in the note", () => {
  it("replace all is one undo step, keeps bold and links, and $ stays literal", () => {
    const src = "A **note** and a [note](https://x.example) and note.\n";
    const { state, session } = stateOf(src, opts("note", { replace: "$draft" }));
    const after = run(state, replaceAll);
    expect(md(after, session)).toBe("A **$draft** and a [$draft](https://x.example) and $draft.\n");
    expect(md(run(after, undo), session)).toBe(src);
  });
  it("replaces 100 matches in one undo step", () => {
    const src = Array.from({ length: 100 }, (_, i) => `word ${i}`).join("\n\n") + "\n";
    const { state, session } = stateOf(src, opts("word", { replace: "term" }));
    expect(findStatus(state).count).toBe(100);
    const after = run(state, replaceAll);
    expect(md(after, session).match(/term/g)).toHaveLength(100);
    expect(md(run(after, undo), session)).toBe(src);
  });
  it("supports regex captures when regex is on, and replace-next moves on", () => {
    const { state, session } = stateOf("2024-01-02 and 2025-03-04\n", opts("(\\d+)-(\\d+)-(\\d+)", { regex: true, replace: "$3/$2/$1" }));
    expect(md(run(state, replaceAll), session)).toBe("02/01/2024 and 04/03/2025\n");
    let s2 = stateOf("a a a\n", opts("a", { replace: "b" })).state;
    s2 = run(s2, replaceNext); // selects the first
    s2 = run(s2, replaceNext); // replaces it, selects the next
    expect(s2.doc.textContent).toBe("b a a");
  });
  it("never edits raw blocks shown read-only", () => {
    const src = "note\n\n<div>note</div>\n";
    const { state, session } = stateOf(src, opts("note", { replace: "x" }));
    expect(md(run(state, replaceAll), session)).toBe("x\n\n<div>note</div>\n");
  });
});

void serializeMarkdown;
