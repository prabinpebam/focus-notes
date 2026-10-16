/**
 * Where the block handle draws (IA-CMP-HANDLE, EDT-07): the editor surface publishes the hovered (or,
 * for the block menu, the caret's) block in viewport coordinates, and BlockHandle draws its grip in
 * the gutter beside the block's first line. Like the table geometry, this never goes through the store.
 */
import type { Box } from "./table-geometry.ts";

export interface BlockGeometry {
  /** The block's position in the note, passed back with every action. */
  block: number;
  /** The block's box, and the box of its first line, which the grip is level with. */
  box: Box;
  line: Box;
  /** The reading column's left edge: the grip sits in the gutter outside it. */
  column: number;
}

/** A place a dragged block can land: the position between two blocks, and the line drawn there. */
export interface BlockTarget {
  to: number;
  at: number;
  left: number;
  right: number;
}

let current: BlockGeometry | null = null;
const listeners = new Set<() => void>();

export const blockGeometry = {
  get: (): BlockGeometry | null => current,
  set(next: BlockGeometry | null): void {
    if (current === next || (current && next && JSON.stringify(current) === JSON.stringify(next))) return;
    current = next;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** The places the block can be dropped (its siblings' boundaries); the editor surface provides it. */
  targets: (_block: number): BlockTarget[] => [],
  /** True while the pointer is on the handle, its menu is open, or a drag is under way: the block stays. */
  held: false,
  /** Asks the editor surface to measure again; it provides it. */
  refresh: (): void => {},
  /** Scrolls the note by this much while a drag nears its top or bottom edge; the editor surface provides it. */
  scrollBy: (_dy: number): void => {},
};
