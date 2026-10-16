/**
 * UI-08 (D-170): choosing the toolbar's six actions. Pin, unpin, move, and reset, never more than
 * six; a pinned action leaves ⋯ and an unpinned default joins its Actions group; the choice is kept
 * on this device; Settings → Keyboard shows keybindings.json's problems and conflicts, read again
 * when the file changes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, DEFAULT_TOOLBAR, validPinned, type AppStateFile, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

function setup(o: { pinned?: unknown; keys?: string } = {}) {
  const saved: AppStateFile[] = [];
  let keys = o.keys;
  let changed: (() => void) | undefined;
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# Hello\n", writeNote: async () => {}, chooseNote: async () => undefined,
    newNotePath: async () => "/w/notes/Untitled.md", defaultNotePath: async () => "/w/notes/hello.md",
    loadAppState: async () => ({ version: 1, ...(o.pinned !== undefined ? { toolbarPinned: o.pinned as string[] } : {}) }),
    saveAppState: async (s) => void saved.push(s),
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    keybindings: { load: async () => keys, onChange: (l) => { changed = l; return () => {}; }, edit: async () => {}, reset: async () => { keys = "[]"; } },
  };
  return { bridge, saved, write: (text: string) => { keys = text; changed?.(); } };
}
type Tb = { items: { id: string }[]; more: { id: string; items: { id: string }[] }[] };
type Cust = { open: boolean; count: string; full: boolean; canReset: boolean; pinned: { id: string; first: boolean; last: boolean; up: string }[]; available: { id: string; pin: string }[] };
const tb = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.toolbar", app.store.state) as Tb;
const cust = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.toolbarCustomize", app.store.state) as Cust;

describe("UI-08: choosing the toolbar's six actions", () => {
  it("starts with the six defaults, and keeps only usable pinned actions", async () => {
    const app = createApp(setup().bridge, messages);
    await app.start();
    expect(tb(app).items.map((i) => i.id)).toEqual([...DEFAULT_TOOLBAR]);
    expect(tb(app).more.some((g) => g.id === "actions")).toBe(false);
    expect(validPinned(["note.new", "nope.cmd", "note.new", 3, "find.open"], ["note.new", "find.open"], DEFAULT_TOOLBAR)).toEqual(["note.new", "find.open"]);
    expect(validPinned("x", ["note.new"], DEFAULT_TOOLBAR)).toEqual([...DEFAULT_TOOLBAR]);
  });

  it("pins, unpins, moves and resets; never more than six; unpinned defaults go into ⋯", async () => {
    const f = setup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("toolbar.customize");
    expect(cust(app)).toMatchObject({ open: true, count: "6 of 6 pinned", full: true, canReset: false });
    await app.commands.run("toolbar.pin", { id: "find.open" });
    expect(tb(app).items).toHaveLength(6);
    await app.commands.run("toolbar.unpin", { id: "note.save" });
    expect(tb(app).items.map((i) => i.id)).not.toContain("note.save");
    expect(tb(app).more[0]).toMatchObject({ id: "actions", items: [{ id: "note.save" }] });
    await app.commands.run("toolbar.pin", { id: "find.open" });
    expect(tb(app).items.at(-1)!.id).toBe("find.open");
    // A pinned ⋯ action leaves ⋯.
    expect(tb(app).more.flatMap((g) => g.items.map((i) => i.id))).not.toContain("find.open");
    await app.commands.run("toolbar.move", { id: "find.open", by: -1 });
    expect(tb(app).items.map((i) => i.id).slice(-2)).toEqual(["find.open", "appearance.toggle"]);
    expect(app.store.state.announcement.text).toBe("Find moved to 5 of 6.");
    expect(f.saved.at(-1)!.toolbarPinned).toEqual(["note.new", "note.open", "spotlight.open", "focus.toggle", "find.open", "appearance.toggle"]);
    await app.commands.run("toolbar.move", { id: "note.new", by: -1 });
    expect(tb(app).items[0]!.id).toBe("note.new");
    expect(cust(app).available.map((a) => a.id)).toContain("note.save");
    await app.commands.run("toolbar.resetPinned");
    expect(tb(app).items.map((i) => i.id)).toEqual([...DEFAULT_TOOLBAR]);
  });

  it("restores the pinned actions this device kept", async () => {
    const app = createApp(setup({ pinned: ["find.open", "note.new"] }).bridge, messages);
    await app.start();
    expect(tb(app).items.map((i) => i.id)).toEqual(["find.open", "note.new"]);
  });
});

describe("KEY-07: Settings → Keyboard and the cheat sheet", () => {
  it("shows what applies, the problems, the conflicts, and follows the file as it changes", async () => {
    const f = setup({ keys: JSON.stringify([{ command: "focus.toggle", key: "Mod+Shift+S" }, { command: "nope.cmd", key: "Mod+L" }]) });
    const app = createApp(f.bridge, messages);
    await app.start();
    const kb = () => app.viewModels.select("vm.keyboard", app.store.state) as { status: string; problems: { text: string }[]; conflicts: { text: string }[] };
    expect(kb().status).toBe("1 custom key applies from keybindings.json.");
    expect(kb().problems.map((p) => p.text)).toEqual(["Entry 2 (nope.cmd): no command has that name"]);
    expect(kb().conflicts.map((c) => c.text)).toEqual(["Ctrl+Shift+S runs Focus mode, not Save to cloud"]);
    expect(app.commands.describe("focus.toggle").shortcut).toBe("Mod+Shift+S");
    await app.commands.run("shortcuts.open");
    expect((app.viewModels.select("vm.shortcuts", app.store.state) as { conflicts: { text: string }[] }).conflicts).toHaveLength(1);
    f.write("[]");
    await settle();
    expect(kb()).toMatchObject({ status: "No custom keys: every key is the default. Add some in keybindings.json.", problems: [], conflicts: [] });
    expect((app.viewModels.select("vm.shortcuts", app.store.state) as { conflicts: unknown[] }).conflicts).toEqual([]);
  });
});
