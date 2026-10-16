/**
 * Find and replace in the note (FND-01, FND-02), on prosemirror-search. Matching runs on the visible
 * text, ignores case and accents by default (`cafe` finds `café`), and replace-all is one undo step.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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
  /** Find in selection (FND-03): only inside the scope captured when the bar opened. */
  inSelection?: boolean;
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

type Range = { from: number; to: number };
interface ScopeState { range: Range | null; shown: boolean }
const scopeKey = new PluginKey<ScopeState>("findScope");

/**
 * Find in selection's scope (FND-03, D-160): the text selected when the find bar opened. It follows
 * edits, as prosemirror-search's own range does, and is tinted only while the option is on.
 */
const FindScope = (className: string) => new Plugin<ScopeState>({
  key: scopeKey,
  state: {
    init: () => ({ range: null, shown: false }),
    apply(tr, prev) {
      const meta = tr.getMeta(scopeKey) as Partial<ScopeState> | undefined;
      let next = meta ? { ...prev, ...meta } : prev;
      if (tr.docChanged && next.range) {
        const from = tr.mapping.map(next.range.from, 1);
        const to = tr.mapping.map(next.range.to, -1);
        next = { ...next, range: from < to ? { from, to } : null };
      }
      return next;
    },
  },
  props: {
    decorations(state) {
      const s = scopeKey.getState(state);
      if (!className || !s?.shown || !s.range) return null;
      return DecorationSet.create(state.doc, [Decoration.inline(s.range.from, s.range.to, { class: className })]);
    },
  },
});

export const Find = Extension.create<{ scopeClass: string }>({
  name: "find",
  addOptions: () => ({ scopeClass: "" }),
  addProseMirrorPlugins() {
    return [search(), FindScope(this.options.scopeClass)];
  },
});

/** The scope find in selection would search, or null when nothing was selected. */
export const findScope = (state: EditorState): Range | null => scopeKey.getState(state)?.range ?? null;

/** Takes the selection as find in selection's scope, as the find bar opens. Says whether there is one. */
export function captureFindScope(editor: Editor): boolean {
  syncSelection(editor);
  const { from, to, empty } = editor.state.selection;
  const range = empty ? null : { from, to };
  editor.view.dispatch(editor.state.tr.setMeta(scopeKey, { range, shown: false }).setMeta("addToHistory", false));
  return Boolean(range);
}

/** Forgets the scope, as the find bar closes. */
export function clearFindScope(editor: Editor): void {
  if (!scopeKey.getState(editor.state)?.range) return;
  editor.view.dispatch(editor.state.tr.setMeta(scopeKey, { range: null, shown: false }).setMeta("addToHistory", false));
}

/** Sets the active query. It isn't an edit, so it never enters the undo history. */
export function setFind(editor: Editor, o: FindOptions): void {
  // Runs from an effect, after a pause in typing: read any selection the keys just made first.
  syncSelection(editor);
  const scope = o.inSelection && o.query ? findScope(editor.state) : null;
  const tr = setSearchState(editor.state.tr, buildQuery(o), scope)
    .setMeta(scopeKey, { shown: Boolean(o.inSelection && findScope(editor.state)) })
    .setMeta("addToHistory", false);
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
  // Inside find in selection's scope, when it's on.
  const range = s.range ?? { from: 0, to: state.doc.content.size };
  const start = Math.min(Math.max(state.selection.from, range.from), range.to);
  const hit = s.query.findNext(state, start, range.to) ?? s.query.findNext(state, range.from, start);
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
