/**
 * Where the table controls draw (IA-CMP-TABLE): the editor surface publishes the hovered or active
 * table's geometry in viewport coordinates, and TableControls draws its handles, insertion point,
 * edge bars, and outlines over it. Like the anchors, this never goes through the store.
 */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TableGeometry {
  /** The table's position in the note, passed back with every action. */
  table: number;
  /** The visible part of the table (its frame scrolls sideways when it's wide). */
  frame: Box;
  rows: number;
  cols: number;
  /** The row and column the handles are for, and their boxes. */
  row: number;
  col: number;
  rowBox: Box;
  colBox: Box;
  /** The pointer is over the table (the column tint and edge bars show), not just the caret. */
  hovering: boolean;
  /** Handles show: on hover, or for the caret's cell on touch screens. */
  handles: boolean;
  /** The + insertion point: the boundary it's at, and where that boundary is (y for rows, x for columns). */
  insert: { axis: "row" | "column"; index: number; at: number } | null;
  /** The selected cell range's box, outlined in the accent. */
  selection: Box | null;
  /** The active cell's box, where the context menu opens. */
  cell: Box | null;
}

/** Row and column boundaries (y and x), for dropping a dragged row or column. */
export interface TableEdges {
  rows: number[];
  cols: number[];
}

let current: TableGeometry | null = null;
const listeners = new Set<() => void>();

export const tableGeometry = {
  get: (): TableGeometry | null => current,
  set(next: TableGeometry | null): void {
    if (current === next || (current && next && JSON.stringify(current) === JSON.stringify(next))) return;
    current = next;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Measures every boundary of the current table; the editor surface provides it. */
  edges: (): TableEdges | null => null,
  /** True while the pointer is on the controls, a menu is open, or a drag is under way: hover stays. */
  held: false,
  /** Asks the editor surface to measure again (the pointer left the controls); it provides it. */
  refresh: (): void => {},
};
