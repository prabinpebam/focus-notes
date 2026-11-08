// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemCard } from "../../ui/src/primitives/ItemCard/ItemCard.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("independent GitHub references in cards (D-393)", () => {
  it("keeps card open, repository and account as sibling keyboard targets", () => {
    const calls: string[] = [];
    act(() => root.render(createElement(ItemCard, {
      title: "notes", detail: "Private · @ada", icon: "github",
      label: "Open notes", titleLabel: "Open ada/notes on GitHub", detailLabel: "Open @ada on GitHub",
      onPress: () => calls.push("project"), onTitlePress: () => calls.push("repository"), onDetailPress: () => calls.push("account"),
    })));
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Open notes", "Open ada/notes on GitHub", "Open @ada on GitHub",
    ]);
    expect(host.querySelector("button button")).toBeNull();
    for (const button of buttons) {
      button.focus();
      expect(document.activeElement).toBe(button);
    }
    act(() => buttons[1]!.click());
    act(() => buttons[2]!.click());
    expect(calls).toEqual(["repository", "account"]);
    act(() => buttons[0]!.click());
    expect(calls).toEqual(["repository", "account", "project"]);
  });
  it("has no fictional GitHub target on a local-only card", () => {
    act(() => root.render(createElement(ItemCard, { title: "Local project", detail: "On this computer only", icon: "hardDrive" })));
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });
});
