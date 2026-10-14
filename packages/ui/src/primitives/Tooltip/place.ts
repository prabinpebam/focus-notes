/** The sides a tooltip can sit on, as the contract names them (start and end follow the reading direction's left and right in LTR). */
export type TooltipSide = "top" | "bottom" | "start" | "end";

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Foundations → Visual quality, anchored tooltips (D-111): next to the control, `gap` away, centered
 * on it, on the preferred side unless there's no room there, and kept `edge` inside the window's
 * box (the drawn window on Windows and Linux). Everything is in viewport coordinates.
 */
export function placeTooltip(c: Box, size: { width: number; height: number }, win: Box, m: { gap: number; edge: number }, prefer: TooltipSide): { x: number; y: number; side: TooltipSide } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  const cx = (c.left + c.right) / 2;
  const cy = (c.top + c.bottom) / 2;
  if (prefer === "start" || prefer === "end") {
    const start = c.left - m.gap - size.width;
    const end = c.right + m.gap;
    const fitsStart = start >= win.left + m.edge;
    const fitsEnd = end + size.width <= win.right - m.edge;
    const side = prefer === "start" ? (fitsStart || !fitsEnd ? "start" : "end") : fitsEnd || !fitsStart ? "end" : "start";
    return { x: side === "start" ? start : end, y: clamp(cy - size.height / 2, win.top + m.edge, win.bottom - m.edge - size.height), side };
  }
  const above = c.top - m.gap - size.height;
  const below = c.bottom + m.gap;
  const fitsAbove = above >= win.top + m.edge;
  const fitsBelow = below + size.height <= win.bottom - m.edge;
  const side = prefer === "top" ? (fitsAbove || !fitsBelow ? "top" : "bottom") : fitsBelow || !fitsAbove ? "bottom" : "top";
  return { x: clamp(cx - size.width / 2, win.left + m.edge, win.right - m.edge - size.width), y: side === "top" ? above : below, side };
}
