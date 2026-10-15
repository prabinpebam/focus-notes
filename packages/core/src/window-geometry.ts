/**
 * The geometry of the app-built window on Windows and Linux (DSK-01, DSK-03, DSK-08, D-14): resize
 * zones, snapping, restoring under the pointer, displays with different scaling, and remembered bounds.
 * Pure functions on device-independent pixels (DIP), as Electron reports screens and windows. The
 * desktop's main process applies them; nothing here touches a window.
 */
import { windowMetrics } from "@focus-notes/tokens";

/** The `window.*` tokens, resolved: the shadow margin, the handles, the minimum size, and the Snap Layouts delay. */
export const WINDOW_METRICS = windowMetrics;
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplayInfo {
  id: number;
  bounds: Rect;
  /** The display without the taskbar or panels: windows snap and maximize into it. */
  workArea: Rect;
  scaleFactor: number;
  /** Where the display starts in physical pixels, when the system says. */
  nativeOrigin?: Point;
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
/** Where a point is over the window: a resize handle, the app, or the click-through shadow margin. */
export type HitZone = ResizeEdge | "inside" | "outside";
export const SNAP_ZONES = ["maximize", "left", "right", "topLeft", "topRight", "bottomLeft", "bottomRight", "leftThird", "centerThird", "rightThird"] as const;
export type SnapZone = (typeof SNAP_ZONES)[number];
export type SnapLayout = "halves" | "thirds" | "quarters" | "maximize";
/** The Snap Layouts picker's layouts and the zones in each, in reading order. */
export const SNAP_LAYOUTS: Record<SnapLayout, readonly SnapZone[]> = {
  halves: ["left", "right"],
  thirds: ["leftThird", "centerThird", "rightThird"],
  quarters: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
  maximize: ["maximize"],
};
/** The shadow margin and the resize handles, in px (the `window.*` tokens). */
export interface FrameMetrics { margin: number; edge: number; corner: number }

/** How close to a screen edge the pointer must be to snap, and how far along it a corner reaches. */
export const SNAP_EDGE = 8;
export const SNAP_CORNER = 64;
/** Work areas at least this wide offer thirds in Snap Layouts, as Windows 11 does. */
export const WIDE_WORK_AREA = 1920;
/** How far a press must move before it becomes a drag (restoring a maximized window). */
export const DRAG_THRESHOLD = 4;
/** One arrow press of Move or Size from the system menu; one pixel with Ctrl. */
export const KEY_STEP = 10;

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const contains = (r: Rect, p: Point) => p.x >= r.x && p.x < right(r) && p.y >= r.y && p.y < bottom(r);
const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, width: r.width - 2 * d, height: r.height - 2 * d });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));

export const outerBounds = (content: Rect, margin: number): Rect => inset(content, -margin);
export const contentBounds = (outer: Rect, margin: number): Rect => inset(outer, margin);

/**
 * What the point (in window coordinates) is over. The handles lie in a band `edge` wide just outside
 * the visible window, inside the shadow margin; with no margin (snapped) they lie just inside the
 * edges. Corners are `corner` squares at the band's corners. The rest of the margin is "outside".
 */
export function hitZone(p: Point, size: Size, m: FrameMetrics, resizable = true): HitZone {
  const frame = inset({ x: 0, y: 0, width: size.width, height: size.height }, m.margin);
  if (!resizable) return contains(frame, p) ? "inside" : "outside";
  const outer = inset(frame, -Math.min(m.edge, m.margin));
  const inner = m.margin >= m.edge ? frame : inset(frame, m.edge - m.margin);
  if (!contains(outer, p)) return "outside";
  const w = p.x < outer.x + m.corner;
  const e = p.x >= right(outer) - m.corner;
  const n = p.y < outer.y + m.corner;
  const s = p.y >= bottom(outer) - m.corner;
  if ((w || e) && (n || s)) return `${n ? "n" : "s"}${w ? "w" : "e"}` as ResizeEdge;
  if (contains(inner, p)) return "inside";
  if (p.x < inner.x) return "w";
  if (p.x >= right(inner)) return "e";
  return p.y < inner.y ? "n" : "s";
}

/** The bounds after dragging an edge or corner by `d`, never below `min`. With `keepRatio` (Shift) the proportions stay. */
export function resizeBounds(start: Rect, edge: ResizeEdge, d: Point, min: Size, keepRatio = false): Rect {
  const west = edge.includes("w");
  const north = edge.includes("n");
  const dx = west ? -d.x : edge.includes("e") ? d.x : 0;
  const dy = north ? -d.y : edge.includes("s") ? d.y : 0;
  let width = start.width + dx;
  let height = start.height + dy;
  if (keepRatio) {
    const ratio = start.width / start.height;
    const byWidth = dy === 0 || (dx !== 0 && Math.abs(dx) / start.width >= Math.abs(dy) / start.height);
    if (byWidth) height = Math.round(width / ratio);
    else width = Math.round(height * ratio);
  }
  width = Math.max(min.width, Math.round(width));
  height = Math.max(min.height, Math.round(height));
  return {
    x: west ? right(start) - width : start.x,
    y: north ? bottom(start) - height : start.y,
    width,
    height,
  };
}

/**
 * Dragging a maximized or snapped window restores it under the pointer, at the same relative place
 * across its width and the same distance below its top, as Windows does.
 */
export function restoreUnderPointer(restore: Size, from: Rect, p: Point, workArea: Rect): Rect {
  const fx = from.width > 0 ? (p.x - from.x) / from.width : 0.5;
  const x = clamp(Math.round(p.x - fx * restore.width), Math.max(workArea.x, p.x - restore.width + 1), Math.min(right(workArea) - restore.width, p.x));
  const y = p.y - Math.min(p.y - from.y, restore.height - 1);
  return { x, y, width: restore.width, height: restore.height };
}

/** A snap zone's rectangle in a work area. Neighbouring zones share edges, with no gaps. */
export function zoneRect(zone: SnapZone, wa: Rect): Rect {
  const xAt = (f: number) => wa.x + Math.round(wa.width * f);
  const yAt = (f: number) => wa.y + Math.round(wa.height * f);
  const box = (x0: number, x1: number, y0: number, y1: number): Rect => ({ x: xAt(x0), y: yAt(y0), width: xAt(x1) - xAt(x0), height: yAt(y1) - yAt(y0) });
  switch (zone) {
    case "maximize": return { ...wa };
    case "left": return box(0, 0.5, 0, 1);
    case "right": return box(0.5, 1, 0, 1);
    case "topLeft": return box(0, 0.5, 0, 0.5);
    case "topRight": return box(0.5, 1, 0, 0.5);
    case "bottomLeft": return box(0, 0.5, 0.5, 1);
    case "bottomRight": return box(0.5, 1, 0.5, 1);
    case "leftThird": return box(0, 1 / 3, 0, 1);
    case "centerThird": return box(1 / 3, 2 / 3, 0, 1);
    case "rightThird": return box(2 / 3, 1, 0, 1);
  }
}

/** The layouts the Snap Layouts picker offers on a work area: thirds only on wide ones. */
export const layoutsFor = (wa: Rect): SnapLayout[] => (wa.width >= WIDE_WORK_AREA ? ["halves", "thirds", "quarters", "maximize"] : ["halves", "quarters", "maximize"]);

/** The display under a point, or the nearest one. */
export function displayAt(p: Point, displays: readonly DisplayInfo[]): DisplayInfo {
  const hit = displays.find((d) => contains(d.bounds, p));
  if (hit) return hit;
  const dist = (d: DisplayInfo) => Math.hypot(p.x - clamp(p.x, d.bounds.x, right(d.bounds) - 1), p.y - clamp(p.y, d.bounds.y, bottom(d.bounds) - 1));
  return [...displays].sort((a, b) => dist(a) - dist(b))[0]!;
}

/** The display a window belongs to: the one it overlaps most, as the system decides. */
export function displayFor(r: Rect, displays: readonly DisplayInfo[]): DisplayInfo {
  const best = [...displays].sort((a, b) => overlap(r, b.bounds) - overlap(r, a.bounds))[0]!;
  return overlap(r, best.bounds) > 0 ? best : displayAt({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, displays);
}

/**
 * The snap zone the pointer is at while moving the window: an outer edge of a display (one no other
 * display continues past), the corners along it, or the top for maximize.
 */
export function snapZoneAt(p: Point, displays: readonly DisplayInfo[]): { zone: SnapZone; display: DisplayInfo } | undefined {
  const display = displays.find((d) => contains(d.bounds, p));
  if (!display) return undefined;
  const b = display.bounds;
  const wa = display.workArea;
  const open = (q: Point) => !displays.some((d) => contains(d.bounds, q));
  const west = p.x - b.x < SNAP_EDGE && open({ x: b.x - 1, y: p.y });
  const east = right(b) - 1 - p.x < SNAP_EDGE && open({ x: right(b), y: p.y });
  const north = p.y - b.y < SNAP_EDGE && open({ x: p.x, y: b.y - 1 });
  const nearTop = p.y - wa.y < SNAP_CORNER;
  const nearBottom = bottom(wa) - p.y < SNAP_CORNER;
  let zone: SnapZone | undefined;
  if (west) zone = nearTop ? "topLeft" : nearBottom ? "bottomLeft" : "left";
  else if (east) zone = nearTop ? "topRight" : nearBottom ? "bottomRight" : "right";
  else if (north) zone = p.x - b.x < SNAP_CORNER ? "topLeft" : right(b) - p.x < SNAP_CORNER ? "topRight" : "maximize";
  return zone ? { zone, display } : undefined;
}

/**
 * Windows' vertical maximize (D-141): resizing by the top or bottom edge until the pointer reaches
 * the work area's top, or its bottom (the taskbar), fills the work area's height. The pointer must
 * still be on the window's display: going past onto a display above or below is crossing to it.
 */
export function verticalSnapAt(edge: ResizeEdge, p: Point, display: DisplayInfo): boolean {
  const b = display.bounds;
  const wa = display.workArea;
  if (p.x < b.x || p.x >= right(b)) return false;
  if (edge === "n") return p.y >= b.y && p.y < wa.y + SNAP_EDGE;
  if (edge === "s") return p.y < bottom(b) && p.y >= bottom(wa) - SNAP_EDGE;
  return false;
}
/** A vertically maximized window: the work area's full height, at the same x and width. */
export const verticalRect = (r: Rect, wa: Rect): Rect => ({ x: r.x, y: wa.y, width: r.width, height: wa.height });

/**
 * How far a CSS box shadow reaches past its box on each side, in px: the offset, the spread, and
 * 1.5 × the blur, where Chromium's Gaussian (σ = blur / 2) ends (3σ). Inset shadows reach nothing.
 * The drawn window's shadow must stay inside the shadow margin, or the native window's edge cuts it (D-141).
 */
export function shadowExtent(css: string): { top: number; right: number; bottom: number; left: number } {
  const out = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const layer of css.split(/,(?![^(]*\))/)) {
    const parts = layer.trim().split(/\s+(?![^(]*\))/);
    if (parts.includes("inset") || parts[0] === "none") continue;
    const n = parts.filter((x) => /^-?[\d.]+(px)?$/.test(x)).map((x) => parseFloat(x));
    if (n.length < 2) continue;
    const [x = 0, y = 0, blur = 0, spread = 0] = n;
    const reach = spread + 1.5 * blur;
    out.top = Math.max(out.top, reach - y);
    out.bottom = Math.max(out.bottom, reach + y);
    out.left = Math.max(out.left, reach - x);
    out.right = Math.max(out.right, reach + x);
  }
  return out;
}

/** DIP to physical pixels on a display: each display has its own scale. */
export function toPhysical(r: Rect, d: DisplayInfo): Rect {
  const o = d.nativeOrigin ?? { x: d.bounds.x * d.scaleFactor, y: d.bounds.y * d.scaleFactor };
  const s = d.scaleFactor;
  return { x: Math.round(o.x + (r.x - d.bounds.x) * s), y: Math.round(o.y + (r.y - d.bounds.y) * s), width: Math.round(r.width * s), height: Math.round(r.height * s) };
}
export function toDip(r: Rect, d: DisplayInfo): Rect {
  const o = d.nativeOrigin ?? { x: d.bounds.x * d.scaleFactor, y: d.bounds.y * d.scaleFactor };
  const s = d.scaleFactor;
  return { x: Math.round(d.bounds.x + (r.x - o.x) / s), y: Math.round(d.bounds.y + (r.y - o.y) / s), width: Math.round(r.width / s), height: Math.round(r.height / s) };
}

/**
 * Keeps a window's size in DIP (which keeps its physical size on screen, since each display's scale
 * makes a DIP about the same size) on the display it's moving to, shrinking it to the work area if
 * it doesn't fit, and keeping it inside.
 */
export function fitToDisplay(r: Rect, d: DisplayInfo): Rect {
  const wa = d.workArea;
  const width = Math.min(r.width, wa.width);
  const height = Math.min(r.height, wa.height);
  return { x: clamp(r.x, wa.x, right(wa) - width), y: clamp(r.y, wa.y, bottom(wa) - height), width, height };
}

/** Whether the system changed a window's size (crossing to another scale) by more than rounding. */
export const needsRemeasure = (expected: Size, actual: Size): boolean => Math.abs(expected.width - actual.width) > 1 || Math.abs(expected.height - actual.height) > 1;

/**
 * Remembered bounds, checked against the displays there are now: at least the minimum size, no
 * larger than its display's work area, and with enough of the title band on a display to grab it.
 * A window that would open off-screen is moved onto the nearest display.
 */
export function clampToDisplays(saved: Rect, displays: readonly DisplayInfo[], min: Size, band = 44): Rect {
  const r = { ...saved, width: Math.max(min.width, saved.width), height: Math.max(min.height, saved.height) };
  const grab = { x: r.x, y: r.y, width: r.width, height: band };
  const on = displays.find((d) => {
    const wa = d.workArea;
    const w = Math.min(right(grab), right(wa)) - Math.max(grab.x, wa.x);
    return r.y >= wa.y && w >= Math.min(64, r.width) && grab.y < bottom(wa) - band / 2;
  });
  if (on) return r.width <= on.workArea.width && r.height <= on.workArea.height ? r : fitToDisplay(r, on);
  return fitToDisplay(r, displayFor(r, displays));
}

export type ArrowKey = "Left" | "Right" | "Up" | "Down";
/**
 * One arrow press of the system menu's Move or Size. Size first chooses an edge, then moves it; an
 * arrow across it adds the other edge, making a corner, as on Windows.
 */
export function keyboardStep(r: Rect, mode: "move" | "size", key: ArrowKey, edge: ResizeEdge | undefined, min: Size, fine = false): { rect: Rect; edge?: ResizeEdge } {
  const step = fine ? 1 : KEY_STEP;
  const dx = key === "Left" ? -step : key === "Right" ? step : 0;
  const dy = key === "Up" ? -step : key === "Down" ? step : 0;
  if (mode === "move") return { rect: { ...r, x: r.x + dx, y: r.y + dy } };
  const v = edge?.match(/[ns]/)?.[0] ?? "";
  const h = edge?.match(/[ew]/)?.[0] ?? "";
  const horizontal = dx !== 0;
  if (horizontal ? !h : !v) {
    const chosen = horizontal ? (dx < 0 ? "w" : "e") : dy < 0 ? "n" : "s";
    return { rect: r, edge: (horizontal ? v + chosen : chosen + h) as ResizeEdge };
  }
  return { rect: resizeBounds(r, (horizontal ? h : v) as ResizeEdge, { x: dx, y: dy }, min), edge: edge! };
}
