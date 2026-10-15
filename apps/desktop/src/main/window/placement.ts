/**
 * Where the window opens (DSK-03, Desktop app → Remembered state): `window.json` in the app's data
 * folder keeps its size, position, and whether it was maximized, snapped, or full screen, and the
 * remembered bounds are checked against the displays there are now.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { clampToDisplays, WINDOW_METRICS, displayAt, displayFor, SNAP_ZONES, verticalRect, zoneRect, type DisplayInfo, type Rect, type SnapZone } from "@focus-notes/core/window-geometry";

export interface WindowMemory {
  version: 1;
  /** The window's own (visible) bounds when it was last a normal window, in DIP. */
  bounds?: Rect;
  maximized?: boolean;
  /** Snapped to this zone (not maximize). */
  zone?: SnapZone;
  /** Maximized vertically (D-141): the work area's height at `bounds`'s x and width. */
  vertical?: boolean;
  fullScreen?: boolean;
}

export type WindowMode = "normal" | "maximized" | "snapped";
/** Where a snapped window is: a snap zone, or "vertical" (D-141). */
export type PlacedZone = SnapZone | "vertical";
export interface Placement {
  /** The visible window's bounds now. */
  content: Rect;
  mode: WindowMode;
  zone?: PlacedZone;
  /** Where Restore puts it. */
  restore: Rect;
  fullScreen: boolean;
}

export const MIN_SIZE = { width: WINDOW_METRICS.minWidth, height: WINDOW_METRICS.minHeight };
export const DEFAULT_SIZE = { width: 1100, height: 780 };

const isRect = (r: unknown): r is Rect =>
  typeof r === "object" && r !== null && ["x", "y", "width", "height"].every((k) => Number.isFinite((r as Record<string, unknown>)[k])) && (r as Rect).width > 0 && (r as Rect).height > 0;

/** Reads `window.json`, keeping only what's valid. Anything else is forgotten, never an error. */
export function parseWindowMemory(text: string | undefined): WindowMemory {
  try {
    const m = JSON.parse(text ?? "") as Record<string, unknown>;
    if (m.version !== 1) return { version: 1 };
    const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    return {
      version: 1,
      ...(isRect(m.bounds) ? { bounds: round(m.bounds) } : {}),
      ...(m.maximized === true ? { maximized: true } : {}),
      ...((SNAP_ZONES as readonly unknown[]).includes(m.zone) && m.zone !== "maximize" ? { zone: m.zone as SnapZone } : {}),
      ...(m.vertical === true && m.maximized !== true && m.zone === undefined ? { vertical: true } : {}),
      ...(m.fullScreen === true ? { fullScreen: true } : {}),
    };
  } catch {
    return { version: 1 };
  }
}

export function readWindowMemory(file: string): WindowMemory {
  try {
    return parseWindowMemory(readFileSync(file, "utf8"));
  } catch {
    return { version: 1 };
  }
}

/** Written whole, through a temporary file, so a crash never leaves half of it. */
export function writeWindowMemory(file: string, m: WindowMemory): void {
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`);
    renameSync(tmp, file);
  } catch {
    // Not remembering where the window was never stops the app.
  }
}

/** The remembered place on today's displays, or the default size centered on the primary display. */
export function initialPlacement(m: WindowMemory, displays: readonly DisplayInfo[], primary: DisplayInfo): Placement {
  const wa = primary.workArea;
  const width = Math.min(DEFAULT_SIZE.width, wa.width);
  const height = Math.min(DEFAULT_SIZE.height, wa.height);
  const centered: Rect = { x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height };
  const restore = m.bounds ? clampToDisplays(m.bounds, displays, MIN_SIZE) : centered;
  if (m.vertical && !m.maximized && !m.zone) {
    const display = displayFor(restore, displays);
    return { content: verticalRect(restore, display.workArea), mode: "snapped", zone: "vertical", restore, fullScreen: m.fullScreen === true };
  }
  const zone: SnapZone | undefined = m.maximized ? "maximize" : m.zone;
  if (!zone) return { content: restore, mode: "normal", restore, fullScreen: m.fullScreen === true };
  const display = m.bounds ? displayFor(restore, displays) : displayAt({ x: wa.x, y: wa.y }, displays);
  return {
    content: zoneRect(zone, display.workArea),
    mode: zone === "maximize" ? "maximized" : "snapped",
    ...(zone === "maximize" ? {} : { zone }),
    restore,
    fullScreen: m.fullScreen === true,
  };
}
