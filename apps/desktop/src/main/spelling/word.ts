/** The word under the pointer, for the spelling menu (D-193): letters with their marks and inner apostrophes. */
const LETTER = /[\p{L}\p{M}'’]/u;
const QUOTE = /['’]/;

export function wordAround(text: string, offset: number): { start: number; end: number; word: string } | undefined {
  let start = Math.max(0, Math.min(offset, text.length));
  let end = start;
  while (start > 0 && LETTER.test(text[start - 1]!)) start--;
  while (end < text.length && LETTER.test(text[end]!)) end++;
  // 'quoted' is the word quoted; don't keeps its apostrophe.
  while (start < end && QUOTE.test(text[start]!)) start++;
  while (end > start && QUOTE.test(text[end - 1]!)) end--;
  return end > start ? { start, end, word: text.slice(start, end) } : undefined;
}
