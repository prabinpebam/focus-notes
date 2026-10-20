/**
 * D-204, EDT-14: one model for the right-click menu in text on every platform, so the app's drawn menu
 * (Windows, Linux) and the system's (macOS) stay in parity; the page checks what the shell sends and
 * shows it in the app's words with the platform's keys; Undo and Redo run the editor's own history.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type PlatformBridge } from "../src/index.ts";
import { parseTextMenu, textMenuChoice, textMenuEntries, textMenuItemId, type TextMenuEntry, type TextMenuParams, type TextMenuPlatform } from "../src/text-menu.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const flags = { canCut: true, canCopy: true, canPaste: true, canDelete: false, canSelectAll: true };
const params = (p: Partial<TextMenuParams> = {}): TextMenuParams => ({ isEditable: true, misspelledWord: "", dictionarySuggestions: [], selectionText: "", menuSourceType: "mouse", linkURL: "", editFlags: flags, ...p });
const ids = (entries: TextMenuEntry[]) => entries.map((e, i) => textMenuItemId(entries, i) ?? "-").join(" ");

describe("textMenuEntries, per platform", () => {
  const word = params({ misspelledWord: "teh", dictionarySuggestions: ["the", "tech"], linkURL: "https://example.com/" });
  it.each<[TextMenuPlatform, string]>([
    ["windows", "s0 s1 - learn - undo redo - cut copy paste pasteAsPlainText delete - selectAll - copyLink openLink - emoji"],
    ["linux", "s0 s1 - learn - undo redo - cut copy paste pasteAsPlainText delete - selectAll - copyLink openLink"],
    ["macos", "s0 s1 - learn - lookUp - undo redo - cut copy paste pasteAsPlainText delete - selectAll - copyLink openLink - speech - emoji"],
  ])("%s: spelling, the edit actions, links, and the platform's own items, in order", (platform, want) => {
    expect(ids(textMenuEntries(word, { platform }))).toBe(want);
  });

  it("disables what the page can't do, and Paste as plain text with Paste", () => {
    const e = textMenuEntries(params({ editFlags: { ...flags, canPaste: false } }), { platform: "windows" });
    expect(e.filter((x) => x.kind === "edit").map((x) => `${x.role}:${x.enabled}`)).toEqual(["undo:true", "redo:true", "cut:true", "copy:true", "paste:false", "pasteAsPlainText:false", "delete:false", "selectAll:true"]);
  });

  it("says No suggestions, or that the spell checker is still checking, above the edit actions", () => {
    expect(ids(textMenuEntries(params({ misspelledWord: "zxqv" }), { platform: "windows" })).startsWith("noSuggestions - learn - undo")).toBe(true);
    expect(ids(textMenuEntries(params(), { platform: "windows", checking: true })).startsWith("checking - undo")).toBe(true);
  });

  it("keeps at most six suggestions", () => {
    const e = textMenuEntries(params({ misspelledWord: "x", dictionarySuggestions: ["a", "b", "c", "d", "e", "f", "g", "h"] }), { platform: "windows" });
    expect(e.filter((x) => x.kind === "suggestion")).toHaveLength(6);
  });

  it("offers only Copy for read-only text with a selection, Copy link alone for a link that isn't a web link, and nothing otherwise", () => {
    expect(ids(textMenuEntries(params({ isEditable: false, selectionText: "words" }), { platform: "windows" }))).toBe("copy");
    expect(ids(textMenuEntries(params({ isEditable: false, linkURL: "file:///c:/x" }), { platform: "windows" }))).toBe("copyLink");
    expect(textMenuEntries(params({ isEditable: false }), { platform: "windows" })).toEqual([]);
    expect(textMenuEntries(params({ menuSourceType: "keyboard" }), { platform: "macos" })).toEqual([]);
  });
});

describe("parseTextMenu and textMenuChoice", () => {
  const model = { id: 3, x: 1.4, y: 2, entries: [{ kind: "suggestion", word: "the" }, { kind: "separator" }, { kind: "edit", role: "cut", enabled: false }, { kind: "edit", role: "undo", enabled: true }, { kind: "emoji" }] };
  it("accepts a well-formed menu and drops a malformed one whole", () => {
    expect(parseTextMenu(model)).toEqual({ ...model, x: 1 });
    for (const bad of [
      null, "menu", { ...model, id: "3" }, { ...model, x: Infinity }, { ...model, entries: "x" },
      { ...model, entries: [{ kind: "edit", role: "inspect", enabled: true }] },
      { ...model, entries: [{ kind: "edit", role: "cut" }] },
      { ...model, entries: [{ kind: "suggestion", word: "a\u0007b" }] },
      { ...model, entries: [{ kind: "suggestion", word: "w".repeat(101) }] },
      { ...model, entries: [{ kind: "lookUp", word: "the" }] },
      { ...model, entries: Array.from({ length: 7 }, () => ({ kind: "suggestion", word: "w" })) },
      { ...model, entries: Array.from({ length: 31 }, () => ({ kind: "separator" })) },
    ]) expect(parseTextMenu(bad)).toBeUndefined();
  });
  it("acts only on an available item the menu offered", () => {
    const m = parseTextMenu(model)!;
    expect(textMenuChoice(m, 3, "s0")).toEqual({ kind: "replace", word: "the" });
    expect(textMenuChoice(m, 3, "undo")).toEqual({ kind: "edit", role: "undo" });
    expect(textMenuChoice(m, 3, "emoji")).toEqual({ kind: "emoji" });
    expect(textMenuChoice(m, 3, "cut")).toBeUndefined();
    expect(textMenuChoice(m, 3, "paste")).toBeUndefined();
    expect(textMenuChoice(m, 2, "s0")).toBeUndefined();
    expect(textMenuChoice(undefined, 3, "s0")).toBeUndefined();
  });
});

describe("the drawn menu in the page", () => {
  async function started(platform: "windows" | "linux" | "macos") {
    let open: (m: unknown) => void = () => {};
    let run: (c: unknown) => void = () => {};
    const chosen: [number, string][] = [];
    const bridge: PlatformBridge = {
      platform, readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
      defaultNotePath: async () => "/n/My notes.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      textMenu: { drawn: platform !== "macos", onOpen: (l) => ((open = l), () => {}), choose: (id, item) => chosen.push([id, item]), onRun: (l) => ((run = l), () => {}) },
    };
    const app = createApp(bridge, messages);
    await app.start();
    const actions: string[] = [];
    app.onEditorAction((id) => actions.push(id));
    const vm = () => app.viewModels.select("vm.textMenu", app.store.state) as { available: boolean; request: number; x: number; y: number; sections: { id: string; items: { id: string; label: string; keys?: string[]; keysLabel?: string; disabled?: boolean }[] }[] };
    return { app, vm, chosen, actions, open: (m: unknown) => open(m), run: (c: unknown) => run(c) };
  }
  const entries = textMenuEntries(params({ misspelledWord: "teh", dictionarySuggestions: ["the"] }), { platform: "windows" });

  it("shows the shell's menu in the app's words with the platform's keys, and Undo and Redo as the editor's history allows", async () => {
    const t = await started("windows");
    await t.app.commands.run("format.setState", { undo: true, redo: false });
    t.open({ id: 1, x: 40, y: 50, entries });
    const vm = t.vm();
    expect(vm).toMatchObject({ available: true, request: 1, x: 40, y: 50 });
    const items = vm.sections.flatMap((s) => s.items);
    expect(items.map((i) => i.label)).toEqual(["the", "Add to dictionary", "Undo", "Redo", "Cut", "Copy", "Paste", "Paste as plain text", "Delete", "Select all", "Emoji"]);
    const keys = Object.fromEntries(items.map((i) => [i.id, i.keys?.join("+")]));
    expect(keys).toMatchObject({ undo: "Ctrl+Z", redo: "Ctrl+Y", cut: "Ctrl+X", copy: "Ctrl+C", paste: "Ctrl+V", pasteAsPlainText: "Ctrl+Shift+V", delete: "Del", selectAll: "Ctrl+A", emoji: "Win+." });
    expect(items.find((i) => i.id === "redo")).toMatchObject({ disabled: true, keysLabel: "Ctrl Y" });
    expect(items.find((i) => i.id === "delete")!.disabled).toBe(true);
  });

  it("sends a choice back once, ignores an item it didn't offer, and fills in late suggestions only while open", async () => {
    const t = await started("windows");
    t.open({ id: 1, x: 0, y: 0, entries: [{ kind: "checking" }] });
    await t.app.commands.run("textMenu.choose", { id: "nope" });
    expect(t.chosen).toEqual([]);
    t.open({ id: 1, x: 0, y: 0, entries });
    expect(t.vm().request).toBe(1);
    expect(t.vm().sections[0]!.items[0]!.label).toBe("the");
    await t.app.commands.run("textMenu.choose", { id: "s0" });
    expect(t.chosen).toEqual([[1, "s0"]]);
    await t.app.commands.run("textMenu.choose", { id: "s0" });
    expect(t.chosen).toHaveLength(1);
    t.open({ id: 1, x: 0, y: 0, entries: [{ kind: "emoji" }] });
    expect(t.app.store.state.textMenu.open).toBe(false);
    t.open({ id: "bad", x: 0, y: 0, entries });
    expect(t.vm().request).toBe(1);
  });

  it("runs Undo and Redo through the editor's history, and nothing else the shell names", async () => {
    for (const platform of ["windows", "macos"] as const) {
      const t = await started(platform);
      t.run("edit.undo");
      t.run("edit.redo");
      t.run("note.delete");
      t.run(42);
      await new Promise((r) => setTimeout(r, 0));
      expect(t.actions.filter((a) => a.startsWith("edit."))).toEqual(["edit.undo", "edit.redo"]);
      expect(t.vm().available).toBe(platform !== "macos");
    }
  });
});
