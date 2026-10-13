/**
 * EDT-06: the slash menu's rows come from the editor's block registry, filtered by what's typed
 * after `/` (names and synonyms), moved with the arrow keys, and sent back to the editor when chosen.
 * EDT-09: a paste that left images out says so.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, MessageCatalog, slashItems, type PlatformBridge, type SlashCatalogEntry } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
  defaultNotePath: async () => "/n/a.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {},
};

/** What the editor's block registry hands over (slashCatalog() in @focus-notes/editor). */
const REGISTRY: SlashCatalogEntry[] = [
  { id: "block.paragraph", title: "format.block.paragraph", group: "text", icon: "text", markdown: "" },
  { id: "block.heading1", title: "format.block.heading1", group: "text", icon: "heading1", markdown: "#" },
  { id: "block.heading2", title: "format.block.heading2", group: "text", icon: "heading2", markdown: "##" },
  { id: "block.heading3", title: "format.block.heading3", group: "text", icon: "heading3", markdown: "###" },
  { id: "block.bulletList", title: "format.block.bulletList", group: "lists", icon: "bulletList", markdown: "-" },
  { id: "block.orderedList", title: "format.block.orderedList", group: "lists", icon: "numberedList", markdown: "1." },
  { id: "block.taskList", title: "format.block.taskList", group: "lists", icon: "taskList", markdown: "[ ]" },
  { id: "block.quote", title: "format.block.quote", group: "text", icon: "quote", markdown: ">" },
  { id: "block.codeBlock", title: "format.block.codeBlock", group: "insert", icon: "code", markdown: "```" },
  { id: "block.divider", title: "format.block.divider", group: "insert", icon: "divider", markdown: "---" },
];
const ALL = REGISTRY.map((e) => e.id).join(" ");
const catalog = new MessageCatalog("en", messages);
const ids = (query: string, valid = ALL) => slashItems(REGISTRY, valid.split(" "), query, catalog).map((i) => i.id);

async function started() {
  const app = createApp(bridge, messages);
  await app.start();
  await app.commands.run("slash.register", { entries: REGISTRY });
  const actions: { id: string; args?: Record<string, unknown> }[] = [];
  app.onEditorAction((id, args) => actions.push({ id, ...(args ? { args } : {}) }));
  const vm = () => app.viewModels.select("vm.slash", app.store.state) as {
    open: boolean; items: { id: string; label: string; description?: string; icon: string; shortcut: string }[]; activeId: string; empty: boolean; emptyText: string;
  };
  return { app, actions, vm };
}

describe("filtering the registry's entries (EDT-06)", () => {
  it("shows every valid entry, grouped Text, Lists, Insert, for an empty query", () => {
    expect(ids("")).toEqual([
      "block.paragraph", "block.heading1", "block.heading2", "block.heading3", "block.quote",
      "block.bulletList", "block.orderedList", "block.taskList", "block.codeBlock", "block.divider",
    ]);
  });
  it("matches names and synonyms by word start", () => {
    expect(ids("h2")).toEqual(["block.heading2"]);
    expect(ids("title")).toEqual(["block.heading1"]);
    expect(ids("checkbox")).toEqual(["block.taskList"]);
    expect(ids("head")).toEqual(["block.heading1", "block.heading2", "block.heading3"]);
    expect(ids("heading 3")).toEqual(["block.heading3"]);
    expect(ids("QUO")).toEqual(["block.quote"]);
    expect(ids("list")).toEqual(["block.bulletList", "block.orderedList", "block.taskList"]);
    expect(ids("xyz")).toEqual([]);
  });
  it("offers only the entries valid at the caret (DD-FMT-08)", () => {
    expect(ids("", "block.paragraph block.bulletList")).toEqual(["block.paragraph", "block.bulletList"]);
  });
});

describe("the slash menu's view model and commands (EDT-06)", () => {
  it("opens with the first row active, its hint shown, and the Markdown shortcut on each row", async () => {
    const { app, vm } = await started();
    expect(vm().open).toBe(false);
    await app.commands.run("slash.setState", { open: true, query: "", valid: ALL });
    const v = vm();
    expect(v.open).toBe(true);
    expect(v.activeId).toBe("block.paragraph");
    expect(v.items[0]).toEqual({ id: "block.paragraph", label: "Text", icon: "text", shortcut: "", description: "Plain text" });
    expect(v.items[1]).toEqual({ id: "block.heading1", label: "Heading 1", icon: "heading1", shortcut: "#" });
  });
  it("typing filters and starts again at the top; arrows move and wrap", async () => {
    const { app, vm } = await started();
    await app.commands.run("slash.setState", { open: true, query: "head", valid: ALL });
    expect(vm().items.map((i) => i.label)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
    await app.commands.run("slash.move", { delta: 1 });
    await app.commands.run("slash.move", { delta: 1 });
    expect(vm().activeId).toBe("block.heading3");
    await app.commands.run("slash.move", { delta: 1 });
    expect(vm().activeId).toBe("block.heading1");
    await app.commands.run("slash.move", { delta: -1 });
    expect(vm().activeId).toBe("block.heading3");
    // The same query (the editor re-reporting it) keeps the row; a new one starts at the top.
    await app.commands.run("slash.setState", { open: true, query: "head", valid: ALL });
    expect(vm().activeId).toBe("block.heading3");
    await app.commands.run("slash.setState", { open: true, query: "headi", valid: ALL });
    expect(vm().activeId).toBe("block.heading1");
  });
  it("with no match it says so, and a space after that means the / was text", async () => {
    const { app, vm } = await started();
    await app.commands.run("slash.setState", { open: true, query: "xyz", valid: ALL });
    expect(vm()).toMatchObject({ open: true, empty: true, items: [], emptyText: "No blocks match ‘xyz’. Press Esc to keep the text." });
    await app.commands.run("slash.setState", { open: true, query: "xyz and", valid: ALL });
    expect(vm()).toMatchObject({ open: false, empty: false });
    await app.commands.run("slash.setState", { open: true, query: "heading 2", valid: ALL });
    expect(vm()).toMatchObject({ open: true, activeId: "block.heading2" });
  });
  it("choosing a row, or the active one, sends it to the editor; closing clears it", async () => {
    const { app, actions, vm } = await started();
    await app.commands.run("slash.setState", { open: true, query: "", valid: ALL });
    await app.commands.run("slash.setActive", { id: "block.quote" });
    await app.commands.run("slash.choose", {});
    await app.commands.run("slash.choose", { id: "block.divider" });
    expect(actions).toEqual([{ id: "slash.insert", args: { id: "block.quote" } }, { id: "slash.insert", args: { id: "block.divider" } }]);
    await app.commands.run("slash.setState", { open: false });
    expect(vm()).toMatchObject({ open: false, items: [], activeId: "" });
    await app.commands.run("slash.choose", {});
    expect(actions).toHaveLength(2);
  });
  it("belongs to the open note: switching notes closes it", async () => {
    const { app, vm } = await started();
    await app.commands.run("slash.setState", { open: true, query: "", valid: ALL });
    expect(vm().open).toBe(true);
    await app.commands.run("note.new");
    expect(vm().open).toBe(false);
  });
});

describe("paste notices (EDT-09)", () => {
  it("says images were left out", async () => {
    const { app } = await started();
    await app.commands.run("paste.notice", { kind: "images" });
    expect(app.store.state.ui.toasts.map((t) => t.message)).toEqual(["Images can't be added to notes yet, so they were left out."]);
  });
});
