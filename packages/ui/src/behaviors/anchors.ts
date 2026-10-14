import { createContext } from "react";
/**
 * Where the editor's floating companions point (the formatting toolbar, the link editor, the hover
 * card): the editor surface publishes rectangles in viewport coordinates, and Positioner follows them.
 */
export interface AnchorRect {
  /** The first line's top and the last line's bottom. */
  top: number;
  bottom: number;
  /** The first line's horizontal extent: the toolbar centers on it. */
  left: number;
  right: number;
}
/** The selection (or caret), a link, and the `/` the slash menu opened at. */
export type AnchorName = "selection" | "link" | "caret";

const rects: Record<AnchorName, AnchorRect | null> = { selection: null, link: null, caret: null };
const listeners = new Set<() => void>();

export const anchors = {
  get: (name: AnchorName): AnchorRect | null => rects[name],
  set(name: AnchorName, rect: AnchorRect | null): void {
    const old = rects[name];
    if (old === rect || (old && rect && old.top === rect.top && old.bottom === rect.bottom && old.left === rect.left && old.right === rect.right)) return;
    rects[name] = rect;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Marks an element as part of the editor's companions: focus or the pointer there keeps them open. */
export const COMPANION_ATTR = "data-editor-companion";
/**
 * Inside an editor companion (the formatting toolbar, the link editor and card), a pointer press
 * leaves focus in the note: the note never blurs and refocuses, so nothing puts back an older
 * selection (ProseMirror restores its own on focus). The keyboard still moves into them.
 */
export const CompanionContext = createContext(false);
/** Dispatched on window when focus or the pointer leaves a companion for somewhere else. */
export const COMPANION_LEAVE_EVENT = "focus-notes:companion-leave";
/** True while the pointer is over a companion, so the hover card waits (Text formatting → Hover a link). */
export const companion = { hovered: false };

/** Inside a companion, or a menu one of them opened (the Turn into menu is portaled). */
export const inCompanion = (el: EventTarget | Element | null | undefined): boolean =>
  el instanceof Element && Boolean(el.closest(`[${COMPANION_ATTR}], [data-floating-child]`));

export interface Metrics {
  /** Space between the anchor and the floating content. */
  gap: number;
  /** The least distance from the window's edges. */
  edge: number;
  /** The trigger band at the top, which nothing covers. */
  topBand: number;
}

export interface Placed {
  x: number;
  y: number;
  side: "above" | "below";
  /** The anchor has scrolled out of view: the content hides until it's back. */
  offscreen: boolean;
}

/**
 * Text formatting → Placement: centered on the anchor's first line, `gap` above it, flipped below
 * when that would reach the top band (or `prefer` is below and there's no room under it), and kept
 * `edge` inside the window. It never covers the anchor.
 */
export function place(a: AnchorRect, size: { width: number; height: number }, view: { width: number; height: number }, m: Metrics, prefer: "above" | "below", align: "center" | "start" = "center"): Placed {
  const center = (a.left + a.right) / 2;
  const maxX = view.width - m.edge - size.width;
  // Start alignment lines the content up with the anchor's leading edge (the slash menu under its `/`).
  const x = Math.max(m.edge, Math.min(align === "start" ? a.left : center - size.width / 2, maxX));
  const aboveY = a.top - m.gap - size.height;
  const belowY = a.bottom + m.gap;
  let side = prefer;
  if (prefer === "above" && aboveY < m.topBand) side = "below";
  else if (prefer === "below" && belowY + size.height > view.height - m.edge && aboveY >= m.topBand) side = "above";
  return { x, y: side === "above" ? aboveY : belowY, side, offscreen: a.bottom < m.topBand || a.top > view.height };
}

/**
 * Content too tall for the side it was placed on (a long slash menu in a small window, D-111): it
 * goes to the side with more room and is held to that room, so it never leaves the window; what it
 * holds scrolls. Content that fits keeps its place.
 */
export function fit(a: AnchorRect, p: Placed, height: number, view: { width: number; height: number }, m: Metrics): { y: number; side: "above" | "below"; maxHeight: number | undefined } {
  const below = view.height - m.edge - (a.bottom + m.gap);
  const above = a.top - m.gap - m.topBand;
  if (height <= (p.side === "below" ? below : above)) return { y: p.y, side: p.side, maxHeight: undefined };
  const side = below >= above ? "below" : "above";
  const room = Math.max(0, side === "below" ? below : above);
  return { y: side === "below" ? a.bottom + m.gap : a.top - m.gap - room, side, maxHeight: room };
}
