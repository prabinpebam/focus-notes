// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { registry, contractByType } from "@focus-notes/ui";
import { messages, views } from "@focus-notes/views";
import { ViewHost, type RuntimeDeps } from "../src/render.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("renders the fourth site list's empty fallback and existing Files action without inventing a section editor", async () => {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "# Sample\n", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1, firstRun: "done", sharingDrafts: { "/w": { owner: "personal", people: [] } } }),
    saveAppState: vi.fn(), systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "/w" }),
      scan: async () => ({ folder: "/w", roots: [{ id: "public", path: "/w/notes", readOnly: false }], entries: [] }),
      writeFormat: async () => {}, renameNote: async () => {},
    },
  };
  const app = createApp(bridge, messages.en!);
  await app.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  await app.commands.run("sharing.preview");
  // Sections are derived from articles, so an empty section is a defensive state, not a first-use navigation route.
  await app.commands.run("sharing.previewSection", { id: "Previously selected section" });
  const vm = app.viewModels.select("vm.sharingPreview", app.store.state);
  expect(vm).toMatchObject({ page: "section", sections: [], articles: [], sectionTitle: "Previously selected section" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views };
  const saved = vi.mocked(bridge.saveAppState).mock.calls.length;
  try {
    await act(async () => root.render(createElement(ViewHost, { viewId: "sitePreview", deps })));
    const preview = document.querySelector('[aria-label="Preview site"]')!;
    expect(preview.textContent).toContain("Previously selected section");
    const empty = [...preview.querySelectorAll("[data-tone=neutral]")].find(el => el.textContent?.includes("No published notes"));
    expect(empty).toBeDefined();
    expect(empty!.textContent).toContain(messages.en!["uiStates.empty.publishedDetail"]);
    const choose = [...empty!.querySelectorAll("button")].find(el => el.textContent === "Choose note");
    expect(choose).toBeDefined();
    await act(async () => choose!.click());
    expect(app.viewModels.select("vm.sharingPreview", app.store.state)).toMatchObject({ open: false });
    expect(app.store.state.ui.files.open).toBe(true);
    expect(app.store.state.ui.settings.open).toBe(false);
    expect(vi.mocked(bridge.saveAppState).mock.calls).toHaveLength(saved);
  } finally { act(() => root.unmount()); host.remove(); }
});

it("replaces colour failures with the real all-done success row without an unnecessary action", async () => {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1, firstRun: "done" }), saveAppState: vi.fn(),
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
  };
  const app = createApp(bridge, messages.en!);
  await app.start();
  await app.commands.run("theme.manager.open");
  await app.commands.run("theme.manager.setTab", { value: "colors" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views };
  try {
    await act(async () => root.render(createElement(ViewHost, { viewId: "theme", deps })));
    const success = () => [...host.querySelectorAll("[data-status-row=success]")].filter(el => el.textContent === messages.en!["colors.allPass"]);
    expect(success()).toHaveLength(1);
    expect(success()[0]!.querySelectorAll("button")).toHaveLength(0);
    const wrapper = success()[0]!.parentElement!;
    const note = app.store.state.note;
    const saved = vi.mocked(bridge.saveAppState).mock.calls.length;
    await act(async () => app.commands.run("theme.color.set", { key: "text", value: "#b5b0a8" }));
    expect(success()).toHaveLength(0);
    expect(app.viewModels.select("vm.themeManager", app.store.state)).toMatchObject({ colors: { failing: true } });
    expect(wrapper.isConnected).toBe(true);
    await act(async () => app.commands.run("theme.color.fix", { key: "text" }));
    expect(success()).toHaveLength(1);
    expect(success()[0]!.parentElement).toBe(wrapper);
    expect(success()[0]!.querySelector("[role=status]")?.textContent).toBe(messages.en!["colors.allPass"]);
    expect([...host.querySelectorAll("[role=status]")].filter(el => el.textContent === messages.en!["colors.allPass"])).toHaveLength(1);
    expect(success()[0]!.querySelectorAll("button")).toHaveLength(0);
    expect(app.store.state.note).toBe(note);
    expect(vi.mocked(bridge.saveAppState).mock.calls).toHaveLength(saved);
  } finally { act(() => root.unmount()); host.remove(); }
});
