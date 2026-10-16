/**
 * KEY-07 (D-170): keybindings.json layered over the defaults: entries add or remove chords per
 * platform, user chords win over a default on the same key, every entry the app can't apply is
 * reported by its position and the rest still apply, and conflicts are found per context. The
 * schema accepts what the parser applies.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { CommandRegistry, canonicalChord, createApp, keyConflicts, parseKeybindings, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const schema = JSON.parse(readFileSync(join(import.meta.dirname, "../../../schemas/keybindings.schema.json"), "utf8"));
const validate = new Ajv2020({ strict: false }).compile(schema);
const known = (id: string) => ["focus.toggle", "note.save", "sync.now", "find.allNotes", "spotlight.open"].includes(id);
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe("parseKeybindings", () => {
  it("adds and removes chords, per platform", () => {
    const p = parseKeybindings(JSON.stringify([
      { command: "focus.toggle", key: "Mod+J" },
      { command: "-note.save", key: "Mod+S" },
      { command: "find.allNotes", key: "Mod+Shift+G", platform: "macos" },
      { command: "find.allNotes", key: "Alt+G", platform: "windows" },
    ]), "windows", known);
    expect(p.problems).toEqual([]);
    expect(p.applied).toBe(3);
    expect(p.bindings.add.get("focus.toggle")).toEqual(["Mod+J"]);
    expect(p.bindings.add.get("find.allNotes")).toEqual(["Alt+G"]);
    expect([...p.bindings.remove.get("note.save")!]).toEqual(["Mod+S"]);
  });

  it("reports what it can't apply by position, and applies the rest", () => {
    const p = parseKeybindings(JSON.stringify([
      { command: "focus.toggle", key: "Mod+J" }, "x", { command: "nope.cmd", key: "Mod+L" }, { command: "focus.toggle", key: "Mod+ J" },
      { command: "focus.toggle", key: "Alt+F4" }, { command: "focus.toggle", key: "Mod+K", platform: "amiga" }, { command: "focus.toggle", key: "Mod+K", when: "editor" },
      { command: "Focus", key: "Mod+K" },
    ]), "windows", known);
    expect(p.problems).toEqual([
      { position: 2, reason: "notObject" }, { position: 3, reason: "unknownCommand", command: "nope.cmd" }, { position: 4, reason: "badKey", command: "focus.toggle" },
      { position: 5, reason: "reserved", command: "focus.toggle" }, { position: 6, reason: "badPlatform", command: "focus.toggle" }, { position: 7, reason: "unknownField" },
      { position: 8, reason: "unknownCommand", command: "Focus" },
    ]);
    expect(p.bindings.add.get("focus.toggle")).toEqual(["Mod+J"]);
    expect(parseKeybindings("{not json", "windows", known).problems).toEqual([{ position: 0, reason: "notJson" }]);
    expect(parseKeybindings('{"command":"focus.toggle"}', "windows", known).problems).toEqual([{ position: 0, reason: "notList" }]);
    expect(parseKeybindings(undefined, "windows", known)).toMatchObject({ problems: [], applied: 0 });
  });

  it("the schema accepts exactly the shapes the parser applies", () => {
    expect(validate([{ command: "focus.toggle", key: "Mod+J" }, { command: "-note.save", key: "Mod+S", platform: "windows" }])).toBe(true);
    for (const bad of [[{ command: "focus.toggle", key: "Mod+ J" }], [{ command: "focus.toggle", key: "Mod+J", when: "editor" }], [{ command: "focus.toggle", key: "Mod+J", platform: "amiga" }], [{ command: "Focus", key: "x" }], {}]) expect(validate(bad)).toBe(false);
  });
});

describe("user bindings in the registry", () => {
  const registry = () => {
    const r = new CommandRegistry<object>(() => ({}), () => {}, "windows");
    r.register({ id: "focus.toggle", title: "t", shortcut: { default: "Mod+Shift+D" }, layer: "writer", group: "app", run: () => {} });
    r.register({ id: "sync.now", title: "t", shortcut: { default: "Mod+Shift+S" }, layer: "basic", group: "app", run: () => {} });
    r.register({ id: "note.save", title: "t", shortcut: { default: "Mod+S" }, layer: "basic", group: "app", run: () => {} });
    return r;
  };
  it("a user chord runs its command, wins over a default on the same key, and a removed chord does nothing", () => {
    const r = registry();
    r.setUserBindings(parseKeybindings(JSON.stringify([{ command: "focus.toggle", key: "Mod+Shift+S" }, { command: "-note.save", key: "Mod+S" }]), "windows", (id) => r.has(id)).bindings);
    expect(r.match(key("S", { ctrlKey: true, shiftKey: true }))).toBe("focus.toggle");
    expect(r.match(key("s", { ctrlKey: true }))).toBeUndefined();
    expect(r.match(key("D", { ctrlKey: true, shiftKey: true }))).toBe("focus.toggle");
    expect(r.describe("focus.toggle").shortcut).toBe("Mod+Shift+S");
    expect(r.bindings().find((b) => b.id === "focus.toggle")!.chords).toEqual(["Mod+Shift+S", "Mod+Shift+D"]);
    // The other platform's keys stay the defaults.
    expect(r.bindings("macos").find((b) => b.id === "focus.toggle")!.chords).toEqual(["Mod+Shift+D"]);
    const conflicts = keyConflicts(r.bindings(), "windows", r.userBound());
    expect(conflicts).toEqual([{ chord: "Mod+Shift+S", ids: ["focus.toggle", "sync.now"] }]);
  });
  it("compares chords as the matcher does", () => {
    expect(canonicalChord("Mod+Shift+s", "windows")).toBe(canonicalChord("Shift+Ctrl+S", "windows"));
    expect(canonicalChord("Mod+S", "macos")).toBe("Meta+s");
  });
  it("the app's own defaults have no conflicts", () => {
    const bridge: PlatformBridge = {
      platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n.md",
      defaultNotePath: async () => "/n.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {}, systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    };
    for (const platform of ["windows", "macos", "linux"] as const) {
      const app = createApp({ ...bridge, platform }, messages);
      expect(keyConflicts(app.commands.bindings(), platform)).toEqual([]);
    }
  });
});

describe("PRF-14: custom keys add no work while nothing changes (candidate X)", () => {
  const bridgeWith = (load: () => Promise<string | undefined>, onChange: (l: () => void) => void): PlatformBridge => ({
    platform: "windows", readNote: async () => "# A\n", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n.md",
    defaultNotePath: async () => "/n.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {}, systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    keybindings: { load, onChange: (l) => { onChange(l); return () => {}; }, edit: async () => {}, reset: async () => {} },
  });
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

  it("a change signal with the same file touches nothing in the store; without a file the keymap's version never moves", async () => {
    let text: string | undefined;
    let changed: (() => void) | undefined;
    const app = createApp(bridgeWith(async () => text, (l) => { changed = l; }), messages);
    await app.start();
    await settle();
    expect(app.store.state.keybindings.version).toBe(0);
    const keymap = (app.viewModels.select("vm.app", app.store.state) as { editorKeymap: unknown }).editorKeymap;
    const before = app.store.version;
    changed!();
    await settle();
    expect(app.store.version).toBe(before);
    text = JSON.stringify([{ command: "focus.toggle", key: "Mod+J" }]);
    changed!();
    await settle();
    expect(app.store.state.keybindings.version).toBe(1);
    const after = app.store.version;
    changed!();
    await settle();
    expect(app.store.version).toBe(after);
    // A file whose keys are the same (only spacing changed) keeps the keymap's version.
    text = JSON.stringify([{ command: "focus.toggle", key: "Mod+J" }], null, 2);
    changed!();
    await settle();
    expect(app.store.state.keybindings.version).toBe(1);
    expect((app.viewModels.select("vm.app", app.store.state) as { editorKeymap: unknown }).editorKeymap).not.toBe(keymap);
  });

  it("matching a key asks held and enabled only of the commands whose key it is", () => {
    const r = new CommandRegistry<object>(() => ({}), () => {}, "windows");
    const asked: string[] = [];
    for (let i = 0; i < 50; i++) r.register({ id: `a.c${i}`, title: "t", shortcut: { default: `Mod+Alt+F${(i % 12) + 1}`, whenEnabled: true }, layer: "power", group: "app", enabled: () => (asked.push(`a.c${i}`), true), run: () => {} });
    r.register({ id: "focus.toggle", title: "t", shortcut: { default: "Mod+Shift+D", whenEnabled: true }, layer: "writer", group: "app", enabled: () => (asked.push("focus.toggle"), true), run: () => {} });
    r.setHold((id) => (asked.push(`hold:${id}`), undefined));
    expect(r.match(key("D", { ctrlKey: true, shiftKey: true }))).toBe("focus.toggle");
    expect(asked).toEqual(["hold:focus.toggle", "focus.toggle"]);
  });

  it("a held or disabled command passes its key on to the next command with it, in registration order and then app-wide (candidate Y)", () => {
    let state = { firstOn: false, held: "" };
    const r = new CommandRegistry<typeof state>(() => state, () => {}, "windows");
    const reg = (id: string, extra: Record<string, unknown> = {}) =>
      r.register({ id, title: "t", layer: "basic", group: "app", run: () => {}, ...extra } as Parameters<typeof r.register>[0]);
    reg("table.save", { shortcut: { default: "Mod+S", handledBy: "table", whenEnabled: true }, enabled: () => false });
    reg("first.save", { shortcut: { default: "Mod+S", whenEnabled: true }, enabled: (s: typeof state) => s.firstOn });
    reg("note.save", { shortcut: { default: "Mod+S" } });
    reg("later.save", { shortcut: { default: "Mod+S" } });
    r.setHold((id, s) => (id === s.held ? "held" : undefined));
    const save = key("s", { ctrlKey: true });
    // The disabled scoped command and the disabled first one pass it on: the next one runs.
    expect(r.match(save, ["table"])).toBe("note.save");
    expect(r.match(save)).toBe("note.save");
    state = { firstOn: true, held: "" };
    expect(r.match(save)).toBe("first.save");
    // Held (the first run, D-126): the same.
    state = { firstOn: true, held: "first.save" };
    expect(r.match(save)).toBe("note.save");
    state = { firstOn: false, held: "note.save" };
    expect(r.match(save)).toBe("later.save");
    // With custom keys, the person's own key on a held command passes it on too.
    r.setUserBindings(parseKeybindings(JSON.stringify([{ command: "later.save", key: "Mod+S" }, { command: "note.save", key: "Mod+S" }]), "windows", (id) => r.has(id)).bindings);
    state = { firstOn: false, held: "" };
    expect(r.match(save)).toBe("note.save");
    state = { firstOn: false, held: "note.save" };
    expect(r.match(save)).toBe("later.save");
  });
});
