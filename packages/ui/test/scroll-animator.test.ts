/** D-156: the reading zone's auto-scroll animates over motion.autoScroll with easing.inOut, retargets from where it is, and never queues. */
import { describe, expect, it } from "vitest";
import { autoScroll } from "@focus-notes/tokens";
import { createScrollAnimator, cubicBezier, type FrameClock } from "../src/host/EditorSurface/scroll-animator.ts";

/** A clock whose frames run only when the test advances it, 16 ms at a time. */
function fakeClock() {
  let t = 0;
  let next = 1;
  const queue = new Map<number, () => void>();
  const clock: FrameClock = {
    now: () => t,
    request: (cb) => (queue.set(next, cb), next++),
    cancel: (id) => void queue.delete(id),
  };
  const tick = (ms = 16) => {
    t += ms;
    const due = [...queue.values()];
    queue.clear();
    for (const cb of due) cb();
  };
  return { clock, tick, pending: () => queue.size };
}

function setup(duration: number = autoScroll.duration) {
  const c = fakeClock();
  let pos = 0;
  const samples: number[] = [];
  const a = createScrollAnimator(
    { get: () => pos, set: (v) => { pos = v; samples.push(v); } },
    { duration: () => duration, easing: cubicBezier(autoScroll.easing), clock: c.clock },
  );
  return { ...c, a, samples, pos: () => pos, setPos: (v: number) => (pos = v) };
}

describe("the in-out curve (easing.inOut)", () => {
  it("is the token's cubic-bezier(0.42, 0, 0.58, 1)", () => {
    expect(autoScroll.easing).toEqual([0.42, 0, 0.58, 1]);
    expect(autoScroll.duration).toBe(200);
  });
  it("eases both ends and is symmetric about the middle", () => {
    const e = cubicBezier(autoScroll.easing);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeCloseTo(0.5, 4);
    // Slow at the start and the end: a tenth of the time covers well under a tenth of the way.
    expect(e(0.1)).toBeLessThan(0.05);
    expect(e(0.9)).toBeGreaterThan(0.95);
    for (const t of [0.1, 0.25, 0.4]) expect(e(t) + e(1 - t)).toBeCloseTo(1, 4);
    // Known values of this curve (as browsers compute ease-in-out).
    expect(e(0.25)).toBeCloseTo(0.1291, 3);
    expect(e(0.75)).toBeCloseTo(0.8709, 3);
  });
  it("only rises", () => {
    const e = cubicBezier(autoScroll.easing);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = e(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("the auto-scroll (D-156)", () => {
  it("animates to the target over 200 ms, never jumping", () => {
    const s = setup();
    s.a.to(300);
    expect(s.pos()).toBe(0); // nothing moves until the next frame
    for (let i = 0; i < 12; i++) s.tick();
    expect(s.pos()).toBeLessThan(300);
    s.tick(); // 208 ms
    expect(s.pos()).toBe(300);
    expect(s.a.dest).toBeNull();
    expect(s.pending()).toBe(0); // nothing at rest (PRF-04)
    // Monotonic, and no frame moves more than the curve's steepest slope allows (about 1.74x the average).
    const steps = s.samples.map((v, i) => v - (s.samples[i - 1] ?? 0));
    for (const d of steps) expect(d).toBeGreaterThanOrEqual(0);
    expect(Math.max(...steps)).toBeLessThan((300 / 200) * 16 * 1.8);
  });

  it("a new target mid-way starts from where the note is, over a fresh 200 ms", () => {
    const s = setup();
    s.a.to(300);
    for (let i = 0; i < 6; i++) s.tick(); // 96 ms
    const mid = s.pos();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(300);
    s.a.to(500);
    expect(s.a.dest).toBe(500);
    s.tick();
    // It continues from mid (no jump back to 0 or forward to 300).
    expect(s.pos()).toBeGreaterThanOrEqual(mid);
    expect(s.pos() - mid).toBeLessThan(20);
    for (let i = 0; i < 11; i++) s.tick(); // 192 ms after the retarget: not there yet
    expect(s.pos()).toBeLessThan(500);
    s.tick();
    expect(s.pos()).toBe(500);
    expect(s.pending()).toBe(0);
  });

  it("never queues: the same target again doesn't restart the clock", () => {
    const s = setup();
    s.a.to(300);
    for (let i = 0; i < 6; i++) s.tick();
    s.a.to(300.2);
    for (let i = 0; i < 7; i++) s.tick(); // 208 ms since the first call
    expect(s.pos()).toBe(300);
  });

  it("the person's scroll cancels it where it is", () => {
    const s = setup();
    s.a.to(300);
    for (let i = 0; i < 4; i++) s.tick();
    const at = s.pos();
    expect(s.a.wrote(at)).toBe(true);
    expect(s.a.wrote(at + 40)).toBe(false);
    s.a.cancel();
    s.tick();
    s.tick();
    expect(s.pos()).toBe(at);
    expect(s.a.dest).toBeNull();
    expect(s.pending()).toBe(0);
  });

  it("with reduced motion (duration 0) it's instant", () => {
    const s = setup(0);
    s.a.to(300);
    expect(s.pos()).toBe(300);
    expect(s.pending()).toBe(0);
  });

  it("a move the person's input didn't cause (opening a note) is placed at once, stopping any scroll", () => {
    const s = setup();
    s.a.to(300);
    s.tick();
    s.a.to(5000, true);
    expect(s.pos()).toBe(5000);
    expect(s.a.dest).toBeNull();
    expect(s.pending()).toBe(0);
  });

  it("a nudge of a few px, or a target past the end the browser clamps away, needs no frames (PRF-01)", () => {
    const s = setup();
    // The browser stops at 241299 though the target is 241301: written once, not animated every keystroke.
    let pos = 241_299;
    const writes: number[] = [];
    const a = createScrollAnimator(
      { get: () => pos, set: (v) => { writes.push(v); pos = Math.min(v, 241_299); } },
      { duration: () => autoScroll.duration, easing: cubicBezier(autoScroll.easing), clock: s.clock },
    );
    for (let i = 0; i < 5; i++) a.to(241_301);
    expect(writes.length).toBe(5);
    expect(a.dest).toBeNull();
    expect(s.pending()).toBe(0);
  });
});
