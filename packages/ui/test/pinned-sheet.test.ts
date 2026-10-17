/** D-161, D-187: corner controls beside docked Files, and which panels dock as the window narrows. */
import { describe, expect, it } from "vitest";
import { allocateDocks, cornerClearance, dockMaxWidth, pinnedSheet } from "../src/behaviors/pinned-sheet.ts";

describe("corner controls beside pinned Files", () => {
  it("stays in the corner without a sheet, and moves a gap past its edge when pinned", () => {
    expect(cornerClearance(undefined, 16, 1168, 32, 24)).toBe(24);
    expect(cornerClearance(352, 16, 1168, 32, 24)).toBe(360);
  });
  it("uses the above-sheet fallback rather than hiding under Files or leaving a narrow viewport", () => {
    expect(cornerClearance(352, 16, 360, 32, 24)).toBeUndefined();
  });
});

describe("docking (D-187)", () => {
  const ask = { files: 280, outline: 280, contentMin: 400 };
  it("docks both while the window holds them and the note's narrowest area", () => {
    expect(allocateDocks({ ...ask, width: 960 })).toEqual({ files: true, outline: true });
    expect(allocateDocks({ ...ask, width: 1400 })).toEqual({ files: true, outline: true });
  });
  it("narrower, Files undocks first, then the contents", () => {
    expect(allocateDocks({ ...ask, width: 959 })).toEqual({ files: false, outline: true });
    expect(allocateDocks({ ...ask, width: 680 })).toEqual({ files: false, outline: true });
    expect(allocateDocks({ ...ask, width: 679 })).toEqual({ files: false, outline: false });
  });
  it("Files never stays where the contents asking to dock couldn't, even when it's the narrower", () => {
    expect(allocateDocks({ files: 200, outline: 360, contentMin: 400, width: 700 })).toEqual({ files: false, outline: false });
  });
  it("a panel that doesn't ask takes no room", () => {
    expect(allocateDocks({ files: 280, contentMin: 400, width: 680 })).toEqual({ files: true, outline: false });
    expect(allocateDocks({ outline: 280, contentMin: 400, width: 680 })).toEqual({ files: false, outline: true });
    expect(allocateDocks({ contentMin: 400, width: 300 })).toEqual({ files: false, outline: false });
  });
  it("resizing stops where the note keeps its narrowest area, and never below the minimum", () => {
    expect(dockMaxWidth({ window: 1200, other: 280, contentMin: 400, min: 200, max: 480 })).toBe(480);
    expect(dockMaxWidth({ window: 1000, other: 280, contentMin: 400, min: 200, max: 480 })).toBe(320);
    expect(dockMaxWidth({ window: 700, other: 280, contentMin: 400, min: 200, max: 480 })).toBe(200);
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
