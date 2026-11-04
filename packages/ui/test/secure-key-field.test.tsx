// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SecureKeyField } from "../src/compounds/SecureKeyField/SecureKeyField.tsx";
import type { CommitState } from "../src/primitives/CommitMark/CommitMark.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps a key local through checking and refusal, retries exactly that entry, and clears only after confirmation or Revert", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const save = vi.fn(), revert = vi.fn();
  const render = (commit: CommitState, disabled = false, entryScope = "original-destination") => act(() => root.render(createElement(SecureKeyField, {
    label: "Key", saveLabel: "Save key", pendingLabel: "Checking key", savedLabel: "Key saved",
    error: "Refused; entry kept", retryLabel: "Retry", revertLabel: "Revert",
    commit, disabled, entryScope, onSave: save, onRevert: revert,
  })));
  const enter = (value: string) => act(() => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  try {
    render("rest"); enter("synthetic-secret");
    const button = host.querySelector("button")!;
    button.focus();
    act(() => button.click());
    expect(save).toHaveBeenLastCalledWith({ key: "synthetic-secret" });
    expect(host.querySelector("input")!.value).toBe("synthetic-secret");
    render("pending", true);
    expect(host.querySelector("input")!.readOnly).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(save).toHaveBeenCalledOnce();
    render("failed");
    expect(host.textContent).toContain("Refused; entry kept");
    expect(host.querySelector("input")!.value).toBe("synthetic-secret");
    act(() => [...host.querySelectorAll("button")].find(b => b.textContent === "Retry")!.click());
    expect(save).toHaveBeenLastCalledWith({ key: "synthetic-secret" });
    render("pending"); render("confirmed");
    expect(host.querySelector("input")!.value).toBe("");
    render("rest"); enter("another-synthetic-secret"); render("failed");
    act(() => [...host.querySelectorAll("button")].find(b => b.textContent === "Revert")!.click());
    expect(host.querySelector("input")!.value).toBe("");
    expect(revert).toHaveBeenCalledOnce();
    enter("old-destination-secret");
    render("rest", false, "another-destination");
    expect(host.querySelector("input")!.value).toBe("");
  } finally { act(() => root.unmount()); host.remove(); }
});
