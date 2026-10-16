/**
 * FND-03: find in selection, the app side (Find and replace → Find in selection, D-160). Alt+L (⌥⌘L
 * on a Mac) opens the bar scoped to the selection, or toggles the scope while it's open; without a
 * selection there's no scope, so the toggle is disabled and says why. Closing forgets it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
  defaultNotePath: async () => "/n/a.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {},
};

async function started() {
  const app = createApp(bridge, messages);
  await app.start();
  const actions: { id: string; args?: Record<string, unknown> }[] = [];
  app.onEditorAction((id, args) => actions.push({ id, ...(args ? { args } : {}) }));
  const find = () => app.store.state.ui.find;
  const vm = () => app.viewModels.select("vm.find", app.store.state) as { inSelection: boolean; scoped: boolean; actions: Record<string, { label: string; shortcut: string }> };
  return { app, actions, find, vm };
}

describe("find in selection (FND-03)", () => {
  it("is a Pro command on Alt+L (⌥⌘L on a Mac), working in the note and in the find bar", async () => {
    const { app } = await started();
    expect(app.commands.shortcut("find.toggle.inSelection")).toMatchObject({ macos: "Mod+Alt+L", default: "Alt+L" });
    const b = app.commands.bindings("windows").find((x) => x.id === "find.toggle.inSelection");
    expect(b).toMatchObject({ layer: "pro" });
    expect(b?.handledBy).toBeUndefined();
    expect(app.commands.match({ key: "l", code: "KeyL", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe("find.toggle.inSelection");
  });
  it("with the bar closed, opens it scoped to the selection, without filling the field from it", async () => {
    const { app, actions, find } = await started();
    await app.commands.run("find.toggle.inSelection");
    expect(find()).toMatchObject({ open: true, inSelection: true });
    expect(actions).toContainEqual({ id: "find.prefill", args: { scopeOnly: true } });
    // The editor says it took a selection as the scope.
    await app.commands.run("find.setScope", { scoped: true });
    expect(find()).toMatchObject({ inSelection: true, scoped: true });
  });
  it("with nothing selected there's no scope: the option goes off, and the toggle is disabled with a reason", async () => {
    const { app, find, vm } = await started();
    await app.commands.run("find.toggle.inSelection");
    await app.commands.run("find.setScope", { scoped: false });
    expect(find()).toMatchObject({ open: true, inSelection: false, scoped: false });
    expect(app.commands.describe("find.toggle.inSelection")).toMatchObject({ enabled: false, disabledReason: "find.noScope" });
    expect(messages["find.noScope"]).toBe("Select text in the note, then open find");
    expect(vm().scoped).toBe(false);
  });
  it("toggles while the bar is open, and closing the bar forgets the scope", async () => {
    const { app, find, vm } = await started();
    await app.commands.run("find.open");
    await app.commands.run("find.setScope", { scoped: true });
    expect(find().inSelection).toBe(false);
    await app.commands.run("find.toggle.inSelection");
    expect(find().inSelection).toBe(true);
    expect(vm()).toMatchObject({ inSelection: true, scoped: true });
    expect(vm().actions.inSelection).toEqual({ label: "Find in selection", shortcut: "Alt+L" });
    await app.commands.run("find.toggle.inSelection");
    expect(find().inSelection).toBe(false);
    await app.commands.run("find.toggle.inSelection");
    await app.commands.run("find.close");
    expect(find()).toMatchObject({ open: false, inSelection: false, scoped: false });
  });
});
