// When the bench's memory reading counts (PRF-04, D-120): after use, the renderer collects its
// garbage and hands memory back over 15-20 s, so one early sample lands before or after that at
// random. A reading counts once a window of samples agrees.

/**
 * The median of the last `window` samples once they all lie within `tolerance` (a fraction) of it,
 * or undefined while memory is still moving.
 */
export function settledMedian(samples, { window = 8, tolerance = 0.02 } = {}) {
  if (samples.length < window) return undefined;
  const last = samples.slice(-window);
  const sorted = [...last].sort((a, b) => a - b);
  const median = sorted[Math.floor(window / 2)];
  return sorted[window - 1] - sorted[0] <= tolerance * median ? median : undefined;
}
