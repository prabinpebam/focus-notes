/**
 * Find and replace in the note (FND-01, FND-02), on prosemirror-search. Matching runs on the visible
 * text, ignores case and accents by default (`cafe` finds `café`), and replace-all is one undo step.
 */
import { Extension, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";
import {
  search, SearchQuery, setSearchState, getMatchHighlights, getSearchState,
  findNext, findPrev, replaceNext, replaceAll,
} from "prosemirror-search";

export interface FindOptions {
  query: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindStatus {
  count: number;
  /** 1-based index of the selected match, or 0 when the selection isn't on a match. */
  current: number;
  /** The query is a regular expression that doesn't compile. */
  invalid: boolean;
}

// Accented Latin letters by base letter, from Unicode decomposition: e → é è ê ë ē ė ę ě …
const VARIANTS = (() => {
  const map = new Map<string, string>();
  for (let cp = 0xc0; cp <= 0x24f; cp++) {
    const ch = String.fromCodePoint(cp);
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    if (base.length === 1 && base !== ch) map.set(base, (map.get(base) ?? "") + ch);
  }
  return map;
})();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A plain query as an accent-insensitive pattern. Accented letters in the query match exactly. */
export function foldedPattern(text: string): string {
  let out = "";
  for (const ch of text) {
    const variants = VARIANTS.get(ch);
    // Letters may be followed by combining marks, so decomposed text (e + ◌́) matches too.
    if (variants) out += `[${ch}${variants}]\\p{M}*`;
    else out += /\p{L}/u.test(ch) ? `${escape(ch)}\\p{M}*` : escape(ch);
  }
  return out;
}

export function buildQuery(o: FindOptions): SearchQuery {
  if (!o.query) return new SearchQuery({ search: "" });
  if (o.regex) return new SearchQuery({ search: o.query, regexp: true, caseSensitive: o.caseSensitive, wholeWord: o.wholeWord, replace: o.replace });
  // Plain text is searched as a folded pattern, and its replacement is always literal text.
  return new PlainQuery({ search: foldedPattern(o.query), regexp: true, caseSensitive: o.caseSensitive, wholeWord: o.wholeWord, replace: o.replace });
}

/** A folded plain-text query: `$1` or `$&` in its replacement are just characters. */
class PlainQuery extends SearchQuery {
  override getReplacements(state: EditorState, result: { from: number; to: number }) {
    const marks = state.doc.resolve(result.from).marksAcross(state.doc.resolve(result.to)) ?? undefined;
    const insert = this.replace ? new Slice(Fragment.from(state.schema.text(this.replace, marks)), 0, 0) : Slice.empty;
    return [{ from: result.from, to: result.to, insert }];
  }
}

export const Find = Extension.create({
  name: "find",
  addProseMirrorPlugins() {
    return [search()];
  },
});

/** Sets the active query. It isn't an edit, so it never enters the undo history. */
export function setFind(editor: Editor, o: FindOptions): void {
  const tr = setSearchState(editor.state.tr, buildQuery(o)).setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

export function findStatus(state: EditorState): FindStatus {
  const s = getSearchState(state);
  if (!s || !s.query.search) return { count: 0, current: 0, invalid: false };
  if (!s.query.valid) return { count: 0, current: 0, invalid: true };
  const matches = getMatchHighlights(state).find();
  const { from, to } = state.selection;
  const index = matches.findIndex((d) => d.from === from && d.to === to);
  return { count: matches.length, current: index + 1, invalid: false };
}

/** Moves the selection to the first match at or after the caret, as typing a query does. */
export function findFromCaret(editor: Editor): boolean {
  const { state } = editor;
  const s = getSearchState(state);
  if (!s?.query.valid) return false;
  const start = state.selection.from;
  const hit = s.query.findNext(state, start) ?? s.query.findNext(state, 0, start);
  if (!hit) return false;
  editor.commands.setTextSelection({ from: hit.from, to: hit.to });
  editor.commands.scrollIntoView();
  return true;
}

export const FIND_ACTIONS: Readonly<Record<string, (editor: Editor) => boolean>> = {
  "find.next": (e) => findNext(e.state, e.view.dispatch),
  "find.prev": (e) => findPrev(e.state, e.view.dispatch),
  "find.replaceNext": (e) => replaceNext(e.state, e.view.dispatch),
  "find.replaceAll": (e) => replaceAll(e.state, e.view.dispatch),
};
