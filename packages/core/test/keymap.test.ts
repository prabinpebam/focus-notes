/** KEY-02, KEY-05, KEY-06: the keymap's rules, checked over every binding on every platform. */
import { describe, expect, it } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import {
  BROWSER_RESERVED, chordParts, chordsFor, createApp, formatChord, OS_RESERVED, spokenChord,
  type KeyEventLike, type Platform, type PlatformBridge,
} from "../src/index.ts";

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
  };
  return createApp(bridge, en);
}

const key = (k: Partial<KeyEventLike> & { key: string }): KeyEventLike => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...k });
const PLATFORMS: Platform[] = ["macos", "windows", "linux", "web"];

describe("matching keys (KEY-06)", () => {
  const win = appFor("windows").commands;
  const mac = appFor("macos").commands;

  it("matches punctuation by physical key when Shift changes the character", () => {
    expect(win.match(key({ key: "?", code: "Slash", ctrlKey: true, shiftKey: true }))).toBe("shortcuts.open");
    expect(mac.match(key({ key: "?", code: "Slash", metaKey: true, shiftKey: true }))).toBe("shortcuts.open");
  });
  it("follows the character on remapped Latin layouts (Dvorak)", () => {
    // Dvorak: the physical O key types "s".
    expect(win.match(key({ key: "s", code: "KeyO", ctrlKey: true }))).toBe("note.save");
  });
  it("falls back to the physical key on non-Latin layouts", () => {
    expect(win.match(key({ key: "ы", code: "KeyS", ctrlKey: true }))).toBe("note.save");
  });
  it("never runs while an IME is composing or AltGr types a character", () => {
    expect(win.match(key({ key: "s", code: "KeyS", ctrlKey: true, isComposing: true }))).toBeUndefined();
    expect(win.match(key({ key: "s", code: "KeyS", ctrlKey: true, altKey: true, altGraph: true }))).toBeUndefined();
    // German AltGr+7 types "{": Ctrl+Alt+7 must not fall back to the physical key.
    expect(win.match(key({ key: "{", code: "Digit7", ctrlKey: true, altKey: true }))).toBeUndefined();
  });
  it("German layout: Ctrl+Shift+7 types \"/\", so it opens the cheat sheet, not a numbered list", () => {
    expect(win.match(key({ key: "/", code: "Digit7", ctrlKey: true, shiftKey: true }))).toBe("shortcuts.open");
  });
  it("matches chords that name Ctrl, and the web substitute for New note", () => {
    const web = appFor("web").commands;
    expect(web.match(key({ key: "n", code: "KeyN", ctrlKey: true, altKey: true }))).toBe("note.new");
    expect(web.match(key({ key: "n", code: "KeyN", ctrlKey: true }))).toBeUndefined();
    expect(mac.match(key({ key: "f", code: "KeyF", ctrlKey: true, metaKey: true }))).toBe("window.fullScreen");
    expect(mac.match(key({ key: "f", code: "KeyF", metaKey: true }))).toBeUndefined();
  });
  it("leaves editor keys to the editor", () => {
    expect(win.match(key({ key: "b", code: "KeyB", ctrlKey: true }))).toBeUndefined();
  });
  it("runs quiet variants without listing them", () => {
    expect(win.match(key({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true }))).toBe("font.larger");
    expect(win.bindings().find((b) => b.id === "font.larger")!.chords).toEqual(["Mod+="]);
  });
});

describe("the default keymap (KEY-02, KEY-06)", () => {
  for (const platform of PLATFORMS) {
    const app = appFor(platform);
    const all = app.commands.bindings(platform);
    it(`${platform}: no chord runs two commands`, () => {
      const seen = new Map<string, string>();
      for (const b of all) for (const c of b.chords) {
        expect(seen.get(c), `${c} is bound to ${seen.get(c)} and ${b.id}`).toBeUndefined();
        seen.set(c, b.id);
      }
    });
    it(`${platform}: no OS-reserved or browser-reserved keys`, () => {
      const reserved = platform === "web" ? BROWSER_RESERVED : OS_RESERVED[platform];
      for (const b of all) for (const c of b.chords) expect(reserved, `${b.id}: ${c}`).not.toContain(c);
    });
    it(`${platform}: every shortcut has a layer and a group`, () => {
      for (const id of app.commands.ids()) {
        const d = app.commands.describe(id);
        if (d.shortcut) expect(all.some((b) => b.id === id) || id === "spotlight.open", id).toBe(true);
      }
    });
  }
  it("macOS: Option and Control never stand alone with a letter", () => {
    for (const b of appFor("macos").commands.bindings("macos")) for (const c of b.chords) {
      const parts = c.split("+");
      if (/^[A-Z]$/i.test(parts.at(-1)!) && !parts.includes("Mod")) expect(parts, `${b.id}: ${c}`).not.toContain("Alt");
      if (/^[A-Z]$/i.test(parts.at(-1)!) && !parts.includes("Mod")) expect(parts, `${b.id}: ${c}`).not.toContain("Ctrl");
    }
  });
  it("web: browser keys have substitutes", () => {
    const web = appFor("web").commands;
    expect(chordsFor({ default: "Mod+N", web: "Ctrl+Alt+N" }, "web")).toEqual(["Ctrl+Alt+N"]);
    expect(web.bindings("web").find((b) => b.id === "note.new")!.chords).toEqual(["Ctrl+Alt+N"]);
    expect(web.bindings("web").find((b) => b.id === "window.fullScreen")).toBeUndefined();
  });
});

describe("showing keys", () => {
  it("draws chords in each platform's symbols and order", () => {
    expect(formatChord("Mod+Alt+Shift+C", "macos")).toBe("⌥⇧⌘C");
    expect(formatChord("Mod+Alt+Shift+C", "windows")).toBe("Ctrl+Alt+Shift+C");
    expect(chordParts("Mod+Shift+/", "macos")).toEqual(["⇧", "⌘", "/"]);
    expect(chordParts("Mod+Shift+Up", "windows")).toEqual(["Ctrl", "Shift", "↑"]);
    expect(spokenChord("Mod+Shift+L", "macos")).toBe("Shift Command L");
    expect(spokenChord("Mod+\\", "windows")).toBe("Control Backslash");
  });
});

describe("the cheat sheet (KEY-05)", () => {
  const open = async (platform: Platform = "windows") => {
    const app = appFor(platform);
    await app.commands.run("shortcuts.open");
    const vm = () => app.viewModels.select("vm.shortcuts", app.store.state) as { open: boolean; groups: { id: string; rows: { id: string; chords: { text: string }[] }[] }[]; count: number; summary: string };
    return { app, vm };
  };
  const ids = (groups: { rows: { id: string }[] }[]) => groups.flatMap((g) => g.rows.map((r) => r.id));

  it("lists every binding in the documented groups, closed until asked", async () => {
    const app = appFor("windows");
    expect((app.viewModels.select("vm.shortcuts", app.store.state) as { groups: unknown[] }).groups).toEqual([]);
    const { vm } = await open();
    expect(vm().groups.map((g) => g.id)).toEqual(["app", "editing", "formatting", "blocks"]);
    expect(ids(vm().groups)).toEqual(expect.arrayContaining(["note.save", "format.bold", "block.heading1", "keys.cutCopyPaste", "shortcuts.open"]));
    expect(ids(vm().groups)).not.toContain("spotlight.open"); // planned for M4
    expect(vm().summary).toBe(`${vm().count} shortcuts`);
  });
  it("searches names and keys, in either platform's spelling", async () => {
    const { app, vm } = await open();
    await app.commands.run("shortcuts.setQuery", { value: "bold" });
    expect(ids(vm().groups)).toEqual(["format.bold"]);
    await app.commands.run("shortcuts.setQuery", { value: "ctrl shift /" });
    expect(ids(vm().groups)).toEqual(["shortcuts.open"]);
    await app.commands.run("shortcuts.setQuery", { value: "⇧⌘L" });
    expect(ids(vm().groups)).toEqual(["appearance.toggle"]);
    await app.commands.run("shortcuts.setQuery", { value: "zzz" });
    expect(vm().groups).toEqual([]);
    expect(vm().summary).toBe("No shortcuts match “zzz”");
  });
  it("filters by layer and switches platforms", async () => {
    const { app, vm } = await open();
    await app.commands.run("shortcuts.setLayer", { value: "basic" });
    expect(ids(vm().groups)).toContain("note.save");
    expect(ids(vm().groups)).not.toContain("focus.toggle");
    await app.commands.run("shortcuts.setLayer", { value: "nonsense" });
    expect(app.store.state.ui.shortcuts.layer).toBe("basic");
    await app.commands.run("shortcuts.setPlatform", { value: "mac" });
    expect(vm().groups[0]!.rows.find((r) => r.id === "note.save")!.chords[0]!.text).toBe("⌘S");
  });
  it("opens fresh each time and closes the toolbar", async () => {
    const { app } = await open();
    await app.commands.run("shortcuts.setQuery", { value: "bold" });
    await app.commands.run("shortcuts.setOpen", { open: false });
    await app.commands.run("toolbar.setOpen", { open: true });
    await app.commands.run("shortcuts.open");
    expect(app.store.state.ui).toMatchObject({ toolbarOpen: false, shortcuts: { open: true, query: "" } });
  });
  it("delivers editor commands to the editor", async () => {
    const app = appFor("windows");
    await app.start();
    const got: string[] = [];
    app.onEditorAction((id) => got.push(id));
    await app.commands.run("format.bold");
    expect(got).toEqual(["format.bold"]);
  });
});
