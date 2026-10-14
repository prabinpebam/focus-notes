/**
 * The theme manager (IA-VIEW-THEME): THM-07, the gallery's keyboard preview on the real note, Esc
 * and Revert, and choosing; the reading settings, remembered and synced like the rest of
 * appearance; THM-13, editing a key color until the contrast guard flags it, then the one-click
 * fix, and the warning before saving a failing theme. Settings → Appearance opens it (DD-SET-02).
 */
import { describe, expect, it } from "vitest";
import { themeValues } from "@focus-notes/tokens";
import { CONTRAST_PAIRS, createApp, saveWarning, type AppStateFile, type PlatformBridge } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

function shell(opts: { state?: Partial<AppStateFile>; settings?: string | null } = {}) {
  let state: AppStateFile = { version: 1, firstRun: "done", lastNotePath: "/n/a.md", ...opts.state };
  let settings: string | undefined = opts.settings ?? undefined;
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# A\n\nText.\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => state,
    saveAppState: async (s) => void (state = s),
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    ...(opts.settings === undefined ? {} : {
      settings: {
        load: async () => ({ available: opts.settings !== null, ...(settings ? { text: settings } : {}) }),
        save: async (t: string) => void (settings = t),
        remove: async () => void (settings = undefined),
      },
    }),
  };
  return { bridge, state: () => state, settings: () => settings };
}

async function started(opts: Parameters<typeof shell>[0] = {}) {
  const f = shell(opts);
  const app = createApp(f.bridge, en);
  await app.start();
  const vm = (id = "vm.themeManager") => app.viewModels.select(id, app.store.state) as Record<string, any>;
  return { ...f, app, vm, run: (id: string, args?: Record<string, unknown>) => app.commands.run(id, args) };
}

describe("THM-07: the theme manager's gallery previews on the real note", () => {
  it("opens from ⋯ → Theme… on the Themes tab, with every built-in theme as a tile", async () => {
    const t = await started();
    const more = t.vm("vm.toolbar").more as { id: string; items: { id: string; label: string }[] }[];
    expect(more.find((g) => g.id === "theme")!.items[0]).toMatchObject({ id: "theme.manager.open", label: "Theme…" });
    await t.run("theme.manager.open");
    const vm = t.vm();
    expect(vm).toMatchObject({ open: true, tab: "themes", mode: "system", showing: "paper", previewing: false, status: "Text contrast 16.1:1 · AAA" });
    expect(vm.tabs.map((x: { label: string }) => x.label)).toEqual(["Themes", "Reading", "Edit colors"]);
    expect(vm.tiles).toHaveLength(10);
    expect(vm.tiles[0]).toMatchObject({ id: "paper", label: "Paper", kind: "light", slot: "Light ✓", badge: "AAA" });
    expect(vm.tiles.find((x: { id: string }) => x.id === "ink")).toMatchObject({ slot: "Dark ✓" });
    expect(vm.focusRequest).toBe(1);
  });

  it("keyboard focus previews a theme on the note without choosing it, and Esc goes back", async () => {
    const t = await started();
    await t.run("theme.manager.open");
    await t.run("theme.preview", { id: "dusk" });
    expect(t.vm("vm.app")).toMatchObject({ theme: "dusk", scheme: "dark" });
    expect(t.vm()).toMatchObject({ previewing: true, showing: "dusk" });
    expect(t.app.store.state.announcement.text).toBe("Previewing Dusk, dark, AAA");
    expect(t.app.store.state.appearance).toMatchObject({ lightTheme: "paper", darkTheme: "ink", mode: "system" });
    await t.run("theme.previewEnd");
    expect(t.vm("vm.app").theme).toBe("paper");
    // Closing while previewing goes back too.
    await t.run("theme.preview", { id: "sepia" });
    await t.run("theme.manager.close");
    expect(t.vm("vm.app").theme).toBe("paper");
    expect(t.state().lightTheme).toBeUndefined();
  });

  it("choosing fills the theme's slot, shows it, and is remembered; Revert brings back what was there", async () => {
    const t = await started();
    await t.run("theme.manager.open");
    await t.run("theme.preview", { id: "forest-dark" });
    await t.run("theme.choose", { id: "forest-dark" });
    // Showing light, so choosing a dark theme switches to dark (the same commands as the ⋯ menu).
    expect(t.app.store.state.appearance).toMatchObject({ darkTheme: "forest-dark", mode: "dark" });
    expect(t.vm("vm.app")).toMatchObject({ theme: "forest-dark", scheme: "dark" });
    expect(t.vm()).toMatchObject({ previewing: false });
    expect(t.state()).toMatchObject({ darkTheme: "forest-dark", appearance: "dark" });
    await t.run("reading.setLineHeight", { value: 1.8 });
    await t.run("theme.manager.revert");
    expect(t.app.store.state.appearance).toMatchObject({ darkTheme: "ink", mode: "system", lineHeight: 1.5 });
    expect(t.state()).toMatchObject({ darkTheme: "ink", appearance: "system", lineHeight: 1.5 });
    expect(t.vm("vm.app").theme).toBe("paper");
  });

  it("the appearance switch runs the appearance commands", async () => {
    const t = await started();
    await t.run("theme.manager.open");
    await t.run("appearance.setMode", { value: "dark" });
    expect(t.vm()).toMatchObject({ mode: "dark", showing: "ink" });
    expect(t.state().appearance).toBe("dark");
  });
});

describe("Reading settings apply to every theme and are remembered", () => {
  it("line spacing, reading width, paragraph spacing, and focus dim reach the root, on their steps", async () => {
    const t = await started();
    expect(t.vm("vm.app")).toMatchObject({ lineHeight: undefined, measure: undefined, paragraphSpacing: "comfortable", focusDim: undefined });
    await t.run("reading.setLineHeight", { value: 1.8 });
    await t.run("reading.setMeasure", { value: 60 });
    await t.run("reading.setParagraphSpacing", { value: "airy" });
    await t.run("reading.setFocusDim", { value: 0.45 });
    // Off its steps or out of range: ignored.
    await t.run("reading.setLineHeight", { value: 1.85 });
    await t.run("reading.setMeasure", { value: 140 });
    await t.run("reading.setParagraphSpacing", { value: "huge" });
    expect(t.vm("vm.app")).toMatchObject({ lineHeight: 1.8, measure: 60, paragraphSpacing: "airy", focusDim: 0.45 });
    expect(t.state()).toMatchObject({ lineHeight: 1.8, measure: 60, paragraphSpacing: "airy", focusDim: 0.45 });
    await t.run("theme.manager.open");
    await t.run("theme.manager.setTab", { value: "reading" });
    expect(t.vm().reading).toMatchObject({ lineHeightText: "1.8", measureText: "60 characters", focusDimText: "45%", sizeText: "16 px", font: "mono", spacing: "airy" });
    // Changing theme doesn't reset them.
    await t.run("theme.choose", { id: "sepia" });
    expect(t.vm("vm.app")).toMatchObject({ theme: "sepia", lineHeight: 1.8, measure: 60 });
    await t.run("reading.reset");
    expect(t.vm("vm.app")).toMatchObject({ lineHeight: undefined, measure: undefined, paragraphSpacing: "comfortable", focusDim: undefined, contentFont: "mono", fontSize: 16 });
    expect(t.state().focusDim).toBeUndefined();
    // Until it's set, focus dim shows the theme's own.
    await t.run("theme.choose", { id: "contrast-light" });
    expect(t.vm().reading.focusDimText).toBe("55%");
  });

  it("are read back at start, and invalid ones are ignored", async () => {
    const t = await started({ state: { lineHeight: 2, measure: 100, paragraphSpacing: "compact", focusDim: 0.15 } });
    expect(t.vm("vm.app")).toMatchObject({ lineHeight: 2, measure: 100, paragraphSpacing: "compact", focusDim: 0.15 });
    const bad = await started({ state: { lineHeight: 9, measure: 51, paragraphSpacing: "x" as "airy", focusDim: 1 } });
    expect(bad.vm("vm.app")).toMatchObject({ lineHeight: undefined, measure: undefined, paragraphSpacing: "comfortable", focusDim: undefined });
  });

  it("sync through the private repository while Sync appearance is on (THM-05, D-46)", async () => {
    const t = await started({ settings: JSON.stringify({ reading: { fontSize: 18 } }) });
    expect(t.app.store.state.settingsSync).toBe("on");
    await t.run("reading.setMeasure", { value: 80 });
    await t.run("reading.setFocusDim", { value: 0.5 });
    expect(JSON.parse(t.settings()!).reading).toEqual({ fontSize: 18, measure: 80, focusDim: 0.5 });
    expect(t.state().measure).toBeUndefined();
    await t.run("reading.reset");
    expect(JSON.parse(t.settings()!).reading).toEqual({ contentFont: "mono", fontSize: 16, lineHeight: 1.5, measure: 70, paragraphSpacing: "comfortable" });
  });
});

describe("THM-13: Edit colors and the contrast guard", () => {
  it("editing a key color makes a copy shown on the note; the guard flags it, and Fix makes it readable", async () => {
    const t = await started();
    await t.run("theme.manager.open");
    await t.run("theme.manager.setTab", { value: "colors" });
    let c = t.vm().colors;
    expect(c).toMatchObject({ note: "Paper is built in. Your first change makes a copy, Paper (custom).", failing: false, summary: "Every pair is easy to read" });
    expect(c.rows.map((r: { label: string }) => r.label)).toEqual(["Background", "Surface", "Text", "Muted text", "Accent"]);
    expect(c.rows[2]).toMatchObject({ id: "text", value: themeValues.paper!["color.text"], failing: false, canFix: false });
    expect(c.rows[2].status).toMatch(/^Text on .+ \d+\.\d:1$/);

    await t.run("theme.color.set", { key: "text", value: "#b5b0a8" });
    c = t.vm().colors;
    expect(c.note).toBe("Editing a copy, Paper (custom). It's kept until you close the app.");
    expect(c.rows[2]).toMatchObject({ value: "#b5b0a8", failing: true, canFix: true, fixLabel: "Fix Text" });
    expect(c.rows[2].status).toMatch(/^Text on (Background|Surface|Raised surface|Sunken surface|Hovered item) \d\.\d:1, needs 4\.5$/);
    expect(c.failing).toBe(true);
    expect(c.summary).toMatch(/^\d+ pairs are hard to read$/);
    expect(t.vm().status).toMatch(/^Text contrast \d\.\d:1 · Low contrast$/);
    // The note shows the copy: the edited color over the theme's tokens.
    expect(t.vm("vm.app").themeColors).toEqual(expect.arrayContaining([{ id: "color.text", value: "#b5b0a8" }, { id: "code.text", value: "#b5b0a8" }]));

    await t.run("theme.color.fix", { key: "text" });
    c = t.vm().colors;
    expect(c.rows[2].failing).toBe(false);
    expect(c.rows[2].value).not.toBe("#b5b0a8");
    expect(c.failing).toBe(false);
    expect(t.app.store.state.announcement.text).toBe(`Text is now ${c.rows[2].value}`);
    // Nothing is saved to disk: saving custom themes arrives with custom themes (WP-8.2).
    expect(JSON.stringify(t.state())).not.toContain(c.rows[2].value);
  });

  it("takes typed hex values, says when one isn't a color, and drops the copy when its theme leaves both slots", async () => {
    const t = await started();
    await t.run("theme.manager.open");
    await t.run("theme.color.set", { key: "accent", value: "zz12" });
    expect(t.vm().colors.rows[4]).toMatchObject({ value: "zz12", error: "Enter a color like #1f1d1a." });
    expect(t.vm("vm.app").themeColors).toEqual([]);
    await t.run("theme.color.set", { key: "accent", value: "1D4ED8" });
    expect(t.vm().colors.rows[4]).toMatchObject({ value: "#1d4ed8", error: "" });
    await t.run("theme.choose", { id: "contrast-dark" });
    expect(t.vm("vm.app").themeColors).toEqual([]);
    await t.run("theme.choose", { id: "sepia" });
    await t.run("appearance.setMode", { value: "light" });
    expect(t.app.store.state.ui.theme.draft).toBeUndefined();
  });

  it("names every color the guard checks, in words", () => {
    const tokens = new Set(CONTRAST_PAIRS.flatMap((p) => [p.fg, p.bg]));
    for (const t of tokens) expect((en as Record<string, string>)[`colors.token.${t}`], t).toBeTruthy();
  });

  it("warns before saving a theme with hard-to-read pairs (the API custom themes save through)", async () => {
    const t = await started();
    expect(saveWarning(t.app.messages, themeValues.paper!)).toBeUndefined();
    const bad = { ...themeValues.paper!, "color.text": "#d0ccc4", "color.textMuted": "#e0dcd4" };
    expect(saveWarning(t.app.messages, bad)).toMatch(/^This theme has \d+ hard-to-read pairs\. Save anyway\?$/);
    expect(saveWarning(t.app.messages, { ...themeValues.paper!, "color.danger": "#ff9a8f" })).toBe("This theme has 1 hard-to-read pair. Save anyway?");
  });
});

describe("Settings → Appearance (DD-SET-02)", () => {
  it("summarizes the look, sets the interface size, and opens the theme manager", async () => {
    const t = await started({ settings: null });
    const a = () => (t.vm("vm.settings") as { appearance: Record<string, unknown> }).appearance;
    expect(t.vm("vm.settings").sections.map((s: { id: string }) => s.id)).toEqual(["account", "workspace", "appearance"]);
    expect(a()).toMatchObject({ summary: "System · Paper / Ink · 16 px Mono (Roboto Mono)", scale: "1", canSync: false });
    expect((a().scales as { label: string }[]).map((s) => s.label)).toEqual(["90%", "100%", "110%", "125%", "150%"]);
    await t.run("ui.setScale", { value: "1.25" });
    expect(t.app.store.state.appearance.uiScale).toBe(1.25);
    expect(t.state().uiScale).toBe(1.25);
  });
});
