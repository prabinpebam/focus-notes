/** D-111, anchored tooltips: next to the control they name, centered on it, and inside the window. */
import { describe, expect, it } from "vitest";
import { placeTooltip } from "../src/primitives/Tooltip/place.ts";

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
});
