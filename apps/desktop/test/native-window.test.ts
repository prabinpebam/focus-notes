/**
 * macOS's native window (DSK-02, DSK-05, D-14): the menu bar built from the renderer's menu (keys as
 * Electron accelerators, the system's roles, checked and enabled states kept up to date without
 * rebuilding an open menu, and anything that isn't a menu refused), and the traffic lights shown
 * only on the title bar band. The real menu bar and traffic lights are checked by the macOS journeys.
 */
import { describe, expect, it } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { createApp, menuBarModel, type MenuBarModel, type PlatformBridge } from "@focus-notes/core";
import type { Point, Rect } from "@focus-notes/core/window-geometry";
import en from "../../../packages/views/messages/en.json" with { type: "json" };
import { AppMenuBar, checkMenuModel, menuTemplate, toAccelerator, type MenuLike } from "../src/main/window/menu-bar.ts";
import { MacTitleBar, onBand, type MacWinLike } from "../src/main/window/mac-title-bar.ts";

const model: MenuBarModel = {
  menus: [
    { id: "app", label: "Focus Notes", kind: "app", items: [{ kind: "role", role: "about" }, { kind: "separator" }, { kind: "command", id: "settings.open", label: "Settings…", chord: "Mod+,", enabled: true }, { kind: "role", role: "quit" }] },
    { id: "edit", label: "Edit", items: [{ kind: "role", role: "undo", id: "edit.undo", label: "Undo", chord: "Mod+Z" }, { kind: "role", role: "copy" }] },
    {
      id: "view", label: "View", items: [
        { kind: "command", id: "focus.toggle", label: "Focus mode", chord: "Mod+Shift+D", enabled: true, checked: true },
        { kind: "submenu", label: "Appearance", items: [{ kind: "command", id: "appearance.dark", label: "Dark", enabled: true, checked: false, radio: true }] },
        { kind: "command", id: "window.fullScreen", label: "Full screen", chord: "Ctrl+Mod+F", enabled: true },
      ],
    },
    { id: "window", label: "Window", kind: "window", items: [{ kind: "role", role: "minimize" }] },
    { id: "help", label: "Help", kind: "help", items: [
      { kind: "command", id: "shortcuts.open", label: "Keyboard shortcuts", chord: "Mod+Shift+/", enabled: false },
      { kind: "command", id: "help.open", label: "Help and docs", enabled: false, reason: "Help and docs arrive in a later preview" },
    ] },
  ],
};
const sub = (t: MenuItemConstructorOptions[], i: number) => t[i]!.submenu as MenuItemConstructorOptions[];

describe("DSK-05: the macOS menu bar", () => {
  it("turns the keymap's chords into Electron accelerators", () => {
    expect(toAccelerator("Mod+Shift+L")).toBe("Shift+Command+L");
    expect(toAccelerator("Ctrl+Mod+F")).toBe("Control+Command+F");
    expect(toAccelerator("Mod+Alt+1")).toBe("Alt+Command+1");
    expect(toAccelerator("Mod+=")).toBe("Command+=");
    expect(toAccelerator("Mod+-")).toBe("Command+-");
    expect(toAccelerator("Mod+\\")).toBe("Command+\\");
    expect(toAccelerator("Mod+Shift+/")).toBe("Shift+Command+/");
    expect(toAccelerator("Mod+Up")).toBe("Command+Up");
    expect(toAccelerator("Mod+Enter")).toBe("Command+Enter");
    expect(toAccelerator("F6")).toBe("F6");
    expect(toAccelerator("Alt+F10")).toBe("Alt+F10");
    expect(toAccelerator("Mod+b")).toBe("Command+B");
    expect(toAccelerator("Mod+Nope")).toBeUndefined();
    expect(toAccelerator("Hyper+K")).toBeUndefined();
  });

  it("gives every command of the desktop's menu bar an accelerator Electron accepts", async () => {
    const noop = async () => undefined;
    const bridge: PlatformBridge = {
      platform: "macos", readNote: async () => "# A\n", writeNote: async () => {}, chooseNote: noop, newNotePath: async () => "/n/b.md",
      defaultNotePath: async () => "/n/a.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
      systemScheme: () => "light", onSystemSchemeChange: () => () => {}, toggleFullScreen: () => {},
    };
    const app = createApp(bridge, en);
    const m = menuBarModel(app.commands, app.messages, "macos");
    const chords: string[] = [];
    const walk = (items: MenuBarModel["menus"][number]["items"]) => {
      for (const i of items) if (i.kind === "submenu") walk(i.items); else if ((i.kind === "command" || i.kind === "role") && i.chord) chords.push(i.chord);
    };
    for (const menu of m.menus) walk(menu.items);
    expect(chords.length).toBeGreaterThan(30);
    expect(chords.filter((c) => !toAccelerator(c))).toEqual([]);
    expect(checkMenuModel(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it("builds the template: the system's roles, the Window and Help menus, checkboxes and radio items, and commands sent back", () => {
    const chosen: [string, boolean][] = [];
    const t = menuTemplate(model, (id, byKey) => chosen.push([id, byKey]));
    expect(t.map((m) => [m.label, m.role])).toEqual([["Focus Notes", undefined], ["Edit", undefined], ["View", undefined], ["Window", "window"], ["Help", "help"]]);
    expect(sub(t, 0)[0]).toEqual({ role: "about" });
    expect(sub(t, 0)[1]).toEqual({ type: "separator" });
    expect(sub(t, 0)[2]).toMatchObject({ id: "settings.open", label: "Settings…", accelerator: "Command+,", enabled: true });
    expect(sub(t, 0)[2]!.type).toBeUndefined();
    expect(sub(t, 1)[0]).toEqual({ role: "undo", id: "edit.undo", label: "Undo", accelerator: "Command+Z" });
    expect(sub(t, 2)[0]).toMatchObject({ id: "focus.toggle", type: "checkbox", checked: true, accelerator: "Shift+Command+D" });
    expect((sub(t, 2)[1]!.submenu as MenuItemConstructorOptions[])[0]).toMatchObject({ id: "appearance.dark", type: "radio", checked: false });
    expect(sub(t, 2)[2]).toMatchObject({ id: "window.fullScreen", accelerator: "Control+Command+F" });
    expect(sub(t, 4)[0]).toMatchObject({ enabled: false, accelerator: "Shift+Command+/" });
    expect(sub(t, 4)[0]!.toolTip).toBeUndefined();
    // An unavailable item says why (D-100), as macOS's tooltip.
    expect(sub(t, 4)[1]).toMatchObject({ id: "help.open", enabled: false, toolTip: "Help and docs arrive in a later preview" });
    const click = (o: MenuItemConstructorOptions, byKey: boolean) => (o.click as unknown as (a: unknown, b: unknown, e: { triggeredByAccelerator?: boolean }) => void)({}, undefined, { triggeredByAccelerator: byKey });
    click(sub(t, 2)[0]!, false);
    click(sub(t, 2)[2]!, true);
    expect(chosen).toEqual([["focus.toggle", false], ["window.fullScreen", true]]);
  });

  it("refuses anything that isn't a menu: unknown roles, odd IDs, and items without words", () => {
    expect(checkMenuModel(model)).toEqual(model);
    const bad = (patch: unknown) => checkMenuModel({ menus: [{ id: "x", label: "X", items: [patch] }] });
    expect(bad({ kind: "role", role: "toggleDevTools" })).toBeUndefined();
    expect(bad({ kind: "role", role: "reload" })).toBeUndefined();
    expect(bad({ kind: "command", id: "../../evil", label: "X", enabled: true })).toBeUndefined();
    expect(bad({ kind: "command", id: "a.b", label: "", enabled: true })).toBeUndefined();
    expect(bad({ kind: "command", id: "a.b", label: "X" })).toBeUndefined();
    expect(bad({ kind: "command", id: "a.b", label: "X", enabled: false, reason: "" })).toBeUndefined();
    expect(bad({ kind: "command", id: "a.b", label: "X", enabled: false, reason: "x".repeat(201) })).toBeUndefined();
    expect(bad({ kind: "submenu", label: "S", items: [{ kind: "submenu", label: "T", items: [{ kind: "submenu", label: "U", items: [] }] }] })).toBeUndefined();
    expect(checkMenuModel({ menus: "no" })).toBeUndefined();
    expect(checkMenuModel(null)).toBeUndefined();
  });

  it("changes only the states while the menu keeps its shape, so an open menu stays open", () => {
    const items = new Map<string, { enabled: boolean; checked: boolean }>();
    const built: MenuItemConstructorOptions[][] = [];
    const set: unknown[] = [];
    const api = {
      buildFromTemplate: (template: MenuItemConstructorOptions[]): MenuLike => {
        built.push(template);
        items.clear();
        const walk = (ts: MenuItemConstructorOptions[]) => {
          for (const x of ts) {
            if (Array.isArray(x.submenu)) walk(x.submenu);
            if (x.id) items.set(x.id, { enabled: x.enabled ?? true, checked: x.checked ?? false });
          }
        };
        walk(template);
        return { getMenuItemById: (id: string) => items.get(id) ?? null };
      },
      setApplicationMenu: (m: MenuLike) => set.push(m),
    };
    const chosen: string[] = [];
    const bar = new AppMenuBar(api, (id) => chosen.push(id));
    expect(bar.set(model)).toBe(true);
    expect(built).toHaveLength(1);
    expect(set).toHaveLength(1);
    // Focus mode turned off, Help's item enabled: the same menu, updated.
    const next = JSON.parse(JSON.stringify(model)) as MenuBarModel;
    (next.menus[2]!.items[0] as { checked: boolean }).checked = false;
    (next.menus[4]!.items[0] as { enabled: boolean }).enabled = true;
    expect(bar.set(next)).toBe(true);
    expect(built).toHaveLength(1);
    expect(items.get("focus.toggle")).toEqual({ enabled: true, checked: false });
    expect(items.get("shortcuts.open")?.enabled).toBe(true);
    // A checkbox chosen shows the command's state until the renderer reports the new one.
    items.get("focus.toggle")!.checked = true; // Electron flips it on click.
    (sub(built[0]!, 2)[0]!.click as unknown as (a: unknown, b: unknown, e: unknown) => void)({}, undefined, {});
    expect(items.get("focus.toggle")!.checked).toBe(false);
    expect(chosen).toEqual(["focus.toggle"]);
    // A new label is a new shape: rebuilt.
    const renamed = JSON.parse(JSON.stringify(next)) as MenuBarModel;
    renamed.menus[1]!.label = "Bearbeiten";
    bar.set(renamed);
    expect(built).toHaveLength(2);
    expect(set).toHaveLength(2);
    // Anything else is ignored, and the menu stays as it was.
    expect(bar.set({ menus: [{ id: "x", label: "X", items: [{ kind: "role", role: "toggleDevTools" }] }] })).toBe(false);
    expect(built).toHaveLength(2);
  });
});

class FakeMac implements MacWinLike {
  focused = true;
  full = false;
  visible = true;
  calls: boolean[] = [];
  getContentBounds(): Rect {
    return { x: 100, y: 50, width: 800, height: 600 };
  }
  isFocused() {
    return this.focused;
  }
  isFullScreen() {
    return this.full;
  }
  isVisible() {
    return this.visible;
  }
  isDestroyed() {
    return false;
  }
  setWindowButtonVisibility(v: boolean) {
    this.calls.push(v);
  }
}

describe("DSK-02: macOS's traffic lights show on the title bar band", () => {
  it("knows the band: the window's top 44 px, its full width", () => {
    const c = { x: 100, y: 50, width: 800, height: 600 };
    expect(onBand({ x: 100, y: 50 }, c)).toBe(true);
    expect(onBand({ x: 899, y: 93 }, c)).toBe(true);
    expect(onBand({ x: 500, y: 94 }, c)).toBe(false);
    expect(onBand({ x: 99, y: 60 }, c)).toBe(false);
    expect(onBand({ x: 900, y: 60 }, c)).toBe(false);
    expect(onBand({ x: 500, y: 49 }, c)).toBe(false);
  });

  it("hides them at rest, and shows them on the band, with the toolbar open, when inactive, and in full screen", () => {
    const w = new FakeMac();
    let pointer: Point = { x: 500, y: 400 };
    const bar = new MacTitleBar(w, () => pointer);
    bar.update();
    expect(w.calls).toEqual([false]);
    pointer = { x: 120, y: 60 };
    bar.update();
    pointer = { x: 500, y: 400 };
    bar.update();
    bar.update();
    expect(w.calls).toEqual([false, true, false]);
    bar.reveal(true);
    bar.reveal(false);
    w.focused = false;
    bar.update();
    w.focused = true;
    w.full = true;
    bar.update();
    w.full = false;
    bar.update();
    expect(w.calls).toEqual([false, true, false, true, false, true, false]);
    expect(bar.shown).toBe(false);
    bar.stop();
  });

  it("follows the page's pointer reports once the caret is ready, and the window's own events", () => {
    const w = new FakeMac();
    let pointer: Point = { x: 500, y: 400 };
    const bar = new MacTitleBar(w, () => pointer);
    bar.update();
    pointer = { x: 120, y: 60 };
    bar.pointerMoved();
    expect(w.calls).toEqual([false]);
    bar.trackPointer();
    bar.pointerMoved();
    expect(w.calls).toEqual([false, true]);
    pointer = { x: 500, y: 400 };
    bar.pointerMoved();
    expect(w.calls).toEqual([false, true, false]);
    // Clicking the band to make the window active: the system's focus event, with the pointer on the band.
    w.focused = false;
    bar.update();
    pointer = { x: 120, y: 60 };
    w.focused = true;
    bar.update();
    expect(w.calls).toEqual([false, true, false, true]);
    expect(bar.shown).toBe(true);
    bar.stop();
  });
});
