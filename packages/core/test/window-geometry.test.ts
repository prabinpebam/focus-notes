import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  clampToDisplays, contentBounds, displayAt, displayFor, fitToDisplay, hitZone, keyboardStep, layoutsFor, needsRemeasure, outerBounds,
  resizeBounds, restoreUnderPointer, shadowExtent, snapZoneAt, toDip, toPhysical, verticalRect, verticalSnapAt, zoneRect, SNAP_LAYOUTS, WINDOW_METRICS, type DisplayInfo,
} from "../src/window-geometry.ts";

// The window geometry of the app-built window on Windows and Linux (DSK-03, DSK-08, D-14).
const metrics = { margin: 16, edge: 6, corner: 14 };
const full: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };
// A 150% laptop panel to the right of it (DIP coordinates, as Electron reports them).
const laptop: DisplayInfo = { id: 2, bounds: { x: 1920, y: 0, width: 1707, height: 1067 }, workArea: { x: 1920, y: 0, width: 1707, height: 1019 }, scaleFactor: 1.5, nativeOrigin: { x: 1920, y: 0 } };

describe("DSK-03: resize hit zones, edges and corners", () => {
  const size = { width: 1132, height: 812 };
  it("finds each edge in the band just outside the visible window", () => {
    expect(hitZone({ x: 12, y: 400 }, size, metrics)).toBe("w");
    expect(hitZone({ x: 15, y: 400 }, size, metrics)).toBe("w");
    expect(hitZone({ x: 1120, y: 400 }, size, metrics)).toBe("e");
    expect(hitZone({ x: 566, y: 12 }, size, metrics)).toBe("n");
    expect(hitZone({ x: 566, y: 800 }, size, metrics)).toBe("s");
  });
  it("finds each corner, which reaches a little inside the rounded corner", () => {
    expect(hitZone({ x: 11, y: 11 }, size, metrics)).toBe("nw");
    expect(hitZone({ x: 22, y: 22 }, size, metrics)).toBe("nw");
    expect(hitZone({ x: 1121, y: 11 }, size, metrics)).toBe("ne");
    expect(hitZone({ x: 11, y: 801 }, size, metrics)).toBe("sw");
    expect(hitZone({ x: 1121, y: 801 }, size, metrics)).toBe("se");
  });
  it("passes the rest of the shadow margin through, and keeps the inside for the app", () => {
    expect(hitZone({ x: 5, y: 400 }, size, metrics)).toBe("outside");
    expect(hitZone({ x: 566, y: 2 }, size, metrics)).toBe("outside");
    expect(hitZone({ x: 16, y: 400 }, size, metrics)).toBe("inside");
    expect(hitZone({ x: 25, y: 25 }, size, metrics)).toBe("inside");
  });
  it("puts the handles inside the edges when there's no margin (snapped)", () => {
    const snapped = { width: 800, height: 600 };
    const m0 = { ...metrics, margin: 0 };
    expect(hitZone({ x: 2, y: 300 }, snapped, m0)).toBe("w");
    expect(hitZone({ x: 7, y: 300 }, snapped, m0)).toBe("inside");
    expect(hitZone({ x: 2, y: 2 }, snapped, m0)).toBe("nw");
    expect(hitZone({ x: 799, y: 599 }, snapped, m0)).toBe("se");
  });
  it("has no handles when the window can't be resized (maximized, full screen)", () => {
    expect(hitZone({ x: 12, y: 400 }, size, metrics, false)).toBe("outside");
    expect(hitZone({ x: 100, y: 100 }, size, metrics, false)).toBe("inside");
  });
});

describe("DSK-03: resizing", () => {
  const start = { x: 100, y: 100, width: 800, height: 600 };
  const min = { width: 480, height: 360 };
  it("moves only the dragged edges", () => {
    expect(resizeBounds(start, "e", { x: 50, y: 30 }, min)).toEqual({ x: 100, y: 100, width: 850, height: 600 });
    expect(resizeBounds(start, "w", { x: 50, y: 30 }, min)).toEqual({ x: 150, y: 100, width: 750, height: 600 });
    expect(resizeBounds(start, "n", { x: 50, y: -40 }, min)).toEqual({ x: 100, y: 60, width: 800, height: 640 });
    expect(resizeBounds(start, "s", { x: 50, y: 40 }, min)).toEqual({ x: 100, y: 100, width: 800, height: 640 });
    expect(resizeBounds(start, "nw", { x: -10, y: -20 }, min)).toEqual({ x: 90, y: 80, width: 810, height: 620 });
    expect(resizeBounds(start, "se", { x: 10, y: 20 }, min)).toEqual({ x: 100, y: 100, width: 810, height: 620 });
  });
  it("stops at the minimum size, keeping the opposite edge still", () => {
    expect(resizeBounds(start, "w", { x: 600, y: 0 }, min)).toEqual({ x: 420, y: 100, width: 480, height: 600 });
    expect(resizeBounds(start, "n", { x: 0, y: 500 }, min)).toEqual({ x: 100, y: 340, width: 800, height: 360 });
  });
  it("keeps the proportions with Shift", () => {
    const r = resizeBounds(start, "se", { x: 80, y: 0 }, min, true);
    expect(r.width / r.height).toBeCloseTo(800 / 600, 2);
    expect(r).toEqual({ x: 100, y: 100, width: 880, height: 660 });
    const n = resizeBounds(start, "n", { x: 0, y: -60 }, min, true);
    expect(n).toEqual({ x: 100, y: 40, width: 880, height: 660 });
  });
});

describe("DSK-03: restoring a maximized window by dragging it", () => {
  const max = full.workArea;
  it("puts the restored window under the pointer at the same relative position", () => {
    expect(restoreUnderPointer({ width: 1000, height: 700 }, max, { x: 1440, y: 20 }, max)).toEqual({ x: 690, y: 0, width: 1000, height: 700 });
    expect(restoreUnderPointer({ width: 1000, height: 700 }, max, { x: 10, y: 20 }, max)).toEqual({ x: 5, y: 0, width: 1000, height: 700 });
    const r = restoreUnderPointer({ width: 1000, height: 700 }, max, { x: 1915, y: 20 }, max);
    expect(r.x + r.width).toBeLessThanOrEqual(1920);
    expect(r.x).toBeLessThanOrEqual(1915);
  });
});

describe("DSK-08: edge and corner snapping", () => {
  it("names halves, quarters, and maximize from the screen's edges", () => {
    expect(snapZoneAt({ x: 2, y: 500 }, [full])?.zone).toBe("left");
    expect(snapZoneAt({ x: 1918, y: 500 }, [full])?.zone).toBe("right");
    expect(snapZoneAt({ x: 960, y: 1 }, [full])?.zone).toBe("maximize");
    expect(snapZoneAt({ x: 2, y: 10 }, [full])?.zone).toBe("topLeft");
    expect(snapZoneAt({ x: 30, y: 2 }, [full])?.zone).toBe("topLeft");
    expect(snapZoneAt({ x: 1900, y: 2 }, [full])?.zone).toBe("topRight");
    expect(snapZoneAt({ x: 1918, y: 1030 }, [full])?.zone).toBe("bottomRight");
    expect(snapZoneAt({ x: 2, y: 1075 }, [full])?.zone).toBe("bottomLeft");
    expect(snapZoneAt({ x: 500, y: 500 }, [full])).toBeUndefined();
  });
  it("doesn't snap at an edge shared with another display, so the window can cross", () => {
    expect(snapZoneAt({ x: 1919, y: 500 }, [full, laptop])).toBeUndefined();
    expect(snapZoneAt({ x: 1921, y: 500 }, [full, laptop])).toBeUndefined();
    const right = snapZoneAt({ x: 3625, y: 700 }, [full, laptop]);
    expect(right?.zone).toBe("right");
    expect(right?.display.id).toBe(2);
    expect(snapZoneAt({ x: 3000, y: 0 }, [full, laptop])?.zone).toBe("maximize");
  });
  it("snaps where the next display doesn't reach", () => {
    const lower = { ...laptop, bounds: { ...laptop.bounds, y: 200 }, workArea: { ...laptop.workArea, y: 200 } };
    expect(snapZoneAt({ x: 1919, y: 100 }, [full, lower])?.zone).toBe("right");
  });
  it("uses the work area, so the taskbar is never covered", () => {
    expect(zoneRect("left", full.workArea)).toEqual({ x: 0, y: 0, width: 960, height: 1040 });
    expect(zoneRect("right", full.workArea)).toEqual({ x: 960, y: 0, width: 960, height: 1040 });
    expect(zoneRect("topLeft", full.workArea)).toEqual({ x: 0, y: 0, width: 960, height: 520 });
    expect(zoneRect("bottomRight", full.workArea)).toEqual({ x: 960, y: 520, width: 960, height: 520 });
    expect(zoneRect("maximize", full.workArea)).toEqual(full.workArea);
    expect(zoneRect("leftThird", full.workArea)).toEqual({ x: 0, y: 0, width: 640, height: 1040 });
    expect(zoneRect("centerThird", full.workArea)).toEqual({ x: 640, y: 0, width: 640, height: 1040 });
    expect(zoneRect("rightThird", full.workArea)).toEqual({ x: 1280, y: 0, width: 640, height: 1040 });
  });
  it("tiles odd sizes without gaps", () => {
    const wa = { x: 1920, y: 0, width: 1365, height: 1019 };
    const l = zoneRect("left", wa);
    const r = zoneRect("right", wa);
    expect(l.x + l.width).toBe(r.x);
    expect(r.x + r.width).toBe(wa.x + wa.width);
    const b = zoneRect("bottomLeft", wa);
    expect(zoneRect("topLeft", wa).height + b.height).toBe(wa.height);
  });
  it("offers thirds in Snap Layouts only on wide displays", () => {
    expect(layoutsFor(full.workArea)).toEqual(["halves", "thirds", "quarters", "maximize"]);
    expect(layoutsFor(laptop.workArea)).toEqual(["halves", "quarters", "maximize"]);
    expect(SNAP_LAYOUTS.quarters).toEqual(["topLeft", "topRight", "bottomLeft", "bottomRight"]);
  });
});

describe("DSK-08: monitors with different scaling", () => {
  it("finds the display under a point, or the nearest one", () => {
    expect(displayAt({ x: 2500, y: 300 }, [full, laptop]).id).toBe(2);
    expect(displayAt({ x: 5000, y: 300 }, [full, laptop]).id).toBe(2);
    expect(displayAt({ x: -300, y: 300 }, [full, laptop]).id).toBe(1);
  });
  it("gives a window to the display it overlaps most, as the system does", () => {
    expect(displayFor({ x: 1600, y: 100, width: 800, height: 600 }, [full, laptop]).id).toBe(2);
    expect(displayFor({ x: 1300, y: 100, width: 800, height: 600 }, [full, laptop]).id).toBe(1);
  });
  it("converts between device-independent and physical pixels with each display's scale", () => {
    const r = { x: 2020, y: 100, width: 800, height: 600 };
    const p = toPhysical(r, laptop);
    expect(p).toEqual({ x: 2070, y: 150, width: 1200, height: 900 });
    expect(toDip(p, laptop)).toEqual(r);
    expect(toPhysical({ x: 10, y: 10, width: 800, height: 600 }, full)).toEqual({ x: 10, y: 10, width: 800, height: 600 });
  });
  it("keeps the window's size when it moves to a display with another scale, fitting it in the work area", () => {
    expect(fitToDisplay({ x: 2500, y: 100, width: 1200, height: 700 }, laptop)).toEqual({ x: 2427, y: 100, width: 1200, height: 700 });
    expect(fitToDisplay({ x: 2000, y: 50, width: 1800, height: 1200 }, laptop)).toEqual({ x: 1920, y: 0, width: 1707, height: 1019 });
  });
  it("re-measures only when the system changed the size by more than rounding", () => {
    expect(needsRemeasure({ width: 800, height: 600 }, { width: 801, height: 600 })).toBe(false);
    expect(needsRemeasure({ width: 800, height: 600 }, { width: 1200, height: 900 })).toBe(true);
  });
});

describe("DSK-03: remembered size and position, kept on a display that exists", () => {
  const min = { width: 480, height: 360 };
  it("keeps bounds that are on a display", () => {
    expect(clampToDisplays({ x: 100, y: 80, width: 1000, height: 700 }, [full], min)).toEqual({ x: 100, y: 80, width: 1000, height: 700 });
    expect(clampToDisplays({ x: 2100, y: 80, width: 1000, height: 700 }, [full, laptop], min)).toEqual({ x: 2100, y: 80, width: 1000, height: 700 });
  });
  it("moves a window from a display that's gone onto the nearest one", () => {
    expect(clampToDisplays({ x: 2100, y: 80, width: 1000, height: 700 }, [full], min)).toEqual({ x: 920, y: 80, width: 1000, height: 700 });
  });
  it("brings a title bar that's above the screen back where it can be grabbed", () => {
    expect(clampToDisplays({ x: 100, y: -500, width: 1000, height: 700 }, [full], min)).toEqual({ x: 100, y: 0, width: 1000, height: 700 });
  });
  it("shrinks a window bigger than the display, and never below the minimum", () => {
    expect(clampToDisplays({ x: -50, y: -50, width: 4000, height: 3000 }, [full], min)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
    expect(clampToDisplays({ x: 100, y: 100, width: 100, height: 100 }, [full], min)).toEqual({ x: 100, y: 100, width: 480, height: 360 });
  });
});

describe("DSK-08: Move and Size from the system menu, with the arrow keys", () => {
  const r = { x: 100, y: 100, width: 800, height: 600 };
  const min = { width: 480, height: 360 };
  it("moves by a step, or by one pixel with Ctrl", () => {
    expect(keyboardStep(r, "move", "Left", undefined, min).rect).toEqual({ ...r, x: 90 });
    expect(keyboardStep(r, "move", "Down", undefined, min, true).rect).toEqual({ ...r, y: 101 });
  });
  it("chooses an edge first, then resizes it, and turns it into a corner", () => {
    const a = keyboardStep(r, "size", "Right", undefined, min);
    expect(a).toEqual({ rect: r, edge: "e" });
    const b = keyboardStep(a.rect, "size", "Right", a.edge, min);
    expect(b).toEqual({ rect: { ...r, width: 810 }, edge: "e" });
    const c = keyboardStep(b.rect, "size", "Up", b.edge, min);
    expect(c).toEqual({ rect: b.rect, edge: "ne" });
    const d = keyboardStep(c.rect, "size", "Up", c.edge, min);
    expect(d.rect).toEqual({ x: 100, y: 90, width: 810, height: 610 });
    expect(keyboardStep(r, "size", "Left", "w", min).rect).toEqual({ x: 90, y: 100, width: 810, height: 600 });
  });
});

describe("DSK-01: the shadow margin around the visible window", () => {
  it("adds and removes the margin", () => {
    const c = { x: 100, y: 100, width: 800, height: 600 };
    expect(outerBounds(c, 16)).toEqual({ x: 84, y: 84, width: 832, height: 632 });
    expect(contentBounds(outerBounds(c, 16), 16)).toEqual(c);
    expect(outerBounds(c, 0)).toEqual(c);
  });
});

describe("DSK-01, D-141: the drawn shadow fits inside the shadow margin, in every theme", () => {
  it("measures a box shadow's reach past the window on each side: offset, spread, and 1.5 × blur (Skia's 3σ)", () => {
    expect(shadowExtent("0px 2px 8px 0px #00000066")).toEqual({ top: 10, right: 12, bottom: 14, left: 12 });
    expect(shadowExtent("0px 1px 2px 0px #0000000f, 0px 2px 8px 0px #00000014")).toEqual({ top: 10, right: 12, bottom: 14, left: 12 });
    expect(shadowExtent("none")).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(shadowExtent("inset 0 0 40px red")).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
  it("cmp.appRoot.windowShadow resolves, in the base and in every theme and mode, to a shadow that fades out before the native window's edge", () => {
    const css = readFileSync(fileURLToPath(new URL("../../tokens/dist/tokens.css", import.meta.url)), "utf8");
    const vars = new Map<string, string>();
    for (const m of css.matchAll(/(--fn-[\w-]+):\s*([^;]+);/g)) vars.set(`${m[1]}@${vars.size}`, m[2]!.trim());
    const value = (name: string) => [...vars].filter(([k]) => k.startsWith(`${name}@`)).map(([, v]) => v);
    const resolve = (v: string, depth = 0): string[] => {
      const ref = /^var\((--fn-[\w-]+)\)$/.exec(v);
      if (!ref || depth > 8) return [v];
      return value(ref[1]!).flatMap((x) => resolve(x, depth + 1));
    };
    const shadows = value("--fn-cmp-app-root-window-shadow").flatMap((v) => resolve(v));
    expect(shadows.length).toBeGreaterThan(2);
    for (const s of shadows) {
      const e = shadowExtent(s);
      expect(Math.max(e.top, e.right, e.bottom, e.left), s).toBeLessThanOrEqual(WINDOW_METRICS.margin);
    }
  });
});

describe("D-141: vertical maximize, as Windows does it", () => {
  const top: DisplayInfo = { id: 3, bounds: { x: 0, y: -1080, width: 1920, height: 1080 }, workArea: { x: 0, y: -1080, width: 1920, height: 1080 }, scaleFactor: 1 };
  it("starts when a top or bottom edge being resized reaches the work area's top, or its bottom (the taskbar)", () => {
    expect(verticalSnapAt("n", { x: 500, y: 0 }, full)).toBe(true);
    expect(verticalSnapAt("n", { x: 500, y: 7 }, full)).toBe(true);
    expect(verticalSnapAt("n", { x: 500, y: 8 }, full)).toBe(false);
    expect(verticalSnapAt("s", { x: 500, y: 1039 }, full)).toBe(true);
    expect(verticalSnapAt("s", { x: 500, y: 1060 }, full)).toBe(true); // on the taskbar
    expect(verticalSnapAt("s", { x: 500, y: 1031 }, full)).toBe(false);
  });
  it("only for the top and bottom edges, and only while the pointer is still on the window's display", () => {
    for (const edge of ["e", "w", "ne", "nw", "se", "sw"] as const) expect(verticalSnapAt(edge, { x: 500, y: 0 }, full), edge).toBe(false);
    // Past the top onto a display above: that's crossing to it, not the screen's edge.
    expect(verticalSnapAt("n", { x: 500, y: -5 }, full)).toBe(false);
    expect(verticalSnapAt("n", { x: 500, y: -1080 }, top)).toBe(true);
    expect(verticalSnapAt("s", { x: 500, y: 1080 }, full)).toBe(false);
  });
  it("respects a taskbar at the top", () => {
    const tb: DisplayInfo = { ...full, workArea: { x: 0, y: 48, width: 1920, height: 1032 } };
    expect(verticalSnapAt("n", { x: 500, y: 20 }, tb)).toBe(true);
    expect(verticalSnapAt("n", { x: 500, y: 54 }, tb)).toBe(true);
    expect(verticalSnapAt("n", { x: 500, y: 56 }, tb)).toBe(false);
  });
  it("fills the work area's height at the same x and width", () => {
    expect(verticalRect({ x: 300, y: 200, width: 900, height: 500 }, full.workArea)).toEqual({ x: 300, y: 0, width: 900, height: 1040 });
    expect(verticalRect({ x: 2000, y: 100, width: 800, height: 400 }, laptop.workArea)).toEqual({ x: 2000, y: 0, width: 800, height: 1019 });
  });
});
