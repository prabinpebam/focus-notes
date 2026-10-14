/**
 * The Files tree's type-ahead (Files → Accessibility): letters jump to the next row whose name
 * starts with them. Letters typed within TYPE_AHEAD_MS of the one before make one word. The gap is
 * timed from each key's event time, when it was pressed, not from when it's handled: while the app
 * is busy (indexing 10,000 notes, say), keys wait in a queue, and timing their handling would split
 * a word typed quickly and land on the wrong row (DEF-4).
 */
export const TYPE_AHEAD_MS = 700;

export interface TypeAheadState {
  text: string;
  /** The previous key's event time (ms). */
  at: number;
}
export interface TypeAheadRow {
  id: string;
  label: string;
  editing?: boolean;
}

/** Adds `key`, pressed at `at`, to the word; returns the row to select, if any. Updates `state`. */
export function typeAhead(state: TypeAheadState, key: string, at: number, rows: readonly TypeAheadRow[], focused: number): string | undefined {
  state.text = at - state.at > TYPE_AHEAD_MS || at < state.at ? key : state.text + key;
  state.at = at;
  const q = state.text.toLocaleLowerCase();
  // A new word starts after the focused row; a longer one may stay on it.
  const start = state.text.length === 1 ? focused + 1 : focused;
  const order = [...rows.slice(start), ...rows.slice(0, start)];
  return order.find((x) => !x.editing && x.label.toLocaleLowerCase().startsWith(q))?.id;
}
