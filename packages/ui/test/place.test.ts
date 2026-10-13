/** EDT-12: the toolbar never covers the selection, flips below near the top band, and stays on screen. */
import { describe, expect, it } from "vitest";
import { place, type AnchorRect } from "../src/behaviors/anchors.ts";

const m = { gap: 8, edge: 12, topBand: 44 };
const view = { width: 1000, height: 800 };
const size = { width: 300, height: 52 };
const covers = (a: AnchorRect, p: { x: number; y: number }) =>
  p.y < a.bottom && p.y + size.height > a.top && p.x < a.right && p.x + size.width > a.left;

describe("placing the toolbar over a selection (EDT-12)", () => {
  it("centers above the first line with the gap", () => {
    const a = { top: 400, bottom: 424, left: 400, right: 600 };
    const p = place(a, size, view, m, "above");
    expect(p).toMatchObject({ side: "above", x: 350, y: 400 - 8 - 52, offscreen: false });
    expect(covers(a, p)).toBe(false);
  });
  it("flips below the last line when it would reach the top band", () => {
    const a = { top: 70, bottom: 140, left: 100, right: 200 };
    const p = place(a, size, view, m, "above");
    expect(p).toMatchObject({ side: "below", y: 148 });
    expect(covers(a, p)).toBe(false);
  });
  it("stays inside the window edges", () => {
    expect(place({ top: 400, bottom: 420, left: 0, right: 20 }, size, view, m, "above").x).toBe(12);
    expect(place({ top: 400, bottom: 420, left: 980, right: 1000 }, size, view, m, "above").x).toBe(1000 - 12 - 300);
  });
  it("below by preference (touch, the hover card), above when there's no room under it", () => {
    expect(place({ top: 400, bottom: 420, left: 400, right: 500 }, size, view, m, "below")).toMatchObject({ side: "below", y: 428 });
    expect(place({ top: 760, bottom: 780, left: 400, right: 500 }, size, view, m, "below")).toMatchObject({ side: "above" });
  });
  it("EDT-06: the slash menu lines up under its `/`, kept on screen, and flips above near the bottom", () => {
    const slash = { top: 400, bottom: 420, left: 300, right: 300 };
    expect(place(slash, size, view, m, "below", "start")).toMatchObject({ side: "below", x: 300, y: 428 });
    expect(place({ ...slash, left: 900, right: 900 }, size, view, m, "below", "start").x).toBe(1000 - 12 - 300);
    expect(place({ top: 760, bottom: 780, left: 300, right: 300 }, size, view, m, "below", "start")).toMatchObject({ side: "above", x: 300 });
  });
  it("hides while the anchor is scrolled out of view", () => {
    expect(place({ top: 0, bottom: 30, left: 0, right: 10 }, size, view, m, "above").offscreen).toBe(true);
    expect(place({ top: 900, bottom: 920, left: 0, right: 10 }, size, view, m, "above").offscreen).toBe(true);
  });
});
