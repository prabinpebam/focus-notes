/**
 * When the page reports the pointer to the shell (`window:pointer`, D-104, D-106, D-150): the
 * preload's decision, kept pure so it's tested without a page. Nothing here touches Electron.
 */

/** Where the page watches the pointer: near every edge (the click-through margin) or under the top band (macOS). */
export interface PointerZone {
  top: boolean;
  size: number;
}

/** The zone from the page's `pointer` query (`edge:<px>` or `top:<px>`), if any. */
export function parsePointerZone(query: string | null): PointerZone | undefined {
  const m = /^(edge|top):(\d{1,3})$/.exec(query ?? "");
  return m ? { top: m[1] === "top", size: Number(m[2]) } : undefined;
}

/**
 * A pointer move at (x, y) in a page `width` × `height`: whether to report it, and whether it's now
 * near the zone. Near the zone, or just leaving it, it's reported. While the window lets clicks
 * through (`passthrough`, which the shell tells the page), every move the system forwards is: the
 * pointer can reach the window's middle without crossing the edges (Alt+Tab, a window that moved or
 * appeared under it), and the shell must see it there to take the mouse again (D-150).
 */
export function pointerMove(zone: PointerZone, near: boolean, passthrough: boolean, x: number, y: number, width: number, height: number): { report: boolean; near: boolean } {
  const now = zone.top ? y < zone.size : Math.min(x, y, width - x, height - y) < zone.size;
  return { report: now || near || passthrough, near: now };
}
