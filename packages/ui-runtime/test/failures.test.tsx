// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { registry, contractByType } from "@focus-notes/ui";
import { messages } from "@focus-notes/views";
import { createResolver, ViewHost, type RuntimeDeps } from "../src/render.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

function setup() {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
  };
  const app = createApp(bridge, messages.en!);
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views: {} };
  vi.spyOn(console, "error").mockImplementation(() => {});
  return { app, deps, resolver: createResolver(deps) };
}

describe("view command failures (F1)", () => {
  it("keeps repeated inline commit recovery failures local and reports malformed commit actions", async () => {
    const { app, resolver } = setup();
    app.commands.register({ id: "fixture.persist", title: "gallery.action", run: async () => { throw new Error("disk full"); } });
    const args = { target: "vm.project.accent", command: "fixture.persist", value: "blue" };
    expect(await resolver.runCommand("commit.run", args)).toBe(false);
    expect(await resolver.runCommand("commit.run", args)).toBe(false);
    expect(app.store.state.ui.toasts).toEqual([]);
    expect(console.error).toHaveBeenCalled();
    expect(await resolver.runCommand("commit.run", { target: "", command: "missing", value: "blue" })).toBe(false);
    expect(app.store.state.ui.toasts).toHaveLength(1);
  });

  it("uses the commit track only for declared persisted fields, retains a failed draft and reverts without writing", async () => {
    const { app, deps } = setup();
    const set = vi.fn().mockRejectedValue(new Error("disk full"));
    app.commands.register({ id: "fixture.persist", title: "gallery.action", run: set });
    app.viewModels.register({
      id: "vm.persisted", schema: { type: "object", properties: { value: { type: "string" } } },
      setters: { value: "fixture.persist" }, commits: ["value"], select: () => ({ value: "confirmed" }),
    });
    let props: Record<string, unknown> = {};
    deps.registry = { ...registry, TextField: (next: Record<string, unknown>) => { props = next; return null; } };
    deps.views.v = { id: "v", root: { type: "TextField", props: { label: "Name", value: { bind: "vm.persisted.value" } } } };
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(ViewHost, { viewId: "v", deps })));
      expect(props.commitOnBlur).toBe(true);
      await act(async () => {
        const change = props.onChange;
        if (typeof change !== "function") throw new Error("Missing field handler");
        await change({ value: "my draft" });
      });
      expect(props).toMatchObject({ value: "my draft", commit: "failed", error: expect.any(String) });
      expect(app.store.state.ui.toasts).toEqual([]);
      await act(async () => {
        const revert = props.onRevert;
        if (typeof revert !== "function") throw new Error("Missing Revert handler");
        await revert();
      });
      expect(props).toMatchObject({ value: "confirmed", commit: "rest" });
      expect(set).toHaveBeenCalledTimes(1);
    } finally { act(() => root.unmount()); }
  });

  it("reports a rejected bound setter, keeps its exact Retry arguments, and stops follow-up actions", async () => {
    const { app, deps } = setup();
    const set = vi.fn().mockRejectedValue(new Error("disk full"));
    const follow = vi.fn();
    app.commands.register({ id: "fixture.set", title: "gallery.action", run: set });
    app.commands.register({ id: "fixture.follow", title: "gallery.action", run: follow });
    app.viewModels.register({
      id: "vm.fixture", schema: { type: "object", properties: { value: { type: "string" } } },
      setters: { value: "fixture.set" }, select: () => ({ value: "kept" }),
    });
    let change: ((value: string) => Promise<void>) | undefined;
    deps.registry = { ...registry, TextField: (props: Record<string, unknown>) => {
      const callback = props.onChange;
      if (typeof callback === "function") change = (value) => callback({ value });
      return null;
    } };
    deps.views.v = { id: "v", root: { type: "TextField", props: { label: "Name", value: { bind: "vm.fixture.value" } }, on: { change: { run: "fixture.follow" } } } };
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(ViewHost, { viewId: "v", deps })));
      await act(async () => change!("my draft"));
      expect(set.mock.calls[0]?.[0]).toEqual({ value: "my draft" });
      expect(follow).not.toHaveBeenCalled();
      expect(app.store.state.ui.toasts.at(-1)).toMatchObject({ tone: "error", action: { command: "fixture.set", args: { value: "my draft" } } });
      expect(console.error).toHaveBeenCalled();
    } finally { act(() => root.unmount()); }
  });

  it("stops a failed action sequence and retries only the failing command, including repeated failures", async () => {
    const { app, resolver } = setup();
    const before = vi.fn(), after = vi.fn(), fail = vi.fn().mockRejectedValue(new Error("offline"));
    for (const [id, run] of [["fixture.before", before], ["fixture.fail", fail], ["fixture.after", after]] as const) {
      app.commands.register({ id, title: "gallery.action", run });
    }
    const scope = { state: app.store.state, local: {}, items: {}, setLocal: vi.fn() };
    expect(await resolver.runActions([{ run: "fixture.before" }, { run: "fixture.fail", args: { value: "draft" } }, { run: "fixture.after" }], scope)).toBe(false);
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
    let toast = app.store.state.ui.toasts.at(-1)!;
    expect(await resolver.runCommand("toast.action", { id: toast.id })).toBe(false);
    toast = app.store.state.ui.toasts.at(-1)!;
    expect(toast.action).toMatchObject({ command: "fixture.fail", args: { value: "draft" } });
    fail.mockResolvedValue(undefined);
    expect(await resolver.runCommand("toast.action", { id: toast.id })).toBe(true);
    expect(fail).toHaveBeenCalledTimes(3);
    expect(before).toHaveBeenCalledTimes(1);
  });
});
