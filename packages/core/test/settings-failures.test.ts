import { describe, expect, it, vi } from "vitest";
import { createApp, type AppStateFile, type PlatformBridge } from "../src/index.ts";

function setup(save: PlatformBridge["saveAppState"]) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1 }), saveAppState: save,
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
  };
  return createApp(bridge, {});
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
