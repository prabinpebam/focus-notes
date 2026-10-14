/**
 * WP-4.5 on the web (THM-07): the theme manager is the same view in the browser. Opened from ⋯ →
 * Theme…, the arrow keys preview each theme on the note, Esc goes back, Enter chooses, and the
 * choice is still there after a reload (kept in this browser). No axe violations.
 */
import { test, expect, type Page } from "@playwright/test";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const mod = "Control";
const sheet = (page: Page) => page.getByRole("complementary", { name: "Theme" });
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

test("THM-07 on the web: the gallery previews on the note, Esc goes back, and Enter chooses and is kept", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText(/Garden log|Reading list/);
  await settled(page);
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Theme…/ }).click();
  await expect(sheet(page)).toBeVisible();
  const gallery = sheet(page).getByRole("listbox", { name: "Themes" });
  await expect(gallery.locator('[data-tile="paper"]')).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => theme(page)).toBe("sepia");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => theme(page)).toBe("harbor-light");
  await page.keyboard.press("Escape");
  await expect.poll(() => theme(page)).toBe("paper");
  await expect(gallery.locator('[data-tile="paper"]')).toBeFocused();
  await expect(sheet(page)).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect.poll(() => theme(page)).toBe("sepia");
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText(/Garden log|Reading list/);
  await expect.poll(() => theme(page)).toBe("sepia");
});
