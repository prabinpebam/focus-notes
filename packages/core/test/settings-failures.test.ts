import { describe, expect, it, vi } from "vitest";
import { createApp, type AppStateFile, type PlatformBridge } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

function setup(save: PlatformBridge["saveAppState"]) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1 }), saveAppState: save,
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
  };
  return createApp(bridge, en);
}

describe("rejected settings writes (F1)", () => {
  it.each(["appearance.light", "font.larger", "font.content.serif", "ui.scaleUp", "focus.toggle"])("does not claim %s was kept when persistence rejects", async (command) => {
    const app = setup(async () => { throw new Error("disk full"); });
    const before = app.store.state;
    await expect(app.commands.run(command)).rejects.toThrow("disk full");
    expect(app.store.state.appearance).toEqual(before.appearance);
    expect(app.store.state.focusMode).toEqual(before.focusMode);
  });

  it("does not leak a failed setting into a later successful write; the lane recovers", async () => {
    const writes: AppStateFile[] = [];
    const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockImplementation(async (state: AppStateFile) => { writes.push(state); });
    const app = setup(save);
    await expect(app.commands.run("appearance.dark")).rejects.toThrow("disk full");
    await app.commands.run("focus.toggle");
    expect(writes.at(-1)).toEqual({ version: 1, focusMode: true });
    expect(app.store.state.appearance.mode).toBe("system");
    await app.commands.run("appearance.light");
    expect(writes.at(-1)).toEqual({ version: 1, focusMode: true, appearance: "light" });
  });

  it("does not claim reading settings were kept when persistence rejects", async () => {
    const app = setup(async () => { throw new Error("disk full"); });
    const before = app.store.state.appearance;
    await expect(app.commands.run("reading.setLineHeight", { value: 2 })).rejects.toThrow("disk full");
    expect(app.store.state.appearance).toEqual(before);
  });

  it.each([
    ["focus.toggle", "vm.app.focusMode", "focusMode"],
    ["outline.togglePin", "vm.app.outlinePinned", "outlinePinned"],
  ] as const)("retains %s's stored value and retries an exact value, not a second toggle", async (command, target, key) => {
    let reject = true;
    const writes: AppStateFile[] = [];
    const app = setup(async (state) => { if (reject) throw new Error("disk full"); writes.push(state); });
    const before = app.store.state[key];
    await expect(app.commands.run(command)).rejects.toThrow("disk full");
    expect(app.store.state[key]).toBe(before);
    expect(app.store.state.commits).toContainEqual(expect.objectContaining({ target, value: !before, phase: "failed" }));
    await app.commands.run("app.reportFailure", { command: "command.run", args: { id: command } });
    const toast = app.store.state.ui.toasts[0]!;
    expect(toast.action).toMatchObject({ command, args: { value: !before } });
    reject = false;
    await app.commands.run(command);
    expect(app.store.state[key]).toBe(!before);
    await app.commands.run("toast.action", { id: toast.id });
    expect(app.store.state[key]).toBe(!before);
    expect(writes.at(-1)?.[key]).toBe(!before);
  });

  it("holds the same focus control and prevents duplicate writes while its group is pending", async () => {
    let release!: () => void;
    let writes = 0;
    const app = setup(async () => { writes++; await new Promise<void>((resolve) => { release = resolve; }); });
    await app.commands.run("toolbar.toggle");
    const saving = app.commands.run("command.run", { id: "focus.toggle" });
    await Promise.resolve();
    expect(app.store.state.ui.toolbarOpen).toBe(true);
    const vm = app.viewModels.select("vm.toolbar", app.store.state) as { items: { id: string; commit?: string; disabled?: boolean }[] };
    expect(vm.items.find((item) => item.id === "focus.toggle")).toMatchObject({ commit: "pending" });
    expect(vm.items.find((item) => item.id === "focus.toggle")?.disabled).toBeUndefined();
    await app.commands.run("focus.toggle");
    expect(writes).toBe(1);
    release();
    await saving;
    expect(app.store.state.commits).toContainEqual(expect.objectContaining({ target: "vm.app.focusMode", phase: "confirmed" }));
  });

  it("keeps a failed notification Retry usable instead of replacing it with a dead toast.action retry", async () => {
    let reject = true;
    const app = setup(async () => { if (reject) throw new Error("disk full"); });
    await expect(app.commands.run("font.larger")).rejects.toThrow("disk full");
    await app.commands.run("app.reportFailure", { command: "font.larger" });
    const first = app.store.state.ui.toasts[0]!;
    await expect(app.commands.run("toast.action", { id: first.id })).rejects.toThrow("disk full");
    expect(app.store.state.ui.toasts).toContainEqual(expect.objectContaining({ id: first.id, pending: false }));
    await app.commands.run("app.reportFailure", { command: "toast.action", args: { id: first.id } });
    const current = app.store.state.ui.toasts.find((item) => item.action?.command === "font.reset")!;
    expect(current.action?.args).toEqual({ value: 17 });
    expect(current.action?.command).not.toBe("toast.action");
    reject = false;
    await app.commands.run("toast.action", { id: current.id });
    expect(app.store.state.appearance.fontSize).toBe(17);
    expect(app.store.state.ui.toasts.find((item) => item.id === current.id)).toBeUndefined();
  });

  it("does not pass an old F6 focus request to the next queued notification", async () => {
    const app = setup(async () => {});
    await app.commands.run("app.reportFailure", { command: "font.larger" });
    await app.commands.run("app.reportFailure", { command: "appearance.dark" });
    await app.commands.run("toast.focus");
    const first = app.store.state.ui.toasts[0]!;
    const feedback = () => app.viewModels.select("vm.feedback", app.store.state) as { toasts: { id: number; focusRequest: number }[] };
    expect(feedback().toasts[0]?.focusRequest).toBe(1);
    await app.commands.run("toast.dismiss", { id: first.id });
    expect(feedback().toasts).toHaveLength(1);
    expect(feedback().toasts[0]?.focusRequest).toBe(0);
    await app.commands.run("toast.focus");
    expect(feedback().toasts[0]?.focusRequest).toBe(2);
  });

  it("serializes writes so the newest requested value is the final stored value", async () => {
    const pending: { state: AppStateFile; resolve: () => void }[] = [];
    const app = setup(state => new Promise<void>(resolve => pending.push({ state, resolve })));
    const first = app.commands.run("appearance.light");
    const second = app.commands.run("appearance.dark");
    await Promise.resolve();
    expect(pending).toHaveLength(1);
    pending[0]!.resolve();
    await first;
    expect(pending).toHaveLength(2);
    pending[1]!.resolve();
    await second;
    expect(pending[1]!.state.appearance).toBe("dark");
    expect(app.store.state.appearance.mode).toBe("dark");
  });
});
