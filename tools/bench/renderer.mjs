/**
 * DSY-11: the renderer's overhead is the median of several separate test processes, gated against
 * the same budget. Each process already takes the median of many interleaved pairs, but one
 * process's JIT and the runner's load can still swing it (0.9% to 26.8% on unchanged code on CI).
 * Every sample is kept for bench.json, so an outlier stays visible without deciding the gate.
 */
export function rendererSummary(overheadPct) {
  if (!overheadPct.length) throw new Error("DSY-11 needs at least one renderer sample");
  if (overheadPct.some((x) => !Number.isFinite(x))) throw new Error("DSY-11 samples must be numbers");
  const sorted = [...overheadPct].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  return {
    measures: { "DSY-11.rendererOverheadPct": median },
    samples: { runs: overheadPct.length, overheadPct: [...overheadPct] },
  };
}
