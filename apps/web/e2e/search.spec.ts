/**
 * The search index in the browser (WP-4.1, D-90): built in its own worker from this browser's
 * notes and the instance's; the instance's private notes only while unlocked, and forgotten the
 * moment the vault locks; and searching makes no network request at all (SPT-08). Reading a note's
 * text is the only traffic indexing causes, and only to the site itself.
 */
import { test, expect, type Page } from "@playwright/test";
import { ask, keysOf, searchWorker } from "../../desktop/e2e/search.ts";

const PASSPHRASE = "correct horse battery staple";
const SITE = "127.0.0.1:4317";
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const corner = (page: Page) => page.getByRole("region", { name: "Account" });

test("SPT-08: private notes are indexed only while unlocked, forgotten on lock, and searching sends nothing anywhere", async ({ page }) => {
  const requests: { method: string; url: string }[] = [];
  page.context().on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  const worker = await searchWorker(page);
  expect(new URL(worker.url()).host).toBe(SITE);

  // The instance's public notes are indexed; its private notes aren't, while locked.
  await expect.poll(() => keysOf(worker, { text: "curious", scope: "text" }), { timeout: 15_000 }).toEqual(["public:Reading.md"]);
  expect(await keysOf(worker, { text: "launch", scope: "titles" })).toEqual([]);

  await corner(page).getByRole("button", { name: "Unlock" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock private notes" });
  await dialog.getByLabel("Passphrase").fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => keysOf(worker, { text: "november board", scope: "text" }), { timeout: 15_000 }).toEqual(["private:Plans/Launch plan.md"]);
  expect((await ask(worker, { text: "launch plan", scope: "titles" })).hits[0]).toMatchObject({ key: "private:Plans/Launch plan.md", rel: "Plans/Launch plan.md", root: "private", tier: "exact" });

  // Searching makes no request at all.
  const before = requests.length;
  for (const text of ["l", "la", "lau", "launch", "november", "reading", "garden", "novembr"]) {
    await ask(worker, { text, scope: "titles" });
    await ask(worker, { text, scope: "text" });
  }
  expect(requests.slice(before)).toEqual([]);

  // Locking forgets them. (That the app's own later queries never see them is the unit tests':
  // these questions skip the worker's queue, so they wait for the lock to arrive.)
  const pill = corner(page).getByRole("button", { name: "Private notes unlocked for octo" });
  await pill.click();
  await page.getByRole("menu", { name: "Private notes unlocked for octo" }).getByRole("menuitem", { name: /Lock/ }).click();
  await expect(corner(page).getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect.poll(() => keysOf(worker, { text: "november", scope: "text" })).toEqual([]);
  expect(await keysOf(worker, { text: "launch", scope: "titles" })).toEqual([]);
  expect(await keysOf(worker, { text: "curious", scope: "text" })).toEqual(["public:Reading.md"]);

  // Everything the page fetched was a file of the site itself: nothing was sent anywhere.
  expect(requests.filter((r) => new URL(r.url).host !== SITE || r.method !== "GET")).toEqual([]);
});
