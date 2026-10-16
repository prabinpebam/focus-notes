/**
 * The product site's screenshots (D-169, D-174, WP-10.4 brought forward): a curated demo workspace,
 * each scene the landing page shows, captured from the app's own window (webContents.capturePage,
 * never the screen, D-141) as lossless PNG with its shadow's alpha, into test-results/site-capture/.
 * tools/site/scenes.py then sets each on the wallpaper as a 2560 × 1440 desktop scene (D-176).
 *
 * Opt in with `FOCUS_NOTES_CAPTURE_SITE=1` (and `FOCUS_NOTES_E2E=1`). `FOCUS_NOTES_SITE_OUT` names the
 * folder. The window is 1440 × 900 unless `FOCUS_NOTES_SITE_WINDOW_W`/`_H` say otherwise; the Review captures workflow
 * can regenerate it on CI (`gh workflow run review-captures.yml -f catalog=site`).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { scheme, spotlight, files, reset, mod } from "./surfaces.ts";
import { settled } from "./visual-quality.ts";
import { repoRoot } from "./github-world.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_SITE !== "1", "Opt in with FOCUS_NOTES_CAPTURE_SITE=1");

/** The window's size (D-176), and where the lossless captures go; tools/site/scenes.py makes the site's images from them. */
const WINDOW = { width: Number(process.env.FOCUS_NOTES_SITE_WINDOW_W ?? 1440), height: Number(process.env.FOCUS_NOTES_SITE_WINDOW_H ?? 900) };
const PNG_OUT = process.env.FOCUS_NOTES_SITE_OUT ?? join(repoRoot, "test-results", "site-capture");

/** The demo workspace: real writing, nobody's own notes, nothing private. */
export const DEMO_NOTES: Record<string, string> = {
  "On writing slowly.md": [
    "# On writing slowly",
    "",
    "Most of what I write well, I write slowly. Not because the words are hard to find, but because the room around them is loud.",
    "",
    "## The page in front of you",
    "",
    "A good first draft asks for one thing: the next sentence. Everything else can wait. The outline, the title, the doubts about the second paragraph all belong to tomorrow.",
    "",
    "So I keep the screen quiet. One note, one line at a time, and the rest of the page fades back until I'm ready to read it again.",
    "",
    "> Write as if no one will read it, then read it as if someone will.",
    "",
    "## What helps",
    "",
    "- A fixed time, the same each morning",
    "- No tabs, no inbox, no notifications",
    "- Stopping mid-sentence, so tomorrow starts easily",
    "",
    "## Revising",
    "",
    "Revision is where the slowness pays off. When the draft has had a night to settle, the weak sentences stand out on their own, and cutting them feels less like loss and more like tidying a desk.",
    "",
  ].join("\n"),
  "Reading list.md": "# Reading list\n\n- [x] Bird by Bird\n- [ ] The Elements of Style\n- [ ] Draft No. 4\n",
  "Garden/Spring planting.md": "# Spring planting\n\nTomatoes go in after the last frost. Basil beside them.\n\n| Bed | Plant | When |\n| --- | --- | --- |\n| North | Peas | March |\n| South | Tomatoes | May |\n",
  "Garden/Compost notes.md": "# Compost notes\n\nGreens and browns, roughly one to two.\n",
  "Journal/Tuesday.md": "# Tuesday\n\nA long walk by the river before work. The first cold morning.\n",
  "Journal/Friday.md": "# Friday\n\nFinished the essay draft. Read it aloud once; cut the second paragraph.\n",
  "Projects/Kitchen shelves.md": "# Kitchen shelves\n\nOak, oiled, three shelves above the counter.\n",
  "Recipes/Lentil soup.md": "# Lentil soup\n\nOnion, carrot, cumin, red lentils, lemon at the end.\n",
};

async function start(theme: "light" | "dark"): Promise<Launched> {
  const dirs = tempDirs();
  for (const [path, text] of Object.entries(DEMO_NOTES)) {
    const file = join(dirs.docs, ...path.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
  // A large window, as on a 2560 × 1440 desktop (D-176), opened inactive like every journey window.
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: WINDOW.width, height: WINDOW.height } }));
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await scheme(l.page, theme);
  await openNote(l.page, "On writing slowly");
  return l;
}

/** Opens a note by title through quick open. */
async function openNote(page: Page, title: string) {
  await page.keyboard.press(`${mod}+p`);
  const dialog = page.getByRole("dialog", { name: "Spotlight" });
  await dialog.getByRole("combobox").fill(title);
  await dialog.getByRole("option", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText(title);
  await expect(dialog).toBeHidden();
}

/**
 * The app's own window as lossless PNG with its alpha: the drawn corners and shadow in their
 * transparent margin (D-141: never the screen). tools/site/scenes.py sets it on the wallpaper.
 * The scrollbars are at rest first: the pointer away, and no scroller marked as scrolling or hovered,
 * so the design system's minimal scrollbar is hidden as it is whenever nobody scrolls (D-73, D-176).
 */
async function capture(l: Launched, name: string) {
  await l.page.mouse.move(1, 1);
  await expect.poll(() => l.page.evaluate(() => document.querySelectorAll("[data-scrolling], [data-scrollbar-hover]").length), { timeout: 10_000 }).toBe(0);
  await settled(l.page);
  await l.page.waitForTimeout(500);
  const png = await l.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    return (await w.webContents.capturePage()).toPNG().toString("base64");
  });
  mkdirSync(PNG_OUT, { recursive: true });
  writeFileSync(join(PNG_OUT, `${name}.png`), Buffer.from(png, "base64"));
}

async function openThemes(page: Page) {
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Theme…/ }).click();
  await expect(page.getByRole("complementary", { name: "Theme" })).toBeVisible();
}

const focusMode = (page: Page) => page.evaluate(() => document.documentElement.dataset.focus !== undefined);

// Light mode in every scene; the Themes scene also in dark, behind the page's Light / Dark choice (D-176).
for (const theme of ["light", "dark"] as const) {
  test(`D-176: the landing page's scenes, ${theme}`, async () => {
    test.setTimeout(180_000);
    const l = await start(theme);
    const { page } = l;
    // The whole note at full contrast: focus mode off, the caret at its start (the hero never uses focus mode).
    if (await focusMode(page)) await page.keyboard.press("F8");
    await expect.poll(() => focusMode(page)).toBe(false);
    await page.keyboard.press(`${mod}+Home`);
    if (theme === "light") {
      await capture(l, `note-${theme}`);
      await spotlight(page, `${mod}+Slash`);
      await page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox").fill("gar");
      await page.waitForTimeout(600);
      await capture(l, `spotlight-${theme}`);
      await reset(page);
      await files(page);
      await capture(l, `files-${theme}`);
      await reset(page);
    }
    await openThemes(page);
    await capture(l, `themes-${theme}`);
    await quit(l);
  });
}

/** Every built-in theme (packages/tokens/src/themes), light and dark, for the landing page's theme swatches (D-176). */
export const SITE_THEMES = {
  light: ["paper", "sepia", "harbor-light", "forest-light", "contrast-light"],
  dark: ["ink", "dusk", "harbor-dark", "forest-dark", "contrast-dark"],
} as const;

test("D-176: the same note in every built-in theme, light and dark", async () => {
  test.setTimeout(300_000);
  for (const mode of ["light", "dark"] as const) {
    const l = await start(mode);
    const { page } = l;
    if (await focusMode(page)) await page.keyboard.press("F8");
    await expect.poll(() => focusMode(page)).toBe(false);
    // The theme gallery lists the light themes, then the dark ones, in SITE_THEMES' order.
    for (const [i, id] of SITE_THEMES[mode].entries()) {
      await openThemes(page);
      const tiles = page.getByRole("complementary", { name: "Theme" }).getByRole("option");
      await expect(tiles).toHaveCount(SITE_THEMES.light.length + SITE_THEMES.dark.length);
      await tiles.nth(mode === "light" ? i : SITE_THEMES.light.length + i).click();
      await reset(page);
      await page.keyboard.press(`${mod}+Home`);
      await capture(l, `theme-${id}`);
    }
    await quit(l);
  }
});
