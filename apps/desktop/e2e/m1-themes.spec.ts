/**
 * WP-1.9 journeys: built-in themes chosen separately for light and dark (THM-02, THM-08), content
 * fonts (THM-03), the contrast and forced-colors modes and UI scale (DSY-03, A11Y-02), and every
 * theme free of axe violations, including color contrast.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const LIGHT = ["Paper", "Sepia", "Harbor", "Forest", "High contrast"];
const DARK = ["Ink", "Dusk", "Harbor", "Forest", "High contrast"];

async function pick(page: Page, submenu: string, item: string) {
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: submenu }).click();
  await page.getByRole("menu", { name: submenu }).getByRole("menuitemradio", { name: item }).click();
  await expect(page.getByRole("menu", { name: "More" })).toBeHidden();
}
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector("[data-editor-scroller]")!).backgroundColor);
const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);

test("light and dark themes are chosen separately, switch with the appearance, and are remembered", async () => {
  const dirs = tempDirs();
  let l = await launch(dirs);
  let { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitemcheckbox", { name: "Light" }).click();
  await expect.poll(() => attr(page, "data-theme")).toBe("paper");

  await pick(page, "Light theme", "Sepia");
  await expect.poll(() => attr(page, "data-theme")).toBe("sepia");
  expect(await canvas(page)).toBe("rgb(247, 240, 225)");
  // The submenu shows the choice as a checked radio item.
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Light theme" }).click();
  await expect(page.getByRole("menu", { name: "Light theme" }).getByRole("menuitemradio", { name: "Sepia" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await pick(page, "Dark theme", "Dusk");
  // Still light: the dark choice waits for dark mode.
  expect(await attr(page, "data-theme")).toBe("sepia");
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect.poll(() => attr(page, "data-theme")).toBe("dusk");
  expect(await canvas(page)).toBe("rgb(29, 24, 20)");
  // The window behind the page matches, so resizing never flashes another color.
  const bg = await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor());
  expect(bg.toLowerCase()).toBe("#1d1814");
  await quit(l);

  const state = JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8"));
  expect(state).toMatchObject({ lightTheme: "sepia", darkTheme: "dusk", appearance: "dark" });
  l = await launch(dirs);
  page = l.page;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => attr(page, "data-theme")).toBe("dusk");
  await quit(l);
});

test("every built-in theme has no axe violations, including color contrast", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# A heading\n\nBody text with a [link](https://example.com) and `code`.\n\n- [ ] a task\n\n> a quote\n");
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press("F8"); // focus mode off: dimmed rows are a deliberate contrast exception
  for (const [mode, names, submenu] of [["Light", LIGHT, "Light theme"], ["Dark", DARK, "Dark theme"]] as const) {
    await page.keyboard.press(`${mod}+.`);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menu", { name: "More" }).getByRole("menuitemcheckbox", { name: mode }).click();
    for (const name of names) {
      await pick(page, submenu, name);
      await page.waitForTimeout(50);
      expect(await axeViolations(page), `${mode} ${name}`).toEqual([]);
      await page.screenshot({ path: `../../test-results/screens/theme-${mode.toLowerCase()}-${name.toLowerCase().replace(" ", "-")}.png` });
    }
  }
  // The High contrast themes turn on the contrast mode: a heavier focus ring.
  expect(await attr(page, "data-contrast")).toBe("more");
  const focus = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-border-focus").trim());
  expect(focus).toContain("3px");
  await quit(l);
});

test("the content font changes only the note text, and the bundled font loads offline", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const family = () => editor.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await family()).toMatch(/^"Roboto Mono"/);
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Roboto Mono"'))).toBe(true);
  // Serif pairs Newsreader for the body with Fraunces for headings (D-79).
  await pick(page, "Font", "Serif (Fraunces and Newsreader)");
  await expect.poll(family).toMatch(/^Newsreader/);
  await expect.poll(() => editor.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^Fraunces/);
  await expect.poll(() => page.evaluate(async () => (await document.fonts.load("16px Newsreader")).length > 0 && (await document.fonts.load("700 32px Fraunces")).length > 0)).toBe(true);
  await pick(page, "Font", "OpenDyslexic");
  await expect.poll(family).toMatch(/^OpenDyslexic/);
  await expect.poll(() => page.evaluate(async () => (await document.fonts.load("16px OpenDyslexic")).length > 0)).toBe(true);
  // Interface text keeps its own font.
  const ui = await page.getByRole("button", { name: "Focus Notes menu" }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(ui).not.toMatch(/OpenDyslexic/);
  await quit(l);
});

test("forced colors: every color becomes a system color and the scrollbar thumb stays visible (A11Y-02)", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Long note\n\n" + Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`).join("\n\n") + "\n");
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.emulateMedia({ forcedColors: "active" });
  const canvasVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-canvas").trim());
  expect(await canvasVar()).toBe("Canvas");
  // It wins over every theme, not just the base one (review of WP-1.9).
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect.poll(() => attr(page, "data-theme")).toBe("ink");
  expect(await canvasVar()).toBe("Canvas");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-focus-ring").trim())).toBe("Highlight");
  await page.waitForTimeout(1200);
  const thumb = await page.locator("[data-editor-scroller]").evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor);
  expect(thumb).not.toBe("rgba(0, 0, 0, 0)");
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/forced-colors.png" });
  await quit(l);
});

test("200% zoom at a 640 px window reflows to 320 CSS px without sideways scrolling (A11Y-02)", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await l.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setMinimumSize(320, 320);
    w.setContentSize(640, 700);
    w.webContents.setZoomFactor(2);
  });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(320);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  // The toolbar and the cheat sheet fit too.
  await page.keyboard.press(`${mod}+.`);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  // Once the morph settles, the toolbar fits inside 320 px.
  await expect.poll(async () => { const b = (await toolbar.boundingBox())!; return b.x >= 0 && b.x + b.width <= 320; }).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+Shift+Slash`);
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  const s = (await sheet.boundingBox())!;
  expect(s.x + s.width).toBeLessThanOrEqual(320);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "../../test-results/screens/reflow-320.png" });
  await quit(l);
});

test("UI scale enlarges the interface but not the note text", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, uiScale: 1.5 }));
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
  await page.keyboard.press(`${mod}+.`);
  const btn = page.getByRole("toolbar", { name: "Toolbar" }).getByRole("button", { name: "Save" });
  await expect.poll(async () => (await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await quit(l);
});
