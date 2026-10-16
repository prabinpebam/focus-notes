/**
 * DEF-21: a surface anchored to the note follows its anchor as the note scrolls (the anchor is read
 * live when it's placed, never a frame old), and opening one ends D-156's auto-scroll first.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { anchors } from "../src/behaviors/anchors.ts";

afterEach(() => anchors.set("caret", null));

describe("anchors read live (DEF-21)", () => {
  it("gives the rectangle where the anchor is now, not where it was published", () => {
    let top = 400;
    const read = () => ({ top, bottom: top + 20, left: 100, right: 100 });
    anchors.set("caret", read(), read);
    top = 300; // the note scrolled; no publish yet
    expect(anchors.get("caret")).toMatchObject({ top: 300, bottom: 320 });
  });

  it("falls back to the published rectangle when the reader can't tell (the document changed) or throws", () => {
    anchors.set("caret", { top: 10, bottom: 30, left: 0, right: 0 }, () => null);
    expect(anchors.get("caret")).toMatchObject({ top: 10 });
    anchors.set("caret", { top: 11, bottom: 31, left: 0, right: 0 }, () => {
      throw new RangeError("position out of range");
    });
    expect(anchors.get("caret")).toMatchObject({ top: 11 });
  });

  it("keeps a new reader even when the rectangle published is the same", () => {
    const rect = { top: 50, bottom: 70, left: 5, right: 5 };
    anchors.set("caret", rect, () => rect);
    anchors.set("caret", { ...rect }, () => ({ ...rect, top: 60 }));
    expect(anchors.get("caret")).toMatchObject({ top: 60 });
  });

  it("closing the anchor drops its reader", () => {
    anchors.set("caret", { top: 1, bottom: 2, left: 0, right: 0 }, () => ({ top: 9, bottom: 10, left: 0, right: 0 }));
    anchors.set("caret", null);
    expect(anchors.get("caret")).toBeNull();
  });
});

describe("an anchored surface opening (DEF-21)", () => {
  it("tells the note first (its auto-scroll ends), and is open until it says it closed", () => {
    const finish = vi.fn();
    const off = anchors.onOpen(finish);
    expect(anchors.anyOpen).toBe(false);
    const closed = anchors.opening();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(anchors.anyOpen).toBe(true);
    const other = anchors.opening();
    expect(finish).toHaveBeenCalledTimes(2);
    closed();
    closed(); // twice is once
    expect(anchors.anyOpen).toBe(true);
    other();
    expect(anchors.anyOpen).toBe(false);
    off();
    anchors.opening()();
    expect(finish).toHaveBeenCalledTimes(2); // no longer listening
  });
});
