// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { registry, contractByType } from "@focus-notes/ui";
import { messages, views } from "@focus-notes/views";
import { createResolver, ViewHost, type RuntimeDeps } from "../src/render.ts";
import { RecoverableView } from "../src/mount.ts";

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
  it.each(["ColorField", "Switch"] as const)("tracks a declared persisted %s through refusal, exact Retry, success and write-free Revert", async type => {
    const { app, deps } = setup();
    let stored: string | boolean = type === "Switch" ? false : "#ffffff";
    let refused = true;
    const set = vi.fn(async ({ value }: { value: string | boolean }) => {
      if (refused) throw new Error("disk full");
      stored = value;
      app.store.update(state => ({ ...state }));
    });
    app.commands.register({ id: "fixture.persist", title: "gallery.action", run: set });
    app.viewModels.register({
      id: "vm.persisted", schema: { type: "object", properties: { value: { type: type === "Switch" ? "boolean" : "string" } } },
      setters: { value: "fixture.persist" }, commits: ["value"], select: () => ({ value: stored }),
    });
    let props: Record<string, unknown> = {};
    deps.registry = { ...registry, [type]: (next: Record<string, unknown>) => { props = next; return null; } };
    const property = type === "Switch" ? "checked" : "value";
    const event = type === "Switch" ? "onChange" : "onCommit";
    const attempted = type === "Switch" ? true : "#123456";
    deps.views.v = { id: "v", root: { type, props: { label: "Setting", [property]: { bind: "vm.persisted.value" }, ...(type === "Switch" ? { onLabel: "On", offLabel: "Off" } : {}) } } };
    const host = document.createElement("div");
    const root = createRoot(host);
    const invoke = async (name: string, value?: string | boolean) => {
      const callback = props[name];
      if (typeof callback !== "function") throw new Error(`Missing ${type} ${name} handler`);
      await callback(value === undefined ? undefined : { value });
    };
    try {
      await act(async () => root.render(createElement(ViewHost, { viewId: "v", deps })));
      await act(async () => invoke(event, attempted));
      expect(props).toMatchObject({ [property]: type === "Switch" ? false : attempted, commit: "failed" });
      expect(app.store.state.ui.toasts).toEqual([]);
      await act(async () => invoke("onRetry"));
      expect(set.mock.calls.at(-1)?.[0]).toEqual({ value: attempted });
      expect(props.commit).toBe("failed");
      refused = false;
      await act(async () => invoke("onRetry"));
      expect(stored).toBe(attempted);
      expect(props).toMatchObject({ [property]: attempted, commit: "confirmed" });
      refused = true;
      await act(async () => invoke(event, type === "Switch" ? false : "#654321"));
      const writes = set.mock.calls.length;
      await act(async () => invoke("onRevert"));
      expect(props).toMatchObject({ [property]: attempted, commit: "rest" });
      expect(set).toHaveBeenCalledTimes(writes);
    } finally { act(() => root.unmount()); }
  });

  it("recovers a client-rendered failed panel without remounting its sibling or changing the note, and reports only safe canned details", async () => {
    const { app, deps } = setup();
    let crashes = true, mounts = 0;
    deps.registry = { ...registry, Heading: () => {
      if (crashes) throw new Error("secret note text C:\\private\\notes\\secret.md");
      return createElement(registry.Text!, { value: "Recovered panel" });
    }, Text: (props: Record<string, unknown>) => {
      mounts++;
      return createElement(registry.Text!, props);
    } };
    deps.views = { panel: { root: { type: "Heading", props: { value: "Panel" } } }, sibling: { root: { type: "Text", props: { value: "Kept editor" } } }, panelFailure: views.panelFailure };
    app.store.update(state => ({ ...state, note: { ...state.note, markdown: "# Kept\n\nUnsent text.", path: "C:\\private\\notes\\kept.md" } }));
    const note = app.store.state.note;
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement("div", null,
        createElement(RecoverableView, { app, viewId: "panel", deps }),
        createElement(RecoverableView, { app, viewId: "sibling", deps }))));
      expect(host.textContent).toContain("Your notes are kept.");
      const sibling = [...host.querySelectorAll("span")].find(el => el.textContent === "Kept editor");
      const count = mounts;
      const report = [...host.querySelectorAll("button")].find(el => el.textContent === "Report problem");
      await act(async () => report!.click());
      expect(app.store.state.ui.feedback).toMatchObject({ open: true, attach: false, title: messages.en!["feedback.panel.title"], details: messages.en!["feedback.panel.details"] });
      expect(JSON.stringify(app.store.state.ui.feedback)).not.toContain("secret.md");
      expect(host.textContent).not.toContain("Reload panel");
      await act(async () => app.commands.run("feedback.close"));
      await act(async () => [...host.querySelectorAll("button")].find(el => el.textContent === "Reload panel")!.click());
      expect(host.textContent).toContain("Your notes are kept.");
      crashes = false;
      const reload = [...host.querySelectorAll("button")].find(el => el.textContent === "Reload panel");
      await act(async () => reload!.click());
      expect(host.textContent).toContain("Recovered panel");
      expect(host.textContent).not.toContain("Reload panel");
      expect(host.contains(sibling!)).toBe(true);
      expect(mounts).toBe(count);
      expect(app.store.state.note).toBe(note);
    } finally { act(() => root.unmount()); }
  });

  it("never overwrites an existing Feedback draft when a panel report is requested", async () => {
    const { app } = setup();
    await app.commands.run("feedback.open");
    await app.commands.run("feedback.setKind", { value: "idea" });
    await app.commands.run("feedback.setTitle", { value: "My existing draft" });
    await app.commands.run("feedback.setDetails", { value: "Keep these words" });
    await app.commands.run("feedback.open", { kind: "problem", source: "panel" });
    expect(app.store.state.ui.feedback).toMatchObject({ kind: "idea", title: "My existing draft", details: "Keep these words" });
  });
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
