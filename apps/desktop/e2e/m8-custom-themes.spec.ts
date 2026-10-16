/**
 * WP-8.2 journeys (D-173): a custom theme is a JSON file in the workspace, added without code
 * (THM-04). It shows first in the theme manager, under its own name, sampled in its own colors and
 * with its contrast badge (THM-13); keyboard focus previews it on the real note, Enter chooses it,
 * and it's back at the next launch. No axe violations.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const sheet = (page: Page) => page.getByRole("complementary", { name: "Theme" });
const gallery = (page: Page) => sheet(page).getByRole("listbox", { name: "Themes" });
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector("[data-editor-scroller]")!).backgroundColor);
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

async function openThemeManager(page: Page) {
  await settled(page);
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  const focused = page.getByRole("menu").locator('[role^="menuitem"]:focus');
  for (let i = 0; i < 40; i++) {
    await expect(focused).toHaveCount(1);
    if (((await focused.textContent()) ?? "").trim().startsWith("Theme…")) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await expect(sheet(page)).toBeVisible();
}

test("THM-04, THM-13: a theme file in the workspace is offered first, previewed and chosen from the keyboard, and remembered", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  writeFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "# Morning pages\n\nWritten in my own colors.\n");
  const themes = join(dirs.docs, "private", ".focus-notes", "themes");
  mkdirSync(themes, { recursive: true });
  writeFileSync(join(themes, "evening.json"), JSON.stringify({ name: "Sepia evening", kind: "light", base: "sepia", tokens: { "color.canvas": "#f4ecd8", "color.text": "#3b2f1e", "color.accent": "#9a5b13" } }));
  writeFileSync(join(themes, "faded.json"), JSON.stringify({ name: "Faded", kind: "light", tokens: { "color.canvas": "#ffffff", "color.text": "#bbbbbb" } }));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", focusMode: false }));
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const before = await canvas(page);
  await openThemeManager(page);
  // Yours first, by name; the low-contrast one says so.
  const options = gallery(page).getByRole("option");
  await expect(options.nth(0)).toHaveAccessibleName(/^Faded/);
  await expect(options.nth(0)).toContainText("Low contrast");
  await expect(options.nth(1)).toHaveAccessibleName(/^Sepia evening/);
  await expect(options.nth(1)).toHaveAccessibleDescription(/^Yours, light, AA/);
  // Its sample is drawn in its own colors.
  const sample = await options.nth(1).evaluate((el) => getComputedStyle(el.querySelector("span")!).backgroundColor);
  expect(sample).toBe("rgb(244, 236, 216)");
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  // Keyboard focus previews it on the real note; Enter chooses it.
  await gallery(page).locator('[tabindex="0"]').focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(options.nth(1)).toBeFocused();
  await expect.poll(() => canvas(page)).toBe("rgb(244, 236, 216)");
  await page.keyboard.press("Enter");
  await expect(options.nth(1)).toHaveAccessibleName(/Light ✓/);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  expect(await canvas(page)).not.toBe(before);
  expect(JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8")).lightTheme).toBe("custom:sepia-evening");
  await quit(l);

  // The next launch shows it again.
  const again = await launch(dirs);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => canvas(again.page)).toBe("rgb(244, 236, 216)");
  await quit(again);
});

test("THM-04, THM-13: edited colors are saved as a theme file, listed in the gallery, and chosen; a hard-to-read one is asked about first", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  writeFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "# Morning pages\n\nWritten in my own colors.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", focusMode: false }));
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await openThemeManager(page);
  await sheet(page).getByRole("tab", { name: "Edit colors" }).click();
  // A readable edit: saved at once, and the tab has no axe violations with the button showing.
  const accent = sheet(page).getByRole("textbox", { name: "Accent", exact: true });
  await accent.fill("#7a3e9d");
  await accent.press("Enter");
  const save = sheet(page).getByRole("button", { name: "Save as a theme" });
  await expect(save).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await save.click();
  const themes = join(dirs.docs, "private", ".focus-notes", "themes");
  await expect.poll(() => existsSync(join(themes, "paper-custom.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(themes, "paper-custom.json"), "utf8"))).toMatchObject({ name: "Paper (custom)", kind: "light", base: "paper", tokens: { "color.accent": "#7a3e9d" } });
  // A hard-to-read edit of it: asked first, then saved anyway as a numbered copy.
  const text = sheet(page).getByRole("textbox", { name: "Text", exact: true });
  await text.fill("#eeeeee");
  await text.press("Enter");
  await save.click();
  const warning = sheet(page).getByText(/hard-to-read pairs?\. Save anyway\?/);
  await expect(warning).toBeVisible();
  await settled(page);
  // The colors chosen are hard to read on purpose here, which the warning is about: every other rule still holds.
  expect((await axeViolations(page)).filter((v) => !v.startsWith("color-contrast:"))).toEqual([]);
  await sheet(page).getByRole("button", { name: "Save anyway" }).click();
  await expect.poll(() => existsSync(join(themes, "paper-custom-2.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(themes, "paper-custom-2.json"), "utf8"))).toMatchObject({ name: "Paper (custom) 2", base: "paper", tokens: { "color.text": "#eeeeee", "color.accent": "#7a3e9d" } });
  await sheet(page).getByRole("tab", { name: "Themes" }).click();
  const options = gallery(page).getByRole("option");
  await expect(options.nth(0)).toHaveAccessibleName(/^Paper \(custom\)/);
  await expect(options.nth(1)).toHaveAccessibleName(/^Paper \(custom\) 2.*Light ✓/);
  await expect(options.nth(1)).toContainText("Low contrast");
  await quit(l);
});

test("D-173: the gallery's Yours group, a theme added while the app runs, and a theme's options: duplicate, delete, and Undo", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  writeFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "# Morning pages\n\nWritten in my own colors.\n");
  const themes = join(dirs.docs, "private", ".focus-notes", "themes");
  mkdirSync(themes, { recursive: true });
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", focusMode: false }));
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  // Added while the app runs: it shows when the theme manager opens.
  writeFileSync(join(themes, "evening.json"), JSON.stringify({ name: "Sepia evening", kind: "light", base: "sepia", tokens: { "color.canvas": "#f4ecd8" } }));
  await openThemeManager(page);
  const yours = gallery(page).getByRole("group", { name: "Yours" });
  await expect(yours.getByRole("option")).toHaveCount(1);
  await expect(gallery(page).getByRole("group", { name: "Focus Notes" }).getByRole("option")).toHaveCount(10);
  await yours.getByRole("option").first().click();
  // The theme's options: Duplicate, then Delete with Undo.
  const options = sheet(page).getByRole("button", { name: "Options for Sepia evening" });
  await options.click();
  await expect(page.getByRole("menuitem", { name: "Show file" })).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect.poll(() => existsSync(join(themes, "sepia-evening-2.json"))).toBe(true);
  await expect(yours.getByRole("option")).toHaveCount(2);
  await sheet(page).getByRole("button", { name: "Options for Sepia evening 2" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect.poll(() => existsSync(join(themes, "sepia-evening-2.json"))).toBe(false);
  await expect(yours.getByRole("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => existsSync(join(themes, "sepia-evening-2.json"))).toBe(true);
  await expect(yours.getByRole("option")).toHaveCount(2);
  await quit(l);
});
