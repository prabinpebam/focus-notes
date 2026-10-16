/**
 * WP-8.1 journeys: editor pro, from the keyboard alone. Sorting a table by a column (TBL-09) and
 * aligning it (TBL-04) through the cell menu, and find in selection (FND-03), with no axe violations.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";

async function start(markdown: string) {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, markdown);
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  return { ...l, saved: () => readFileSync(note, "utf8") };
}
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const column = (page: Page, c: number) => page.getByRole("textbox", { name: "Note" }).locator("table").first()
  .evaluate((t: HTMLTableElement, k) => [...t.rows].slice(1).map((r) => r.cells[k]?.textContent ?? ""), c);

/** Moves through the open menu (or the submenu named `menu`) with the arrow keys to `name`, then Enter. */
async function chooseByKeyboard(page: Page, name: string, menu?: string) {
  const focused = (menu ? page.getByRole("menu", { name: menu }) : page.getByRole("menu")).locator('[role^="menuitem"]:focus');
  await expect(focused).toHaveCount(1);
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { id, text } = await focused.evaluate((el) => ({ id: el.id, text: el.textContent ?? "" }));
    if (text.replace("✓", "").trim() === name) {
      await page.keyboard.press("Enter");
      return;
    }
    if (seen.has(id)) break;
    seen.add(id);
    await page.keyboard.press("ArrowDown");
    await expect(focused).not.toHaveId(id);
  }
  throw new Error(`No menu item "${name}"`);
}

test("TBL-09, TBL-04 by keyboard: the cell menu sorts a column in natural order, undoably, and aligns it", async () => {
  const l = await start("| Item | Qty |\n| --- | --- |\n| pears | 10 |\n| Apples | 2 |\n| figs |  |\n| plums | -1 |\n\nAfter the table.\n");
  const { page } = l;
  // Into the table without the pointer: the first header cell, then down and across to Qty.
  await page.keyboard.press(caret.docStart);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Cell options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sort column A→Z" })).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await chooseByKeyboard(page, "Sort column A→Z");
  await expect.poll(() => column(page, 1)).toEqual(["-1", "2", "10", ""]);
  await expect.poll(() => column(page, 0)).toEqual(["plums", "Apples", "pears", "figs"]);
  // Announced politely.
  await expect(page.getByRole("status").filter({ hasText: "Column 2 sorted A to Z" })).toHaveCount(1);
  await expect.poll(l.saved).toContain("| plums  | -1  |");
  // The caret came back to the note; one undo restores the order.
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => column(page, 0)).toEqual(["pears", "Apples", "figs", "plums"]);

  // Sort the first column Z→A, then align Qty right, all from the cell menu.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+F10");
  await chooseByKeyboard(page, "Sort column Z→A");
  await expect.poll(() => column(page, 0)).toEqual(["plums", "pears", "figs", "Apples"]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+F10");
  await chooseByKeyboard(page, "Align");
  await chooseByKeyboard(page, "Right", "Align");
  await expect.poll(l.saved).toMatch(/^\| Item +\| +Qty \|\n\| -+ \| -+: \|\n\| plums/);
  await quit(l);
});

test("FND-03 by keyboard: Alt+L finds only inside the selection, steps inside it, and replace all changes only those", async () => {
  const l = await start("# Notes\n\nA note before.\n\nThe middle note, and another note.\n\nA note after.\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  // Select the middle paragraph from the keyboard: to its end, then to its start.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press(caret.lineEnd);
  await page.keyboard.press(caret.selectToLineStart);
  await page.keyboard.press(mac ? "Meta+Alt+l" : "Alt+l");
  const bar = page.getByRole("region", { name: "Find in note" });
  const field = bar.getByRole("searchbox", { name: "Find" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
  const toggle = bar.getByRole("button", { name: "Find in selection" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await field.fill("note");
  const status = bar.getByRole("status").first();
  await expect(status).toHaveText(/of 2$/);
  await expect(editor.locator(".ProseMirror-search-match, .ProseMirror-active-search-match")).toHaveCount(2);
  expect(await settledAxe(page)).toEqual([]);
  // Enter steps and wraps inside the selection.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText(/of 2$/);
  // Off: the whole note; on again: back to the selection.
  await page.keyboard.press(mac ? "Meta+Alt+l" : "Alt+l");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // The heading "Notes" counts too: plain find matches inside words.
  await expect(status).toHaveText(/of 5$/);
  await page.keyboard.press(mac ? "Meta+Alt+l" : "Alt+l");
  await expect(status).toHaveText(/of 2$/);
  // Replace all changes only the two inside, as one undo step.
  await page.keyboard.press(mac ? "Meta+Alt+f" : "Control+h");
  await bar.getByRole("searchbox", { name: "Replace" }).fill("memo");
  await page.keyboard.press(mac ? "Meta+Enter" : "Control+Alt+Enter");
  await expect.poll(l.saved).toBe("# Notes\n\nA note before.\n\nThe middle memo, and another memo.\n\nA note after.\n");
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(l.saved).toBe("# Notes\n\nA note before.\n\nThe middle note, and another note.\n\nA note after.\n");

  // With nothing selected the toggle is disabled and says why.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press(`${mod}+f`);
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await quit(l);
});
