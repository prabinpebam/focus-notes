// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MorphPanel } from "../src/primitives/MorphPanel/MorphPanel.tsx";
import { ToolbarRow } from "../src/layouts/ToolbarRow/ToolbarRow.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("UI-05: opening and reopening focus the toolbar before the next frame so immediate End is handled", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (open: boolean, preview = false) => act(() => root.render(
    <MorphPanel label="Toolbar" open={open} preview={preview}
      trigger={<button>Open toolbar</button>}
      content={<ToolbarRow label="Toolbar"><button>New note</button><button>More</button></ToolbarRow>} />,
  ));
  try {
    render(false);
    const [trigger, first, more] = host.querySelectorAll("button");
    trigger!.focus();
    for (let attempt = 0; attempt < 2; attempt++) {
      render(true);
      expect(document.activeElement).toBe(attempt === 0 ? first : more);
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
      expect(document.activeElement).toBe(more);
      render(false);
      trigger!.focus();
    }
    render(true, true);
    expect(document.activeElement).toBe(trigger);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
