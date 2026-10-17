/**
 * A pinned side sheet and the note's text (D-161): the pinned Files sheet says where it ends, and the
 * note lays its reading column out clear of it. Both live in packages/ui; this is the one place they meet.
 */

/** The pinned sheet's edge on the canvas side, in window pixels, or undefined when nothing is pinned. */
let edge: number | undefined;
const listeners = new Set<(edge: number | undefined) => void>();

export const pinnedSheet = {
  get: () => edge,
  set(next: number | undefined): void {
    if (next === edge) return;
    edge = next;
    for (const l of listeners) l(next);
  },
  subscribe(listener: (edge: number | undefined) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The width a pinned contents card keeps on the note's right (D-186), in pixels; 0 when nothing is pinned there. */
let right = 0;
const rightListeners = new Set<(width: number) => void>();

export const pinnedRight = {
  get: () => right,
  set(next: number): void {
    const v = Math.max(0, Math.round(next));
    if (v === right) return;
    right = v;
    for (const l of rightListeners) l(v);
  },
  subscribe(listener: (width: number) => void): () => void {
    rightListeners.add(listener);
    return () => rightListeners.delete(listener);
  },
};

/** A corner control sits after a pinned sheet, or above it when the side has no room. */
export function cornerClearance(edge: number | undefined, left: number, width: number, controlWidth: number, gap: number): number | undefined {
  const x = edge === undefined ? gap : Math.max(gap, edge - left + gap);
  return x + controlWidth + gap <= width ? x : undefined;
}

export interface ClearanceInput {
  /** Where the sheet ends, in window pixels (undefined: nothing pinned). */
  edge: number | undefined;
  /** The scroller's content box: where the column is laid out. */
  left: number;
  width: number;
  /** The space kept after the sheet (`space.l`), and the column's own padding on each side (its gutter). */
  gap: number;
  gutter: number;
  /** The narrowest the text may get (`cmp.editorSurface.pinnedColumnMin`). */
  minText: number;
}

/**
 * How far the column's box starts from the scroller's left (0: centred as always): far enough that the
 * text, inside the gutter, starts `gap` after the sheet. When what's left can't hold `minText` of text,
 * nothing moves and the sheet floats over the text, as an unpinned one does.
 */
export function clearance({ edge, left, width, gap, gutter, minText }: ClearanceInput): number {
  if (edge === undefined) return 0;
  const clear = Math.max(0, edge + gap - gutter - left);
  if (clear === 0) return 0;
  return width - clear - 2 * gutter >= minText ? Math.round(clear) : 0;
}
