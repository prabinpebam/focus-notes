// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileTree } from "../src/primitives/FileTree/FileTree.tsx";
import type { TreeItem } from "../src/data.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.restoreAllMocks(); });

it("PRF-10: mounts desktop row pins only where hover, focus or commit feedback can expose them", () => {
  const original = window.matchMedia.bind(window);
  const media = original("(hover: hover)");
  Object.defineProperty(media, "matches", { value: true, configurable: true });
  vi.spyOn(window, "matchMedia").mockImplementation(query => query === "(hover: hover)" ? media : original(query));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const items: TreeItem[] = Array.from({ length: 100 }, (_, i) => ({
    id: String(i), label: `Note ${i}`, level: 1, kind: "note", pinLabel: `Pin Note ${i}`, pinCommit: "rest",
  }));
  const render = () => root!.render(createElement(FileTree, { id: "files", label: "Files", items }));
  act(render);
  expect(host.querySelectorAll("button")).toHaveLength(1);
  const row = host.querySelector<HTMLElement>('[id="files-r-50"]')!;
  act(() => row.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
  const pin = row.querySelector<HTMLButtonElement>("button")!;
  expect(pin.getAttribute("aria-label")).toBe("Pin Note 50");
  act(() => pin.focus());
  act(() => row.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: host, pointerType: "mouse" })));
  expect(row.querySelector("button")).toBe(pin);
  expect(document.activeElement).toBe(pin);
  act(() => host!.querySelector<HTMLElement>('[id="files-r-0"]')!.focus());
  expect(row.querySelector("button")).toBeNull();
  items[50] = { ...items[50]!, pinCommit: "pending" };
  act(render);
  const pending = row.querySelector<HTMLButtonElement>("button")!;
  expect(pending.getAttribute("aria-busy")).toBe("true");
  items[50] = { ...items[50]!, pinCommit: "confirmed" };
  act(render);
  expect(row.querySelector("button")).toBe(pending);
  items[50] = { ...items[50]!, pinCommit: "failed" };
  act(render);
  expect(row.querySelector("button")).toBe(pending);
  items[50] = { ...items[50]!, pinCommit: "rest" };
  act(render);
  expect(row.querySelector("button")).toBeNull();
  act(() => {
    Object.defineProperty(media, "matches", { value: false, configurable: true });
    media.dispatchEvent(new Event("change"));
  });
  expect(host.querySelectorAll("button")).toHaveLength(100);
});

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
  act(() => button.click());
  expect(onPin).toHaveBeenCalledWith({ id: "ideas", pinned: true });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onAction).not.toHaveBeenCalled();
  expect(onExpand).not.toHaveBeenCalled();
  expect(document.getElementById(row.getAttribute("aria-labelledby")!)?.textContent).toBe("Ideas");
  act(() => root!.render(createElement(FileTree, { id: "files", label: "Files", items: [
    { id: "ideas", kind: "folder", level: 1, label: "Ideas", pinLabel: "Unpin Ideas", pinned: true },
  ] })));
  expect(host.querySelector('button[aria-label="Unpin Ideas"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector('[data-file-icon="pin"]')).not.toBeNull();
});
