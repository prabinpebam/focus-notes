/**
 * Find in all notes in the browser (WP-4.3, FND-04, D-90): it searches this browser's notes and the
 * instance's public notes, and its private notes only while they're unlocked; locking takes them out
 * of the results at once. A match opens at that match with the find bar on it, read-only notes too.
 */
import { test, expect, type Page } from "@playwright/test";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const PASSPHRASE = "correct horse battery staple";
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const corner = (page: Page) => page.getByRole("region", { name: "Account" });
async function axe(page: Page): Promise<string[]> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
}

test("FND-04: find in all notes searches the instance's public notes, and its private notes only while unlocked", async ({ page }) => {
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  await page.keyboard.press("Control+Shift+F");
  const sheet = page.getByRole("complementary", { name: "Find in all notes" });
  const field = sheet.getByRole("combobox", { name: "Search all notes" });
  await expect(field).toBeFocused();
  const summary = sheet.getByRole("status").first();

  // A public note of the instance.
  await page.keyboard.type("tomatoes");
  await expect(summary).toHaveText("1 match in 1 note", { timeout: 15_000 });
  await expect(sheet.getByText("Guides/Garden.md · Public · 1 match")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // A private note isn't found while the vault is locked.
  await field.fill("november");
  await expect(summary).toHaveText("No results");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await corner(page).getByRole("button", { name: "Unlock" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock private notes" });
  await dialog.getByLabel("Passphrase").fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // Unlocked, it is; and Enter opens it at the match, with the find bar on it.
  await page.keyboard.press("Control+Shift+F");
  await expect(field).toBeFocused();
  await field.fill("november");
  await expect(summary).toHaveText("1 match in 1 note", { timeout: 15_000 });
  await expect(sheet.getByText("Plans/Launch plan.md · Private · 1 match")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(editor(page).locator("h1")).toHaveText("Launch plan");
  const bar = page.getByRole("region", { name: "Find in note" });
  await expect(bar.getByRole("searchbox", { name: "Find" })).toBeFocused();
  await expect(bar.getByRole("status").first()).toHaveText("1 of 1");
  await expect(editor(page).locator(".ProseMirror-active-search-match")).toHaveText("November");
  await page.keyboard.press("Escape");

  // Locking takes it out of the results at once.
  const pill = corner(page).getByRole("button", { name: "Private notes unlocked for octo" });
  await pill.click();
  await page.getByRole("menu", { name: "Private notes unlocked for octo" }).getByRole("menuitem", { name: /Lock/ }).click();
  await expect(corner(page).getByRole("button", { name: "Unlock" })).toBeVisible();
  await page.keyboard.press("Control+Shift+F");
  await expect(field).toHaveValue("november");
  await expect(summary).toHaveText("No results", { timeout: 15_000 });
  await expect(sheet.getByRole("option")).toHaveCount(0);
});
