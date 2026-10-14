/** D-111, floating side sheets: equal insets, vertically centered, the trigger and the window's controls kept clear. */
import { describe, expect, it } from "vitest";
import { placeSheet } from "../src/layouts/Sheet/place.ts";

const m = { base: 16, clearance: 8, width: 320, minWidth: 200 };
const trigger = (winLeft: number, winWidth: number) => ({ left: winLeft + winWidth / 2 - 15, right: winLeft + winWidth / 2 + 15, top: 56, bottom: 86 });
const controls = (winRight: number) => ({ left: winRight - 138, right: winRight, top: 22, bottom: 54 });

describe("placing a side sheet (D-111)", () => {
  it("has the token's inset on its side, top, and bottom when nothing is in the way", () => {
    const win = { left: 16, top: 16, right: 1116, bottom: 796 };
    expect(placeSheet(win, [trigger(16, 1100), controls(1116)], "start", m)).toEqual({ inset: 16, width: 320 });
  });
  it("narrows to keep the trigger clear when it can stay usable, keeping its insets", () => {
    const win = { left: 16, top: 16, right: 496, bottom: 376 };
    // The trigger's left edge is at 16 + 240 - 15 = 241: the sheet ends the clearance before it.
    expect(placeSheet(win, [trigger(16, 480), controls(496)], "start", m)).toEqual({ inset: 16, width: 241 - 8 - 32 });
  });
  it("moves its inset past the window's controls in its corner, the same on all three sides", () => {
    const win = { left: 16, top: 16, right: 1116, bottom: 796 };
    expect(placeSheet(win, [trigger(16, 1100), controls(1116)], "end", { ...m, width: 380 })).toEqual({ inset: 54 - 16 + 8, width: 380 });
  });
  it("moves below the trigger when narrowing would make it too narrow", () => {
    const win = { left: 16, top: 16, right: 496, bottom: 376 };
    const p = placeSheet(win, [trigger(16, 480), controls(496)], "end", { ...m, width: 380 });
    expect(p.inset).toBe(86 - 16 + 8);
    expect(p.width).toBe(480 - 2 * p.inset);
  });
});
