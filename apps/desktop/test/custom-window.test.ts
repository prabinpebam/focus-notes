/**
 * The app-built window's controller (DSK-01, DSK-03, DSK-08, D-14), against a fake window and
 * screen: moving, resizing, maximizing and restoring, snapping with a preview, restoring by dragging,
 * keyboard Move and Size, the click-through margin, displays with other scales, and remembered bounds.
 * What only a real desktop can show (Windows' own Win+arrow, real monitors) is in the stage demo.
 */
import { describe, expect, it } from "vitest";
import type { DisplayInfo, Rect } from "@focus-notes/core/window-geometry";
import type { WindowReport } from "@focus-notes/core";
import { CustomWindow, type KeyInput, type WinLike } from "../src/main/window/custom-window.ts";
import { initialPlacement, parseWindowMemory, type Placement, type WindowMemory } from "../src/main/window/placement.ts";

const main: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };
const laptop: DisplayInfo = { id: 2, bounds: { x: 1920, y: 0, width: 1707, height: 1067 }, workArea: { x: 1920, y: 0, width: 1707, height: 1019 }, scaleFactor: 1.5 };

class FakeWin implements WinLike {
  bounds: Rect;
  ignore: boolean | undefined;
  calls: string[] = [];
  /** Every position the window was given, in order. */
  positions: { x: number; y: number }[] = [];
  constructor(b: Rect) {
    this.bounds = b;
  }
  getBounds = () => ({ ...this.bounds });
  setBounds = (r: Rect) => void (this.bounds = { ...r });
  setPosition = (x: number, y: number) => {
    this.positions.push({ x, y });
    this.bounds = { ...this.bounds, x, y };
  };
  minimize = () => void this.calls.push("minimize");
  close = () => void this.calls.push("close");
  isMinimized = () => false;
  isVisible = () => true;
  isFocused = () => true;
  isDestroyed = () => false;
  setIgnoreMouseEvents = (ignore: boolean) => void (this.ignore = ignore);
  moveTop = () => void this.calls.push("moveTop");
}

/** The drag loop's clock: `tick()` is one display frame. Counts how many loops run, so none outlives its drag (PRF-04). */
function fakeClock() {
  const loops = new Set<() => void>();
  const intervals: number[] = [];
  return {
    every: (ms: number, fn: () => void) => {
      intervals.push(ms);
      loops.add(fn);
      return () => void loops.delete(fn);
    },
    tick: () => [...loops].forEach((fn) => fn()),
    get running() {
      return loops.size;
    },
    intervals,
  };
}

function setup(content: Rect = { x: 100, y: 100, width: 1000, height: 700 }, displays = [main], mode: Placement["mode"] = "normal", forwardsMoves = true, dragPointer: "cursor" | "page" = "page") {
  const placement: Placement = { content, mode, restore: content, fullScreen: false };
  const win = new FakeWin(CustomWindow.outer(placement, "custom"));
  const reports: WindowReport[] = [];
  const saved: WindowMemory[] = [];
  const preview: { shown?: Rect; visible: boolean; shows: number } = { visible: false, shows: 0 };
  const passes: boolean[] = [];
  const clock = fakeClock();
  let cursor = { x: 0, y: 0 };
  const w = new CustomWindow(win, {
    frame: "custom",
    screen: { getAllDisplays: () => displays, getCursorScreenPoint: () => cursor },
    preview: () => ({ show: (r) => Object.assign(preview, { shown: r, visible: true, shows: preview.shows + 1 }), hide: () => void (preview.visible = false) }),
    previewColor: () => "#4d2f6fed",
    notify: (r) => reports.push(r),
    save: (m) => saved.push(m),
    forwardsMoves,
    passthrough: (on) => passes.push(on),
    dragPointer: () => dragPointer,
    frameMs: () => 1000 / 144,
    every: clock.every,
  }, placement);
  return { w, win, reports, saved, preview, passes, clock, point: (x: number, y: number) => (cursor = { x, y }) };
}
const drag = (w: CustomWindow, kind: Parameters<CustomWindow["drag"]>[1], from: [number, number], to: [number, number], shift = false) => {
  w.drag("start", kind, ...from, shift);
  w.drag("move", kind, ...to, shift);
  w.drag("end", kind, ...to, shift);
};
const key = (key: string, control = false): KeyInput => ({ type: "keyDown", key, control, alt: false, shift: false, meta: false });

describe("DSK-01: the drawn window and its shadow margin", () => {
  it("is 16 px larger on every side than the visible window at rest, and exactly the visible window when maximized", () => {
    const { w, win } = setup();
    expect(win.bounds).toEqual({ x: 84, y: 84, width: 1032, height: 732 });
    expect(w.content()).toEqual({ x: 100, y: 100, width: 1000, height: 700 });
    w.maximize();
    expect(win.bounds).toEqual(main.workArea);
    expect(w.margin()).toBe(0);
  });
});

describe("DSK-03: moving, resizing, maximizing, restoring", () => {
  it("moves with the pointer", () => {
    const { w } = setup();
    drag(w, "move", [500, 110], [620, 170]);
    expect(w.content()).toEqual({ x: 220, y: 160, width: 1000, height: 700 });
  });
  it("ignores a click that doesn't move", () => {
    const { w, saved } = setup();
    drag(w, "move", [500, 110], [502, 111]);
    expect(w.content()).toEqual({ x: 100, y: 100, width: 1000, height: 700 });
    expect(saved).toEqual([]);
  });
  it("resizes from every edge and corner", () => {
    const cases: [Parameters<CustomWindow["drag"]>[1], Rect][] = [
      ["e", { x: 100, y: 100, width: 1050, height: 700 }],
      ["w", { x: 150, y: 100, width: 950, height: 700 }],
      ["n", { x: 100, y: 130, width: 1000, height: 670 }],
      ["s", { x: 100, y: 100, width: 1000, height: 730 }],
      ["ne", { x: 100, y: 130, width: 1050, height: 670 }],
      ["nw", { x: 150, y: 130, width: 950, height: 670 }],
      ["se", { x: 100, y: 100, width: 1050, height: 730 }],
      ["sw", { x: 150, y: 100, width: 950, height: 730 }],
    ];
    for (const [edge, want] of cases) {
      const { w } = setup();
      drag(w, edge, [600, 400], [650, 430]);
      expect(w.content(), edge).toEqual(want);
    }
  });
  it("maximizes into the work area, and restores to where it was", () => {
    const { w, reports } = setup();
    w.toggleMaximize();
    expect(w.content()).toEqual(main.workArea);
    expect(reports.at(-1)).toMatchObject({ maximized: true, snapped: false });
    w.toggleMaximize();
    expect(w.content()).toEqual({ x: 100, y: 100, width: 1000, height: 700 });
    expect(reports.at(-1)).toMatchObject({ maximized: false });
  });
  it("doesn't resize a maximized window", () => {
    const { w } = setup();
    w.maximize();
    drag(w, "e", [1919, 500], [1800, 500]);
    expect(w.content()).toEqual(main.workArea);
  });
  it("restores a maximized window under the pointer when its band is dragged", () => {
    const { w, reports } = setup();
    w.maximize();
    drag(w, "move", [1440, 20], [1460, 60]);
    expect(reports.at(-1)).toMatchObject({ maximized: false });
    // 75% across, so the restored window is 75% across under the pointer, then follows it.
    expect(w.content()).toEqual({ x: 690 + 20, y: 0 + 40, width: 1000, height: 700 });
  });
  it("maximizes by dragging to the top of the screen, with a preview first", () => {
    const { w, preview, win, clock } = setup();
    w.drag("start", "move", 500, 110, false);
    w.drag("move", "move", 700, 2, false);
    clock.tick();
    expect(preview).toMatchObject({ visible: true, shown: main.workArea });
    expect(win.calls).toContain("moveTop");
    w.drag("end", "move", 700, 2, false);
    expect(preview.visible).toBe(false);
    expect(w.report().maximized).toBe(true);
    expect(w.content()).toEqual(main.workArea);
  });
  it("remembers where it is, and whether it's maximized or snapped", () => {
    const { w, saved } = setup();
    drag(w, "move", [500, 110], [520, 130]);
    expect(saved.at(-1)).toEqual({ version: 1, bounds: { x: 120, y: 120, width: 1000, height: 700 } });
    w.snap("left");
    expect(saved.at(-1)).toEqual({ version: 1, bounds: { x: 120, y: 120, width: 1000, height: 700 }, zone: "left" });
    w.maximize();
    expect(saved.at(-1)).toMatchObject({ maximized: true });
  });
});

describe("DSK-08: snapping, the system menu, and monitors", () => {
  it("snaps to halves and quarters at the screen's edges and corners, without covering the taskbar", () => {
    for (const [to, zone] of [[[1, 500], { x: 0, y: 0, width: 960, height: 1040 }], [[1919, 500], { x: 960, y: 0, width: 960, height: 1040 }], [[1, 5], { x: 0, y: 0, width: 960, height: 520 }], [[1919, 1035], { x: 960, y: 520, width: 960, height: 520 }]] as const) {
      const { w, reports } = setup();
      drag(w, "move", [500, 110], to as unknown as [number, number]);
      expect(w.content()).toEqual(zone);
      expect(reports.at(-1)).toMatchObject({ snapped: true, maximized: false });
      expect(w.margin()).toBe(0);
    }
  });
  it("snaps from the Snap Layouts picker or the commands, and a snapped window is resizable and restorable", () => {
    const { w } = setup();
    w.snap("rightThird");
    expect(w.content()).toEqual({ x: 1280, y: 0, width: 640, height: 1040 });
    expect(w.resizable()).toBe(true);
    w.restore();
    expect(w.content()).toEqual({ x: 100, y: 100, width: 1000, height: 700 });
  });
  it("moves and sizes from the keyboard, Enter keeping it and Esc putting it back", () => {
    const { w } = setup();
    w.keyboard("move");
    expect(w.key(key("ArrowRight"))).toBe(true);
    w.key(key("ArrowDown", true));
    w.key(key("Enter"));
    expect(w.content()).toEqual({ x: 110, y: 101, width: 1000, height: 700 });
    expect(w.keyboardActive).toBe(false);
    w.keyboard("size");
    w.key(key("ArrowLeft"));
    w.key(key("ArrowLeft"));
    expect(w.content()).toEqual({ x: 100, y: 101, width: 1010, height: 700 });
    w.key(key("Escape"));
    expect(w.content()).toEqual({ x: 110, y: 101, width: 1000, height: 700 });
    expect(w.key(key("ArrowLeft"))).toBe(false);
  });
  it("lets clicks in the shadow margin through, but not on the handles or the window", () => {
    const { w, win, point } = setup();
    // Not before the caret is ready (PRF-02): the page's reports are followed from then on.
    point(86, 500);
    w.pointerCheck();
    expect(win.ignore).toBeUndefined();
    w.trackPointer();
    point(86, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    point(96, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(false);
    point(86, 500);
    w.pointerCheck();
    point(600, 400);
    w.pointerCheck();
    expect(win.ignore).toBe(false);
    // Windows forwards the moves of an ignoring window to the page, so a pointer that leaves changes nothing until it's back.
    point(86, 500);
    w.pointerCheck();
    point(20, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    // A hidden window takes the pointer again.
    win.isVisible = () => false;
    w.pointerCheck();
    expect(win.ignore).toBe(false);
  });
  it("on Linux, which can't forward moves to an ignoring window, takes the pointer again once it leaves the margin", () => {
    const { w, win, point } = setup(undefined, undefined, undefined, false);
    w.trackPointer();
    point(86, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    expect(w.watching).toBe(true);
    point(20, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(false);
    expect(w.watching).toBe(false);
    w.stop();
    point(86, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(false);
  });
  it("offers thirds only on a wide display, following the window", () => {
    const { w } = setup({ x: 100, y: 100, width: 1000, height: 700 }, [main, laptop]);
    expect(w.report().layouts).toContain("thirds");
    drag(w, "move", [500, 110], [2500, 110]);
    expect(w.report().layouts).not.toContain("thirds");
  });
  it("keeps its size on a display with another scale, re-measuring if the system changed it", () => {
    const { w, win, clock } = setup({ x: 100, y: 100, width: 1000, height: 700 }, [main, laptop]);
    w.drag("start", "move", 500, 110, false);
    w.drag("move", "move", 2500, 110, false);
    clock.tick();
    // The system resized it as it crossed to the 150% display.
    win.bounds = { ...win.bounds, width: 1532, height: 1082 };
    w.drag("end", "move", 2500, 110, false);
    expect(w.content()).toMatchObject({ width: 1000, height: 700 });
  });
  it("goes full screen over the whole display without corners or margin, and comes back as it was (DSK-01)", () => {
    const { w, reports } = setup();
    w.toggleFullScreen();
    expect(w.content()).toEqual(main.bounds);
    expect(w.margin()).toBe(0);
    expect(reports.at(-1)).toMatchObject({ fullScreen: true });
    expect(w.memory()).toMatchObject({ fullScreen: true, bounds: { x: 100, y: 100, width: 1000, height: 700 } });
    w.toggleFullScreen();
    expect(w.content()).toEqual({ x: 100, y: 100, width: 1000, height: 700 });
    expect(reports.at(-1)).toMatchObject({ fullScreen: false });
  });
  it("refits a maximized window when the displays change", () => {
    const displays = [main];
    const { w } = setup(undefined, displays);
    w.maximize();
    displays[0] = { ...main, workArea: { x: 0, y: 0, width: 1920, height: 1000 } };
    w.displaysChanged();
    expect(w.content()).toEqual({ x: 0, y: 0, width: 1920, height: 1000 });
  });
});

describe("DSK-03: remembered bounds across launches", () => {
  it("reads only what's valid from window.json", () => {
    expect(parseWindowMemory("not json")).toEqual({ version: 1 });
    expect(parseWindowMemory(JSON.stringify({ version: 2, bounds: { x: 1, y: 1, width: 500, height: 400 } }))).toEqual({ version: 1 });
    expect(parseWindowMemory(JSON.stringify({ version: 1, bounds: { x: 1.4, y: 2, width: 500, height: 400 }, zone: "left", maximized: "yes", extra: 1 })))
      .toEqual({ version: 1, bounds: { x: 1, y: 2, width: 500, height: 400 }, zone: "left" });
    expect(parseWindowMemory(JSON.stringify({ version: 1, bounds: { x: 1, y: 2, width: -5, height: 400 }, zone: "maximize" }))).toEqual({ version: 1 });
  });
  it("opens centered the first time, and where it was after that", () => {
    expect(initialPlacement({ version: 1 }, [main], main)).toMatchObject({ mode: "normal", content: { x: 410, y: 130, width: 1100, height: 780 } });
    const back = initialPlacement({ version: 1, bounds: { x: 2100, y: 100, width: 900, height: 600 } }, [main, laptop], main);
    expect(back.content).toEqual({ x: 2100, y: 100, width: 900, height: 600 });
  });
  it("opens on the nearest display when its display is gone, maximized or snapped as it was", () => {
    expect(initialPlacement({ version: 1, bounds: { x: 2100, y: 100, width: 900, height: 600 } }, [main], main).content).toEqual({ x: 1020, y: 100, width: 900, height: 600 });
    const max = initialPlacement({ version: 1, bounds: { x: 2100, y: 100, width: 900, height: 600 }, maximized: true }, [main, laptop], main);
    expect(max).toMatchObject({ mode: "maximized", content: laptop.workArea, restore: { x: 2100, y: 100, width: 900, height: 600 } });
    expect(initialPlacement({ version: 1, bounds: { x: 100, y: 100, width: 900, height: 600 }, zone: "right" }, [main], main)).toMatchObject({ mode: "snapped", zone: "right", content: { x: 960, y: 0, width: 960, height: 1040 } });
  });
});

describe("D-141: vertical maximize, as Windows does it", () => {
  const start = { x: 300, y: 200, width: 1000, height: 600 };
  const full = { x: 300, y: 0, width: 1000, height: 1040 };
  it("dragging the top edge to the screen's top previews, then fills the work area's height at the same x and width", () => {
    const { w, preview, reports, win, clock } = setup(start);
    w.drag("start", "n", 800, 195, false);
    w.drag("move", "n", 800, 3, false);
    clock.tick();
    expect(preview).toMatchObject({ visible: true, shown: full });
    w.drag("end", "n", 800, 3, false);
    expect(preview.visible).toBe(false);
    expect(w.content()).toEqual(full);
    expect(win.bounds).toEqual(full); // no shadow margin: it's snapped
    expect(w.margin()).toBe(0);
    expect(reports.at(-1)).toMatchObject({ snapped: true, maximized: false });
  });
  it("dragging the bottom edge to the taskbar does the same", () => {
    const { w } = setup(start);
    drag(w, "s", [800, 805], [800, 1060]);
    expect(w.content()).toEqual(full);
  });
  it("a resize that stops short, or by a corner or a side, stays a resize", () => {
    const short = setup(start);
    drag(short.w, "n", [800, 195], [800, 40]);
    expect(short.w.content()).toEqual({ ...start, y: 45, height: 755 });
    const corner = setup(start);
    drag(corner.w, "ne", [1305, 195], [1305, 2]);
    expect(corner.w.report().snapped).toBe(false);
  });
  it("restores its previous height when dragged away, and by Restore", () => {
    const { w, reports } = setup(start);
    drag(w, "n", [800, 195], [800, 2]);
    drag(w, "move", [800, 20], [820, 140]);
    expect(reports.at(-1)).toMatchObject({ snapped: false });
    expect(w.content()).toMatchObject({ width: 1000, height: 600 });
    const again = setup(start);
    drag(again.w, "s", [800, 805], [800, 1039]);
    again.w.restore();
    expect(again.w.content()).toEqual(start);
  });
  it("double-clicking the top or bottom border toggles it", () => {
    const { w } = setup(start);
    w.toggleVertical();
    expect(w.content()).toEqual(full);
    w.toggleVertical();
    expect(w.content()).toEqual(start);
  });
  it("Win+Shift+Up maximizes vertically and Win+Shift+Down restores, when the shell lets the keys through", () => {
    const { w } = setup(start);
    const winKey = (key: string): KeyInput => ({ type: "keyDown", key, control: false, alt: false, shift: true, meta: true });
    expect(w.snapKey(winKey("ArrowUp"))).toBe(true);
    expect(w.content()).toEqual(full);
    expect(w.snapKey(winKey("ArrowUp"))).toBe(true);
    expect(w.content()).toEqual(full);
    expect(w.snapKey(winKey("ArrowDown"))).toBe(true);
    expect(w.content()).toEqual(start);
    expect(w.snapKey({ ...winKey("ArrowUp"), shift: false })).toBe(false);
    expect(w.snapKey({ ...winKey("ArrowUp"), meta: false })).toBe(false);
  });
  it("keeps the taskbar visible, refits when the work area changes, and isn't offered while maximized", () => {
    const displays = [{ ...main }];
    const { w } = setup(start, displays);
    w.toggleVertical();
    displays[0] = { ...main, workArea: { x: 0, y: 48, width: 1920, height: 1032 } };
    w.displaysChanged();
    expect(w.content()).toEqual({ x: 300, y: 48, width: 1000, height: 1032 });
    const max = setup(start);
    max.w.maximize();
    max.w.toggleVertical();
    expect(max.w.content()).toEqual(main.workArea);
  });
  it("works on the display the window is on, with its own work area", () => {
    const { w } = setup({ x: 2000, y: 200, width: 800, height: 500 }, [main, laptop]);
    drag(w, "n", [2400, 195], [2400, 1]);
    expect(w.content()).toEqual({ x: 2000, y: 0, width: 800, height: 1019 });
  });
  it("is remembered across launches", () => {
    const { w, saved } = setup(start);
    w.toggleVertical();
    expect(saved.at(-1)).toEqual({ version: 1, bounds: start, vertical: true });
    expect(parseWindowMemory(JSON.stringify({ version: 1, bounds: start, vertical: true }))).toEqual({ version: 1, bounds: start, vertical: true });
    expect(initialPlacement({ version: 1, bounds: start, vertical: true }, [main], main)).toMatchObject({ mode: "snapped", zone: "vertical", content: full, restore: start });
  });
});

describe("D-150: a window that let clicks through takes the mouse again", () => {
  it("after the pointer left through the margin and came back inside without crossing the edges", () => {
    const { w, win, passes, point } = setup();
    w.trackPointer();
    point(86, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    // The page is told, so it reports every move the system forwards, not only near the edges.
    expect(passes).toEqual([true]);
    point(20, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    // Alt+Tab, a window uncovering it: the pointer is now in the middle. The first forwarded move restores the mouse.
    point(600, 400);
    w.pointerCheck();
    expect(win.ignore).toBe(false);
    expect(passes).toEqual([true, false]);
  });
  it("whenever the system shows, restores, or activates it, unless the pointer is in the margin", () => {
    const { w, win, point } = setup();
    w.trackPointer();
    point(86, 500);
    w.pointerCheck();
    point(20, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    // Activated from the taskbar with the pointer elsewhere: it takes the mouse.
    w.settle();
    expect(win.ignore).toBe(false);
    point(600, 400);
    w.settle();
    expect(win.ignore).toBe(false);
    // Activated with the pointer actually in the margin: clicks there still pass through.
    point(86, 500);
    w.settle();
    expect(win.ignore).toBe(true);
    point(600, 400);
    w.settle();
    expect(win.ignore).toBe(false);
  });
  it("as it maximizes, snaps, maximizes vertically, goes full screen, and restores, wherever the pointer was", () => {
    for (const change of [
      (w: CustomWindow) => w.maximize(),
      (w: CustomWindow) => w.snap("left"),
      (w: CustomWindow) => w.toggleVertical(),
      (w: CustomWindow) => w.toggleFullScreen(),
    ]) {
      const { w, win, point } = setup();
      w.trackPointer();
      // In the margin at the window's top-left, which the new shape covers.
      point(86, 86);
      w.pointerCheck();
      expect(win.ignore).toBe(true);
      change(w);
      expect(w.margin()).toBe(0);
      expect(win.ignore).toBe(false);
    }
  });
  it("when the displays change under a still pointer", () => {
    const { w, win, point } = setup();
    w.trackPointer();
    point(86, 500);
    w.pointerCheck();
    expect(win.ignore).toBe(true);
    // The window was moved to it by the system: the pointer is over the visible window now, unmoved.
    point(600, 400);
    w.displaysChanged();
    expect(win.ignore).toBe(false);
  });
  it("never lets a click through anywhere on the visible window, in any mode", () => {
    const corners = (r: Rect) => [[r.x, r.y], [r.x + r.width - 1, r.y], [r.x, r.y + r.height - 1], [r.x + r.width - 1, r.y + r.height - 1], [r.x + r.width / 2, r.y + r.height / 2]] as const;
    const modes: [string, (w: CustomWindow) => void][] = [
      ["normal", () => {}],
      ["maximized", (w) => w.maximize()],
      ["snapped", (w) => w.snap("right")],
      ["vertical", (w) => w.toggleVertical()],
      ["full screen", (w) => w.toggleFullScreen()],
    ];
    for (const [name, change] of modes) {
      const { w, win, point } = setup();
      w.trackPointer();
      change(w);
      const visible = w.content();
      for (const [x, y] of corners(visible)) {
        point(x, y);
        w.pointerCheck();
        expect(win.ignore ?? false, `${name} at ${x},${y}`).toBe(false);
      }
      // And every pixel of the window that isn't the visible window is margin.
      if (w.margin() === 0) expect(win.bounds, name).toEqual(visible);
    }
  });
  it("on Linux, takes the mouse when activated, and still watches only while the pointer is in the margin", () => {
    const { w, win, point } = setup(undefined, undefined, undefined, false);
    w.trackPointer();
    point(86, 500);
    w.pointerCheck();
    expect(w.watching).toBe(true);
    point(600, 400);
    w.settle();
    expect(win.ignore).toBe(false);
    expect(w.watching).toBe(false);
    w.stop();
  });
});

describe("PRF-14, D-151: the window follows the hand", () => {
  it("follows the system's cursor once a frame, applying only its latest position", () => {
    const { w, win, clock, point } = setup(undefined, undefined, undefined, true, "cursor");
    point(500, 110);
    w.drag("start", "move", 500, 110, false);
    // The cursor goes on moving between two frames: only where it is at the frame counts.
    point(530, 120);
    point(560, 130);
    point(620, 170);
    clock.tick();
    expect(win.positions).toEqual([{ x: 204, y: 144 }]);
    expect(w.content()).toEqual({ x: 220, y: 160, width: 1000, height: 700 });
    // The pointer held still: nothing is applied.
    clock.tick();
    clock.tick();
    expect(win.positions).toHaveLength(1);
    w.drag("end", "move", 0, 0, false);
    expect(w.content()).toEqual({ x: 220, y: 160, width: 1000, height: 700 });
  });
  it("takes only Shift from the page's moves while it follows the cursor", () => {
    const { w, clock, point } = setup(undefined, undefined, undefined, true, "cursor");
    point(1095, 795);
    w.drag("start", "se", 1095, 795, false);
    point(1145, 795);
    w.drag("move", "se", 9999, 9999, true);
    clock.tick();
    // Shift keeps the proportions (1000 × 700 grows by 50 px wide): the page's position was ignored.
    expect(w.content()).toEqual({ x: 100, y: 100, width: 1050, height: 735 });
    w.drag("end", "se", 0, 0, true);
  });
  it("never plays a queue: moves that arrive between frames replace each other, and nothing moves after the release", () => {
    const { w, win, clock } = setup();
    w.drag("start", "move", 500, 110, false);
    for (let i = 1; i <= 20; i++) w.drag("move", "move", 500 + i * 10, 110 + i, false);
    w.drag("end", "move", 700, 130, false);
    // One position, the release's, applied at the release.
    expect(win.positions).toEqual([{ x: 284, y: 104 }]);
    for (let i = 0; i < 5; i++) clock.tick();
    expect(win.positions).toHaveLength(1);
  });
  it("runs its loop at the display's frame rate, only while a drag lasts (PRF-04)", () => {
    const { w, clock, point } = setup(undefined, undefined, undefined, true, "cursor");
    expect(clock.running).toBe(0);
    point(500, 110);
    w.drag("start", "move", 500, 110, false);
    expect(clock.running).toBe(1);
    expect(clock.intervals).toEqual([1000 / 144]);
    expect(w.dragging).toBe(true);
    w.drag("end", "move", 500, 110, false);
    expect(clock.running).toBe(0);
    // Hidden, minimized or no longer active mid-drag (the shell calls endDrag), or closed: the loop stops.
    w.drag("start", "move", 500, 110, false);
    point(600, 160);
    w.endDrag();
    expect(clock.running).toBe(0);
    expect(w.content()).toMatchObject({ x: 200, y: 150 });
    w.drag("start", "move", 600, 160, false);
    w.stop();
    expect(clock.running).toBe(0);
    expect(w.dragging).toBe(false);
  });
  it("shows the snap preview and raises the window only when the zone changes, not on every move", () => {
    const { w, win, clock, preview, point } = setup(undefined, undefined, undefined, true, "cursor");
    point(500, 110);
    w.drag("start", "move", 500, 110, false);
    for (let x = 600; x <= 900; x += 30) {
      point(x, 2);
      clock.tick();
    }
    expect(preview).toMatchObject({ visible: true, shown: main.workArea, shows: 1 });
    expect(win.calls.filter((c) => c === "moveTop")).toHaveLength(1);
    point(1, 500);
    clock.tick();
    point(1, 520);
    clock.tick();
    expect(preview).toMatchObject({ shown: { x: 0, y: 0, width: 960, height: 1040 }, shows: 2 });
    w.drag("end", "move", 0, 0, false);
    expect(w.report().snapped).toBe(true);
  });
  it("restores a maximized window under the cursor and snaps on release, following the cursor", () => {
    const { w, clock, point } = setup(undefined, undefined, undefined, true, "cursor");
    w.maximize();
    point(1440, 20);
    w.drag("start", "move", 1440, 20, false);
    point(1460, 60);
    clock.tick();
    expect(w.content()).toEqual({ x: 710, y: 40, width: 1000, height: 700 });
    w.drag("end", "move", 0, 0, false);
    expect(w.report().maximized).toBe(false);
  });
  it("costs the main process well under a millisecond a frame (unit-level timing of the drag path)", () => {
    const { w, clock, point } = setup(undefined, [main, laptop], undefined, true, "cursor");
    point(500, 110);
    w.drag("start", "move", 500, 110, false);
    const times: number[] = [];
    for (let i = 0; i < 5000; i++) {
      point(500 + (i % 1500), 110 + (i % 300));
      const t = performance.now();
      clock.tick();
      times.push(performance.now() - t);
    }
    w.drag("end", "move", 0, 0, false);
    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)]!;
    console.log(`[D-151] main-process drag frame: p50 ${times[Math.floor(times.length / 2)]!.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms`);
    expect(p99).toBeLessThan(1);
  });
});