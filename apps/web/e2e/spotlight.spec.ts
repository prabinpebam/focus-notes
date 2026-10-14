/**
 * Spotlight in the browser (WP-4.2): the same keys as the desktop where browsers let pages have them
 * (Ctrl+/, Ctrl+P for quick open, which replaces the old in-app list, Ctrl+Shift+P for commands);
 * the instance's notes are read-only here, so their quick actions are limited to opening, links,
 * and Copy to my notes (D-90, SPT-03); and no axe violations.
 */
import { test, expect, type Page } from "@playwright/test";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const mod = "Control";
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const spotlight = (page: Page) => page.getByRole("dialog", { name: "Spotlight" });
const field = (page: Page) => spotlight(page).getByRole("combobox");
const active = (page: Page) => spotlight(page).locator("[role=option][aria-selected=true]");
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};

test("SPT-01, SPT-05, FIL-04 on the web: Ctrl+/ opens Spotlight, Ctrl+P is quick open, Ctrl+Shift+P lists commands", async ({ page }) => {
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  await page.keyboard.press(`${mod}+/`);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute("placeholder", "Search notes, commands, and settings");
  await expect(spotlight(page).getByRole("group", { name: "Suggestions" })).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  // The instance's public notes are found by their text once the index has read them.
  await expect(async () => {
    await field(page).fill("");
    await field(page).fill("tomatoes");
    await expect(spotlight(page).getByRole("option", { name: /Garden log/ }).first()).toContainText("tomatoes", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(spotlight(page)).toBeHidden();

  // Quick open is Spotlight's notes mode now: the old list is gone.
  await page.keyboard.press(`${mod}+p`);
  await expect(field(page)).toHaveAttribute("placeholder", "Find a note by title or path");
  await field(page).fill("guides gard");
  await expect(active(page)).toContainText("Garden log");
  await expect(active(page)).toContainText("Guides/Garden.md · Public");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toContainText("Planted the tomatoes");

  await page.keyboard.press(`${mod}+Shift+P`);
  await expect(field(page)).toHaveAttribute("placeholder", "Run a command or change a setting");
  await field(page).fill("export");
  await expect(active(page)).toContainText("Export my notes");
  // Mod+N belongs to the browser: New note shows its substitute.
  await field(page).fill("new note");
  await expect(spotlight(page).getByRole("option", { name: /^New note/ }).first()).toContainText("Ctrl+Alt+N");
  expect(await settledAxe(page)).toEqual([]);
});

test("SPT-03 on the web: an instance's read-only note has only open, link, and Copy to my notes", async ({ page }) => {
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  await page.keyboard.press(`${mod}+p`);
  await field(page).fill("reading");
  await expect(active(page)).toContainText("Reading list");
  await page.keyboard.press(`${mod}+k`);
  await expect(spotlight(page)).toContainText("Actions for “Reading list”");
  const options = spotlight(page).getByRole("option");
  await expect(options).toHaveText([
    /^Open$/, /^Open in new window/, /^Copy Markdown link/, /^Copy public link/, /^Copy to my notes/,
    /^Rename/, /^Move to…/, /^Make private/, /^Show in Files/, /^Delete/,
  ]);
  for (const name of ["Rename", "Move to…", "Make private", "Delete"]) {
    const o = spotlight(page).getByRole("option", { name: new RegExp(`^${name}`) });
    await expect(o).toHaveAttribute("aria-disabled", "true");
    await expect(o).toContainText("Read-only here");
  }
  expect(await settledAxe(page)).toEqual([]);
  // Copy to my notes makes an editable copy in this browser.
  while (!(await active(page).textContent())?.startsWith("Copy to my notes")) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Copied to your notes in this browser as “Reading”.")).toBeVisible();
  await expect(editor(page)).not.toHaveAttribute("aria-readonly", "true");
});
