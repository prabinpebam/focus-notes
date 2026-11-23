// DSY-11: the gate reads the median of separate renderer runs, and bench.json keeps every sample.
import { describe, expect, it } from "vitest";
import { rendererSummary } from "../bench/renderer.mjs";

describe("rendererSummary", () => {
  it("gates on the median, so one noisy process on a busy runner doesn't decide the result", () => {
    expect(rendererSummary([0.9, 26.8, 3.7, 14.5, 7]).measures).toEqual({ "DSY-11.rendererOverheadPct": 7 });
  });

  it("averages the middle pair for an even number of runs", () => {
    expect(rendererSummary([3.9, 5.6, 4.2, 30]).measures["DSY-11.rendererOverheadPct"]).toBe(4.9);
  });

  it("keeps every sample in run order for the report", () => {
    const runs = [4.1, 26.8, 3.9];
    const { samples } = rendererSummary(runs);
    expect(samples).toEqual({ runs: 3, overheadPct: [4.1, 26.8, 3.9] });
    runs.push(1);
    expect(samples.overheadPct).toHaveLength(3);
  });

  it("refuses a run without samples or with a missing result", () => {
    expect(() => rendererSummary([])).toThrow();
    expect(() => rendererSummary([4, Number.NaN])).toThrow();
  });
});
