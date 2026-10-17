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

/** The width a docked contents panel takes on the note's right (D-186, D-187), in pixels; 0 when nothing is docked there. */
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

/** The width docked Files takes on the window's left (D-187), live as it's resized; 0 when it isn't docked. */
let left = 0;
const leftListeners = new Set<(width: number) => void>();

export const dockLeft = {
  get: () => left,
  set(next: number): void {
    const v = Math.max(0, Math.round(next));
    if (v === left) return;
    left = v;
    for (const l of leftListeners) l(v);
  },
  subscribe(listener: (width: number) => void): () => void {
    leftListeners.add(listener);
    return () => leftListeners.delete(listener);
  },
};

/**
 * Which panels dock (D-187): each asks with its width (undefined: not asking); the note's area keeps
 * at least `contentMin` between them. When the window can't hold them all, Files undocks first, then
 * the contents.
 */
export function allocateDocks(o: { width: number; files?: number; outline?: number; contentMin: number }): { files: boolean; outline: boolean } {
  const asksOutline = o.outline !== undefined;
  const outline = asksOutline && o.outline! + o.contentMin <= o.width;
  // Files is first to go: it never stays docked where the contents asking to dock couldn't.
  const files = o.files !== undefined && (!asksOutline || outline) && o.files + (outline ? o.outline! : 0) + o.contentMin <= o.width;
  return { files, outline };
}

/** The widest a docked panel may be resized to: its own maximum, and no more than leaves the note its narrowest. */
export function dockMaxWidth(o: { window: number; other: number; contentMin: number; min: number; max: number }): number {
  return Math.max(o.min, Math.min(o.max, o.window - o.other - o.contentMin));
}

/** A corner control sits after a pinned sheet, or above it when the side has no room. */
export function cornerClearance(edge: number | undefined, left: number, width: number, controlWidth: number, gap: number): number | undefined {
  const x = edge === undefined ? gap : Math.max(gap, edge - left + gap);
  return x + controlWidth + gap <= width ? x : undefined;
}
