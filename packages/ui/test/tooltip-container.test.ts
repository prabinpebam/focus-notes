// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { tooltipContainer } from "../src/primitives/Tooltip/Tooltip.tsx";

afterEach(() => { document.body.replaceChildren(); });

describe("tooltip portals (D-392)", () => {
  it("keeps a MenuButton tooltip outside its scrolling popover in the drawn window", () => {
    const window = document.createElement("div");
    window.setAttribute("data-app-root", "");
    const popover = document.createElement("div");
    popover.setAttribute("data-surface", "popover");
    const button = document.createElement("button");
    popover.append(button); window.append(popover); document.body.append(window);
    expect(tooltipContainer(button, popover)).toBe(window);
  });

  it("retains an outer landmark rather than choosing a nested popover", () => {
    const main = document.createElement("main");
    const popover = document.createElement("div");
    popover.setAttribute("data-surface", "popover");
    const button = document.createElement("button");
    popover.append(button); main.append(popover); document.body.append(main);
    expect(tooltipContainer(button, popover)).toBe(main);
  });

  it("retains the provided overlay for a dialog tooltip without a popover", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("data-dialog-modal", "");
    const button = document.createElement("button"), overlay = document.createElement("div");
    dialog.append(button); document.body.append(dialog, overlay);
    expect(tooltipContainer(button, overlay)).toBe(overlay);
  });

  it("falls back to the native page, never a nested popover", () => {
    const popover = document.createElement("div");
    popover.setAttribute("data-surface", "popover");
    const button = document.createElement("button");
    popover.append(button); document.body.append(popover);
    expect(tooltipContainer(button, popover)).toBe(document.body);
  });
});
