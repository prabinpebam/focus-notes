/**
 * THM-04, THM-13 (D-173): custom themes are JSON files in the workspace, added without code. They
 * show in the theme manager first, with their contrast badge, can be previewed and chosen for their
 * slot, show on the note through their base theme's styles and their own colors, and the choice is
 * remembered; a theme file that's gone falls back to the slot's default.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, customThemesOf, parseThemeFile, type AppStateFile, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;

const EVENING = JSON.stringify({ name: "Sepia evening", kind: "light", base: "sepia", tokens: { "color.canvas": "#f4ecd8", "color.text": "#3b2f1e", "color.accent": "#9a5b13" } });
const MIDNIGHT = JSON.stringify({ name: "Midnight", kind: "dark", base: "ink", tokens: { "color.canvas": "#0b1020", "color.text": "#e6e9f2" } });
const FADED = JSON.stringify({ name: "Faded", kind: "light", tokens: { "color.canvas": "#ffffff", "color.text": "#bbbbbb" } });

describe("reading a theme file (THM-04)", () => {
  it("keeps the color tokens its base has, with hex values; a key color leads its tokens", () => {
    const t = parseThemeFile("evening.json", EVENING)!;
    expect(t).toMatchObject({ id: "custom:sepia-evening", name: "Sepia evening", kind: "light", base: "sepia", readable: true, ignored: [] });
    expect(t.tokens["color.canvas"]).toBe("#f4ecd8");
    // The accent leads the link and the focus ring.
    expect(t.tokens["color.link"]).toBe("#9a5b13");
    expect(t.tokens["color.focusRing"]).toBe("#9a5b13");
  });
  it("can't inject CSS: unknown tokens, non-color values, url() and raw CSS are left out and listed", () => {
    const t = parseThemeFile("x.json", JSON.stringify({ name: "X", kind: "dark", tokens: {
      "color.canvas": "url(https://evil.example/x.png)", "color.text": "#fff; background: red", "font.family": "#123456",
      "color.notAToken": "#123456", "color.accent": "#3a8", "color.textMuted": 12,
    } }))!;
    expect(t.base).toBe("ink");
    expect(Object.keys(t.tokens).sort()).toEqual(["color.accent", "color.focusRing", "color.link"]);
    expect(t.tokens["color.accent"]).toBe("#33aa88");
    expect(t.ignored.sort()).toEqual(["color.canvas", "color.notAToken", "color.text", "color.textMuted", "font.family"]);
  });
  it("isn't a theme without a name and tokens, or when it isn't JSON; a base of the other kind becomes that kind's default", () => {
    expect(parseThemeFile("a.json", "{ nope")).toBeUndefined();
    expect(parseThemeFile("a.json", JSON.stringify({ tokens: {} }))).toBeUndefined();
    expect(parseThemeFile("a.json", JSON.stringify({ name: "A" }))).toBeUndefined();
    expect(parseThemeFile("a.json", JSON.stringify({ name: "A", kind: "dark", base: "paper", tokens: {} }))?.base).toBe("ink");
  });
  it("checks the contrast guard's pairs (THM-13): a failing theme is marked, not refused", () => {
    expect(parseThemeFile("faded.json", FADED)).toMatchObject({ readable: false, base: "paper" });
  });
  it("one theme per name: the first file wins", () => {
    expect(customThemesOf([{ file: "b.json", text: EVENING }, { file: "a.json", text: EVENING.replace("#f4ecd8", "#ffffff") }]).map((t) => [t.file, t.tokens["color.canvas"]]))
      .toEqual([["a.json", "#ffffff"]]);
  });
});

function setup(files: { file: string; text: string }[], state: Partial<AppStateFile> = {}) {
  let saved: AppStateFile = { version: 1, firstRun: "done", ...state };
  let lists = 0;
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/a.md", loadAppState: async () => saved, saveAppState: async (s) => { saved = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    themes: { list: async () => { lists++; return files; } },
  };
  const app = createApp(bridge, messages);
  const vmApp = () => app.viewModels.select("vm.app", app.store.state) as { theme: string; scheme: string; themeColors: { id: string; value: string }[] };
  const vm = () => app.viewModels.select("vm.themeManager", app.store.state) as { tiles: { id: string; label: string; kind: string; slot: string; badge: string; description: string }[] };
  return { app, vmApp, vm, saved: () => saved, lists: () => lists };
}

describe("custom themes in the app (THM-04, THM-13)", () => {
  it("are listed first in the gallery, as Yours, with their badge; a failing one says Low contrast", async () => {
    const s = setup([{ file: "evening.json", text: EVENING }, { file: "faded.json", text: FADED }]);
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    const tiles = s.vm().tiles;
    expect(tiles.slice(0, 2).map((t) => [t.id, t.label, t.kind])).toEqual([["custom:faded", "Faded", "light"], ["custom:sepia-evening", "Sepia evening", "light"]]);
    expect(tiles[0]!.badge).toBe("Low contrast");
    expect(tiles[1]!.description).toMatch(/^Yours, light, AA/);
    expect(tiles.length).toBe(12);
    // In two groups: Yours, then Focus Notes.
    expect(tiles.map((t) => (t as { group?: string }).group)).toEqual([...Array(2).fill("Yours"), ...Array(10).fill("Focus Notes")]);
  });
  it("previewed and chosen, it shows on the note through its base's styles and its own colors, and is remembered", async () => {
    const s = setup([{ file: "evening.json", text: EVENING }]);
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    await s.app.commands.run("theme.preview", { id: "custom:sepia-evening" });
    expect(s.vmApp()).toMatchObject({ theme: "sepia", scheme: "light" });
    expect(s.vmApp().themeColors).toContainEqual({ id: "color.canvas", value: "#f4ecd8" });
    await s.app.commands.run("theme.choose", { id: "custom:sepia-evening" });
    expect(s.app.store.state.appearance.lightTheme).toBe("custom:sepia-evening");
    expect(s.saved().lightTheme).toBe("custom:sepia-evening");
    expect(s.vm().tiles[0]!.slot).toBe("Light ✓");
  });
  it("a dark custom theme chosen while light shows switches to dark, as built-in themes do", async () => {
    const s = setup([{ file: "midnight.json", text: MIDNIGHT }]);
    await s.app.start();
    await s.app.commands.run("theme.choose", { id: "custom:midnight" });
    expect(s.app.store.state.appearance.darkTheme).toBe("custom:midnight");
    expect(s.vmApp()).toMatchObject({ theme: "ink", scheme: "dark" });
    expect(s.vmApp().themeColors).toContainEqual({ id: "color.canvas", value: "#0b1020" });
  });
  it("comes back at the next launch, and a theme whose file is gone falls back to the slot's default", async () => {
    const back = setup([{ file: "evening.json", text: EVENING }], { lightTheme: "custom:sepia-evening", appearance: "light" });
    await back.app.start();
    expect(back.app.store.state.appearance.lightTheme).toBe("custom:sepia-evening");
    expect(back.vmApp().theme).toBe("sepia");
    const gone = setup([], { lightTheme: "custom:sepia-evening", appearance: "light" });
    await gone.app.start();
    expect(gone.app.store.state.appearance.lightTheme).toBe("paper");
    expect(gone.vmApp()).toMatchObject({ theme: "paper", themeColors: [] });
  });
  it("Settings → Appearance names it", async () => {
    const s = setup([{ file: "evening.json", text: EVENING }], { lightTheme: "custom:sepia-evening" });
    await s.app.start();
    const vm = s.app.viewModels.select("vm.settings", s.app.store.state) as Record<string, unknown>;
    expect(JSON.stringify(vm)).toContain("Sepia evening");
  });
  it("aren't read at launch unless a slot holds one: nothing about them runs at start (PRF-14)", async () => {
    const files = [{ file: "evening.json", text: EVENING }];
    const plain = setup(files);
    await plain.app.start();
    expect(plain.lists()).toBe(0);
    expect(plain.app.store.state.appearance.customThemes ?? []).toEqual([]);
    // The theme manager reads them as it opens.
    await plain.app.commands.run("theme.manager.open");
    await new Promise((r) => setTimeout(r, 0));
    expect(plain.lists()).toBe(1);
    expect(plain.app.store.state.appearance.customThemes?.map((t) => t.id)).toEqual(["custom:sepia-evening"]);
    // Opening it again with the files unchanged changes nothing: the root isn't styled again.
    const appearance = plain.app.store.state.appearance;
    await plain.app.commands.run("theme.manager.close");
    await plain.app.commands.run("theme.manager.open");
    await new Promise((r) => setTimeout(r, 0));
    expect(plain.app.store.state.appearance).toBe(appearance);
    // A slot holding one reads them at launch, to put it back.
    const chosen = setup(files, { lightTheme: "custom:sepia-evening", appearance: "light" });
    await chosen.app.start();
    expect(chosen.lists()).toBe(1);
    expect(chosen.app.store.state.appearance.customThemes?.map((t) => t.id)).toEqual(["custom:sepia-evening"]);
  });
});

describe("saving edited colors as a theme (THM-04, THM-13)", () => {
  function saving(files: { file: string; text: string }[] = []) {
    const written: { name: string; text: string }[] = [];
    let saved: AppStateFile = { version: 1, firstRun: "done", appearance: "light" };
    const bridge: PlatformBridge = {
      platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
      defaultNotePath: async () => "/n/a.md", loadAppState: async () => saved, saveAppState: async (s) => { saved = s; },
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      themes: { list: async () => files, save: async (name, text) => { written.push({ name, text }); return name; } },
    };
    const app = createApp(bridge, messages);
    const colors = () => app.viewModels.select("vm.themeManager", app.store.state) as { colors: { canSave: boolean; saveLabel: string; warning: string } };
    return { app, written, colors, saved: () => saved };
  }
  it("offers saving once a color is edited; saves the copy as a file, adds it to Yours, and chooses it", async () => {
    const s = saving();
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    expect(s.colors().colors.canSave).toBe(false);
    await s.app.commands.run("theme.color.set", { key: "accent", value: "#7a3e9d" });
    expect(s.colors().colors).toMatchObject({ canSave: true, saveLabel: "Save as a theme", warning: "" });
    await s.app.commands.run("theme.saveDraft");
    expect(s.written).toHaveLength(1);
    expect(s.written[0]!.name).toBe("paper-custom.json");
    expect(JSON.parse(s.written[0]!.text)).toMatchObject({ name: "Paper (custom)", kind: "light", base: "paper", tokens: { "color.accent": "#7a3e9d", "color.link": "#7a3e9d" } });
    expect(s.app.store.state.appearance.lightTheme).toBe("custom:paper-custom");
    expect(s.app.store.state.ui.theme.draft).toBeUndefined();
    expect(s.saved().lightTheme).toBe("custom:paper-custom");
    expect(s.app.store.state.announcement.text).toBe("Saved as Paper (custom)");
  });
  it("asks before saving a theme that fails the guard, then saves it anyway (UNSUP-THEME-02)", async () => {
    const s = saving();
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    await s.app.commands.run("theme.color.set", { key: "text", value: "#eeeeee" });
    await s.app.commands.run("theme.saveDraft");
    expect(s.written).toHaveLength(0);
    expect(s.colors().colors.warning).toMatch(/hard-to-read pairs?\. Save anyway\?$/);
    expect(s.colors().colors.saveLabel).toBe("Save anyway");
    await s.app.commands.run("theme.saveDraft");
    expect(s.written).toHaveLength(1);
    expect((s.app.store.state.appearance.customThemes ?? [])[0]).toMatchObject({ readable: false });
  });
  it("names a second copy so it doesn't replace the first", async () => {
    const s = saving([{ file: "paper-custom.json", text: JSON.stringify({ name: "Paper (custom)", kind: "light", base: "paper", tokens: { "color.accent": "#123456" } }) }]);
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    await s.app.commands.run("theme.choose", { id: "paper" });
    await s.app.commands.run("theme.color.set", { key: "accent", value: "#7a3e9d" });
    await s.app.commands.run("theme.saveDraft");
    expect(s.written[0]).toMatchObject({ name: "paper-custom-2.json" });
    expect(JSON.parse(s.written[0]!.text).name).toBe("Paper (custom) 2");
  });
});

describe("reading theme files again, and syncing the slots (THM-04, THM-05)", () => {
  it("opening the theme manager reads the theme files again: a new one shows, a changed one shows its new colors, and a chosen one that's gone falls back", async () => {
    const files = [{ file: "evening.json", text: EVENING }];
    const s = setup(files, { lightTheme: "custom:sepia-evening", appearance: "light" });
    await s.app.start();
    files.push({ file: "midnight.json", text: MIDNIGHT });
    files[0] = { file: "evening.json", text: EVENING.replace("#f4ecd8", "#f0e6d0") };
    await s.app.commands.run("theme.manager.open");
    await expect.poll(() => s.vm().tiles.map((t) => t.id).slice(0, 2)).toEqual(["custom:midnight", "custom:sepia-evening"]);
    expect(s.vmApp().themeColors).toContainEqual({ id: "color.canvas", value: "#f0e6d0" });
    files.splice(0, 1);
    await s.app.commands.run("theme.manager.close");
    await s.app.commands.run("theme.manager.open");
    await expect.poll(() => s.app.store.state.appearance.lightTheme).toBe("paper");
    expect(s.saved().lightTheme).toBe("paper");
  });
  it("a custom theme chosen on another computer comes through Sync appearance, with its file in the private repository", async () => {
    let settings = JSON.stringify({ appearance: { mode: "light", lightTheme: "custom:sepia-evening" } });
    const bridge: PlatformBridge = {
      platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
      defaultNotePath: async () => "/n/a.md", loadAppState: async () => ({ version: 1, firstRun: "done" }), saveAppState: async () => {},
      systemScheme: () => "dark", onSystemSchemeChange: () => () => {},
      settings: { load: async () => ({ available: true, text: settings }), save: async (t) => { settings = t; }, remove: async () => {} },
      themes: { list: async () => [{ file: "evening.json", text: EVENING }] },
    };
    const app = createApp(bridge, messages);
    await app.start();
    expect(app.store.state.appearance).toMatchObject({ mode: "light", lightTheme: "custom:sepia-evening" });
    await app.commands.run("theme.choose", { id: "custom:sepia-evening" });
    expect(JSON.parse(settings).appearance.lightTheme).toBe("custom:sepia-evening");
  });
});

describe("a theme's options: duplicate, show the file, delete with Undo (D-173)", () => {
  function managed() {
    const files = [{ file: "evening.json", text: EVENING }];
    const revealed: string[] = [];
    let saved: AppStateFile = { version: 1, firstRun: "done", appearance: "light", lightTheme: "custom:sepia-evening" };
    const bridge: PlatformBridge = {
      platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
      defaultNotePath: async () => "/n/a.md", loadAppState: async () => saved, saveAppState: async (s) => { saved = s; },
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      themes: {
        list: async () => [...files],
        save: async (file, text) => { files.push({ file, text }); return file; },
        remove: async (file) => { files.splice(files.findIndex((f) => f.file === file), 1); },
        reveal: async (file) => { revealed.push(file); },
      },
    };
    const app = createApp(bridge, messages);
    const vm = () => app.viewModels.select("vm.themeManager", app.store.state) as { themeMenuLabel: string; themeMenu: { items: { id: string; label: string }[] }[] };
    return { app, files, revealed, vm, saved: () => saved };
  }
  it("offers Duplicate for any theme; Show file and Delete for one of yours", async () => {
    const s = managed();
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    expect(s.vm().themeMenuLabel).toBe("Options for Sepia evening");
    expect(s.vm().themeMenu.flatMap((g) => g.items.map((i) => i.id))).toEqual(["theme.duplicate", "theme.reveal", "theme.delete"]);
    await s.app.commands.run("theme.choose", { id: "paper" });
    expect(s.vm().themeMenu.flatMap((g) => g.items.map((i) => i.id))).toEqual(["theme.duplicate"]);
  });
  it("Duplicate saves a copy and chooses it; Show file shows its file", async () => {
    const s = managed();
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    await s.app.commands.run("theme.reveal");
    expect(s.revealed).toEqual(["evening.json"]);
    await s.app.commands.run("theme.duplicate");
    expect(s.files.map((f) => f.file)).toEqual(["evening.json", "sepia-evening-2.json"]);
    expect(s.app.store.state.appearance.lightTheme).toBe("custom:sepia-evening-2");
  });
  it("Delete removes the file, the slot goes back to its default, and Undo puts both back", async () => {
    const s = managed();
    await s.app.start();
    await s.app.commands.run("theme.manager.open");
    await s.app.commands.run("theme.delete");
    expect(s.files).toEqual([]);
    expect(s.app.store.state.appearance.lightTheme).toBe("paper");
    const t = s.app.store.state.ui.toasts.at(-1)!;
    expect(t.message).toBe("Deleted Sepia evening");
    expect(t.action).toMatchObject({ command: "theme.restore", label: "Undo" });
    await s.app.commands.run("toast.action", { id: t.id });
    expect(s.files.map((f) => f.file)).toEqual(["evening.json"]);
    expect(s.app.store.state.appearance.lightTheme).toBe("custom:sepia-evening");
  });
});
