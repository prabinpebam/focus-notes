// PRF-02: the gate reads the median of fresh launches, and bench.json keeps every sample.
import { describe, expect, it } from "vitest";
import { startSummary } from "../bench/start.mjs";

describe("startSummary", () => {
  it("gates on the median, so one slow cold launch on a busy runner doesn't decide the result", () => {
    const { measures } = startSummary([879, 5259, 714], [640, 702, 655]);
    expect(measures).toEqual({ "PRF-02.coldReadyMs": 879, "PRF-02.warmReadyMs": 655 });
  });

  it("keeps every sample in launch order for the report", () => {
    const cold = [879, 5259, 714], warm = [640, 702, 655];
    const { samples } = startSummary(cold, warm);
    expect(samples).toEqual({ runs: 3, coldReadyMs: [879, 5259, 714], warmReadyMs: [640, 702, 655] });
    cold.push(1);
    expect(samples.coldReadyMs).toHaveLength(3);
  });

  it("refuses a run without paired launches", () => {
    expect(() => startSummary([], [])).toThrow();
    expect(() => startSummary([800], [])).toThrow();
  });
});
