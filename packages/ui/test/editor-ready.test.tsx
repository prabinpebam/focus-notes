// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorSurface, EDITOR_ACTION_EVENT } from "../src/host/EditorSurface/EditorSurface.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("FND-04: accepts a target as soon as the mounted editor reports ready", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const result = vi.fn();
  const ready = vi.fn(() => window.dispatchEvent(new CustomEvent(EDITOR_ACTION_EVENT, {
    detail: { id: "find.select", args: { query: "heron", index: 2 } },
  })));
  try {
    for (const [index, title] of ["Garden diary", "Public diary", "Garden diary"].entries()) {
      await act(async () => root.render(createElement(EditorSurface, {
        documentKey: `note-${index}`, initialValue: `# ${title}\n\nOne heron, two heron, three Heron.\n`, label: "Note",
        findOpen: true, findQuery: "heron", onReady: ready, onFindResult: result,
      })));
      expect(ready).toHaveBeenCalledTimes(index + 1);
      act(() => vi.advanceTimersByTime(60));
      expect(result).toHaveBeenLastCalledWith({ count: 3, current: 3, invalid: false, wrapped: false, replaced: 0 });
    }
  } finally { act(() => root.unmount()); host.remove(); vi.useRealTimers(); }
});

for (const keyboard of [false, true]) it(`OFB.16: inserting a table from a ${keyboard ? "keyboard" : "pointer"} menu focuses its first cell in the same task`, async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const menu = document.createElement("button");
  menu.setAttribute("data-floating-child", "");
  if (keyboard) menu.setAttribute("data-focus-visible", "");
  document.body.append(menu);
  try {
    await act(async () => root.render(createElement(EditorSurface, { documentKey: "table-insertion", initialValue: "# Plan\n\n", label: "Note" })));
    menu.focus();
    expect(document.activeElement).toBe(menu);
    act(() => window.dispatchEvent(new CustomEvent(EDITOR_ACTION_EVENT, { detail: { id: "table.insert", args: {} } })));
    expect(host.querySelectorAll("table th")).toHaveLength(3);
    expect(document.activeElement).toBe(host.querySelector("[contenteditable]"));
    expect(document.getSelection()?.anchorNode?.parentElement?.closest("th")).toBe(host.querySelector("th"));
    act(() => menu.focus());
    expect(document.activeElement).toBe(host.querySelector("[contenteditable]"));
  } finally { act(() => root.unmount()); host.remove(); menu.remove(); }
});
