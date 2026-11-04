// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SegmentedControl } from "../src/primitives/SegmentedControl/SegmentedControl.tsx";
import { TextField } from "../src/primitives/TextField/TextField.tsx";
import { ProjectMark } from "../src/primitives/ProjectMark/ProjectMark.tsx";
import { PickerButton } from "../src/primitives/PickerButton/PickerButton.tsx";
import { Slider } from "../src/primitives/Slider/Slider.tsx";
import { MenuButton } from "../src/primitives/MenuButton/MenuButton.tsx";
import { IconButton } from "../src/primitives/IconButton/IconButton.tsx";
import { ThemeGallery } from "../src/primitives/ThemeGallery/ThemeGallery.tsx";
import { ColorField } from "../src/primitives/ColorField/ColorField.tsx";
import { Switch } from "../src/primitives/Switch/Switch.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.useRealTimers());

it("keeps a colour field focused and editable after refusal, with scoped Retry and Revert", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const retry = vi.fn(), revert = vi.fn();
  const render = (commit: "rest" | "pending" | "confirmed" | "failed") => act(() => root.render(createElement("div", {},
    createElement(ColorField, { label: "Colour", value: "#123456", commit, error: "Not saved", retryLabel: "Retry", revertLabel: "Revert", onRetry: retry, onRevert: revert }),
    createElement(TextField, { label: "Neighbour", value: "Still editable" }),
  )));
  try {
    render("rest");
    const [input, neighbour] = host.querySelectorAll<HTMLInputElement>("input");
    input!.focus();
    render("pending");
    expect(document.activeElement).toBe(input);
    expect(input!.readOnly).toBe(true);
    expect(input!.disabled).toBe(false);
    expect(neighbour!.readOnly).toBe(false);
    render("failed");
    expect(host.querySelector("input")).toBe(input);
    expect(input!.value).toBe("#123456");
    expect(input!.readOnly).toBe(false);
    expect(input!.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Retry")!.click());
    act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Revert")!.click());
    expect(retry).toHaveBeenCalledOnce();
    expect(revert).toHaveBeenCalledOnce();
    render("confirmed");
    expect(host.querySelector("input")).toBe(input);
    expect(host.querySelector("[data-commit=confirmed]")).not.toBeNull();
    expect(host.querySelector("button")).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); }
});

it("keeps the same switch focusable and at its stored value through pending and failed recovery", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(), retry = vi.fn();
  const render = (commit: "rest" | "pending" | "confirmed" | "failed", checked = false) => act(() => root.render(createElement("div", {},
    createElement(Switch, { label: "Link", checked, onLabel: "On", offLabel: "Off", commit, error: "Not saved", retryLabel: "Retry", onChange: change, onRetry: retry }),
    createElement(TextField, { label: "Neighbour", value: "Still editable" }),
  )));
  try {
    render("rest");
    const input = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    act(() => input.focus());
    render("pending");
    expect(document.activeElement).toBe(input);
    expect(input.disabled).toBe(false);
    expect(input.checked).toBe(false);
    act(() => input.click());
    expect(change).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('input:not([type=checkbox])')!.readOnly).toBe(false);
    render("failed");
    expect(host.querySelector("input[type=checkbox]")).toBe(input);
    expect(input.checked).toBe(false);
    expect(document.activeElement).toBe(input);
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
    render("confirmed", true);
    expect(host.querySelector("input[type=checkbox]")).toBe(input);
    expect(input.checked).toBe(true);
    expect(host.querySelector("button")).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); }
});

it.each(["select", "icon"] as const)("keeps a committing %s menu trigger focused and inert, then shows its outcome after the menu closes", (variant) => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (commit: "rest" | "pending" | "confirmed" | "failed") => act(() => root.render(createElement(MenuButton, {
    label: "Font", variant, commit, sections: [{ id: "fonts", items: [{ id: "serif", label: "Serif" }] }],
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
    expect(button.getAttribute("aria-expanded")).toBe("false");
    render("failed");
    expect(button.getAttribute("data-commit")).toBe("failed");
    expect(button.getAttribute("aria-busy")).toBeNull();
    render("confirmed");
    expect(button.getAttribute("data-commit")).toBe("confirmed");
    expect(document.activeElement).toBe(button);
  } finally { act(() => root.unmount()); host.remove(); }
});

it("keeps an icon toggle focused and blocks only its pending commit", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const press = vi.fn();
  const render = (commit: "rest" | "pending" | "failed") => act(() => root.render(createElement(IconButton, {
    icon: "focus", label: "Focus", toggle: true, pressed: false, commit, onPress: press,
  })));
  try {
    render("rest");
    const button = host.querySelector("button")!;
    button.focus();
    render("pending");
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(press).not.toHaveBeenCalled();
    render("failed");
    act(() => button.click());
    expect(press).toHaveBeenCalledOnce();
  } finally { act(() => root.unmount()); host.remove(); }
});

it("theme arrows only preview and pending tiles retain focus without accepting another choice", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const preview = vi.fn(), choose = vi.fn();
  const render = (commit: "rest" | "pending" | "failed", value = "paper") => act(() => root.render(createElement(ThemeGallery, {
    label: "Themes", items: [{ id: "paper", label: "Paper", kind: "light", badge: "AAA" }, { id: "dusk", label: "Dusk", kind: "dark", badge: "AAA" }],
    value, commit, onPreview: preview, onChoose: choose,
  })));
  try {
    render("rest");
    const tiles = host.querySelectorAll<HTMLElement>("[role=option]");
    act(() => {
      tiles[0]!.focus();
      tiles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(preview).toHaveBeenCalledExactlyOnceWith({ id: "dusk" });
    expect(choose).not.toHaveBeenCalled();
    render("pending", "dusk");
    expect(document.activeElement).toBe(tiles[1]);
    act(() => {
      tiles[1]!.click();
      tiles[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(choose).not.toHaveBeenCalled();
    render("failed", "dusk");
    act(() => tiles[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(choose).toHaveBeenCalledExactlyOnceWith({ id: "dusk" });
  } finally { act(() => root.unmount()); host.remove(); }
});

it("keeps a compact busy menu focusable and inert without reopening it when the operation ends", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (busy: boolean) => act(() => root.render(createElement(MenuButton, {
    label: "Copy again", variant: "text", busy, sections: [{ id: "copy", items: [{ id: "link", label: "Copy link" }] }],
  })));
  try {
    render(false);
    const button = host.querySelector("button")!;
    button.focus();
    render(true);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("false");
    render(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  } finally { act(() => root.unmount()); host.remove(); }
});

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
