/**
 * WP-4.5 journeys: the theme manager (IA-VIEW-THEME). THM-07: opened from ⋯ → Theme… with the
 * keyboard alone, the arrow keys move through the gallery and the real note previews each theme,
 * Esc goes back to the chosen one, and Enter chooses and is remembered. THM-13: a key color edited
 * until the contrast guard flags it, then the one-click fix. The reading settings change the note
 * live and are remembered; Settings → Appearance opens the manager; Revert; and no axe violations
 * on any tab, with visible focus and 24 px targets.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { focusProblem, smallTargets } from "./a11y-checks.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const NOTE = "# Morning pages\n\nA paragraph long enough to show the line spacing and the reading width as they change, written plainly.\n\nA second paragraph, to show the space between them.\n\n- a list item\n\n`code` and a [link](https://example.com).\n";
const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
const sheet = (page: Page) => page.getByRole("complementary", { name: "Theme" });
const gallery = (page: Page) => sheet(page).getByRole("listbox", { name: "Themes" });
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
/** The note's canvas color, as drawn. */
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector("[data-editor-scroller]")!).backgroundColor);
/** The focused tile's sample canvas color, as its swatch shows it. */
const tileCanvas = (page: Page) => page.evaluate(() => {
  const swatch = document.activeElement?.querySelector("span");
  return swatch ? getComputedStyle(swatch).backgroundColor : "";
});
const state = (dirs: { userData: string }) => JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8"));

async function chooseByKeyboard(page: Page, name: string) {
  const focused = page.getByRole("menu").locator('[role^="menuitem"]:focus');
  await expect(focused).toHaveCount(1);
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { id, text } = await focused.evaluate((el) => ({ id: el.id, text: (document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.firstElementChild?.firstElementChild ?? el).textContent ?? "" }));
    if (text.replace("✓", "").trim() === name) {
      await page.keyboard.press("Enter");
      return;
    }
    if (seen.has(id)) break;
    seen.add(id);
    await page.keyboard.press("ArrowDown");
    await expect(focused).not.toHaveId(id);
  }
  throw new Error(`No menu item ${name}`);
}

/** ⋯ → Theme…, with the keyboard alone. */
async function openByKeyboard(page: Page) {
  await expect(page.getByRole("menu")).toHaveCount(0);
  await settled(page);
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "More" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await chooseByKeyboard(page, "Theme…");
  await expect(sheet(page)).toBeVisible();
}

async function start(extraState: Record<string, unknown> = {}): Promise<Launched & { dirs: ReturnType<typeof tempDirs> }> {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), NOTE);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", focusMode: false, ...extraState }));
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  return { ...l, dirs };
}

test("THM-07, keyboard only: the gallery previews each theme on the note, Esc goes back, and Enter chooses and is remembered", async () => {
  const l = await start();
  const { page, dirs } = l;
  await openByKeyboard(page);
  // Focus lands on the theme showing; nothing is previewed yet.
  const paper = gallery(page).getByRole("option", { name: "Paper Light ✓", exact: true });
  await expect(paper).toBeFocused();
  await expect(paper).toHaveAccessibleDescription("light, AAA");
  await expect(paper).toHaveAttribute("aria-selected", "true");
  expect(await attr(page, "data-theme")).toBe("paper");
  expect(await focusProblem(page)).toBe("");
  await settled(page);
  await page.screenshot({ path: "../../test-results/screens/theme-manager-gallery.png" });

  // Every tile, one arrow at a time: the note shows that theme, the colors the tile shows.
  const ids = await gallery(page).getByRole("option").evaluateAll((els) => els.map((e) => e.getAttribute("data-tile")!));
  expect(ids).toEqual(["paper", "sepia", "harbor-light", "forest-light", "contrast-light", "ink", "dusk", "harbor-dark", "forest-dark", "contrast-dark"]);
  for (const id of ids.slice(1)) {
    await page.keyboard.press("ArrowRight");
    await expect(gallery(page).locator(`[data-tile="${id}"]`)).toBeFocused();
    await expect.poll(() => attr(page, "data-theme")).toBe(id);
    await expect.poll(() => canvas(page)).toBe(await tileCanvas(page));
  }
  await expect(page.locator("[aria-live]").filter({ hasText: "Previewing High contrast, dark, AAA" })).toHaveCount(1);
  // Up and down move by a row.
  const columns = await gallery(page).evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => attr(page, "data-theme")).toBe(ids[ids.length - 1 - columns]);
  // Previewing chose nothing.
  expect(state(dirs).darkTheme).toBeUndefined();

  // Esc goes back to the chosen theme, and to its tile, and keeps the sheet open; Esc again closes it.
  await page.keyboard.press("Escape");
  await expect.poll(() => attr(page, "data-theme")).toBe("paper");
  await expect(paper).toBeFocused();
  await expect(sheet(page)).toBeVisible();

  // Enter chooses: Dusk fills the dark slot, and the appearance switches to show it.
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(gallery(page).locator('[data-tile="dusk"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => attr(page, "data-theme")).toBe("dusk");
  await expect(gallery(page).getByRole("option", { name: "Dusk Dark ✓", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(sheet(page).getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(sheet(page).getByText(/^Text contrast \d+\.\d:1 · AAA$/)).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => state(dirs)).toMatchObject({ darkTheme: "dusk", appearance: "dark" });
  await quit(l);

  const again = await launch(dirs);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => attr(again.page, "data-theme")).toBe("dusk");
  await quit(again);
});

test("THM-13, keyboard only: a color edited until the contrast guard flags it, then the one-click fix", async () => {
  const l = await start();
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const textColor = () => editor.locator("p").first().evaluate((el) => getComputedStyle(el).color);
  const before = await textColor();
  await openByKeyboard(page);
  // To the tabs, then Edit colors.
  await page.keyboard.press("Shift+Tab");
  await expect(sheet(page).getByRole("tab", { name: "Themes" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(sheet(page).getByRole("tab", { name: "Edit colors" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet(page).getByText("Paper is built in. Your first change makes a copy, Paper (custom).")).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);

  const field = sheet(page).getByRole("textbox", { name: "Text", exact: true });
  for (let i = 0; i < 6 && !(await field.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(field).toBeFocused();
  await expect(field).toHaveAccessibleDescription(/^Text on .+ \d+\.\d:1$/);
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.type("#c4bfb6");
  // Nothing applies until Enter: typing never shows half a color.
  expect(await textColor()).toBe(before);
  await page.keyboard.press("Enter");
  // The note shows the copy, and the guard flags it in words.
  await expect.poll(textColor).toBe("rgb(196, 191, 182)");
  await expect(field).toHaveAccessibleDescription(/^Text on .+ \d\.\d:1, needs 4\.5$/);
  await expect(sheet(page).getByText("Editing a copy, Paper (custom). It's kept until you close the app.")).toBeVisible();
  await expect(sheet(page).getByText(/^\d+ pairs? (is|are) hard to read$/)).toBeVisible();
  await expect(sheet(page).getByText(/^Text contrast \d\.\d:1 · Low contrast$/)).toBeVisible();

  // The one-click fix: only the lightness changes, until every pair passes; focus goes back to the field.
  await page.keyboard.press("Tab");
  const fix = sheet(page).getByRole("button", { name: "Fix Text" });
  await expect(fix).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fix).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveAccessibleDescription(/^Text on .+ \d+\.\d:1$/);
  await expect(sheet(page).getByText("Every pair is easy to read")).toBeVisible();
  const fixed = await field.inputValue();
  expect(fixed).toMatch(/^#[0-9a-f]{6}$/);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fixed.slice(i, i + 2), 16));
  await expect.poll(textColor).toBe(`rgb(${r}, ${g}, ${b})`);
  // Darker than what was typed, on the light canvas, and still a warm grey (red over blue, as typed).
  expect(r! + g! + b!).toBeLessThan(196 + 191 + 182);
  expect(r!).toBeGreaterThan(b!);
  await settled(page);
  await page.screenshot({ path: "../../test-results/screens/theme-manager-fixed.png" });
  expect(await axeViolations(page)).toEqual([]);
  expect(await focusProblem(page)).toBe("");

  // A value that isn't a color says so, and changes nothing.
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.type("warm");
  await page.keyboard.press("Enter");
  await expect(field).toHaveAccessibleDescription("Enter a color like #1f1d1a.");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect.poll(textColor).toBe(`rgb(${r}, ${g}, ${b})`);

  // Revert brings back the theme exactly as it was when the sheet opened.
  await sheet(page).getByRole("button", { name: "Revert" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(textColor).toBe(before);
  await quit(l);
});

test("Reading settings change the note live, apply to every theme, and are remembered", async () => {
  const l = await start();
  const { page, dirs } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const para = editor.locator("p").first();
  const lineHeight = () => para.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
  const gap = () => editor.locator("p").nth(1).evaluate((el) => parseFloat(getComputedStyle(el).marginTop) / parseFloat(getComputedStyle(el).fontSize));
  const width = () => editor.evaluate((el) => el.getBoundingClientRect().width);
  expect(await lineHeight()).toBeCloseTo(1.5, 2);
  const wide = await width();

  await openByKeyboard(page);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowRight");
  await expect(sheet(page).getByRole("tab", { name: "Reading" })).toHaveAttribute("aria-selected", "true");
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);

  const spacing = sheet(page).getByRole("slider", { name: "Line spacing" });
  await spacing.focus();
  expect(await focusProblem(page)).toBe("");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(sheet(page).getByText("1.8", { exact: true })).toBeVisible();
  await expect.poll(lineHeight).toBeCloseTo(1.8, 2);

  const measure = sheet(page).getByRole("slider", { name: "Reading width" });
  await measure.focus();
  await page.keyboard.press("Home");
  await expect(sheet(page).getByText("50 characters")).toBeVisible();
  await expect.poll(width).toBeLessThan(wide);

  await sheet(page).getByRole("radio", { name: "Airy" }).focus();
  await page.keyboard.press("Space");
  await expect.poll(gap).toBeCloseTo(2, 2);

  const dim = sheet(page).getByRole("slider", { name: "Focus dim" });
  await dim.focus();
  await page.keyboard.press("End");
  await expect(sheet(page).getByText("60%")).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-focus-dim-opacity").trim())).toBe("0.6");

  // A theme change doesn't reset them.
  await sheet(page).getByRole("tab", { name: "Themes" }).click();
  await gallery(page).locator('[data-tile="sepia"]').click();
  await expect.poll(() => attr(page, "data-theme")).toBe("sepia");
  expect(await lineHeight()).toBeCloseTo(1.8, 2);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => state(dirs)).toMatchObject({ lineHeight: 1.8, measure: 50, paragraphSpacing: "airy", focusDim: 0.6, lightTheme: "sepia" });
  await quit(l);

  const again = await launch(dirs);
  const p2 = again.page;
  await expect(p2.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => p2.getByRole("textbox", { name: "Note" }).locator("p").first().evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(1.8, 2);
  expect(await attr(p2, "data-paragraph-spacing")).toBe("airy");
  // Reset reading settings brings back every default.
  await openByKeyboard(p2);
  await sheet(p2).getByRole("tab", { name: "Reading" }).click();
  await sheet(p2).getByRole("button", { name: "Reset reading settings" }).click();
  await expect.poll(() => attr(p2, "data-paragraph-spacing")).toBeNull();
  await expect(sheet(p2).getByText("70 characters")).toBeVisible();
  await quit(again);
});

test("Settings → Appearance opens the theme manager; the manager has no axe violations in a dark theme or in forced colors", async () => {
  const l = await start({ appearance: "dark" });
  const { page } = l;
  await page.keyboard.press(`${mod}+,`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "Appearance" }).click();
  await expect(settings.getByText("Dark · Paper / Ink · 16 px Mono (Roboto Mono)")).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await settings.getByRole("button", { name: "Open theme manager" }).click();
  await expect(settings).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await expect(gallery(page).locator('[data-tile="ink"]')).toBeFocused();
  for (const tab of ["Themes", "Reading", "Edit colors"]) {
    await sheet(page).getByRole("tab", { name: tab }).click();
    await settled(page);
    expect(await axeViolations(page), tab).toEqual([]);
  }
  await page.screenshot({ path: "../../test-results/screens/theme-manager-dark.png" });
  await page.emulateMedia({ forcedColors: "active" });
  await sheet(page).getByRole("tab", { name: "Themes" }).click();
  expect(await axeViolations(page)).toEqual([]);
  // From the tab list into the gallery with the keyboard: the tile showing takes focus, with a visible ring.
  await sheet(page).getByRole("tab", { name: "Themes" }).focus();
  await page.keyboard.press("Tab");
  await expect(gallery(page).locator('[data-tile="ink"]')).toBeFocused();
  expect(await focusProblem(page)).toBe("");
  // Only the tile showing has a border, in the system's highlight color.
  const borders = await gallery(page).getByRole("option").evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopColor));
  expect(new Set(borders.filter((_, i) => i !== 5)).size).toBe(1);
  expect(borders[5]).not.toBe(borders[0]);
  await page.screenshot({ path: "../../test-results/screens/theme-manager-forced-colors.png" });
  await quit(l);
});
