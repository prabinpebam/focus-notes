/**
 * DSK-09, D-148: after a renderer crash the window loads its page again (the one allowed reload),
 * behind a cover in the theme's canvas, so it never shows white or see-through while the new page
 * paints. The cover goes once the new page reports its first themed frame. A clean exit (quitting)
 * isn't a crash, and a page that keeps crashing isn't loaded over and over.
 */
import { describe, expect, it, vi } from "vitest";
import { CrashRecovery, coverBounds, MAX_RECOVERIES } from "../src/main/window/crash-cover.ts";
import { themeCanvas } from "@focus-notes/core/window-geometry";

function rig() {
  const calls: string[] = [];
  let firstFrame: (() => void) | undefined;
  const r = new CrashRecovery({
    canvas: () => "#123456",
    cover: { show: (c) => calls.push(`show ${c}`), hide: () => calls.push("hide") },
    restore: async () => void calls.push("restore"),
    load: () => void calls.push("load"),
    onFirstFrame: (f) => {
      firstFrame = f;
      return () => (firstFrame = undefined);
    },
    log: (l) => calls.push(`log ${l}`),
    now: () => 0,
  });
  return { r, calls, frame: () => firstFrame?.() };
}

describe("CrashRecovery", () => {
  it("covers the window in the theme's canvas, puts back unsaved text, loads the page, and uncovers on its first frame", async () => {
    const { r, calls, frame } = rig();
    await r.gone("crashed");
    expect(calls).toEqual(["show #123456", "log renderer-gone reason=crashed cover=#123456", "restore", "load"]);
    frame();
    expect(calls.slice(4)).toEqual(["hide", "log renderer-recovered on=first-frame"]);
  });
  it("leaves a clean exit alone", async () => {
    const { r, calls } = rig();
    await r.gone("clean-exit");
    expect(calls).toEqual([]);
  });
  it("stops loading a page that keeps crashing, and keeps the cover", async () => {
    const { r, calls } = rig();
    for (let i = 0; i <= MAX_RECOVERIES; i++) await r.gone("crashed");
    expect(calls.filter((c) => c === "load")).toHaveLength(MAX_RECOVERIES);
    expect(calls.at(-1)).toBe(`log renderer-gone reason=crashed gave-up after=${MAX_RECOVERIES}`);
    expect(calls).not.toContain("hide");
  });
  it("uncovers after a time limit if the page never reports a frame", async () => {
    vi.useFakeTimers();
    try {
      const { r, calls } = rig();
      await r.gone("oom");
      vi.advanceTimersByTime(10_000);
      expect(calls.slice(-2)).toEqual(["hide", "log renderer-recovered on=timeout"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("coverBounds", () => {
  it("is the drawn window inside the shadow margin", () => {
    expect(coverBounds({ width: 1000, height: 700 }, 16)).toEqual({ x: 16, y: 16, width: 968, height: 668 });
    expect(coverBounds({ width: 1000, height: 700 }, 0)).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
  });
});

describe("themeCanvas (the native window's background, D-148)", () => {
  it("is the chosen built-in theme's own canvas, not just Paper's or Ink's", () => {
    expect(themeCanvas("paper", "light")).toBe("#fbfaf7");
    expect(themeCanvas("ink", "dark")).toBe("#1a1a1c");
    expect(themeCanvas("sepia", "light")).toBe("#f7f0e1");
    expect(themeCanvas("forest-dark", "dark")).toBe("#141b12");
  });
  it("falls back to Paper's or Ink's for an unknown theme", () => {
    expect(themeCanvas("mine", "dark")).toBe("#1a1a1c");
    expect(themeCanvas("mine", "light")).toBe("#fbfaf7");
  });
});
