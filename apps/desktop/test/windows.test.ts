/**
 * DSK-06 (D-179): several windows, one note each. A new window opens cascaded from the one it was
 * opened from, its normal size, never filling or snapping, and back at the work area's corner when
 * it would leave it; and a window opened for a note never changes which note the app reopens.
 */
import { describe, expect, it } from "vitest";
import { CASCADE_PX, cascadePlacement } from "../src/main/window/placement.ts";
import { stateFromWindow } from "../src/main/windows.ts";

const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };

describe("cascadePlacement", () => {
  it("opens right and down from the window it came from, its size, as a normal window", () => {
    const p = cascadePlacement({ x: 100, y: 80, width: 1100, height: 780 }, [display]);
    expect(p).toEqual({ content: { x: 100 + CASCADE_PX, y: 80 + CASCADE_PX, width: 1100, height: 780 }, mode: "normal", restore: { x: 132, y: 112, width: 1100, height: 780 }, fullScreen: false });
  });
  it("goes back to the work area's top left when it would leave it", () => {
    const p = cascadePlacement({ x: 800, y: 300, width: 1100, height: 780 }, [display]);
    expect(p.content).toMatchObject({ x: 0, y: 0, width: 1100, height: 780 });
  });
  it("is never larger than the work area", () => {
    const p = cascadePlacement({ x: 0, y: 0, width: 3000, height: 2000 }, [display]);
    expect(p.content.width).toBeLessThanOrEqual(1920);
    expect(p.content.height).toBeLessThanOrEqual(1040);
  });
});

describe("stateFromWindow", () => {
  it("the first window saves its state as it is", () => {
    expect(stateFromWindow({ version: 1, lastNotePath: "/b.md", focusMode: true }, { version: 1, lastNotePath: "/a.md" }, false)).toEqual({ version: 1, lastNotePath: "/b.md", focusMode: true });
  });
  it("a window opened for a note keeps the file's note to reopen", () => {
    expect(stateFromWindow({ version: 1, lastNotePath: "/b.md", focusMode: false }, { version: 1, lastNotePath: "/a.md" }, true)).toEqual({ version: 1, lastNotePath: "/a.md", focusMode: false });
    expect(stateFromWindow({ version: 1, lastNotePath: "/b.md" }, undefined, true)).toEqual({ version: 1 });
  });
});
