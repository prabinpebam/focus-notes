/**
 * Find and replace in the note (FND-01, FND-02), on prosemirror-search. Matching runs on the visible
 * text, ignores case and accents by default (`cafe` finds `café`), and replace-all is one undo step.
 */
import { Extension, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { syncSelection } from "./sync.ts";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import {
  search, SearchQuery, setSearchState, getMatchHighlights, getSearchState,
  findNext, findPrev, replaceNext, replaceAll,
} from "prosemirror-search";
import { foldedPattern, lineKey } from "@focus-notes/markdown/match";

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

/** The folding a plain query gets is shared with Find in all notes, so both count the same matches (FND-04). */
export { foldedPattern };

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
  // Runs from an effect, after a pause in typing: read any selection the keys just made first.
  syncSelection(editor);
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

/**
 * A match Find in all notes listed (FND-04): its place in the note's count, and its line, so it's
 * found even where the index and the editor see a block differently (a block shown as raw Markdown
 * isn't searched here; a table's cells are blocks of their own).
 */
export interface FindTarget {
  index: number;
  lineKey?: number;
  lineNth?: number;
  occurrence?: number;
}

/**
 * The match a target names, among the find bar's current matches: on the line with that key (the
 * `lineNth` one that reads so, a code block's lines each counting as one), its `occurrence`; or, if
 * no line here reads so, the `index`th match, or the last.
 */
export function findTargetRange(state: EditorState, t: FindTarget): { from: number; to: number } | null {
  const matches = getMatchHighlights(state).find();
  if (!matches.length) return null;
  if (t.lineKey !== undefined) {
    let seen = 0;
    let found: { from: number; to: number } | null = null;
    state.doc.descendants((node, pos) => {
      if (found) return false;
      if (!node.isTextblock) return true;
      const start = pos + 1;
      let offset = 0;
      // Lines as the index has them: a code block's lines, and the lines either side of a line break.
      for (const sub of searchText(node).split(/[\n\ufffc]/)) {
        const from = start + offset;
        const to = from + sub.length;
        offset += sub.length + 1;
        if (lineKey(sub) !== t.lineKey) continue;
        if (seen++ !== (t.lineNth ?? 0)) continue;
        const here = matches.filter((d) => d.from >= from && d.to <= to);
        const d = here[Math.min(t.occurrence ?? 0, here.length - 1)];
        if (d) found = { from: d.from, to: d.to };
        return false;
      }
      return false;
    });
    if (found) return found;
  }
  const d = matches[Math.max(0, Math.min(t.index, matches.length - 1))]!;
  return { from: d.from, to: d.to };
}

/** A block's text as prosemirror-search reads it, so offsets are positions: a leaf (a line break) is one character. */
function searchText(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    out += child.isText ? child.text : child.isLeaf ? "\ufffc" : ` ${searchText(child)} `;
  });
  return out;
}

/** Searches with these options and selects the target match, as opening a match from Find in all notes does. */
export function selectFindTarget(editor: Editor, o: FindOptions, t: FindTarget): boolean {
  setFind(editor, o);
  const range = findTargetRange(editor.state, t);
  if (!range) return false;
  editor.commands.setTextSelection(range);
  editor.commands.scrollIntoView();
  return true;
}
