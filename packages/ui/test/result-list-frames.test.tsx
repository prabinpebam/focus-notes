// @vitest-environment happy-dom
/**
 * PRF-14, D-151 (12): a long result list draws a screen of rows in the frame its items arrive in and
 * the rest a frame later, both when it opens and when it grows from a short one (Spotlight's query
 * cleared); whatever the person could see stays drawn.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FIRST_ROWS, ResultList, rowsInFirstFrame } from "../src/primitives/ResultList/ResultList.tsx";
import type { ResultItem } from "../src/data.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("rowsInFirstFrame", () => {
  it("a new list draws a screen, never short of its active row; a short one draws all", () => {
    expect(rowsInFirstFrame(FIRST_ROWS, 0, 0)).toBeNull();
    expect(rowsInFirstFrame(180, 0, -1)).toBe(FIRST_ROWS);
    expect(rowsInFirstFrame(180, 0, 100)).toBe(101);
    expect(rowsInFirstFrame(180, 0, 179)).toBeNull();
  });
  it("a list that grows keeps every row it drew and adds a screen past them and past its active row", () => {
    expect(rowsInFirstFrame(180, 4, 0)).toBe(4 + FIRST_ROWS);
    expect(rowsInFirstFrame(180, 40, 60)).toBe(61 + FIRST_ROWS);
    expect(rowsInFirstFrame(20, 4, 0)).toBeNull();
    expect(rowsInFirstFrame(180, 170, 0)).toBeNull();
  });
});

const items = (n: number, prefix = "a"): ResultItem[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, label: `${prefix} ${i}` }));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r)));

describe("ResultList's frames", () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });
  const render = (list: ResultItem[], activeId?: string) =>
    act(() => root!.render(createElement(ResultList, { label: "Results", id: "r", items: list, ...(activeId ? { activeId } : {}) })));
  const options = () => host!.querySelectorAll('[role="option"]').length;

  it("growing from a few matches to every row draws a screen first, then all of them a frame later", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    render(items(180), "a0");
    expect(options()).toBe(FIRST_ROWS);
    await act(frame);
    expect(options()).toBe(180);
    // A query: a few matches, all drawn at once.
    render(items(4, "b"), "b0");
    expect(options()).toBe(4);
    // The query cleared: the rows drawn before and a screen, then the rest.
    render(items(180), "a0");
    expect(options()).toBe(4 + FIRST_ROWS);
    await act(frame);
    expect(options()).toBe(180);
    // A list that changes without growing is drawn whole at once.
    render(items(180, "c"), "c0");
    expect(options()).toBe(180);
  });

  it("never stops short of the active row while the rest are coming", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    render(items(4, "b"), "b0");
    render(items(180), "a150");
    expect(options()).toBe(151 + FIRST_ROWS);
    expect(host.querySelector('[aria-selected="true"]')?.textContent).toBe("a 150");
    await act(frame);
    expect(options()).toBe(180);
  });
});
