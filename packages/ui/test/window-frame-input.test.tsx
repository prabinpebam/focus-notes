// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WindowFrame } from "../src/host/WindowFrame/WindowFrame.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it.each(["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"])("keeps window %s input working when a surface stops bubbling pointer events", (kind) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onDrag = vi.fn();
  act(() => root!.render(createElement(WindowFrame, { frame: "rounded", resizable: true, menu: [], menuLabel: "Window", onDrag })));
  const band = document.createElement("div");
  band.dataset.dragBand = "";
  host.append(band);
  const target = kind === "move" ? band : document.querySelector(`[data-window-handle="${kind}"]`)!;
  for (const type of ["pointerdown", "pointerup"]) {
    target.addEventListener(type, (e) => e.stopPropagation());
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, screenX: 200, screenY: 100 }));
  }
  expect(onDrag.mock.calls.map(([event]) => `${event.phase}:${event.kind}`)).toEqual([`start:${kind}`, `end:${kind}`]);
});
