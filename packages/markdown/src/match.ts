/**
 * Matching on a note's visible text (Find and replace → What counts as a match), shared by the find
 * bar (the editor, on prosemirror-search) and Find in all notes (the search worker, FND-04), so both
 * find exactly the same matches in the same order. Case and accents don't matter by default
 * (`cafe` finds `café`); a match never crosses a block; whole word means no letter on either side.
 */

/** Where a match is: [start, end) in UTF-16 code units. */
export type MatchRange = readonly [number, number];

export interface MatchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
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

/**
 * The expression a query searches with, as the find bar builds it: a plain query folded, a regular
 * expression as typed. `undefined` for an empty query; `null` for one that doesn't compile.
 */
export function matcherOf(query: string, o: MatchOptions = {}): RegExp | null | undefined {
  if (!query) return undefined;
  try {
    return new RegExp(o.regex ? query : foldedPattern(query), `gu${o.caseSensitive ? "" : "i"}`);
  } catch {
    return null;
  }
}

const LETTER_END = /\p{L}$/u;
const LETTER_START = /^\p{L}/u;
/** A word boundary as the find bar sees one: not a letter on both sides. */
export function wordBoundary(text: string, pos: number): boolean {
  if (pos <= 0 || pos >= text.length) return true;
  return !LETTER_END.test(text.slice(Math.max(0, pos - 2), pos)) || !LETTER_START.test(text.slice(pos, pos + 2));
}

/**
 * Every match in one block's text, in order, as the find bar finds and counts them: a match that
 * isn't a whole word (when that's on) is passed over one character at a time, and empty matches
 * never count.
 */
export function matchesIn(text: string, re: RegExp, wholeWord = false): MatchRange[] {
  const out: MatchRange[] = [];
  for (let pos = 0; pos <= text.length;) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) break;
    const from = m.index;
    const to = from + m[0].length;
    if (wholeWord && !(wordBoundary(text, from) && wordBoundary(text, to))) {
      pos = from + 1;
      continue;
    }
    if (to > from) out.push([from, to]);
    pos = Math.max(to, pos + 1);
  }
  return out;
}

/**
 * A line of visible text as a number, so Find in all notes can say which line a match is on and the
 * editor can find that line again without the text itself being sent: whitespace runs count as one
 * space and the ends are trimmed, since the index and the editor space a line differently.
 */
export function lineKey(text: string): number {
  const s = text.replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}