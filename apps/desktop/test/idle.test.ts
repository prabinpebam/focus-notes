/**
 * PRF-04: near-zero idle CPU, with no polling except the 5-minute fetch. Nothing in the app's own
 * code repeats on a timer at rest. The only `setInterval`s are the window's pointer watches, and each
 * runs only while the pointer is somewhere the page can't see it (Linux: the margin of a window that
 * ignores the mouse; macOS: the system's drag band and the strip under it, on the active window). A
 * watch is started by an event (the page's pointer report, or the window's), and stops as soon as the
 * pointer leaves that place or the window hides (D-104, D-106). The only timer that reschedules
 * itself forever is Git's fetch, every 5 minutes. (The benchmark measures the CPU itself:
 * PRF-04.idleCpuPct.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Point, Rect } from "@focus-notes/core/window-geometry";
import { FETCH_EVERY_MS } from "../src/main/git/cadence.ts";
import { CustomWindow, POINTER_WATCH_MS, type WinLike } from "../src/main/window/custom-window.ts";
import { BAND_WATCH_MS, MacTitleBar, type MacWinLike } from "../src/main/window/mac-title-bar.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const sources = [
  ...walk(join(root, "apps", "desktop", "src")),
  ...walk(join(root, "apps", "web", "src")),
  ...readdirSync(join(root, "packages")).flatMap((p) => {
    const src = join(root, "packages", p, "src");
    try {
      return walk(src);
    } catch {
      return [];
    }
  }),
].filter((f) => /\.(ts|tsx|mjs)$/.test(f));
/** The pointer watches: the only places allowed an interval, each checked below to run only when it must. */
const WATCHES = ["apps/desktop/src/main/window/custom-window.ts", "apps/desktop/src/main/window/mac-title-bar.ts"];

class FakeWin implements WinLike {
  bounds: Rect = { x: 84, y: 84, width: 1032, height: 732 };
  ignore = false;
  visible = true;
  getBounds = () => ({ ...this.bounds });
  setBounds = (r: Rect) => void (this.bounds = r);
  setPosition = () => {};
  minimize = () => {};
  close = () => {};
  isMinimized = () => false;
  isVisible = () => this.visible;
  isFocused = () => true;
  isDestroyed = () => false;
  setIgnoreMouseEvents = (ignore: boolean) => void (this.ignore = ignore);
  moveTop = () => {};
}
function customWindow(forwardsMoves: boolean) {
  const win = new FakeWin();
  let cursor: Point = { x: 600, y: 400 };
  const content = { x: 100, y: 100, width: 1000, height: 700 };
  const w = new CustomWindow(win, {
    frame: "custom",
    screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }], getCursorScreenPoint: () => cursor },
    preview: () => ({ show: () => {}, hide: () => {} }),
    previewColor: () => "#4d2f6fed",
    notify: () => {},
    save: () => {},
    forwardsMoves,
  }, { content, mode: "normal", restore: content, fullScreen: false });
  /** The pointer moves, and the page reports it (`window:pointer`) if it can see it. */
  const move = (x: number, y: number, seen = true) => {
    cursor = { x, y };
    if (seen) w.pointerCheck();
  };
  return { w, win, move };
}
class FakeMac implements MacWinLike {
  focused = true;
  full = false;
  visible = true;
  getContentBounds = (): Rect => ({ x: 100, y: 50, width: 800, height: 600 });
  isFocused = () => this.focused;
  isFullScreen = () => this.full;
  isVisible = () => this.visible;
  isDestroyed = () => false;
  setWindowButtonVisibility = () => {};
}

describe("PRF-04: no polling", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("has no setInterval in the app's code but the window's pointer watches", () => {
    expect(sources.length).toBeGreaterThan(50);
    const polling = sources.filter((f) => /\bsetInterval\s*\(/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f).split(sep).join("/"));
    expect(polling.sort()).toEqual(WATCHES);
    // Each has one, started only if none runs, and cleared.
    for (const f of WATCHES) {
      const text = readFileSync(join(root, f), "utf8");
      expect(text.match(/\bsetInterval\s*\(/g), f).toHaveLength(1);
      expect(text, f).toMatch(/this\.#watch \?\?= setInterval\(/);
      expect(text, f).toMatch(/clearInterval\(this\.#watch\)/);
    }
  });

  it("Windows: the click-through margin never runs a timer, since the system forwards the pointer's moves", () => {
    const { w, win, move } = customWindow(true);
    w.trackPointer();
    move(90, 400);
    expect(win.ignore).toBe(true);
    move(20, 400);
    move(90, 400);
    move(600, 400);
    expect(win.ignore).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Linux: a timer runs only while the pointer is in the margin of an ignoring window, and stops when it leaves or the window hides", () => {
    const { w, win, move } = customWindow(false);
    // Nothing at rest, nor before the caret is ready.
    move(90, 400);
    expect(vi.getTimerCount()).toBe(0);
    w.trackPointer();
    move(600, 400);
    expect(vi.getTimerCount()).toBe(0);
    // Into the margin: the window ignores the mouse, so the page can't see the pointer come back.
    move(90, 400);
    expect(win.ignore).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(POINTER_WATCH_MS * 3);
    expect(win.ignore).toBe(true);
    // Back on the window, unseen by the page: the watch finds it and stops.
    move(600, 400, false);
    vi.advanceTimersByTime(POINTER_WATCH_MS);
    expect(win.ignore).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // Out of the window through the margin: the window takes the pointer again, so it sees it come back.
    move(90, 400);
    move(20, 400, false);
    vi.advanceTimersByTime(POINTER_WATCH_MS);
    expect([win.ignore, vi.getTimerCount()]).toEqual([false, 0]);
    // The window hides with the pointer in the margin.
    move(90, 400);
    win.visible = false;
    vi.advanceTimersByTime(POINTER_WATCH_MS);
    expect([win.ignore, vi.getTimerCount()]).toEqual([false, 0]);
    win.visible = true;
    move(90, 400);
    w.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("macOS: a timer runs only while the pointer is on the band or just under it, in the active window", () => {
    const win = new FakeMac();
    let pointer: Point = { x: 500, y: 400 };
    const bar = new MacTitleBar(win, () => pointer);
    // The window's events at rest, and the page's reports before the caret is ready, start nothing.
    bar.update();
    pointer = { x: 120, y: 60 };
    bar.pointerMoved();
    expect(vi.getTimerCount()).toBe(0);
    bar.trackPointer();
    pointer = { x: 500, y: 400 };
    bar.pointerMoved();
    expect(vi.getTimerCount()).toBe(0);
    // Up to the band: the page saw it coming, then loses it.
    pointer = { x: 500, y: 110 };
    bar.pointerMoved();
    expect(vi.getTimerCount()).toBe(1);
    pointer = { x: 500, y: 60 };
    vi.advanceTimersByTime(BAND_WATCH_MS);
    expect(bar.shown).toBe(true);
    // Off the top of the window, unseen by the page.
    pointer = { x: 500, y: 20 };
    vi.advanceTimersByTime(BAND_WATCH_MS);
    expect([bar.shown, vi.getTimerCount()]).toEqual([false, 0]);
    // On the band while the window isn't active, or in full screen, the lights show anyway: no timer.
    pointer = { x: 500, y: 60 };
    win.focused = false;
    bar.update();
    expect([bar.shown, vi.getTimerCount()]).toEqual([true, 0]);
    win.focused = true;
    win.full = true;
    bar.update();
    expect(vi.getTimerCount()).toBe(0);
    win.full = false;
    bar.update();
    expect(vi.getTimerCount()).toBe(1);
    bar.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fetches every 5 minutes by default, and main.ts never shortens it", () => {
    expect(FETCH_EVERY_MS).toBe(5 * 60_000);
    expect(readFileSync(join(root, "apps", "desktop", "src", "main", "git", "sync.ts"), "utf8")).toMatch(/fetchEveryMs \?\? FETCH_EVERY_MS\)/);
    expect(readFileSync(join(root, "apps", "desktop", "src", "main", "main.ts"), "utf8")).not.toMatch(/fetchEveryMs/);
  });
});
