// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { StatusRow } from "../src/primitives/StatusRow/StatusRow.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps the recovery button, focus and open Details mounted while only that action is inert", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const action = vi.fn();
  const render = (actionBusy: boolean) => act(() => root.render(createElement(StatusRow, {
    message: "The list could not be read. Notes are unchanged.", actionLabel: "Retry",
    actionBusy, actionBusyLabel: "Trying again", detailsLabel: "Details", details: "Access was refused.", onAction: action,
  })));
  try {
    render(false);
    const button = host.querySelector("button")!, details = host.querySelector("details")!;
    expect(button.textContent).toBe("Retry");
    details.open = true; button.focus();
    act(() => button.click());
    expect(action).toHaveBeenCalledOnce();
    render(true);
    expect(button.textContent).toBe("Trying again");
    expect(host.querySelector("button")).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(host.querySelector("details")).toBe(details);
    expect(details.open).toBe(true);
    act(() => button.click());
    expect(action).toHaveBeenCalledOnce();
    render(false);
    expect(button.textContent).toBe("Retry");
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(button);
  } finally { act(() => root.unmount()); host.remove(); }
});
