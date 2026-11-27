/** D-111, anchored tooltips: next to the control they name, centered on it, and inside the window. */
import { describe, expect, it } from "vitest";
import { placeTooltip, tooltipWidthLimit } from "../src/primitives/Tooltip/place.ts";

const win = { left: 16, top: 16, right: 1116, bottom: 796 };
const m = { gap: 8, edge: 8 };
const size = { width: 120, height: 26 };
const control = (left: number, top: number, w = 32, h = 32) => ({ left, top, right: left + w, bottom: top + h });

describe("placing a tooltip (D-111)", () => {
  it("sits below its control, centered on it, the gap away", () => {
    expect(placeTooltip(control(500, 100), size, win, m, "bottom")).toEqual({ x: 456, y: 140, side: "bottom" });
  });
  it("goes above near the window's bottom edge", () => {
    expect(placeTooltip(control(500, 760), size, win, m, "bottom")).toEqual({ x: 456, y: 760 - 8 - 26, side: "top" });
  });
  it("prefers above when asked, and goes below near the top edge", () => {
    expect(placeTooltip(control(500, 400), size, win, m, "top").side).toBe("top");
    expect(placeTooltip(control(500, 20), size, win, m, "top")).toMatchObject({ side: "bottom", y: 60 });
  });
  it("is kept inside the window's sides, still next to its control", () => {
    expect(placeTooltip(control(1080, 30), size, win, m, "bottom")).toMatchObject({ x: 1116 - 8 - 120, y: 70 });
    expect(placeTooltip(control(18, 30), size, win, m, "bottom").x).toBe(24);
  });
  it("sits beside its control for start and end, centered on it", () => {
    expect(placeTooltip(control(500, 100), size, win, m, "end")).toEqual({ x: 540, y: 103, side: "end" });
    expect(placeTooltip(control(500, 100), size, win, m, "start")).toEqual({ x: 372, y: 103, side: "start" });
    // No room at the start: the end.
    expect(placeTooltip(control(30, 100), size, win, m, "start").side).toBe("end");
  });
  it("D-436: a 120-character address wraps inside the window and is shifted in from either edge", () => {
    const url = `Published · live at https://ada.github.io/${"a-very-long-note-name-".repeat(4)}n/`.padEnd(120, "x").slice(0, 120);
    expect(url).toHaveLength(120);
    const narrow = { left: 0, top: 0, right: 400, bottom: 800 };
    // About 7 px a character at the tooltip's size, capped at the token (320 px) and the window less its edges.
    const natural = url.length * 7, line = 20, padding = 16;
    const width = Math.min(natural, 320, tooltipWidthLimit(narrow, m.edge));
    const wrapped = { width: width + padding, height: Math.ceil(natural / width) * line };
    expect(tooltipWidthLimit(narrow, m.edge)).toBe(384);
    for (const at of [control(380, 100, 16, 16), control(2, 100, 16, 16), control(190, 100, 16, 16)]) {
      const placed = placeTooltip(at, wrapped, narrow, m, "bottom");
      expect(placed.x).toBeGreaterThanOrEqual(narrow.left + m.edge);
      expect(placed.x + wrapped.width).toBeLessThanOrEqual(narrow.right - m.edge);
    }
    // A window narrower than the token: the window's limit wins, so it still fits.
    const tiny = { left: 0, top: 0, right: 240, bottom: 800 };
    const w = Math.min(natural, 320, tooltipWidthLimit(tiny, m.edge));
    expect(w).toBe(224);
    const p = placeTooltip(control(220, 100, 16, 16), { width: w, height: Math.ceil(natural / w) * line }, tiny, m, "bottom");
    expect(p.x).toBe(m.edge);
    expect(p.x + w).toBeLessThanOrEqual(tiny.right - m.edge);
  });
});
