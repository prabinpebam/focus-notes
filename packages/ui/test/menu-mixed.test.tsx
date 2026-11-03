// @vitest-environment happy-dom
/** A check item over images that disagree is announced as mixed (D-334, IMG-11). */
import { afterEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CommandMenu } from "../src/primitives/MenuButton/MenuButton.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

it("marks a mixed check item aria-checked=mixed with a dash, and plain items true or false", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(CommandMenu, { label: "Images", sections: [{ id: "images", label: "Images · 2 selected", items: [
    { id: "rounded", label: "Rounded corners", checked: false, mixed: true },
    { id: "fit", label: "Limit height", checked: true },
    { id: "other", label: "Other", checked: false },
  ] }] })));
  const item = (label: string) => [...host!.querySelectorAll<HTMLElement>("[role^=menuitem]")].find((e) => e.textContent?.includes(label))!;
  expect(item("Rounded corners").getAttribute("aria-checked")).toBe("mixed");
  expect(item("Rounded corners").textContent).toContain("–");
  expect(item("Limit height").getAttribute("aria-checked")).toBe("true");
  expect(item("Other").getAttribute("aria-checked")).toBe("false");
});
