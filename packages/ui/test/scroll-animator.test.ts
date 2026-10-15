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

  it("a new target mid-way continues from where the note is, at its speed, ending a frame later at most", () => {
    const s = setup();
    s.a.to(300);
    for (let i = 0; i < 6; i++) s.tick(); // 96 ms
    const mid = s.pos();
    const speed = mid - s.samples.at(-2)!; // px in the last frame
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(300);
    s.a.to(500);
    expect(s.a.dest).toBe(500);
    s.tick();
    // It continues from mid at about the speed it had: no jump, no stop.
    const first = s.pos() - mid;
    expect(first).toBeGreaterThan(speed * 0.8);
    expect(first).toBeLessThan(speed * 1.6);
    // The first scroll would have ended at 200 ms; this one ends by 200 ms + one frame (216.7 ms).
    for (let i = 0; i < 6; i++) s.tick(); // 208 ms
    expect(s.pos()).toBeLessThan(500);
    s.tick(); // 224 ms
    expect(s.pos()).toBe(500);
    expect(s.pending()).toBe(0);
    // Monotonic all the way: it never went back.
    s.samples.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(s.samples[i - 1] ?? 0));
  });

  it("held keys (a row every 33 ms) are followed: the caret stays on screen in a 360 px window, no frame jumps", () => {
    const s = setup();
    const row = 24;
    const view = 360;
    const bandBottom = view * 0.65; // the caret's row is kept above this
    let caret = bandBottom - row; // the caret's row bottom, in content px
    const lags: number[] = [];
    const steps: number[] = [];
    let prev = s.pos();
    let presses = 0;
    for (let t = 0; t < 1500; t += 16) {
      // A repeat every 33 ms moves the caret down a row; the reading zone asks for it to sit at the band's bottom.
      if (t % 33 < 16) {
        caret += row;
        const dest = caret - bandBottom;
        // The first press animates; the repeats (KeyboardEvent.repeat) follow.
        if (dest > (s.a.dest ?? s.pos())) s.a.to(dest, presses++ === 0 ? "animate" : "follow");
      }
      s.tick(16);
      lags.push(caret - s.pos()); // where the caret's row bottom is in the viewport
      steps.push(s.pos() - prev);
      prev = s.pos();
    }
    expect(Math.max(...lags)).toBeLessThanOrEqual(view); // never below the window's bottom
    const total = s.pos();
    expect(total).toBeGreaterThan(900);
    for (const d of steps) expect(d).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...steps)).toBeLessThan(total * 0.25);
    // Once the key is let go it settles on the last row within a frame or so of the 200 ms.
    for (let i = 0; i < 14; i++) s.tick(16);
    expect(s.a.dest).toBeNull();
    expect(caret - s.pos()).toBeCloseTo(bandBottom, 0);
  });

  it("never queues: the same target again doesn't restart the clock", () => {
    const s = setup();
    s.a.to(300);
    for (let i = 0; i < 6; i++) s.tick();
    s.a.to(300.2);
    for (let i = 0; i < 7; i++) s.tick(); // 208 ms since the first call
    expect(s.pos()).toBe(300);
  });

  it("moved under it (the browser revealing the caret), it carries on from there and never jumps back", () => {
    const s = setup();
    s.a.to(1600);
    s.tick();
    s.setPos(1383); // the browser's own caret reveal, between frames
    s.tick();
    expect(s.pos()).toBeGreaterThanOrEqual(1383);
    let prev = s.pos();
    for (let i = 0; i < 14; i++) {
      s.tick();
      expect(s.pos()).toBeGreaterThanOrEqual(prev - 0.5);
      prev = s.pos();
    }
    expect(s.pos()).toBe(1600);
  });

  it("moved past its target under it, it stops there and asks for a check (the caret may be further)", () => {
    const s = setup();
    let pos = 0;
    let asked = 0;
    const a = createScrollAnimator(
      { get: () => pos, set: (v) => (pos = v) },
      { duration: () => autoScroll.duration, easing: cubicBezier(autoScroll.easing), clock: s.clock, onOvertaken: () => asked++ },
    );
    a.to(300);
    s.tick();
    pos = 1383; // the browser's caret reveal went past 300
    s.tick();
    expect(pos).toBe(1383); // never back
    expect(a.dest).toBeNull();
    expect(asked).toBe(1);
    expect(s.pending()).toBe(0);
  });

  it("a target the browser clamps away still ends on time: no frames after its end (PRF-04)", () => {
    const s = setup();
    let pos = 0;
    const a = createScrollAnimator(
      { get: () => pos, set: (v) => (pos = Math.min(v, 1000)) }, // the end of the note is at 1000
      { duration: () => autoScroll.duration, easing: cubicBezier(autoScroll.easing), clock: s.clock },
    );
    a.to(1010);
    for (let i = 0; i < 14; i++) s.tick(); // 224 ms
    expect(pos).toBe(1000);
    expect(a.dest).toBeNull();
    expect(s.pending()).toBe(0);
  });

  it("finish() ends a running scroll at once on its target (focus left the note)", () => {
    const s = setup();
    s.a.to(300);
    s.tick();
    s.a.finish();
    expect(s.pos()).toBe(300);
    expect(s.a.dest).toBeNull();
    expect(s.pending()).toBe(0);
    s.a.finish(); // at rest: nothing
    expect(s.pos()).toBe(300);
  });

  it("the person's scroll cancels it where it is", () => {
    const s = setup();
    s.a.to(300);
    for (let i = 0; i < 4; i++) s.tick();
    const at = s.pos();
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
    s.a.to(5000, "instant");
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
