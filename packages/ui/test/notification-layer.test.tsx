// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Layer } from "../src/layouts/Layer/Layer.tsx";
import { Toast } from "../src/primitives/Toast/Toast.tsx";
import * as styles from "../src/layouts/Layer/Layer.css.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps toast controls in React Aria's accessible top layer, using the toast stacking token", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(Layer, { layer: "toast" }, createElement("button", null, "Retry"))));
    const top = host.querySelector("[data-react-aria-top-layer]");
    expect(top?.classList.contains(styles.layer.toast)).toBe(true);
    expect(top?.querySelector("button")?.textContent).toBe("Retry");
    act(() => root.render(createElement(Layer, { layer: "panel" }, "Content")));
    expect(host.querySelector("[data-react-aria-top-layer]")).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it("returns focus to the connected field when its focused notification is removed", () => {
  const field = document.createElement("input");
  const host = document.createElement("div");
  document.body.append(field, host);
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(Toast, { message: "Failed", tone: "error", actionLabel: "Retry", dismissLabel: "Dismiss" })));
    field.focus();
    act(() => host.querySelector("button")!.focus());
    expect(document.activeElement).toBe(host.querySelector("button"));
    act(() => root.render(null));
    expect(document.activeElement).toBe(field);
  } finally { act(() => root.unmount()); field.remove(); host.remove(); }
});

it.each(["hover", "focus"] as const)("keeps the timer paused when %s ends but the other cause remains", (first) => {
  const outside = document.createElement("button");
  const host = document.createElement("div");
  document.body.append(outside, host);
  const root = createRoot(host);
  const paused = vi.fn();
  try {
    act(() => root.render(createElement(Toast, { message: "Saved", actionLabel: "View", dismissLabel: "Dismiss", onPausedChange: paused })));
    const toast = host.querySelector<HTMLElement>("[data-surface=toast]")!;
    const [action, dismiss] = [...toast.querySelectorAll("button")];
    act(() => toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: outside })));
    act(() => action!.focus());
    expect(paused.mock.calls).toEqual([[{ paused: true }]]);
    act(() => dismiss!.focus());
    expect(paused.mock.calls).toEqual([[{ paused: true }]]);
    if (first === "hover") {
      act(() => toast.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: outside })));
    } else {
      act(() => outside.focus());
    }
    expect(paused.mock.calls).toEqual([[{ paused: true }]]);
    if (first === "hover") {
      act(() => outside.focus());
    } else {
      act(() => toast.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: outside })));
    }
    expect(paused.mock.calls).toEqual([[{ paused: true }], [{ paused: false }]]);
  } finally { act(() => root.unmount()); outside.remove(); host.remove(); }
});
