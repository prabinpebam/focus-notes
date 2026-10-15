/**
 * macOS's menu bar (DSK-05): generated from the command registry, every command listed once (or
 * named as not belonging there), with its key for the platform, its checked and enabled states,
 * the system's own items, and items run through the command runner.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createApp, menuBarCommands, menuBarModel, MENU_BAR, MENU_KEY_WINDOW_MS, MENU_UPDATE_MS, NOT_IN_MENU_BAR, shortcutFor,
  type MenuBarItem, type MenuBarModel, type NativeWindowBridge, type PlatformBridge,
} from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const noop = async () => undefined;
/** Everything the desktop's preload gives the app on macOS. */
function desktop(native?: NativeWindowBridge): PlatformBridge {
  return {
    platform: "macos",
    readNote: async () => "# A\n\nText\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/new.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => ({ version: 1, firstRun: "done" }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    toggleFullScreen: () => {},
    markReady: () => {},
    openLink: () => {},
    copyText: async () => {},
    workspace: {
      info: async () => ({ folder: "/n", format: '{"formatVersion":1}' }), scan: async () => ({ roots: [{ path: "/n", visibility: "public" }], entries: [] }),
      writeFormat: async () => {}, renameNote: async (_f: string, to: string) => to, apply: async () => [], chooseBundle: noop, importBundle: noop,
      deleted: async () => [], restore: async () => [], removal: noop, remove: noop, onChange: () => () => {},
    } as unknown as PlatformBridge["workspace"],
    settings: { load: async () => ({ available: false }), save: async () => {}, remove: async () => {} },
    sync: { now: noop, status: async () => ({ git: true, state: "idle", waiting: 0 }), conflicts: async () => [], resolve: noop, onStatus: () => () => {} } as unknown as PlatformBridge["sync"],
    setup: { status: noop, start: noop, retry: noop, reset: noop, passphraseStrength: noop, onReport: () => () => {} } as unknown as PlatformBridge["setup"],
    firstRun: new Proxy({}, { get: (_t, k) => (k === "onSignIn" ? () => () => {} : noop) }) as PlatformBridge["firstRun"],
    ...(native ? { nativeWindow: native } : {}),
  };
}
function fakeNative() {
  const menus: MenuBarModel[] = [];
  const reveals: boolean[] = [];
  let run: ((id: string, byKey: boolean) => void) | undefined;
  const native: NativeWindowBridge = {
    setMenu: (m) => menus.push(m),
    onMenuCommand: (l) => ((run = l), () => {}),
    revealControls: (show) => reveals.push(show),
  };
  return { native, menus, reveals, choose: (id: string, byKey = false) => run?.(id, byKey) };
}
const commandsIn = (items: MenuBarItem[]): (MenuBarItem & { id?: string })[] =>
  items.flatMap((i) => (i.kind === "submenu" ? commandsIn(i.items) : [i]));
const flat = (m: MenuBarModel) => m.menus.flatMap((menu) => commandsIn(menu.items));
const find = (m: MenuBarModel, id: string) => flat(m).find((i) => "id" in i && i.id === id) as (MenuBarItem & { kind: "command" }) | undefined;

afterEach(() => vi.useRealTimers());

describe("DSK-05: the macOS menu bar lists every command", () => {
  it("places every registered command in the menu bar exactly once, or names why it isn't there", async () => {
    const app = createApp(desktop(), en);
    await app.start();
    const listed = menuBarCommands();
    const problems: string[] = [];
    for (const id of app.commands.ids()) {
      const times = listed.filter((x) => x === id).length;
      const why = NOT_IN_MENU_BAR.find((r) => r.ids.test(id))?.why;
      if (times > 1) problems.push(`${id} is listed ${times} times`);
      if (times === 1 && why) problems.push(`${id} is listed and also excluded (${why})`);
      if (times === 0 && !why) problems.push(`${id} has no place in the menu bar`);
    }
    // Everything the layout names is a command of the desktop.
    for (const id of listed) if (!app.commands.has(id)) problems.push(`${id} isn't a command`);
    expect(problems).toEqual([]);
    // And the menu bar built from it has each of them once.
    const ids = flat(menuBarModel(app.commands, app.messages, "macos")).flatMap((i) => ("id" in i && i.id ? [i.id] : []));
    expect(ids.length).toBe(new Set(ids).size);
    expect(new Set(ids)).toEqual(new Set(listed));
  });

  it("has every toolbar and ⋯ action, and every app-wide and editor key, of the desktop", async () => {
    const app = createApp(desktop(), en);
    await app.start();
    const listed = new Set(menuBarCommands());
    const toolbar = app.viewModels.select("vm.toolbar", app.store.state) as { items: { id: string }[]; more: { items: { id: string; items?: { id: string }[] }[] }[] };
    const wanted = [
      ...toolbar.items.map((i) => i.id),
      ...toolbar.more.flatMap((g) => g.items.flatMap((i) => (i.items ? i.items.map((c) => c.id) : [i.id]))),
      ...app.commands.bindings("macos").filter((b) => !b.handledBy || b.handledBy === "editor").map((b) => b.id),
    ];
    expect(wanted.filter((id) => !listed.has(id))).toEqual([]);
  });

  it("shows each command's key for the platform, from the keymap", async () => {
    const app = createApp(desktop(), en);
    await app.start();
    const mac = menuBarModel(app.commands, app.messages, "macos");
    const pc = menuBarModel(app.commands, app.messages, "windows");
    expect(find(mac, "find.replace")?.chord).toBe("Mod+Alt+F");
    expect(find(pc, "find.replace")?.chord).toBe("Mod+H");
    expect(find(mac, "window.fullScreen")?.chord).toBe("Ctrl+Mod+F");
    expect(find(pc, "window.fullScreen")?.chord).toBe("F11");
    expect(find(mac, "edit.docStart")?.chord).toBe("Mod+Up");
    expect(find(pc, "edit.docStart")?.chord).toBe("Mod+Home");
    expect(find(mac, "focus.toggle")?.chord).toBe("Mod+Shift+D");
    expect(find(mac, "picker.open")?.chord).toBeUndefined();
    for (const [platform, model] of [["macos", mac], ["windows", pc]] as const) {
      for (const i of flat(model)) {
        if (i.kind !== "command") continue;
        expect(i.chord, `${platform} ${i.id}`).toBe(shortcutFor(app.commands.shortcut(i.id), platform));
      }
    }
  });

  it("follows the registry's checked and enabled states", async () => {
    const app = createApp(desktop(), en);
    const before = menuBarModel(app.commands, app.messages, "macos");
    // Before the note opens the editor's commands can't run.
    expect(find(before, "format.bold")?.enabled).toBe(false);
    await app.start();
    let m = menuBarModel(app.commands, app.messages, "macos");
    expect(find(m, "format.bold")?.enabled).toBe(true);
    expect(find(m, "focus.toggle")).toMatchObject({ checked: true, enabled: true });
    await app.commands.run("focus.toggle");
    m = menuBarModel(app.commands, app.messages, "macos");
    expect(find(m, "focus.toggle")?.checked).toBe(false);
    // Sync appearance is there but unavailable without a private repository.
    expect(find(m, "settings.sync")).toMatchObject({ enabled: false, checked: false });
    // Choices are radio items, exactly one checked.
    const appearance = m.menus.find((x) => x.id === "view")!.items.find((i) => i.kind === "submenu" && i.label === "Appearance") as Extract<MenuBarItem, { kind: "submenu" }>;
    expect(appearance.items.map((i) => (i.kind === "command" ? [i.id, i.radio, i.checked] : []))).toEqual([
      ["appearance.system", true, true], ["appearance.light", true, false], ["appearance.dark", true, false],
    ]);
    await app.commands.run("appearance.dark");
    m = menuBarModel(app.commands, app.messages, "macos");
    expect(find(m, "appearance.dark")?.checked).toBe(true);
    expect(find(m, "appearance.system")?.checked).toBe(false);
    // ⋯'s planned items are there, unavailable, and say why (D-100): Share and visibility in File, Help and docs in Help.
    const items = (id: string) => commandsIn(m.menus.find((x) => x.id === id)!.items).flatMap((i) => (i.kind === "command" ? [i.id] : []));
    expect(items("file")).toContain("note.share");
    expect(items("help")).toEqual(["shortcuts.open", "help.open"]);
    expect(find(m, "note.share")).toMatchObject({ label: "Share and visibility…", enabled: false, reason: "Sharing is in the desktop app's Settings" });
    expect(find(m, "help.open")).toMatchObject({ label: "Help and docs", enabled: false, reason: "Help and docs arrive in a later preview" });
    expect(find(m, "shortcuts.open")?.reason).toBeUndefined();
    // The app-built window's commands and the browser's aren't on a Mac's menu bar at all.
    for (const id of ["window.minimize", "window.snap.left", "notes.export", "vault.unlock"]) expect(find(m, id)).toBeUndefined();
    // Spotlight (M4) is in Go, with its keys.
    expect(items("go").slice(0, 3)).toEqual(["spotlight.open", "spotlight.commands", "spotlight.headings"]);
    expect(items("file")).toContain("spotlight.quickOpen");
    expect(find(m, "spotlight.open")).toMatchObject({ chord: "Mod+/", enabled: true });
  });

  it("keeps macOS's own menus and items: the app menu, cut, copy, and paste, the Window menu, and Help", async () => {
    const app = createApp(desktop(), en);
    await app.start();
    const m = menuBarModel(app.commands, app.messages, "macos");
    expect(m.menus.map((x) => [x.label, x.kind])).toEqual([
      ["Focus Notes", "app"], ["File", undefined], ["Edit", undefined], ["Format", undefined], ["View", undefined], ["Go", undefined], ["Window", "window"], ["Help", "help"],
    ]);
    const roles = (id: string) => m.menus.find((x) => x.id === id)!.items.flatMap((i) => (i.kind === "role" ? [i.role] : []));
    expect(roles("app")).toEqual(["about", "services", "hide", "hideOthers", "unhide", "quit"]);
    expect(roles("edit")).toEqual(["undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll"]);
    expect(roles("window")).toEqual(["minimize", "zoom", "front"]);
    expect(roles("file")).toEqual(["close"]);
    // Undo and Redo are the system's items (they work in text fields too), named and keyed as the commands.
    const undo = m.menus.find((x) => x.id === "edit")!.items[0];
    expect(undo).toEqual({ kind: "role", role: "undo", id: "edit.undo", label: "Undo", chord: "Mod+Z" });
    // Settings… is in the app menu, as on every Mac.
    expect(m.menus[0]!.items.some((i) => i.kind === "command" && i.id === "settings.open")).toBe(true);
    // No separator starts, ends, or doubles anywhere.
    for (const menu of m.menus) {
      const kinds = menu.items.map((i) => i.kind);
      expect(kinds[0], menu.id).not.toBe("separator");
      expect(kinds.at(-1), menu.id).not.toBe("separator");
      expect(kinds.join(",")).not.toContain("separator,separator");
    }
  });

  it("sends the menu bar to the shell, again when something in it changes, and runs what's chosen", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const f = fakeNative();
    const app = createApp(desktop(f.native), en);
    await app.start();
    expect(f.menus).toHaveLength(1);
    expect(find(f.menus[0]!, "focus.toggle")?.checked).toBe(true);
    // Chosen by pointing: runs through the command runner.
    f.choose("focus.toggle");
    await vi.advanceTimersByTimeAsync(MENU_UPDATE_MS);
    expect(app.store.state.focusMode).toBe(false);
    expect(f.menus).toHaveLength(2);
    expect(find(f.menus[1]!, "focus.toggle")?.checked).toBe(false);
    // A change that doesn't show in the menu bar sends nothing.
    await app.commands.run("toolbar.setOpen", { open: false });
    await vi.advanceTimersByTimeAsync(MENU_UPDATE_MS);
    expect(f.menus).toHaveLength(2);
    // Chosen by its key just after the page saw that key: the page already decided, so it doesn't run twice.
    app.keySeen();
    f.choose("focus.toggle", true);
    expect(app.store.state.focusMode).toBe(false);
    // By its key with no key press in the page (macOS sent it to the menu first): it runs.
    await vi.advanceTimersByTimeAsync(MENU_KEY_WINDOW_MS);
    f.choose("focus.toggle", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(app.store.state.focusMode).toBe(true);
    // Only menu bar commands run from it.
    f.choose("command.run");
    f.choose("window.close");
    f.choose("nope");
    await vi.advanceTimersByTimeAsync(MENU_UPDATE_MS);
    expect(app.store.state.focusMode).toBe(true);
  });

  it("shows the traffic lights while the toolbar is open", async () => {
    const f = fakeNative();
    const app = createApp(desktop(f.native), en);
    await app.start();
    await app.commands.run("toolbar.toggle");
    await app.commands.run("focus.toggle");
    await app.commands.run("toolbar.toggle");
    expect(f.reveals).toEqual([true, false]);
  });

  it("D-126: holds the app's commands while setup owns the window, and gives them back when it's done", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const f = fakeNative();
    // A new install: setup opens at Welcome.
    const app = createApp({ ...desktop(f.native), loadAppState: async () => ({ version: 1 }) }, en);
    await app.start();
    await vi.advanceTimersByTimeAsync(MENU_UPDATE_MS);
    const during = f.menus.at(-1)!;
    expect(during).toBeDefined();
    const held = ["note.new", "note.open", "files.open", "spotlight.open", "format.bold", "focus.toggle"].filter((i) => menuBarCommands().includes(i));
    expect(held.length).toBeGreaterThanOrEqual(4);
    for (const id of held) {
      expect(find(during, id), id).toMatchObject({ enabled: false, reason: en["command.firstRun.held"] });
      // The menu reads the registry's describe().
      expect(app.commands.describe(id).enabled).toBe(false);
    }
    // What setup itself needs stays on.
    for (const id of ["appearance.dark"]) expect(find(during, id)?.enabled, id).toBe(true);
    // Chosen from the menu while held, it does nothing.
    f.choose("note.new");
    await vi.advanceTimersByTimeAsync(MENU_UPDATE_MS);
    expect(app.store.state.note.path).toBeUndefined();
    // Just use this computer for now: setup closes and the menu bar is whole again.
    await app.commands.run("firstRun.local");
    await vi.advanceTimersByTimeAsync(MENU_UPDATE_MS);
    expect(find(f.menus.at(-1)!, "note.new")?.enabled).toBe(true);
    expect(find(f.menus.at(-1)!, "note.new")?.reason).toBeUndefined();
  });

  it("has no menu bar on Windows and Linux", async () => {
    const app = createApp({ ...desktop(), platform: "windows" }, en);
    await app.start();
    expect(app.bridge.nativeWindow).toBeUndefined();
    // The layout is the same everywhere; only macOS's shell asks for it.
    expect(MENU_BAR.map((m) => m.id)).toEqual(["app", "file", "edit", "format", "view", "go", "window", "help"]);
  });
});
