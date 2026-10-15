// @vitest-environment happy-dom
/** A menu's Home and End move focus only: the browser's own smooth scroll is prevented (DEF-9). */
import { describe, expect, it } from "vitest";
import { ownHomeEnd, ownsKey } from "../src/behaviors/menu-keys.ts";

const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};

describe("DEF-9: a menu owns Home and End", () => {
  it("prevents the browser's Home and End, with or without modifiers, and nothing else", () => {
    const menu = document.createElement("div");
    const item = document.createElement("div");
    menu.append(item);
    ownHomeEnd(menu);
    expect(press(item, "Home").defaultPrevented).toBe(true);
    expect(press(item, "End").defaultPrevented).toBe(true);
    expect(press(item, "End", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    for (const key of ["ArrowDown", "ArrowUp", "PageDown", "Enter", "Escape", "a"]) expect(press(item, key).defaultPrevented, key).toBe(false);
    expect(ownsKey({ key: "Home" })).toBe(true);
    expect(ownsKey({ key: "Tab" })).toBe(false);
  });

  it("listens once per element, however often React calls the ref", () => {
    const menu = document.createElement("div");
    let added = 0;
    const add = menu.addEventListener.bind(menu);
    menu.addEventListener = ((...a: Parameters<typeof add>) => (added++, add(...a))) as typeof menu.addEventListener;
    ownHomeEnd(menu);
    ownHomeEnd(null);
    ownHomeEnd(menu);
    expect(added).toBe(1);
  });
});
