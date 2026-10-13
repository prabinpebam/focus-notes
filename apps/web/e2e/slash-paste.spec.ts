/**
 * WP-1.3 in the browser: the slash menu (EDT-06) and paste (EDT-09) work the same as on the desktop,
 * and the page runs under Trusted Types without a single violation (SEC-02).
 */
import { test, expect, type Page } from "@playwright/test";

const mod = "Control";
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });

test("EDT-06, EDT-09, SEC-02: slash menu and sanitized paste in the browser, under Trusted Types", async ({ page }) => {
  // Recorded from the first script on, before the app runs.
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      if (/trusted-types/.test(e.violatedDirective)) w.__violations.push(`${e.violatedDirective} ${e.sample}`);
    });
  });
  // No instance: the browser's own notes, which are writable.
  await page.route("**/focus-notes.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("./");
  await expect(editor(page)).toContainText("Welcome to Focus Notes");
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content"));
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(csp).toContain("trusted-types default dompurify");

  await editor(page).click();
  // The welcome note ends in a list; an empty item's Enter leaves it, since a heading can't start a list item.
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/h2");
  const menu = page.getByRole("listbox", { name: "Insert a block" });
  await expect(menu.getByRole("option")).toHaveText([/^Heading 2/]);
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await page.keyboard.type("From the web");
  await expect(editor(page).locator("h2")).toHaveText("From the web");

  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", `<p>A <b>bold</b> <a href="https://example.com/x" onclick="alert(1)">link</a> and <a href="javascript:alert(2)">no link</a></p><img src="x" onerror="alert(3)"><script>alert(4)</script>`);
    dt.setData("text/plain", "A bold link and no link");
    document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(editor(page).locator("b, strong").last()).toHaveText("bold");
  await expect(editor(page).locator("a[href='https://example.com/x']")).toHaveText("link");
  await expect(editor(page).locator("a[href^='javascript'], img, script, [onclick], [onerror]")).toHaveCount(0);
  await expect(page.getByText("Images can't be added to notes yet, so they were left out.")).toBeVisible();

  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
});
