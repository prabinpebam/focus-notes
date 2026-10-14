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
  constructor(b: Rect) {
    this.bounds = b;
  }
  getBounds = () => ({ ...this.bounds });
  setBounds = (r: Rect) => void (this.bounds = { ...r });
  setPosition = (x: number, y: number) => void (this.bounds = { ...this.bounds, x, y });
  minimize = () => void this.calls.push("minimize");
  close = () => void this.calls.push("close");
  isMinimized = () => false;
  isVisible = () => true;
  isFocused = () => true;
  isDestroyed = () => false;
  setIgnoreMouseEvents = (ignore: boolean) => void (this.ignore = ignore);
  moveTop = () => void this.calls.push("moveTop");
}

function setup(content: Rect = { x: 100, y: 100, width: 1000, height: 700 }, displays = [main], mode: Placement["mode"] = "normal", forwardsMoves = true) {
  const placement: Placement = { content, mode, restore: content, fullScreen: false };
  const win = new FakeWin(CustomWindow.outer(placement, "custom"));
  const reports: WindowReport[] = [];
  const saved: WindowMemory[] = [];
  const preview: { shown?: Rect; visible: boolean } = { visible: false };
  let cursor = { x: 0, y: 0 };
  const w = new CustomWindow(win, {
    frame: "custom",
    screen: { getAllDisplays: () => displays, getCursorScreenPoint: () => cursor },
    preview: () => ({ show: (r) => Object.assign(preview, { shown: r, visible: true }), hide: () => void (preview.visible = false) }),
    previewColor: () => "#4d2f6fed",
    notify: (r) => reports.push(r),
    save: (m) => saved.push(m),
    forwardsMoves,
  }, placement);
  return { w, win, reports, saved, preview, point: (x: number, y: number) => (cursor = { x, y }) };
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
    const { w, preview, win } = setup();
    w.drag("start", "move", 500, 110, false);
    w.drag("move", "move", 700, 2, false);
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
    const { w, win } = setup({ x: 100, y: 100, width: 1000, height: 700 }, [main, laptop]);
    w.drag("start", "move", 500, 110, false);
    w.drag("move", "move", 2500, 110, false);
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
