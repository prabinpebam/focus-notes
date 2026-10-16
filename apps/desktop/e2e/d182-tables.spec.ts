/**
 * D-182 journeys (owner): tables fill the text column, and Loop-style insertion on any inner border.
 * A new table spans the column with equal columns; hovering anywhere on an inner column or row border
 * highlights it with a + at its top or left end; the + (on press) or a click on the line inserts there.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const SAMPLE = "# Plan\n\n| Task | Owner | Status |\n| --- | --- | --- |\n| Draft | Me | Doing |\n| Edit | You | Next |\n| Ship | Us | Later |\n\nAfter the table.\n";

async function start(markdown: string, env: Record<string, string> = {}, size?: { width: number; height: number }): Promise<Launched & { saved: () => string }> {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, markdown);
  if (size) writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
  const l = await launch(dirs, env);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  return { ...l, saved: () => readFileSync(note, "utf8") };
}
const editorOf = (page: Page) => page.getByRole("textbox", { name: "Note" });
const tableOf = (page: Page, n = 0) => editorOf(page).locator("table").nth(n);
const cell = (page: Page, r: number, c: number) => tableOf(page).locator("tr").nth(r).locator("th, td").nth(c);
const widths = (page: Page) => tableOf(page).evaluate((t: HTMLTableElement) => [...t.rows[0]!.cells].map((c) => c.getBoundingClientRect().width));
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

test("D-182: a new table spans the text column with equal columns", async () => {
  const l = await start("# Plan\n\nIntro.\n");
  const { page } = l;
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");
  await expect(tableOf(page).locator("th")).toHaveCount(3);
  const column = await editorOf(page).evaluate((el) => el.getBoundingClientRect().width);
  const table = (await tableOf(page).boundingBox())!;
  expect(Math.abs(table.width - column)).toBeLessThanOrEqual(1);
  const w = await widths(page);
  expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(1);
  await quit(l);
});

test("D-182: hovering an inner border offers to insert there: the line highlights, a + at its top or left end, and the + or a click on the line inserts", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  await tableOf(page).evaluate((t) => t.scrollIntoView({ block: "center" }));
  // The border between columns 1 and 2, halfway down the table (not near its top edge).
  const c1 = (await cell(page, 2, 1).boundingBox())!;
  const frame = (await tableOf(page).boundingBox())!;
  await page.mouse.move(c1.x + 3, c1.y + c1.height / 2);
  const plusColumn = page.getByRole("button", { name: "Insert column between columns 1 and 2" });
  await expect(plusColumn).toBeVisible();
  const line = page.locator("[data-table-insert-line]");
  await expect(line).toHaveCount(1);
  // The + sits at the line's top end, above the table; the line runs the table's height.
  const pb = (await plusColumn.boundingBox())!;
  expect(Math.abs(pb.x + pb.width / 2 - c1.x)).toBeLessThan(2);
  expect(pb.y + pb.height).toBeLessThanOrEqual(frame.y);
  const lb = (await line.boundingBox())!;
  expect(Math.abs(lb.height - frame.height)).toBeLessThan(2);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  // A click on the highlighted line inserts the column there.
  await page.mouse.click(c1.x, c1.y + c1.height / 2);
  await expect(tableOf(page).locator("th")).toHaveCount(4);
  await expect(tableOf(page).locator("th").nth(1)).toHaveText("Column 2");

  // The border between rows 2 and 3, halfway across: the + at its left end; pressing it inserts.
  const r3 = (await cell(page, 2, 2).boundingBox())!;
  await page.mouse.move(r3.x + r3.width / 2, r3.y + 2);
  const plusRow = page.getByRole("button", { name: "Insert row between rows 2 and 3" });
  await expect(plusRow).toBeVisible();
  const rb = (await plusRow.boundingBox())!;
  expect(rb.x + rb.width).toBeLessThanOrEqual(frame.x);
  expect(Math.abs(rb.y + rb.height / 2 - r3.y)).toBeLessThan(2);
  await plusRow.click();
  await expect(tableOf(page).locator("tr")).toHaveCount(5);
  await page.keyboard.type("Inserted");
  await expect(cell(page, 2, 0)).toHaveText("Inserted");
  await expect.poll(l.saved).toContain("| Inserted |");
  await quit(l);
});

test("D-182: dragging the border between column headers resizes the column on its left, following the hand; a double-click resets it; the keys resize by a step", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  await tableOf(page).evaluate((t) => t.scrollIntoView({ block: "center" }));
  const w0 = await widths(page);
  const tableWidth = (await tableOf(page).boundingBox())!.width;
  const h1 = (await cell(page, 0, 1).boundingBox())!;
  // On the header row, the border offers resizing: its cursor says so.
  await page.mouse.move(h1.x + 2, h1.y + h1.height / 2);
  const zone = page.locator("[data-table-resize]");
  await expect(zone).toHaveCount(1);
  expect(await zone.evaluate((el) => getComputedStyle(el).cursor)).toBe("col-resize");
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  // Drag 60 px right: the first column grows as the hand moves, the second gives the room (Fit to column).
  await page.mouse.down();
  await page.mouse.move(h1.x + 32, h1.y + h1.height / 2);
  await page.mouse.move(h1.x + 62, h1.y + h1.height / 2);
  await expect.poll(async () => Math.round((await widths(page))[0]! - w0[0]!)).toBeGreaterThan(50);
  await page.mouse.up();
  const w1 = await widths(page);
  expect(Math.abs(w1[0]! - w0[0]! - 60)).toBeLessThan(4);
  expect(Math.abs(w1[1]! - w0[1]! + 60)).toBeLessThan(4);
  expect(Math.abs((await tableOf(page).boundingBox())!.width - tableWidth)).toBeLessThan(2);
  await expect.poll(l.saved).toMatch(/^<!-- table: widths=[\d.,]+ -->\n\| Task/m);
  // Clicking it without moving inserts nothing; a double-click resets the column to its aim (30 characters at least).
  const h1b = (await cell(page, 0, 1).boundingBox())!;
  await page.mouse.move(h1b.x + 1, h1b.y + h1b.height / 2);
  await expect(zone).toHaveCount(1);
  await zone.dblclick();
  await expect(tableOf(page).locator("th")).toHaveCount(3);
  await expect.poll(async () => (await widths(page))[0]!).not.toBeCloseTo(w1[0]!, 0);
  // From the keyboard: Alt+Shift+Right widens the caret's column by a step.
  const before = (await widths(page))[1]!;
  await cell(page, 1, 1).click();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect.poll(async () => (await widths(page))[1]!).toBeGreaterThan(before + 5);
  // And the cell menu has the width commands.
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Cell options" });
  await expect(menu.getByRole("menuitem", { name: "Widen column" })).toHaveCount(1);
  await expect(menu.getByRole("menuitem", { name: "Reset column width" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await quit(l);
});

const WIDE = "# Plan\n\n| Task | Notes |\n| --- | --- |\n| Draft | " + "A long note about the draft that keeps going for a good while. ".repeat(3).trim() + " |\n| Ship | Short. |\n\nAfter the table.\n";
for (const size of [undefined, { width: 520, height: 420 }]) {
  test(`D-182: Fit to column and Bleed to edge${size ? " in a small window" : ""}: bled out, a table widens past the text column up to the window, never past it, and the mode is kept in the note`, async () => {
    const l = await start(WIDE, {}, size);
    const { page } = l;
    await tableOf(page).evaluate((t) => t.scrollIntoView({ block: "center" }));
    const column = await editorOf(page).evaluate((el) => el.getBoundingClientRect().width);
    const fitWidth = (await tableOf(page).boundingBox())!.width;
    expect(Math.abs(fitWidth - column)).toBeLessThanOrEqual(1);
    // The cell menu switches it (Shift+F10, from the keyboard).
    await cell(page, 2, 0).click();
    const menu = page.getByRole("menu", { name: "Cell options" });
    const choose = async (name: string) => {
      await page.keyboard.press("Shift+F10");
      await expect(menu).toBeVisible();
      await menu.getByRole("menuitemcheckbox", { name }).or(menu.getByRole("menuitem", { name })).click();
      await expect(menu).toHaveCount(0);
    };
    await choose("Bleed to edge");
    await expect.poll(l.saved).toContain("<!-- table: layout=bleed -->\n| Task");
    const inner = await page.evaluate(() => document.querySelector("[data-app-root]")!.getBoundingClientRect().width);
    const bled = (await tableOf(page).boundingBox())!;
    if (!size) expect(bled.width).toBeGreaterThan(column + 10);
    expect(bled.width).toBeLessThanOrEqual(inner);
    expect(bled.x).toBeGreaterThanOrEqual(0);
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    // Back to the column: the caret is still in the table.
    await expect(editorOf(page)).toBeFocused();
    await choose("Fit to column");
    await expect.poll(async () => Math.abs((await tableOf(page).boundingBox())!.width - column)).toBeLessThanOrEqual(1);
    await expect.poll(l.saved).not.toContain("<!-- table:");
    await quit(l);
  });
}
