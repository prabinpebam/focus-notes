/**
 * WP-1.5 in the browser: a table inserted from the slash menu, edited with the keys, and its hover
 * handles, the same as on the desktop, with no Trusted Types violation (TBL-01, TBL-03, TBL-07, SEC-02).
 */
import { test, expect, type Page } from "@playwright/test";

const mod = "Control";
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });

test("TBL-01, TBL-03, TBL-07: /table, Tab between cells, and hover handles in the browser", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      if (/trusted-types/.test(e.violatedDirective)) w.__violations.push(`${e.violatedDirective} ${e.sample}`);
    });
  });
  await page.route("**/focus-notes.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("./");
  await expect(editor(page)).toContainText("Welcome to Focus Notes");
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await expect(page.getByRole("listbox", { name: "Insert a block" }).getByRole("option")).toHaveText([/^Table/]);
  await page.keyboard.press("Enter");
  const table = editor(page).locator("table");
  await expect(table.locator("tr")).toHaveCount(3);
  await page.keyboard.type("Name");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Owner");
  // An empty header shows its column's name, muted, which is never saved (D-100).
  await expect(table.locator("th")).toHaveText(["Name", "Owner", "Column 3"]);
  // Tab in the last cell adds a row.
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  await expect(table.locator("tr")).toHaveCount(4);

  const owner = (await table.locator("th").nth(1).boundingBox())!;
  await page.mouse.move(owner.x + owner.width / 2, owner.y + owner.height / 2);
  await expect(page.getByRole("button", { name: "Column 2, Owner, options" })).toBeVisible();
  await page.getByRole("button", { name: "New row" }).click();
  await expect(table.locator("tr")).toHaveCount(5);
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
});
