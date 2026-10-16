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
  const text = sheet(page).getByRole("textbox", { name: "Text", exact: true });
  await text.fill("#eeeeee");
  await text.press("Enter");
  const save = sheet(page).getByRole("button", { name: "Save as a theme" });
  await save.click();
  // Hard to read: asked first, then saved anyway.
  await expect(sheet(page).getByText(/hard-to-read pairs?\. Save anyway\?/)).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await sheet(page).getByRole("button", { name: "Save anyway" }).click();
  const file = join(dirs.docs, "private", ".focus-notes", "themes", "paper-custom.json");
  await expect.poll(() => existsSync(file)).toBe(true);
  expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ name: "Paper (custom)", kind: "light", base: "paper", tokens: { "color.text": "#eeeeee" } });
  await sheet(page).getByRole("tab", { name: "Themes" }).click();
  await expect(gallery(page).getByRole("option").first()).toHaveAccessibleName(/^Paper \(custom\).*Light ✓/);
  await expect(gallery(page).getByRole("option").first()).toContainText("Low contrast");
  await quit(l);
});
