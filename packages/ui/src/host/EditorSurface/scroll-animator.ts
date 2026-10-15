/**
 * The reading zone's auto-scroll (D-156): scrollTop animates over motion.autoScroll with
 * easing.inOut, frame by frame (CSS smooth-scroll can't be retargeted predictably). A new target
 * while one runs starts from wherever the note is and heads for the new target over a fresh
 * duration: scrolls never queue or stack. A duration of 0 (reduced motion) is instant. Nothing runs
 * at rest (PRF-04): a frame is requested only while an animation is in flight.
 */

/** A CSS cubic Bézier timing function, cubic-bezier(x1, y1, x2, y2), as progress → eased progress. */
export function cubicBezier(curve: readonly number[]): (t: number) => number {
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = curve;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton's method, then bisection if the slope is too flat to trust.
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-6) return y(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;
    s = t;
    for (let i = 0; i < 40; i++) {
      const v = x(s);
      if (Math.abs(v - t) < 1e-6) break;
      if (v < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}

/** Below this distance in px a scroll is written at once, not animated. */
export const NUDGE = 4;

export interface FrameClock {
  now(): number;
  request(cb: () => void): number;
  cancel(id: number): void;
}

const browserClock: FrameClock = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(() => cb()),
  cancel: (id) => cancelAnimationFrame(id),
};

export interface ScrollAnimator {
  /**
   * Scrolls to `dest`: from the current position, over a fresh duration (or at once when it's 0, or
   * when `instant`: a move the person's own input didn't cause, such as opening a note).
   */
  to(dest: number, instant?: boolean): void;
  /** Stops where the note is now (the person scrolled). */
  cancel(): void;
  /** Where the running animation is heading, or null at rest. */
  readonly dest: number | null;
  /** Whether a scroll position is one the animator wrote (so a scroll event there isn't the person's). */
  wrote(pos: number): boolean;
}

export function createScrollAnimator(
  scroll: { get(): number; set(v: number): void },
  opts: { duration: () => number; easing: (t: number) => number; clock?: FrameClock },
): ScrollAnimator {
  const clock = opts.clock ?? browserClock;
  let frame = 0;
  let from = 0;
  let dest: number | null = null;
  let start = 0;
  let span = 0;
  let last = NaN;

  const write = (v: number) => {
    last = v;
    scroll.set(v);
  };
  const step = () => {
    frame = 0;
    if (dest === null) return;
    const p = Math.min(1, (clock.now() - start) / span);
    write(from + (dest - from) * opts.easing(p));
    if (p < 1) frame = clock.request(step);
    else dest = null;
  };
  const cancel = () => {
    if (frame) clock.cancel(frame);
    frame = 0;
    dest = null;
  };
  return {
    to(next, instant = false) {
      if (!instant && dest !== null && Math.abs(next - dest) < 0.5) return; // already heading there
      const duration = instant ? 0 : opts.duration();
      cancel();
      if (!(duration > 0)) {
        write(next);
        return;
      }
      from = scroll.get();
      // A nudge of a few px (or a target past the end the browser clamps away) is written at once: an
      // animation there would only write the same place frame after frame while the person types.
      if (Math.abs(next - from) < NUDGE) {
        write(next);
        return;
      }
      dest = next;
      span = duration;
      start = clock.now();
      frame = clock.request(step);
    },
    cancel,
    get dest() {
      return dest;
    },
    wrote: (pos) => Math.abs(pos - last) <= 1,
  };
}
