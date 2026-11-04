// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SegmentedControl } from "../src/primitives/SegmentedControl/SegmentedControl.tsx";
import { TextField } from "../src/primitives/TextField/TextField.tsx";
import { ProjectMark } from "../src/primitives/ProjectMark/ProjectMark.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.useRealTimers());

it("keeps compact project choices focusable, blocks the pending group and draws feedback only on its chosen mark", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const press = vi.fn();
  const render = (commit: "rest" | "pending" | "failed") => act(() => root.render(createElement("div", {},
    ...["blue", "teal"].map((choice) => createElement(ProjectMark, { key: choice, label: choice, choice, value: "blue", commit, onChange: press })),
  )));
  try {
    render("rest");
    const buttons = host.querySelectorAll("button");
    buttons[0]!.focus();
    render("pending");
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0]!.getAttribute("aria-busy")).toBe("true");
    expect(buttons[1]!.getAttribute("data-commit")).toBeNull();
    act(() => { buttons[0]!.click(); buttons[1]!.click(); });
    expect(press).not.toHaveBeenCalled();
    expect(host.querySelector("button:disabled")).toBeNull();
    render("failed");
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0]!.getAttribute("data-commit")).toBe("failed");
    act(() => buttons[1]!.click());
    expect(press).toHaveBeenCalledWith({ value: "teal" });
  } finally { act(() => root.unmount()); host.remove(); }
});

it("debounces keyboard selection for 500 ms and keeps the selected radio focusable during pending", async () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  const render = (commit: "rest" | "pending") => act(() => root.render(createElement(SegmentedControl, {
    label: "Scale", value: "one", options: [{ id: "one", label: "One" }, { id: "two", label: "Two" }], commit, onChange: change,
  })));
  try {
    render("rest");
    const first = host.querySelector<HTMLInputElement>("input")!;
    act(() => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(change).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(change).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(change).toHaveBeenCalledWith({ value: "two" });
    const focused = document.activeElement;
    render("pending");
    expect(document.activeElement).toBe(focused);
    expect(host.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    expect(host.querySelector("input:disabled")).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it("keeps a standalone field's DOM node and focus through its pending and failed states", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (commit: "rest" | "pending" | "failed") => act(() => root.render(createElement(TextField, {
    label: "Name", value: "Kept draft", commitOnBlur: true, commit, error: "Not saved", retryLabel: "Retry",
  })));
  try {
    render("rest");
    const input = host.querySelector<HTMLInputElement>("input")!;
    input.focus();
    render("pending");
    expect(host.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    render("failed");
    expect(input.value).toBe("Kept draft");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
