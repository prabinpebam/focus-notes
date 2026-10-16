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

async function start(markdown: string, env: Record<string, string> = {}): Promise<Launched & { saved: () => string }> {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, markdown);
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
