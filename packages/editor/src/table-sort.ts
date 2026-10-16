/**
 * Sorting a table by a column (TBL-09, Tables → Copy, paste, and sort, D-160): a one-time reorder of
 * the body rows in natural order. Numbers by value, then ISO dates by date, then text without case or
 * accents (numbers inside text by value), and empty cells last in both directions. The sort is stable.
 */

const NUMBER = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type Key = { rank: 0; value: number } | { rank: 1; value: number } | { rank: 2; text: string } | { rank: 3 };

function keyOf(raw: string): Key {
  const text = raw.trim();
  if (!text) return { rank: 3 };
  if (NUMBER.test(text) && /\d/.test(text)) return { rank: 0, value: Number(text.replace(/,/g, "")) };
  const d = DATE.exec(text);
  if (d) {
    const value = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(d[4] ?? 0), Number(d[5] ?? 0), Number(d[6] ?? 0));
    if (!Number.isNaN(value)) return { rank: 1, value };
  }
  return { rank: 2, text };
}

function compareKeys(a: Key, b: Key): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.rank === 2) return collator.compare(a.text, (b as { text: string }).text);
  if (a.rank === 3) return 0;
  return a.value - (b as { value: number }).value;
}

/** Natural order of two cell texts, ascending, with empty cells last. */
export const naturalCompare = (a: string, b: string): number => compareKeys(keyOf(a), keyOf(b));

/**
 * The order of `values` sorted by them, as indexes: stable, ascending or descending, and empty values
 * last either way.
 */
export function sortOrder(values: readonly string[], direction: "ascending" | "descending"): number[] {
  const keys = values.map(keyOf);
  const sign = direction === "ascending" ? 1 : -1;
  return values.map((_, i) => i).sort((i, j) => {
    const a = keys[i]!;
    const b = keys[j]!;
    if (a.rank === 3 || b.rank === 3) return (a.rank === 3 ? 1 : 0) - (b.rank === 3 ? 1 : 0);
    return sign * compareKeys(a, b);
  });
}
