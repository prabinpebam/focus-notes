import { describe, expect, it } from "vitest";
import { placeSelection } from "../src/behaviors/selection-placement.ts";

const viewport = { left: 20, right: 500, top: 40, bottom: 400 };
const size = { width: 300, height: 220 };
const metrics = { edge: 8, gap: 8 };
const rect = (top: number, bottom: number, left = 100, right = 250) => ({ top, bottom, left, right });

describe("Rewrite selection popover placement (D-265)", () => {
  it("prefers below and flips above when the whole popover fits there", () => {
    expect(placeSelection([rect(50, 70)], viewport, size, metrics)).toMatchObject({ y: 78, side: "below", offscreen: false });
    expect(placeSelection([rect(350, 370)], viewport, size, metrics)).toMatchObject({ y: 122, side: "above", offscreen: false });
  });
  it.each([rect(10, 45), rect(395, 430)])("clamps both axes while any part is visible", (fragment) => {
    const result = placeSelection([fragment], viewport, size, metrics);
    expect(result.offscreen).toBe(false);
    expect(result.x).toBeGreaterThanOrEqual(28);
    expect(result.x + result.width).toBeLessThanOrEqual(492);
    expect(result.y).toBeGreaterThanOrEqual(48);
    expect(result.y + result.height).toBeLessThanOrEqual(392);
  });
  it("keeps a viewport-spanning selection's popover in bounds instead of giving it zero room", () => {
    const result = placeSelection([rect(0, 100), rect(150, 200), rect(300, 450)], viewport, size, metrics);
    expect(result).toMatchObject({ offscreen: false, height: 220 });
    expect(result.y + result.height).toBeLessThanOrEqual(392);
  });
  it("measures visible fragments, not the whole selection bounding box", () => {
    expect(placeSelection([rect(0, 30), rect(410, 450)], viewport, size, metrics).offscreen).toBe(true);
  });
  it("is offscreen only when every fragment has left, and returns when one comes back", () => {
    expect(placeSelection([rect(-50, -20)], viewport, size, metrics).offscreen).toBe(true);
    expect(placeSelection([rect(401, 450)], viewport, size, metrics).offscreen).toBe(true);
    expect(placeSelection([rect(390, 420)], viewport, size, metrics).offscreen).toBe(false);
  });
  it("caps width and height in a small viewport", () => {
    const result = placeSelection([rect(150, 175, 400, 470)], { left: 0, top: 40, right: 480, bottom: 330 }, { width: 600, height: 800 }, metrics);
    expect(result).toMatchObject({ width: 464, height: 274, x: 8, y: 48, offscreen: false });
  });
  it("treats zero-sized fragments and fragments outside horizontally as invisible", () => {
    expect(placeSelection([rect(100, 100), rect(100, 120, 600, 700)], viewport, size, metrics).offscreen).toBe(true);
  });
});
