// @vitest-environment happy-dom
/**
 * DEF-25 (DEF-21, D-156): a surface anchored to the note opening settles the note first. The band
 * check the key that opened it scheduled for the next frame runs at once, so the note is at rest
 * before the surface is placed and never carries it along a frame later.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { anchors } from "../src/behaviors/anchors.ts";
import { autoScrollRemaining, keepInReadingZone } from "../src/host/EditorSurface/reading-zone.ts";

let off: (() => void) | undefined;
afterEach(() => { off?.(); off = undefined; vi.restoreAllMocks(); });

function setup(empty = true) {
  const scroller = document.createElement("div");
  const column = document.createElement("div");
  const dom = document.createElement("div");
  scroller.append(column);
  column.append(dom);
  document.body.append(scroller);
  // A 600 px tall note scroller with 4,000 px of content.
  Object.defineProperty(scroller, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: 4000, configurable: true });
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  let caretTop = 900; // below the band: the caret was moved down by a key
  let props: Record<string, unknown> = {};
  const selection = { empty };
  const handlers = new Map<string, Array<() => void>>();
  const editor = {
    isDestroyed: false,
    state: { selection },
    view: {
      dom,
      hasFocus: () => true,
      state: { selection: { head: 1 } },
      coordsAtPos: () => ({ top: caretTop - scroller.scrollTop, bottom: caretTop + 20 - scroller.scrollTop, left: 10, right: 10 }),
      setProps: (p: Record<string, unknown>) => { props = { ...props, ...p }; },
    },
    on: (name: string, fn: () => void) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    off: () => {},
  } as unknown as Editor;
  off = keepInReadingZone(editor, scroller, column, false);
  /** The selection changes as ProseMirror's would: its scroll check runs before selectionUpdate. */
  const select = (nowEmpty: boolean) => {
    selection.empty = nowEmpty;
    for (const fn of handlers.get("selectionUpdate") ?? []) fn();
  };
  return { scroller, dom, props: () => props, moveCaret: (t: number) => (caretTop = t), selection, select };
}

describe("an anchored surface opening (DEF-25)", () => {
  it("runs the band check a key left for the next frame at once, before the surface is placed", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    const { scroller, props } = setup();
    // The person's key in the note (Enter): its scroll is the reading zone's (D-156).
    document.querySelector("div > div > div")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // ProseMirror asks to scroll to the caret: the reading zone takes it, for the next frame.
    const handle = props().handleScrollToSelection as () => boolean;
    expect(handle()).toBe(true);
    expect(raf).toHaveBeenCalled();
    expect(scroller.scrollTop).toBe(0);
    // The slash menu opens before that frame: the note settles now, the caret in its band.
    const closed = anchors.opening();
    expect(scroller.scrollTop).toBeGreaterThan(0);
    const settled = scroller.scrollTop;
    closed();
    expect(scroller.scrollTop).toBe(settled);
  });
});

describe("a selection's auto-scroll (D-156)", () => {
  it("glides with the formatting toolbar open instead of jumping", () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    const tick = (ms = 16) => {
      now += ms;
      const due = frames.splice(0);
      for (const cb of due) cb(now);
    };
    const { scroller, dom, props } = setup(false);
    const closed = anchors.opening();
    dom.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
    const handle = props().handleScrollToSelection as () => boolean;
    expect(handle()).toBe(true);
    tick(0);
    expect(scroller.scrollTop).toBe(0);
    expect(autoScrollRemaining(scroller)).toBe(200);
    tick();
    const first = scroller.scrollTop;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(10);
    for (let i = 0; i < 11; i++) tick(); // 192 ms
    expect(scroller.scrollTop).toBeLessThan(530);
    tick();
    expect(scroller.scrollTop).toBe(530);
    expect(autoScrollRemaining(scroller)).toBe(0);
    closed();
  });

  it("glides when deselecting, while the toolbar of the collapsing range is still open", () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    const tick = (ms = 16) => {
      now += ms;
      for (const cb of frames.splice(0)) cb(now);
    };
    const { scroller, dom, props, selection, select } = setup(false);
    const closed = anchors.opening();
    // ArrowDown collapses the range: ProseMirror's scroll check sees the caret before the toolbar closes.
    dom.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    selection.empty = true;
    const handle = props().handleScrollToSelection as () => boolean;
    expect(handle()).toBe(true);
    select(true);
    tick(0);
    expect(autoScrollRemaining(scroller)).toBe(200);
    tick();
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBeLessThan(10);
    closed();
  });

  it("still scrolls a fresh caret at once while a surface is open (DEF-21)", () => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
    const { dom, props } = setup(true);
    const closed = anchors.opening();
    dom.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect((props().handleScrollToSelection as () => boolean)()).toBe(false);
    closed();
  });
});
