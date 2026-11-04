// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SegmentedControl } from "../src/primitives/SegmentedControl/SegmentedControl.tsx";
import { TextField } from "../src/primitives/TextField/TextField.tsx";
import { ProjectMark } from "../src/primitives/ProjectMark/ProjectMark.tsx";
import { PickerButton } from "../src/primitives/PickerButton/PickerButton.tsx";
import { Slider } from "../src/primitives/Slider/Slider.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.useRealTimers());

it("previews slider keys immediately, saves once after a 500 ms pause or blur, and retains the focusable thumb while pending", async () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(), preview = vi.fn();
  const render = (commit: "rest" | "pending") => act(() => root.render(createElement(Slider, {
    label: "Reading width", min: 50, max: 100, step: 5, value: 70, commit, onChange: change, onPreview: preview,
  })));
  try {
    render("rest");
    const input = host.querySelector<HTMLInputElement>("input")!;
    const arrow = () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true, cancelable: true }));
    };
    act(() => { input.focus(); arrow(); });
    act(arrow);
    expect(preview).toHaveBeenLastCalledWith({ value: 80 });
    expect(change).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(change).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(change).toHaveBeenCalledExactlyOnceWith({ value: 80 });
    render("pending");
    expect(document.activeElement).toBe(input);
    expect(input.disabled).toBe(false);
    act(arrow);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(change).toHaveBeenCalledTimes(1);
    render("rest");
    act(() => { arrow(); input.blur(); });
    expect(change).toHaveBeenLastCalledWith({ value: 85 });
  } finally { act(() => root.unmount()); host.remove(); }
});

it("keeps a picker trigger focused and inert pending, with persistent failed and confirmed border feedback", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const press = vi.fn();
  const render = (commit: "rest" | "pending" | "confirmed" | "failed") => act(() => root.render(createElement(PickerButton, {
    label: "Font", value: "Serif", variant: "fontTile", commit, onPress: press,
  })));
  try {
    render("rest");
    const button = host.querySelector("button")!;
    button.focus();
    render("pending");
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(press).not.toHaveBeenCalled();
    render("failed");
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("data-commit")).toBe("failed");
    render("confirmed");
    expect(button.getAttribute("data-commit")).toBe("confirmed");
    expect(document.activeElement).toBe(button);
  } finally { act(() => root.unmount()); host.remove(); }
});

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
