/**
 * EDT-07: the block handle's model (IA-CMP-HANDLE, D-160). The grip is named for its block, its menu
 * offers Turn into, Duplicate, Move up and down, Copy link (headings), and Delete, its actions go back
 * to the editor with the block's position, and what changed is announced.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const copied: string[] = [];
const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
  defaultNotePath: async () => "/n/My notes.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {}, copyText: async (t: string) => { copied.push(t); },
};
interface Item { id: string; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; items?: Item[] }
async function started() {
  const app = createApp(bridge, messages);
  await app.start();
  const actions: { id: string; args?: Record<string, unknown> }[] = [];
  app.onEditorAction((id, args) => actions.push({ id, ...(args ? { args } : {}) }));
  const vm = () => app.viewModels.select("vm.block", app.store.state) as { visible: boolean; label: string; menu: { id: string; items: Item[] }[]; menuRequest: number };
  const at = (patch: Record<string, unknown>) => app.commands.run("block.setState", { visible: true, block: 7, kind: "paragraph", level: 0, first: false, last: false, text: "", ...patch });
  return { app, actions, vm, at };
}
const ids = (vm: { menu: { items: Item[] }[] }) => vm.menu.map((s) => s.items.map((i) => i.id));

describe("the block handle (EDT-07)", () => {
  it("names the grip for its block", async () => {
    const { vm, at } = await started();
    expect(vm().visible).toBe(false);
    await at({});
    expect(vm()).toMatchObject({ visible: true, label: "Paragraph options" });
    await at({ kind: "heading", level: 2, text: "Plan" });
    expect(vm().label).toBe("Heading 2 options");
    await at({ kind: "taskItem" });
    expect(vm().label).toBe("Task options");
  });
  it("offers Turn into, Duplicate, Move up and down, and Delete last, with their keys; moves that can't happen are disabled", async () => {
    const { vm, at } = await started();
    await at({ first: true });
    expect(ids(vm())).toEqual([["turnInto"], ["block.duplicate", "block.moveUp", "block.moveDown"], ["block.delete"]]);
    const turn = vm().menu[0]!.items[0]!;
    expect(turn.label).toBe("Turn into");
    expect(turn.items!.map((i) => i.id)).toEqual(["block.paragraph", "block.heading1", "block.heading2", "block.heading3", "block.bulletList", "block.orderedList", "block.taskList", "block.quote", "block.codeBlock"]);
    expect(turn.items!.find((i) => i.checked)?.id).toBe("block.paragraph");
    const edit = vm().menu[1]!.items;
    expect(edit.map((i) => [i.label, i.shortcut ?? "", Boolean(i.disabled)])).toEqual([["Duplicate", "Ctrl+D", false], ["Move up", "Ctrl+Shift+↑", true], ["Move down", "Ctrl+Shift+↓", false]]);
    // A divider has nothing to turn into.
    await at({ kind: "horizontalRule" });
    expect(ids(vm())[0]).toEqual(["block.duplicate", "block.moveUp", "block.moveDown"]);
  });
  it("copies a heading's link (Markdown links only reach headings), relative to the note", async () => {
    const { app, vm, at } = await started();
    await at({ kind: "heading", level: 1, text: "Next steps!" });
    expect(ids(vm())).toContainEqual(["block.copyLink"]);
    await app.commands.run("block.action", { id: "block.copyLink", block: 7 });
    expect(copied.at(-1)).toBe("[Next steps!](My%20notes.md#next-steps)");
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Link to “Next steps!” copied");
  });
  it("sends the menu's and the drag's actions to the editor with the block, announces them, and refuses others", async () => {
    const { app, actions, at } = await started();
    await at({});
    await app.commands.run("block.action", { id: "block.duplicate", block: 7 });
    await app.commands.run("block.action", { id: "block.moveTo", block: 7, to: 30, junk: 1 });
    await app.commands.run("block.action", { id: "block.heading2", block: 7 });
    await app.commands.run("block.action", { id: "note.delete", block: 7 });
    expect(actions).toEqual([
      { id: "block.duplicate", args: { block: 7 } },
      { id: "block.moveTo", args: { block: 7, to: 30 } },
      { id: "block.heading2", args: { block: 7 } },
    ]);
    expect(app.store.state.announcement.text).toBe("Block moved");
  });
  it("Shift+F10 outside a table asks for the menu: the request opens it at the caret's block", async () => {
    const { app, vm } = await started();
    expect(app.commands.shortcut("block.contextMenu")).toMatchObject({ default: "Shift+F10", handledBy: "editor" });
    const before = vm().menuRequest;
    await app.commands.run("block.openMenu");
    expect(vm().menuRequest).toBe(before + 1);
  });
});
