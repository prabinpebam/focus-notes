/** D-161: the note's text clear of a pinned Files sheet, narrower down to a minimum, else under it as before. */
import { describe, expect, it } from "vitest";
import { clearance, cornerClearance, pinnedSheet } from "../src/behaviors/pinned-sheet.ts";

// A 1200 px window whose scroller starts at 16 (the frame's margin); the sheet ends at 16 + 16 + 320.
const base = { left: 16, width: 1168, gap: 16, gutter: 48, minText: 360 };

describe("corner controls beside pinned Files", () => {
  it("stays in the corner without a sheet, and moves a gap past its edge when pinned", () => {
    expect(cornerClearance(undefined, 16, 1168, 32, 24)).toBe(24);
    expect(cornerClearance(352, 16, 1168, 32, 24)).toBe(360);
  });
  it("uses the above-sheet fallback rather than hiding under Files or leaving a narrow viewport", () => {
    expect(cornerClearance(352, 16, 360, 32, 24)).toBeUndefined();
  });
});

describe("clearance (D-161)", () => {
  it("nothing pinned: the column stays centred", () => {
    expect(clearance({ ...base, edge: undefined })).toBe(0);
  });
  it("puts the text a gap after the sheet: the column's box starts gutter before it", () => {
    const edge = 352;
    const clear = clearance({ ...base, edge });
    expect(clear).toBe(352 + 16 - 48 - 16);
    // The text's left edge, in the window: the scroller's left, the clearance, the gutter.
    expect(base.left + clear + base.gutter).toBe(edge + base.gap);
  });
  it("a narrower window narrows the text down to the minimum, then lets the sheet float over it", () => {
    // 352 + 16 - 48 - 16 = 304 clear; text = width - 304 - 96 must be ≥ 360: width ≥ 760.
    expect(clearance({ ...base, edge: 352, width: 760 })).toBe(304);
    expect(clearance({ ...base, edge: 352, width: 759 })).toBe(0);
  });
  it("a sheet that already ends before the text needs nothing", () => {
    expect(clearance({ ...base, edge: 20 })).toBe(0);
  });
});

describe("the pinned sheet's edge", () => {
  it("tells listeners when it changes, once", () => {
    const seen: (number | undefined)[] = [];
    const off = pinnedSheet.subscribe((e) => seen.push(e));
    pinnedSheet.set(300);
    pinnedSheet.set(300);
    pinnedSheet.set(undefined);
    off();
    pinnedSheet.set(10);
    pinnedSheet.set(undefined);
    expect(seen).toEqual([300, undefined]);
  });
});
