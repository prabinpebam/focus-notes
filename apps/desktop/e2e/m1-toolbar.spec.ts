/**
 * WP-1.6 journeys: the trigger opens the toolbar (UI-03), at most six actions plus ⋯ (UI-04),
 * keyboard and screen-reader complete (UI-05), the default actions (UI-07), command-driven (DSY-12).
 */
import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("the trigger opens the toolbar: six actions, then ⋯", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Focus Notes menu" }).click();
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  const names = await toolbar.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names).toEqual(["New note", "Open…", "Search", "Save", "Focus mode", "Switch light and dark", "More"]);
  await expect(page.getByRole("button", { name: "Focus Notes menu" })).toHaveAttribute("aria-expanded", "true");
  expect(await axeViolations(page)).toEqual([]);

  // One tab stop; arrow keys move between actions; Esc closes and the caret returns to the note.
  await expect(toolbar.getByRole("button", { name: "New note" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Open…" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(toolbar.getByRole("button", { name: "More" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();
  await expect(editor).toBeFocused();
  await quit(l);
});

test("toolbar actions run their commands and show their state", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const before = await theme();

  // Theme from the toolbar: it closes the toolbar and switches.
  await page.keyboard.press(`${mod}+.`);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Switch light and dark" }).click();
  await expect(toolbar).toBeHidden();
  await expect.poll(theme).not.toBe(before);
  await expect(editor).toBeFocused();

  // Focus mode (on for new installs, D-04) toggles off, and the button shows its state.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.focus)).toBe("on");
  await page.keyboard.press(`${mod}+.`);
  await expect(toolbar.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Focus mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.focus)).toBeUndefined();
  await expect(toolbar).toBeHidden();
  await page.keyboard.press(`${mod}+.`);
  await expect(toolbar.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "false");
  // Escape reaches the toolbar only once it has taken focus; before that the keypress goes to the note.
  await expect(toolbar.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();

  // Search isn't here yet, and says why instead of doing nothing.
  await page.keyboard.press(`${mod}+.`);
  await expect(toolbar.getByRole("button", { name: "Search" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await quit(l);
});

test("⋯ holds the rest: text size steps and the theme mode, each showing its state", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const size = () => page.evaluate(() => getComputedStyle(document.querySelector("[data-editor]")!).fontSize);
  expect(await size()).toBe("16px");

  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemcheckbox", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitem", { name: /Larger text/ }).click();
  await expect.poll(size).toBe("17px");

  // The shortcuts work too, and reset returns to 16 px (THM-06, D-78).
  await page.keyboard.press(`${mod}+-`);
  await page.keyboard.press(`${mod}+-`);
  await expect.poll(size).toBe("15px");
  await page.keyboard.press(`${mod}+0`);
  await expect.poll(size).toBe("16px");
  await quit(l);
});

test("New note creates an untitled note next to the current one and puts the caret in it", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+N`);
  await expect(editor).toHaveText("");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Fresh");
  await expect.poll(() => readdirSync(dirs.docs).sort()).toEqual(["Untitled.md", "Welcome.md"]);
  await quit(l);
});
