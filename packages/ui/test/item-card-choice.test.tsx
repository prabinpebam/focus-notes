// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemCard } from "../src/primitives/ItemCard/ItemCard.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

it("supports 30 native radio choices with actions outside the choice label", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const choose = vi.fn();
  const change = vi.fn();
  act(() => root!.render(createElement("div", {}, Array.from({ length: 30 }, (_, i) =>
    createElement(ItemCard, {
      key: i, title: `Connection ${i}`, label: `Default: Connection ${i}`,
      choiceGroup: "test-default", choiceValue: String(i), selected: i === 0, onChoose: choose,
    }, createElement("button", { onClick: change }, "Change"))))));
  const radios = host.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  expect(radios).toHaveLength(30);
  expect([...radios].filter((r) => r.checked)).toHaveLength(1);
  expect(radios[0]!.getAttribute("aria-label")).toBe("Default: Connection 0");
  expect(host.querySelector("label button")).toBeNull();
  act(() => host!.querySelector("button")!.click());
  expect(change).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
  act(() => radios[1]!.click());
  expect(choose).toHaveBeenCalledWith({ value: "1" });
});

it("keeps the persisted choice, radio identity and focus while saving without accepting another choice", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const choose = vi.fn();
  const render = (busy: boolean) => act(() => root!.render(createElement(ItemCard, {
    title: "Saved", choiceGroup: "test-default", choiceValue: "saved", selected: true, busy, onChoose: choose,
  })));
  render(false);
  const radio = host.querySelector<HTMLInputElement>("input")!;
  radio.focus();
  render(true);
  expect(host.querySelector("input")).toBe(radio);
  expect(document.activeElement).toBe(radio);
  expect(radio.checked).toBe(true);
  expect(radio.disabled).toBe(false);
  expect(radio.getAttribute("aria-disabled")).toBe("true");
  expect(host.querySelector("[data-item-card]")?.getAttribute("aria-busy")).toBe("true");
  act(() => radio.click());
  expect(choose).not.toHaveBeenCalled();
  expect(radio.checked).toBe(true);
  const arrow = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
  act(() => radio.dispatchEvent(arrow));
  expect(arrow.defaultPrevented).toBe(true);
  render(false);
  expect(host.querySelector("input")).toBe(radio);
  expect(document.activeElement).toBe(radio);
  expect(radio.getAttribute("aria-disabled")).toBeNull();
});
