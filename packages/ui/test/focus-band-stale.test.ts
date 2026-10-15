/** FOC-02, D-156: which changes to the column mark the band stale as a resize (written live, no glide). */
import { describe, expect, it } from "vitest";
import { isResize } from "../src/host/EditorSurface/focus-band.ts";

const box = { width: 680, height: 4000, top: 217 };

describe("marking the focus band stale on a resize (FOC-02, D-156)", () => {
  it("a height-only window change moves the 25vh reading top: a resize", () => {
    expect(isResize(box, { ...box, top: 142 })).toBe(true);
    expect(isResize(box, { ...box, top: 142, height: 3925 })).toBe(true);
  });
  it("a width-only change rewraps the lines: a resize", () => {
    expect(isResize(box, { ...box, width: 520 })).toBe(true);
    expect(isResize(box, { ...box, width: 520, height: 4600 })).toBe(true);
  });
  it("both together: a resize", () => {
    expect(isResize(box, { width: 600, height: 4300, top: 150 })).toBe(true);
  });
  it("only the height, from typing that adds or removes a row, isn't: the band glides", () => {
    expect(isResize(box, { ...box, height: 4024 })).toBe(false);
    expect(isResize(box, { ...box, height: 3976 })).toBe(false);
  });
  it("the first report has nothing to compare with", () => {
    expect(isResize(undefined, box)).toBe(false);
  });
  it("sub-pixel noise isn't a resize", () => {
    expect(isResize(box, { ...box, width: 680.001, top: 217.001 })).toBe(false);
  });
});
