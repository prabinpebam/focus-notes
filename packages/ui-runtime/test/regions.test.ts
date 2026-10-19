// @vitest-environment happy-dom
/** Redraw only what changed (PRF-11): each part of a view re-renders only when a view model it shows changes. */
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement as h, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { registry, contractByType } from "@focus-notes/ui";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { messages } from "@focus-notes/views";
import { ViewHost, type RuntimeDeps } from "../src/render.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
  defaultNotePath: async () => "", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {},
};

let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; });

function mount() {
  const app = createApp(bridge, messages.en!);
  let heavySelected = 0;
  const schema = { type: "object" as const, properties: { label: { type: "string" as const }, show: { type: "boolean" as const } } };
  app.viewModels.register({ id: "vm.left", reads: ["focusMode"], schema, select: (s) => ({ label: s.focusMode ? "left on" : "left off" }) });
  app.viewModels.register({ id: "vm.right", reads: ["ui.toolbarOpen"], schema, select: (s) => ({ label: s.ui.toolbarOpen ? "right open" : "right closed", show: s.ui.toolbarOpen }) });
  // A heavy, rarely shown part: its view model is selected only once it shows.
  app.viewModels.register({ id: "vm.heavy", reads: ["ui.toolbarOpen"], schema, select: () => { heavySelected++; return { label: "heavy" }; } });
  const renders: string[] = [];
  const Text = registry.Text as ComponentType<{ value: string }>;
  const spied = { ...registry, Text: (p: Record<string, unknown>) => { renders.push(String(p.value)); return h(Text, p as { value: string }); } };
  const view = {
    $schema: "x", id: "v", viewModels: ["vm.left", "vm.right", "vm.heavy"], focus: "f",
    root: {
      type: "Stack", props: { gap: "s" },
      children: [
        { type: "Text", props: { value: { get: "vm.left.label" } } },
        { type: "Text", props: { value: { get: "vm.right.label" } } },
        { type: "Text", when: { get: "vm.right.show" }, props: { value: { get: "vm.heavy.label" } } },
      ],
    },
  };
  const deps: RuntimeDeps = { app, registry: spied, contracts: contractByType, views: { v: view } };
  const el = document.createElement("div");
  document.body.append(el);
  act(() => { root = createRoot(el); root.render(h(ViewHost, { viewId: "v", deps })); });
  return { app, renders, heavy: () => heavySelected, el };
}

describe("redraw only what changed (PRF-11)", () => {
  it("re-renders only the parts that show the changed field", () => {
    const { app, renders, el } = mount();
    expect(renders.sort()).toEqual(["left off", "right closed"]);
    renders.length = 0;
    act(() => app.store.update((s) => ({ ...s, focusMode: !s.focusMode })));
    expect(renders).toEqual(["left on"]);
    expect(el.textContent).toContain("left on");
    expect(el.textContent).toContain("right closed");
  });
  it("a change no part shows renders nothing", () => {
    const { app, renders } = mount();
    renders.length = 0;
    act(() => app.store.update((s) => ({ ...s, ui: { ...s.ui, find: { ...s.ui.find, query: "typing" } } })));
    act(() => app.store.update((s) => ({ ...s, note: { ...s.note, markdown: "typing" } })));
    expect(renders).toEqual([]);
  });
  it("a hidden part's view model is selected only when it first shows", () => {
    const { app, renders, heavy } = mount();
    act(() => app.store.update((s) => ({ ...s, focusMode: !s.focusMode })));
    expect(heavy()).toBe(0);
    renders.length = 0;
    act(() => app.store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: true } })));
    expect(heavy()).toBe(1);
    expect(renders.sort()).toEqual(["heavy", "right open"]);
  });
});
