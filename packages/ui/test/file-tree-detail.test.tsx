// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileTree } from "../src/primitives/FileTree/FileTree.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

it("FIL-18: filename detail describes the row without replacing its title and visibility name", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(FileTree, { id: "files", label: "Files", items: [
    { id: "plan", kind: "note", level: 1, label: "Plan", description: "public", detail: "original.md", title: "notes/original.md" },
  ] })));
  const row = host.querySelector<HTMLElement>('[role="treeitem"]')!;
  const named = row.getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id)!.textContent).join(" ");
  expect(named).toBe("Plan, public");
  expect(document.getElementById(row.getAttribute("aria-describedby")!)!.textContent).toBe("original.md");
  expect(row.title).toBe("notes/original.md");
});
