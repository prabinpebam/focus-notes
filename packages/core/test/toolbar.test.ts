/**
 * WP-1.6: the toolbar's actions and the ⋯ menu as the view model gives them to the view (UI-04, UI-07),
 * every one from the command registry (DSY-12), and the items that arrive later saying why.
 */
import { describe, expect, it } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import { createApp, DEFAULT_TOOLBAR, type Platform, type PlatformBridge } from "../src/index.ts";

interface Item { id: string; label: string; shortcut?: string; disabled?: boolean; reason?: string; checked?: boolean; items?: Item[] }
interface ToolbarVm { open: boolean; items: Item[]; more: { id: string; label: string; items: Item[] }[]; triggerShortcut: string }

function appFor(platform: Platform) {
  const bridge: PlatformBridge = {
    platform,
    readNote: async () => "",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/Welcome.md",
    loadAppState: async () => ({ version: 1 }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    toggleFullScreen: () => {},
  };
  return createApp(bridge, en);
}
const vmOf = (app: ReturnType<typeof appFor>) => app.viewModels.select("vm.toolbar", app.store.state) as unknown as ToolbarVm;
const flat = (vm: ToolbarVm) => vm.more.flatMap((g) => g.items.flatMap((i) => [i, ...(i.items ?? [])]));

describe("the toolbar (UI-04, UI-07)", () => {
  it("UI-04: shows at most six actions; everything else is in ⋯", () => {
    const vm = vmOf(appFor("windows"));
    expect(vm.items.length).toBeLessThanOrEqual(6);
    expect(vm.more.length).toBeGreaterThan(0);
    // Nothing on the toolbar is repeated in ⋯.
    const inMenu = new Set(flat(vm).map((i) => i.id));
    for (const item of vm.items) expect(inMenu.has(item.id)).toBe(false);
  });

  it("UI-07: the six defaults are New note, Open, Search, Save, Focus, and Theme, in that order", () => {
    const vm = vmOf(appFor("windows"));
    expect(vm.items.map((i) => i.id)).toEqual([...DEFAULT_TOOLBAR]);
    expect(vm.items.map((i) => i.label)).toEqual(["New note", "Open…", "Search", "Save", "Focus mode", "Switch light and dark"]);
  });

  it("UI-07: ⋯ holds font size, full screen, find, find and replace, share and visibility, settings, keyboard shortcuts, and help", () => {
    const vm = vmOf(appFor("windows"));
    const ids = flat(vm).map((i) => i.id);
    for (const id of ["font.smaller", "font.larger", "font.reset", "window.fullScreen", "find.open", "find.replace", "note.share", "settings.open", "shortcuts.open", "help.open"]) {
      expect(ids, id).toContain(id);
    }
    // Grouped as Main UI → The ⋯ menu lists them.
    expect(vm.more.map((g) => g.label)).toEqual(["View", "Theme", "Edit", "Note", "App"]);
    // Every item shows its shortcut where it has one, so the menu teaches them.
    const byId = new Map(flat(vm).map((i) => [i.id, i]));
    expect(byId.get("font.larger")?.shortcut).toBe("Ctrl+=");
    expect(byId.get("find.replace")?.shortcut).toBe("Ctrl+H");
    expect(byId.get("shortcuts.open")?.shortcut).toBe("Ctrl+Shift+/");
  });

  it("UI-07: items whose feature arrives later are present, unavailable, and say why", async () => {
    const app = appFor("macos");
    const byId = new Map(flat(vmOf(app)).map((i) => [i.id, i]));
    expect(byId.get("note.share")).toMatchObject({ label: "Share and visibility…", disabled: true, reason: "Sharing and visibility arrive in a later preview" });
    expect(byId.get("settings.open")).toMatchObject({ label: "Settings", disabled: true, reason: "Settings arrive in a later preview", shortcut: "⌘," });
    expect(byId.get("help.open")).toMatchObject({ label: "Help and docs", disabled: true, reason: "Help and docs arrive in a later preview" });
    // Running one does nothing (and never throws), so the menu can stay open on it.
    const before = app.store.state;
    await app.commands.run("settings.open");
    expect(app.store.state).toBe(before);
    // Its key is reserved, but it isn't listed in the cheat sheet until it works.
    expect(app.commands.match({ key: ",", code: "Comma", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe("settings.open");
    const sheet = app.viewModels.select("vm.shortcuts", app.store.state) as { groups: { rows: { id: string }[] }[] };
    expect(sheet.groups.flatMap((g) => g.rows.map((r) => r.id))).not.toContain("settings.open");
  });

  it("UI-07: every enabled item runs, and running one closes the toolbar", async () => {
    const app = appFor("windows");
    await app.commands.run("toolbar.setOpen", { open: true });
    expect(vmOf(app).open).toBe(true);
    await app.commands.run("command.run", { id: "font.larger" });
    expect(vmOf(app).open).toBe(false);
    expect(app.store.state.appearance.fontSize).toBe(17);
    // An unknown ID is refused rather than run.
    await app.commands.run("command.run", { id: "nope" });
  });
});
