/**
 * The reading zone's auto-scroll (D-156): scrollTop animates over motion.autoScroll with
 * easing.inOut, frame by frame (CSS smooth-scroll can't be retargeted predictably). A new target
 * while one runs continues from where the note is, at the speed it's moving, and heads for the new
 * target with a cubic Hermite curve that stops there. It finishes no later than one frame after the
 * running scroll would have (and within the duration), so held keys follow the caret continuously
 * instead of pushing the end out by a fresh duration each time; scrolls never queue or stack. A
 * duration of 0 (reduced motion) is instant. Nothing runs at rest (PRF-04): a frame is requested only
 * while an animation is in flight.
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
/** One frame at 60 Hz, in ms: how far a retarget may move the end out, and the shortest segment. */
export const FRAME = 1000 / 60;
/** While a held key repeats, each step finishes within three frames (D-156: held keys follow continuously). */
export const FOLLOW = 3 * FRAME;
/** How a scroll moves: animated, at once, or following a held key. */
export type ScrollHow = "animate" | "instant" | "follow";

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
   * Scrolls to `dest`: from rest over the duration with the in-out curve; while one runs, from where
   * the note is at its current speed (see above). At once when the duration is 0, the move is a
   * nudge, or "instant" (a move the person's own input didn't cause, such as opening a note).
   * "follow" (a held key repeating) finishes within FOLLOW ms, so the caret never outruns the scroll.
   */
  to(dest: number, how?: ScrollHow): void;
  /** Stops where the note is now (the person scrolled). */
  cancel(): void;
  /** Ends at once on the target (focus left the note: whatever opens anchors to where the line will be). */
  finish(): void;
  /** Where the running animation is heading, or null at rest. */
  readonly dest: number | null;
  /** When the running animation ends on the clock, or null at rest. */
  readonly end: number | null;
}

/** One stretch of the scroll: from p0 (moving at v0 px/ms) at t0 to p1 (at rest) at t1. */
interface Segment { p0: number; v0: number; p1: number; t0: number; t1: number; eased: boolean }

/** Where a segment is at time t: the in-out curve from rest, or a cubic Hermite from a moving start. */
export function segmentAt(seg: Segment, t: number, easing: (s: number) => number): number {
  const span = seg.t1 - seg.t0;
  const s = span > 0 ? Math.min(1, Math.max(0, (t - seg.t0) / span)) : 1;
  if (seg.eased) return seg.p0 + (seg.p1 - seg.p0) * easing(s);
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * seg.p0 + (s3 - 2 * s2 + s) * span * seg.v0 + (-2 * s3 + 3 * s2) * seg.p1;
}

/**
 * A segment from a moving start that never overshoots: a cubic Hermite with zero end speed is
 * monotonic when the start speed times the span is between 0 and 3 times the distance, so the speed
 * carried over is held to that (a start moving away from the target starts from rest).
 */
export function hermite(p0: number, v0: number, p1: number, t0: number, t1: number): Segment {
  const span = t1 - t0;
  const d = p1 - p0;
  const ratio = d !== 0 && span > 0 ? Math.min(3, Math.max(0, (v0 * span) / d)) : 0;
  return { p0, v0: span > 0 ? (ratio * d) / span : 0, p1, t0, t1, eased: false };
}

export function createScrollAnimator(
  scroll: { get(): number; set(v: number): void },
  opts: {
    duration: () => number;
    easing: (t: number) => number;
    clock?: FrameClock;
    /** Called when the note was moved past the target under it, so the caller can check again (the caret may be further). */
    onOvertaken?: () => void;
  },
): ScrollAnimator {
  const clock = opts.clock ?? browserClock;
  let frame = 0;
  let seg: Segment | null = null;

  /** The last position written, to tell when something else (the browser's caret reveal) moved the note. */
  let last = NaN;
  const write = (v: number) => {
    last = v;
    scroll.set(v);
  };
  const at = (t: number) => segmentAt(seg!, t, opts.easing);
  const step = () => {
    frame = 0;
    if (!seg) return;
    const now = clock.now();
    const actual = scroll.get();
    if (now >= seg.t1) {
      // Its time is up: end on the target (or where the browser clamps it), never a frame later.
      write(seg.p1);
      seg = null;
      return;
    }
    if (Math.abs(actual - last) > 1) {
      // Moved under it (the browser revealing the caret): carry on from there, never jump back. If it
      // was moved past the target, the scroll is done there.
      const v0 = (at(now + 0.5) - at(now - 0.5)) / 1;
      if (Math.sign(seg.p1 - actual) !== Math.sign(seg.p1 - seg.p0)) {
        seg = null;
        last = actual;
        opts.onOvertaken?.();
        return;
      }
      // Never past its own end: a target the browser clamps away can't keep it running.
      seg = hermite(actual, v0, seg.p1, now, seg.t1);
    }
    write(at(now));
    if (now < seg.t1) frame = clock.request(step);
    else seg = null;
  };
  const cancel = () => {
    if (frame) clock.cancel(frame);
    frame = 0;
    seg = null;
  };
  return {
    to(next, how = "animate") {
      if (how !== "instant" && seg && Math.abs(next - seg.p1) < 0.5) return; // already heading there
      const duration = how === "instant" ? 0 : opts.duration();
      const from = scroll.get();
      if (!(duration > 0) || (!seg && Math.abs(next - from) < NUDGE)) {
        // Reduced motion, a move the person didn't cause, or a nudge of a few px (or a target past the
        // end the browser clamps away): written at once, never frame after frame while the person types.
        cancel();
        write(next);
        return;
      }
      const now = clock.now();
      if (seg) {
        // Retarget: keep the current speed, and end no later than a frame after the running scroll would have.
        const v0 = (at(now + 0.5) - at(now - 0.5)) / 1;
        const t1 = Math.max(now + FRAME, Math.min(seg.t1 + FRAME, now + (how === "follow" ? Math.min(FOLLOW, duration) : duration)));
        seg = hermite(from, now < seg.t1 ? v0 : 0, next, now, t1);
      } else if (how === "follow") {
        seg = { p0: from, v0: 0, p1: next, t0: now, t1: now + Math.min(FOLLOW, duration), eased: true };
      } else {
        seg = { p0: from, v0: 0, p1: next, t0: now, t1: now + duration, eased: true };
      }
      last = from;
      if (!frame) frame = clock.request(step);
    },
    cancel,
    finish() {
      if (!seg) return;
      const dest = seg.p1;
      cancel();
      write(dest);
    },
    get dest() {
      return seg ? seg.p1 : null;
    },
    get end() {
      return seg ? seg.t1 : null;
    },
  };
}