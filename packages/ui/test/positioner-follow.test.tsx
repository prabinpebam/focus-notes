// @vitest-environment happy-dom
/**
 * DEF-25 (DEF-21, D-156): the note scrolled from a frame's callback (the reading zone keeping the
 * caret in its band) places an open anchored surface again in that same frame. A scroll made there
 * reaches scroll listeners only in the next frame, so the slash menu sat a frame where the caret had
 * been: over the caret's row, or travelling from there.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { anchors } from "../src/behaviors/anchors.ts";
import { Positioner } from "../src/layouts/Positioner/Positioner.tsx";
import * as s from "../src/layouts/Positioner/Positioner.css.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

describe("anchors.moved", () => {
  it("calls every follower at once, and none after it stops following", () => {
    const f = vi.fn();
    const off = anchors.onMoved(f);
    anchors.moved();
    expect(f).toHaveBeenCalledTimes(1);
    off();
    anchors.moved();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("a Positioner when the note scrolls in a frame's callback (DEF-25)", () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    anchors.set("caret", null);
  });

  it("is placed again against the anchor where it is now, in the same frame, with no frame callback in between", () => {
    let top = 400;
    const read = () => ({ top, bottom: top + 20, left: 100, right: 100 });
    anchors.set("caret", read(), read);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(Positioner, { anchor: "caret", placement: "below", align: "start" }, "menu")));
    const el = host.querySelector("[data-editor-companion]") as HTMLElement;
    const y = () => parseFloat(el.style.getPropertyValue(name(s.yVar)));
    expect(y()).toBeGreaterThanOrEqual(420);
    // The reading zone scrolls the note up 124 px in its frame callback and says so.
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");
    top = 276;
    anchors.moved();
    expect(y()).toBeGreaterThanOrEqual(296);
    expect(y()).toBeLessThan(400);
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });
});
