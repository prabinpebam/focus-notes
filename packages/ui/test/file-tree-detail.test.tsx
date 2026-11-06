// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileTree } from "../src/primitives/FileTree/FileTree.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

it("FIL-18: the row names its visible title, visibility and filename, with the full path as its description", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(FileTree, { id: "files", label: "Files", items: [
    { id: "plan", kind: "note", level: 1, label: "Plan", description: "public", detail: "original.md", title: "notes/original.md" },
  ] })));
  const row = host.querySelector<HTMLElement>('[role="treeitem"]')!;
  const named = row.getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id)!.textContent).join(" ").replace(/\s+/g, " ");
  expect(named).toBe("Plan, public original.md");
  expect(row.textContent).toBe("Plan, public original.md");
  expect(row.getAttribute("aria-description")).toBe("notes/original.md");
  expect(row.title).toBe("notes/original.md");
});

it("the in-place pin action names and targets its row without selecting, opening or expanding it", () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onPin = vi.fn(), onSelect = vi.fn(), onAction = vi.fn(), onExpand = vi.fn();
  act(() => root!.render(createElement(FileTree, { id: "files", label: "Files", onPin, onSelect, onAction, onExpand, items: [
    { id: "ideas", kind: "folder", level: 1, label: "Ideas", pinLabel: "Pin Ideas", pinned: false },
  ] })));
  const row = host.querySelector<HTMLElement>('[role="treeitem"]')!;
  const button = row.querySelector<HTMLButtonElement>("button")!;
  expect(button.getAttribute("aria-label")).toBe("Pin Ideas");
  expect(button.hasAttribute("aria-pressed")).toBe(false);
  act(() => button.click());
  expect(onPin).toHaveBeenCalledWith({ id: "ideas", pinned: true });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onAction).not.toHaveBeenCalled();
  expect(onExpand).not.toHaveBeenCalled();
  expect(document.getElementById(row.getAttribute("aria-labelledby")!)?.textContent).toBe("Ideas");
  act(() => root!.render(createElement(FileTree, { id: "files", label: "Files", onPin, onSelect, onAction, onExpand, items: [
    { id: "ideas", kind: "folder", level: 1, label: "Ideas", pinLabel: "Unpin Ideas", pinned: true },
  ] })));
  const unpin = host.querySelector<HTMLButtonElement>('button[aria-label="Unpin Ideas"]');
  expect(unpin).not.toBeNull();
  expect(unpin!.hasAttribute("aria-pressed")).toBe(false);
  expect(host.querySelector('[data-file-icon="pin"]')).not.toBeNull();
  act(() => unpin!.click());
  expect(onPin).toHaveBeenLastCalledWith({ id: "ideas", pinned: false });
  expect(onPin).toHaveBeenCalledTimes(2);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onAction).not.toHaveBeenCalled();
  expect(onExpand).not.toHaveBeenCalled();
});
