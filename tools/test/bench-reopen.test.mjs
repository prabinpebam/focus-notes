import { describe, expect, it } from "vitest";
import { reopenSummary } from "../bench/large.mjs";

describe("reopenSummary", () => {
  it("preserves sample order and reports median, nearest-rank p75 and full spread", () => {
    const samples = [83.14, 33.06, 68.74, 44.12, 76.94, 40.04, 90.01];
    expect(reopenSummary(samples)).toEqual({
      samplesMs: [83.1, 33.1, 68.7, 44.1, 76.9, 40, 90],
      medianMs: 68.7, p75Ms: 83.1, minMs: 33.1, maxMs: 90, spreadMs: 57,
    });
    expect(samples).toEqual([83.14, 33.06, 68.74, 44.12, 76.94, 40.04, 90.01]);
  });

  it("keeps the existing upper-median definition and supports one sample", () => {
    expect(reopenSummary([1, 4, 2, 3]).medianMs).toBe(3);
    expect(reopenSummary([0])).toEqual({ samplesMs: [0], medianMs: 0, p75Ms: 0, minMs: 0, maxMs: 0, spreadMs: 0 });
  });

  it.each([[], [NaN], [Infinity], [-1]])("rejects invalid samples: %j", (...samples) => {
    expect(() => reopenSummary(samples)).toThrow("finite, non-negative samples");
  });
});
