// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileTree } from "../src/primitives/FileTree/FileTree.tsx";
import type { TreeItem } from "../src/data.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

it("renders at most 200 of 10,000 rows while End, Home and type-ahead reach off-screen rows", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const items: TreeItem[] = Array.from({ length: 10_000 }, (_, i) => ({
    id: String(i), label: i === 5678 ? "Zebra" : `Note ${i}`, level: 1,
    kind: "note", parent: "", selected: false, readOnly: true,
  }));
  let focusId = "0";
  const render = () => root!.render(createElement(FileTree, {
    id: "review", label: "Contents", items, focusId, windowed: true,
    onSelect: ({ id }) => { focusId = id; render(); },
  }));
  act(render);
  const rows = () => host!.querySelectorAll<HTMLElement>('[role="treeitem"]');
  expect(rows().length).toBeLessThanOrEqual(200);
  act(() => rows()[0]!.focus());
  const key = (key: string) => act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
  key("End");
  expect(focusId).toBe("9999");
  expect(document.activeElement?.id).toBe("review-r-9999");
  expect(rows().length).toBeLessThanOrEqual(200);
  key("Home");
  expect(document.activeElement?.id).toBe("review-r-0");
  key("z");
  expect(focusId).toBe("5678");
  expect(document.activeElement?.id).toBe("review-r-5678");
  expect(rows().length).toBeLessThanOrEqual(200);
});
