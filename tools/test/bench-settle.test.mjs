// PRF-04: memory is read once the app has settled after use, never mid-collection (D-120).
import { describe, expect, it } from "vitest";
import { settledMedian } from "../bench/settle.mjs";

// Resident MB every few seconds after typing, as measured on Windows (D-120): the renderer's
// collection after use takes 15-20 s, with a plateau on the way down.
const afterTyping = [537, 408, 391, 391, 391, 297, 297, 285, 284, 285, 284, 286, 284, 285, 284, 284];

describe("settledMedian", () => {
  it("waits while memory is still falling after use", () => {
    expect(settledMedian(afterTyping.slice(0, 1))).toBeUndefined();
    expect(settledMedian(afterTyping.slice(0, 7))).toBeUndefined();
  });

  it("doesn't take a short plateau on the way down for the settled value", () => {
    expect(settledMedian([537, 408, 391, 391, 391, 391])).toBeUndefined();
    expect(settledMedian([408, 391, 391, 391, 391, 391, 297])).toBeUndefined();
  });

  it("is the median of the last window once every sample in it is within the tolerance", () => {
    expect(settledMedian(afterTyping.slice(0, 14))).toBeUndefined();
    expect(settledMedian(afterTyping)).toBe(284);
    expect(settledMedian([300, 300, 300, 300, 300, 300, 300, 306], { window: 8, tolerance: 0.02 })).toBe(300);
    expect(settledMedian([300, 300, 300, 300, 300, 300, 300, 307], { window: 8, tolerance: 0.02 })).toBeUndefined();
  });
});
