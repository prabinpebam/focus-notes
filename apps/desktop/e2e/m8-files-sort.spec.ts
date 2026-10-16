/**
 * WP-8.4 journeys (FIL-11, D-175): the Files tree sorted by last change from the header's sort menu,
 * folders first and a folder by its newest note, remembered at the next launch; the app's own saves
 * don't move rows. No axe violations.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const files = (page: Page) => page.getByRole("complementary", { name: "Files" });
const tree = (page: Page) => files(page).getByRole("tree", { name: "Notes and folders" });
/** The labels of the rows directly in the first root, in order. */
const topRows = (page: Page) => tree(page).locator('[role="treeitem"][aria-level="2"]').evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ""));
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

test("FIL-11: the sort menu orders the tree by last change, folders first, and it's remembered", async () => {
  const dirs = tempDirs();
  const at = (p: string, text: string, hoursAgo: number) => {
    writeFileSync(p, text);
    const t = new Date(Date.now() - hoursAgo * 3_600_000);
    utimesSync(p, t, t);
  };
  mkdirSync(join(dirs.docs, "archive"));
  mkdirSync(join(dirs.docs, "projects"));
  at(join(dirs.docs, "Welcome.md"), "# Apple\n\nThe oldest note.\n", 5);
  at(join(dirs.docs, "zebra.md"), "# Zebra\n", 1);
  at(join(dirs.docs, "mango.md"), "# Mango\n", 3);
  at(join(dirs.docs, "archive", "old.md"), "# Old\n", 48);
  at(join(dirs.docs, "projects", "plan.md"), "# Plan\n", 2);
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press(`${mod}+o`);
  await expect(tree(page)).toBeVisible();
  // By name: folders, then notes by file name (Welcome.md holds Apple).
  await expect.poll(() => topRows(page)).toEqual(["archive", "projects", "Mango", "Apple", "Zebra"]);
  // The header's sort menu, from the keyboard: Tab to it, open it, Last changed.
  const sort = files(page).getByRole("button", { name: "Sort: Name" });
  await sort.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Sort: Name" });
  await expect(menu.getByRole("menuitemcheckbox", { name: "Name" }).or(menu.getByRole("menuitem", { name: "Name" }))).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(files(page).getByRole("button", { name: "Sort: Last changed" })).toBeVisible();
  await expect.poll(() => topRows(page)).toEqual(["projects", "archive", "Zebra", "Mango", "Apple"]);
  // Typing in the oldest note saves it, and its row doesn't move under the hand.
  await page.getByRole("textbox", { name: "Note" }).focus();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Still writing.");
  await page.waitForTimeout(1200);
  expect(await topRows(page)).toEqual(["projects", "archive", "Zebra", "Mango", "Apple"]);
  await quit(l);

  // The next launch keeps the order chosen.
  const again = await launch(dirs);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await again.page.keyboard.press(`${mod}+o`);
  await expect(files(again.page).getByRole("button", { name: "Sort: Last changed" })).toBeVisible();
  // Apple was saved last time, so now it's the newest.
  await expect.poll(() => topRows(again.page)).toEqual(["projects", "archive", "Apple", "Zebra", "Mango"]);
  await quit(again);
});
