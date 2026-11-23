/**
 * PRF-02: start times are the median of fresh-profile launches, gated against the same budget.
 * Every sample is kept for bench.json, so one slow launch on a shared runner can be told apart
 * from a real regression of the median.
 */
export function startSummary(cold, warm) {
  if (!cold.length || cold.length !== warm.length) throw new Error("PRF-02 needs one warm launch per cold launch");
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return {
    measures: { "PRF-02.coldReadyMs": median(cold), "PRF-02.warmReadyMs": median(warm) },
    samples: { runs: cold.length, coldReadyMs: [...cold], warmReadyMs: [...warm] },
  };
}
