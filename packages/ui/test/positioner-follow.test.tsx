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
    anchors.set("rewrite", null);
    vi.restoreAllMocks();
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

  it("D-265: remeasures an edge-pinned prompt on resize so Return exposes the retained draft within the usable viewport", () => {
    let bottom = 800, fragmentBottom = 200;
    const reveal = vi.fn(() => { fragmentBottom = 0; });
    const read = () => ({
      left: 100, right: 250, top: fragmentBottom - 20, bottom: fragmentBottom,
      fragments: [{ left: 100, right: 250, top: fragmentBottom - 20, bottom: fragmentBottom }],
      viewport: { left: 0, right: 480, top: 0, bottom }, reveal,
    });
    anchors.set("rewrite", read(), read);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const el = this.closest<HTMLElement>("[data-selection-popover]");
      const limit = parseFloat(el?.style.getPropertyValue(name(s.maxHeightVar)) ?? "") || 276;
      const height = this.parentElement === el
        ? el?.dataset.edge ? 0 : Math.min(276, limit)
        : this.tagName === "TEXTAREA" ? 57 : 32;
      return new DOMRect(0, 0, 360, height);
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(Positioner, {
      anchor: "rewrite", returnAboveLabel: "Return above", returnBelowLabel: "Return below",
    }, createElement("textarea", { defaultValue: "Retained draft" }))));
    const el = host.querySelector<HTMLElement>("[data-selection-popover]")!;
    expect(el.dataset.edge).toBeUndefined();

    fragmentBottom = -100;
    act(() => anchors.moved());
    expect(el.dataset.edge).toBe("top");
    bottom = 210;
    act(() => window.dispatchEvent(new Event("resize")));
    act(() => anchors.moved());
    expect(parseFloat(el.style.getPropertyValue(name(s.maxHeightVar)))).toBe(210);
    act(() => el.querySelector<HTMLButtonElement>("button")!.click());
    expect(reveal).toHaveBeenCalledOnce();
    expect(el.dataset.edge).toBeUndefined();
    expect(el.querySelector("textarea")?.value).toBe("Retained draft");
    expect(el.firstElementChild?.getAttribute("aria-hidden")).toBeNull();
    expect(parseFloat(el.style.getPropertyValue(name(s.yVar))) + 210).toBeLessThanOrEqual(bottom);
  });

  it("D-266: a renewed focus request reveals the retained fragment before restoring prompt focus", () => {
    let fragmentBottom = 200;
    const reveal = vi.fn(() => { fragmentBottom = 200; });
    const read = () => ({
      left: 100, right: 250, top: fragmentBottom - 20, bottom: fragmentBottom,
      fragments: [{ left: 100, right: 250, top: fragmentBottom - 20, bottom: fragmentBottom }],
      viewport: { left: 0, right: 480, top: 0, bottom: 800 }, reveal,
    });
    anchors.set("rewrite", read(), read);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 360, 100));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = (focusRequest: number) => act(() => root!.render(createElement(Positioner, {
      anchor: "rewrite", focusRequest, returnAboveLabel: "Return above", returnBelowLabel: "Return below",
    }, createElement("textarea", { defaultValue: "Retained draft" }))));
    render(1);
    expect(reveal).not.toHaveBeenCalled();
    const el = host.querySelector<HTMLElement>("[data-selection-popover]")!;
    const area = el.querySelector("textarea")!;
    act(() => area.focus());
    fragmentBottom = -100;
    act(() => anchors.moved());
    expect(el.dataset.edge).toBe("top");
    expect(document.activeElement).not.toBe(area);

    render(2);
    expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ fragment: 0 }));
    expect(el.dataset.edge).toBeUndefined();
    expect(el.firstElementChild?.getAttribute("aria-hidden")).toBeNull();
    expect(document.activeElement).toBe(area);
    expect(area.value).toBe("Retained draft");
    render(2);
    expect(reveal).toHaveBeenCalledOnce();
    fragmentBottom = -100;
    render(3);
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(el.dataset.edge).toBeUndefined();
    expect(document.activeElement).toBe(area);

    fragmentBottom = -100;
    act(() => anchors.moved());
    const content = el.firstElementChild as HTMLElement;
    content.style.visibility = "hidden";
    render(4);
    expect(document.activeElement).not.toBe(area);
    content.style.visibility = "visible";
    act(() => content.dispatchEvent(new Event("transitionend", { bubbles: true })));
    expect(document.activeElement).toBe(area);
  });
});
