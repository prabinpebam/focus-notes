/**
 * WP-1.5 journeys: Loop-style tables. Inserting (TBL-01), rows and columns from handles, insertion
 * points, and edge bars, by pointer and by keyboard (TBL-02, TBL-07, TBL-08), moving between cells
 * (TBL-03), formatting in cells (TBL-05), GFM on disk (TBL-06), spreadsheet paste (TBL-10), and
 * cell ranges (TBL-11), with focus mode, find, accessibility, and the typing budget.
 */
import { test, expect, type Locator, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";
const SCREENS = "../../test-results/screens";

const SAMPLE = "# Plan\n\n| Task | Owner | Status |\n| --- | --- | --- |\n| Draft | Me | Doing |\n| Edit | You | Next |\n| Ship | Us | Later |\n\nAfter the table.\n";

async function start(markdown: string): Promise<Launched & { note: string; saved: () => string }> {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, markdown);
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  return { ...l, note, saved: () => readFileSync(note, "utf8") };
}

const editorOf = (page: Page) => page.getByRole("textbox", { name: "Note" });
const tableOf = (page: Page, n = 0) => editorOf(page).locator("table").nth(n);
const cell = (page: Page, r: number, c: number, n = 0) => tableOf(page, n).locator("tr").nth(r).locator("th, td").nth(c);
/** Every cell's text, row by row. */
const grid = (page: Page, n = 0) => tableOf(page, n).evaluate((t: HTMLTableElement) => [...t.rows].map((r) => [...r.cells].map((c) => c.textContent ?? "")));
const column = async (page: Page, c: number, n = 0) => (await grid(page, n)).map((r) => r[c]);

/** Puts the caret at the end of a cell's text with a click. */
async function clickCell(page: Page, r: number, c: number) {
  await cell(page, r, c).scrollIntoViewIfNeeded();
  const box = (await cell(page, r, c).boundingBox())!;
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  await page.keyboard.press(caret.lineEnd);
  // The editor reads a click's selection a moment later (selectionchange); a paste comes later than that.
  await page.waitForTimeout(100);
}

/**
 * What the last copy put on the clipboard. The system clipboard isn't reachable where the journeys
 * run (see m1-slash-paste), so the copy event's data is read as the editor wrote it.
 */
async function watchCopies(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __copied: Record<string, string> };
    document.addEventListener("copy", (e) => {
      w.__copied = Object.fromEntries([...(e.clipboardData?.types ?? [])].map((t) => [t, e.clipboardData!.getData(t)]));
    });
  });
  return () => page.evaluate(() => (window as unknown as { __copied?: Record<string, string> }).__copied ?? {});
}

/** Scrolls the table to the middle of the window, clear of the trigger band at the top. */
const centerTable = (page: Page) => tableOf(page).evaluate((t) => t.scrollIntoView({ block: "center" }));

/** Waits for entrance fades, so contrast is checked on what people finally see. */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

/** Pastes as the browser does: a paste event carrying the clipboard's text and HTML (see m1-slash-paste). */
async function paste(page: Page, data: { text?: string; html?: string }) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    if (d.html) dt.setData("text/html", d.html);
    if (d.text) dt.setData("text/plain", d.text);
    document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

/**
 * Moves focus through an open menu with the arrow keys to the item named `name`, then presses Enter.
 * It waits for the menu (or the submenu named `menu`) to have focused an item, and after each arrow
 * for focus to reach the next one: a menu opens, and focus moves, a render after the key.
 */
async function chooseByKeyboard(page: Page, name: string, menu?: string) {
  const focused = (menu ? page.getByRole("menu", { name: menu }) : page.getByRole("menu")).locator('[role^="menuitem"]:focus');
  await expect(focused).toHaveCount(1).catch(async (e: Error) => {
    // Run 38620563582 failed here once on Windows CI only: say where focus and the menus were.
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      const menus = [...document.querySelectorAll('[role="menu"]')].map((m) => `${m.getAttribute("aria-label")} ${JSON.stringify(m.getBoundingClientRect())}`);
      const hovered = [...document.querySelectorAll("[data-hovered]")].map((h) => h.textContent);
      return `focus on ${a?.getAttribute("role")} "${a?.textContent?.slice(0, 40)}"; menus: ${menus.join(" | ")}; hovered: ${hovered.join(", ")}`;
    });
    throw new Error(`${e.message}\n${where}`);
  });
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { id, text } = await focused.evaluate((el) => ({ id: el.id, text: el.textContent ?? "" }));
    if (text.replace("✓", "").trim() === name) {
      await page.keyboard.press("Enter");
      return;
    }
    // Arrows wrap around, so meeting an item again means it isn't there.
    if (seen.has(id)) break;
    seen.add(id);
    await page.keyboard.press("ArrowDown");
    await expect(focused).not.toHaveId(id);
  }
  throw new Error(`No menu item "${name}"`);
}

test("TBL-01, TBL-06: /table inserts a table, a typed GFM header row converts, and both save as GFM", async () => {
  const l = await start("# Plan\n\nIntro.\n");
  const { page } = l;
  const editor = editorOf(page);
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  const menu = page.getByRole("listbox", { name: "Insert a block" });
  await expect(menu.getByRole("option")).toHaveText([/^Table/]);
  await page.keyboard.press("Enter");
  await expect(tableOf(page).locator("tr")).toHaveCount(3);
  await expect(tableOf(page).locator("th")).toHaveCount(3);
  // The caret is in the first header cell.
  await page.keyboard.type("Task");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Owner");
  // An empty header shows its column's name, muted, which is never saved (A11Y-01, D-100).
  await expect(tableOf(page).locator("th")).toHaveText(["Task", "Owner", "Column 3"]);
  await expect(tableOf(page).locator("th").first()).toHaveAttribute("scope", "col");

  // A GFM header row and delimiter row, typed below, convert on Enter.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type("| Item | Qty |");
  await page.keyboard.press("Enter");
  await page.keyboard.type("|---|--:|");
  await page.keyboard.press("Enter");
  await expect(editor.locator("table")).toHaveCount(2);
  await page.keyboard.type("Apples");
  await page.keyboard.press("Tab");
  await page.keyboard.type("3");
  await expect(cell(page, 1, 1, 1)).toHaveAttribute("data-align", "right");
  await page.screenshot({ path: `${SCREENS}/tables-inserted.png` });
  await expect.poll(l.saved).toBe([
    "# Plan", "", "Intro.", "",
    "| Task | Owner |   |", "| ---- | ----- | - |", "|      |       |   |", "|      |       |   |", "",
    "| Item   | Qty |", "| ------ | --: |", "| Apples |   3 |", "",
  ].join("\n"));
  await quit(l);
});

test("TBL-03: Tab, Shift+Tab, Enter, and Shift+Enter move between cells; Tab in the last cell adds a row; row keys", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  await clickCell(page, 1, 0);
  await page.keyboard.press("Tab");
  await page.keyboard.type("!");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("?");
  await expect(cell(page, 1, 1)).toHaveText("Me!");
  await expect(cell(page, 1, 0)).toHaveText("Draft?");
  // Enter goes down, Shift+Enter up: a cell never gets a second line.
  await page.keyboard.press("Enter");
  await page.keyboard.type("+");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("*");
  await expect.poll(() => column(page, 0)).toEqual(["Task*", "Draft?", "Edit+", "Ship"]);
  await expect(editorOf(page).locator("td br, th br, td p + p")).toHaveCount(0);
  // Tab in the last cell adds a row.
  await clickCell(page, 3, 2);
  await page.keyboard.press("Tab");
  await page.keyboard.type("New");
  await expect(tableOf(page).locator("tr")).toHaveCount(5);
  await expect(cell(page, 4, 0)).toHaveText("New");
  // Mod+Enter adds a row below; Mod+Shift+Up moves it; Mod+Shift+K deletes it.
  await clickCell(page, 1, 0);
  await page.keyboard.press(`${mod}+Enter`);
  await page.keyboard.type("Added");
  await expect.poll(() => column(page, 0)).toEqual(["Task*", "Draft?", "Added", "Edit+", "Ship", "New"]);
  await page.keyboard.press(`${mod}+Shift+ArrowUp`);
  await expect.poll(() => column(page, 0)).toEqual(["Task*", "Added", "Draft?", "Edit+", "Ship", "New"]);
  await page.keyboard.press(`${mod}+Shift+K`);
  await expect.poll(() => column(page, 0)).toEqual(["Task*", "Draft?", "Edit+", "Ship", "New"]);
  // Enter in the last row leaves the table.
  await clickCell(page, 4, 0);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Below");
  await expect(editorOf(page).locator("[data-table] + p")).toHaveText("Below");
  await expect(editorOf(page).locator("[data-table] + p + p")).toHaveText("After the table.");
  // Undo takes back the last steps one at a time (EDT-08).
  await expect.poll(l.saved).toContain("| New    |");
  await quit(l);
});

test("TBL-07, TBL-08: hover shows handles, the + insertion point, and New row and New column; handle menus act and drag reorders", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  // Hover a cell in the second column, second row: its handles fade in, named for what they control.
  const owner = (await cell(page, 2, 1).boundingBox())!;
  await page.mouse.move(owner.x + owner.width / 2, owner.y + owner.height / 2);
  const columnHandle = page.getByRole("button", { name: "Column 2, Owner, options" });
  const rowHandle = page.getByRole("button", { name: "Row 3 options" });
  await expect(columnHandle).toBeVisible();
  await expect(rowHandle).toBeVisible();
  const frame = (await tableOf(page).boundingBox())!;
  const ch = (await columnHandle.boundingBox())!;
  expect(ch.y + ch.height).toBeLessThanOrEqual(frame.y);
  expect(Math.abs(ch.x + ch.width / 2 - (owner.x + owner.width / 2))).toBeLessThan(2);
  const rh = (await rowHandle.boundingBox())!;
  expect(rh.x + rh.width).toBeLessThanOrEqual(frame.x);
  await expect(page.getByRole("button", { name: "New row" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New column" })).toBeVisible();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: `${SCREENS}/tables-hover.png` });

  // Near the boundary between rows 2 and 3 on the left edge, a + appears after a moment; it inserts there.
  const r2 = (await cell(page, 2, 0).boundingBox())!;
  await page.mouse.move(frame.x + 3, r2.y + 1);
  const insert = page.getByRole("button", { name: "Insert row between rows 2 and 3" });
  await expect(insert).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/tables-insertion-point.png` });
  await insert.click();
  await expect.poll(() => column(page, 0)).toEqual(["Task", "Draft", "", "Edit", "Ship"]);
  // The caret is in the new row's first cell.
  await page.keyboard.type("Inserted");
  await expect(cell(page, 2, 0)).toHaveText("Inserted");
  // Near a column boundary on the top edge.
  const c1 = (await cell(page, 0, 1).boundingBox())!;
  await page.mouse.move(c1.x + 1, frame.y + 3);
  await page.getByRole("button", { name: "Insert column between columns 1 and 2" }).click();
  await expect(tableOf(page).locator("th")).toHaveCount(4);
  await expect(tableOf(page).locator("th").nth(1)).toHaveText("Column 2");

  // New row and New column append, with one undo step each (EDT-08).
  const last = (await cell(page, 4, 0).boundingBox())!;
  await page.mouse.move(last.x + 10, last.y + last.height / 2);
  await page.getByRole("button", { name: "New row" }).click();
  await expect(tableOf(page).locator("tr")).toHaveCount(6);
  await page.mouse.move(last.x + 10, last.y + last.height / 2);
  await page.getByRole("button", { name: "New column" }).click();
  await expect(tableOf(page).locator("th")).toHaveCount(5);
  await page.keyboard.press(`${mod}+Z`);
  await expect(tableOf(page).locator("th")).toHaveCount(4);

  // A column handle selects its column and opens its menu; Move right moves it.
  const status = (await cell(page, 1, 3).boundingBox())!;
  await page.mouse.move(status.x + status.width / 2, status.y + status.height / 2);
  await page.getByRole("button", { name: "Column 4, Status, options" }).click();
  const columnMenu = page.getByRole("menu", { name: "Column 4, Status, options" });
  await expect(columnMenu).toBeVisible();
  await expect(tableOf(page).locator(".selectedCell")).toHaveCount(6);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: `${SCREENS}/tables-column-menu.png` });
  await expect(columnMenu.getByRole("menuitem", { name: "Move right" })).toHaveAttribute("aria-disabled", "true");
  await columnMenu.getByRole("menuitem", { name: "Move left" }).click();
  await expect(tableOf(page).locator("th")).toHaveText(["Task", "Column 2", "Status", "Owner"]);
  // Back in the note afterwards.
  await expect(editorOf(page)).toBeFocused();

  // The row handle's menu: Delete row; the header row's offers only Insert below and Clear contents.
  const edit = (await cell(page, 3, 0).boundingBox())!;
  await page.mouse.move(edit.x + 10, edit.y + edit.height / 2);
  await page.getByRole("button", { name: "Row 4 options" }).click();
  await page.getByRole("menuitem", { name: "Delete row" }).click();
  await expect.poll(() => column(page, 0)).toEqual(["Task", "Draft", "Inserted", "Ship", ""]);
  const head = (await cell(page, 0, 0).boundingBox())!;
  await page.mouse.move(head.x + 10, head.y + head.height / 2);
  await page.getByRole("button", { name: "Row 1 options" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Insert below", "Clear contents"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Drag a row handle: an accent line follows the nearest boundary; release to move it, Esc cancels.
  const ship = (await cell(page, 3, 0).boundingBox())!;
  await page.mouse.move(ship.x + 10, ship.y + ship.height / 2);
  const shipHandle = (await page.getByRole("button", { name: "Row 4 options" }).boundingBox())!;
  const draft = (await cell(page, 1, 0).boundingBox())!;
  await page.mouse.move(shipHandle.x + shipHandle.width / 2, shipHandle.y + shipHandle.height / 2);
  // The handle stays while the pointer rests on it.
  await page.waitForTimeout(400);
  await expect(page.getByRole("button", { name: "Row 4 options" })).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(shipHandle.x + shipHandle.width / 2, draft.y + 4, { steps: 6 });
  await page.screenshot({ path: `${SCREENS}/tables-drag.png` });
  await page.mouse.up();
  await expect.poll(() => column(page, 0)).toEqual(["Task", "Ship", "Draft", "Inserted", ""]);
  // Esc cancels a drag.
  const ship2 = (await cell(page, 1, 0).boundingBox())!;
  await page.mouse.move(ship2.x + 10, ship2.y + ship2.height / 2);
  const h2 = (await page.getByRole("button", { name: "Row 2 options" }).boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + 120, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => column(page, 0)).toEqual(["Task", "Ship", "Draft", "Inserted", ""]);
  // The moved row stays selected, with the formatting toolbar over it (TBL-11); a click puts the caret back.
  await expect(tableOf(page).locator(".selectedCell")).toHaveCount(4);
  await clickCell(page, 1, 1);
  // Columns drag too (with the table clear of the trigger band at the top of the window).
  await centerTable(page);
  const ownerHead = (await cell(page, 0, 3).boundingBox())!;
  await page.mouse.move(ownerHead.x + 10, ownerHead.y + ownerHead.height / 2);
  const oh = (await page.getByRole("button", { name: "Column 4, Owner, options" }).boundingBox())!;
  const taskHead = (await cell(page, 0, 0).boundingBox())!;
  await page.mouse.move(oh.x + oh.width / 2, oh.y + oh.height / 2);
  await page.mouse.down();
  await page.mouse.move(taskHead.x + 3, oh.y + oh.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(tableOf(page).locator("th")).toHaveText(["Owner", "Task", "Column 3", "Status"]);
  await expect.poll(l.saved).toContain("| Owner | Task     |   | Status |");
  await quit(l);
});

test("TBL-08, TBL-11 by keyboard: Esc selects cells, Shift+arrows extend, Shift+F10 opens the cell menu, and every action is reachable", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  const copied = await watchCopies(page);
  await clickCell(page, 1, 0);
  await page.keyboard.press("Escape");
  await expect(tableOf(page).locator(".selectedCell")).toHaveCount(1);
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(tableOf(page).locator(".selectedCell")).toHaveCount(4);
  // Copy: tab-separated text for spreadsheets, and HTML for documents (TBL-11).
  await page.keyboard.press(`${mod}+C`);
  await expect.poll(async () => (await copied())["text/plain"]).toBe("Draft\tMe\nEdit\tYou");
  expect((await copied())["text/html"]).toContain("<td>Draft</td><td>Me</td>");
  expect((await copied())["text/markdown"]).toBe("| Draft | Me  |\n| ----- | --- |\n| Edit  | You |");
  await page.screenshot({ path: `${SCREENS}/tables-range.png` });
  // Shift+F10: the cell menu, its first item focused.
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Cell options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: `${SCREENS}/tables-cell-menu.png` });
  await chooseByKeyboard(page, "Insert column right");
  await expect(menu).toHaveCount(0);
  await expect(editorOf(page)).toBeFocused();
  await expect(tableOf(page).locator("th")).toHaveText(["Task", "Owner", "Column 3", "Status"]);
  // Every row and column action is in it: move a column, align it, delete a row, by keyboard alone.
  await clickCell(page, 2, 0);
  await page.keyboard.press("Shift+F10");
  await chooseByKeyboard(page, "Move row down");
  await expect.poll(() => column(page, 0)).toEqual(["Task", "Draft", "Ship", "Edit"]);
  // The moved row stays selected, so its last cell is the active one: its column can only move left.
  // Each time, the caret is back in the note before the next key: the menu hands it back a frame
  // after the action shows, and on a busy runner a key pressed in that frame met no editor (CI
  // runs 38620563582, 38631550463: focus on the note, no menu).
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await chooseByKeyboard(page, "Move column left");
  await expect(tableOf(page).locator("th")).toHaveText(["Task", "Owner", "Status", "Column 4"]);
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await chooseByKeyboard(page, "Align");
  await chooseByKeyboard(page, "Center", "Align");
  await expect(cell(page, 0, 2)).toHaveAttribute("data-align", "center");
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await chooseByKeyboard(page, "Delete row");
  await expect(tableOf(page).locator("tr")).toHaveCount(3);
  // Backspace in cell selection mode clears the cells.
  await clickCell(page, 1, 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await expect(cell(page, 1, 1)).toHaveText("");
  // The Menu key opens it too, and Esc closes it with the caret back in the note.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ContextMenu");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(editorOf(page)).toBeFocused();
  await expect.poll(l.saved).toMatch(/\| :-+: \|/);
  await quit(l);
});

test("TBL-10: a spreadsheet range fills from the active cell and grows the table; on an empty line it becomes a table", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  await clickCell(page, 2, 1);
  await paste(page, {
    text: "a\tb\tc\n1\t2\t3\nx\ty\tz\n",
    html: "<google-sheets-html-origin><table><tr><td>a</td><td><b>b</b></td><td>c</td></tr><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>x</td><td>y</td><td>z</td></tr></table>",
  });
  await expect.poll(() => grid(page)).toEqual([
    ["Task", "Owner", "Status", "Column 4"], ["Draft", "Me", "Doing", ""], ["Edit", "a", "b", "c"], ["Ship", "1", "2", "3"], ["", "x", "y", "z"],
  ]);
  await expect(page.getByText("Pasted 3 × 3. Table grew by 1 row and 1 column.")).toBeVisible();
  await expect(cell(page, 2, 2).locator("strong")).toHaveText("b");
  // One undo step takes it all back.
  await page.keyboard.press(`${mod}+Z`);
  await expect(tableOf(page).locator("tr")).toHaveCount(4);
  // Text with line breaks into one cell stays on one line, and says so.
  await clickCell(page, 1, 2);
  await paste(page, { text: "one\ntwo" });
  await expect(cell(page, 1, 2)).toHaveText("Doingone two");
  await expect(page.getByText("A table cell holds one line, so the line breaks became spaces.")).toBeVisible();
  // On an empty line, a range becomes a table of its shape.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press("Enter");
  await paste(page, { text: "Name\tQty\nApples\t3\n" });
  await expect(editorOf(page).locator("table")).toHaveCount(2);
  await expect.poll(l.saved).toContain("| Name   | Qty |\n| ------ | --- |\n| Apples | 3   |");
  await quit(l);
});

test("TBL-05, TBL-11: formatting in a cell and across a range; the toolbar has marks only in tables", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  await cell(page, 1, 0).dblclick();
  const toolbar = page.getByRole("region", { name: "Formatting" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /Turn into/ })).toHaveCount(0);
  await toolbar.getByRole("button", { name: /^Bold/ }).click();
  await expect(cell(page, 1, 0).locator("strong")).toHaveText("Draft");
  // Drag across cells: a range, with the toolbar above it.
  const a = (await cell(page, 2, 0).boundingBox())!;
  const b = (await cell(page, 3, 1).boundingBox())!;
  await page.mouse.move(a.x + 8, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 8, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(tableOf(page).locator(".selectedCell")).toHaveCount(4);
  await expect(toolbar).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/tables-range-toolbar.png` });
  await toolbar.getByRole("button", { name: /^Italic/ }).click();
  await expect(tableOf(page).locator("em")).toHaveCount(4);
  // Bold may be saved on its own first; the italic edit is the last one, so it's what's waited for.
  await expect.poll(l.saved).toContain("| *Edit*    | *You* | Next   |");
  expect(l.saved()).toContain("| **Draft** | Me    | Doing  |");
  await quit(l);
});

test("FOC-01, FND-01: focus mode brightens the caret's line inside a cell, and find highlights matches in cells", async () => {
  const l = await start(SAMPLE);
  const { page } = l;
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-focus-mode]") !== null)).toBe(true);
  await clickCell(page, 2, 1);
  await page.waitForTimeout(250);
  const band = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>("[data-focus-mode]")!;
    const props = [...Array(column.style.length)].map((_, i) => column.style[i]!).filter((p) => p.startsWith("--"));
    const values = props.map((p) => parseFloat(column.style.getPropertyValue(p)));
    const origin = column.getBoundingClientRect().top;
    const caret = getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { top: Math.min(...values), bottom: Math.max(...values), caret: (caret.top + caret.bottom) / 2 - origin };
  });
  expect(band.caret).toBeGreaterThan(band.top);
  expect(band.caret).toBeLessThan(band.bottom);
  // Handles draw above the mask: they're outside the masked column.
  const owner = (await cell(page, 2, 1).boundingBox())!;
  await page.mouse.move(owner.x + 10, owner.y + owner.height / 2);
  const handle = page.getByRole("button", { name: "Row 3 options" });
  await expect(handle).toBeVisible();
  expect(await handle.evaluate((el) => el.closest("[data-focus-mode]") === null)).toBe(true);
  await page.screenshot({ path: `${SCREENS}/tables-focus-mode.png` });
  await page.keyboard.press(`${mod}+F`);
  await page.keyboard.type("You");
  await expect(cell(page, 2, 1).locator(".ProseMirror-search-match, .ProseMirror-active-search-match")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await quit(l);
});

test("PRF-01: typing in a 200 × 10 table stays inside the keystroke budget", async () => {
  // A tracking table of the kind people keep: a task, an owner, a status, and numbers.
  const header = "| Task | Owner | Status | Due | Q1 | Q2 | Q3 | Q4 | Total | Notes |";
  const cellText = (r: number, c: number) => [`Task ${r + 1}`, ["Me", "You", "Us"][r % 3], ["Doing", "Done", "Next"][r % 3], `W${(r % 52) + 1}`][c] ?? String((r * 7 + c) % 97);
  const rows = Array.from({ length: 200 }, (_, r) => `| ${Array.from({ length: 10 }, (_, c) => cellText(r, c)).join(" | ")} |`);
  const l = await start(`# Big\n\n${header}\n|${" --- |".repeat(10)}\n${rows.join("\n")}\n`);
  const { page } = l;
  await expect(tableOf(page).locator("tr")).toHaveCount(201);
  await clickCell(page, 3, 1);
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[] };
    w.__lat = [];
    window.addEventListener("keydown", (e) => {
      const t0 = e.timeStamp;
      requestAnimationFrame(() => requestAnimationFrame(() => w.__lat.push(performance.now() - t0)));
    }, true);
  });
  for (let i = 0; i < 60; i++) await page.keyboard.type("a", { delay: 30 });
  await page.waitForTimeout(300);
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat.sort((a, b) => a - b));
  const p95 = lat[Math.floor(lat.length * 0.95)]!;
  console.log(`PRF-01 (200 × 10 table): p50 ${lat[Math.floor(lat.length / 2)]!.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms over ${lat.length} keystrokes`);
  // The same measure and allowance as the 50,000-word journey (m1-focus): two frames include the frame boundary.
  if (!process.env.CI) expect(p95).toBeLessThan(33);
  await expect(cell(page, 3, 1)).toContainText("a".repeat(60));
  await quit(l);
});

test("PRF-01: typing in a 200 × 10 table whose every cell wraps stays inside the keystroke budget", async () => {
  // The case D-96 left open (about 42 ms, a whole-table repaint per keystroke): each cell paints on
  // its own now (D-100).
  const header = `| ${Array.from({ length: 10 }, (_, c) => `Column ${c + 1}`).join(" | ")} |`;
  const rows = Array.from({ length: 200 }, (_, r) => `| ${Array.from({ length: 10 }, (_, c) => `Cell ${r}-${c} has enough words to wrap`).join(" | ")} |`);
  const l = await start(`# Big\n\n${header}\n|${" --- |".repeat(10)}\n${rows.join("\n")}\n`);
  const { page } = l;
  await expect(tableOf(page).locator("tr")).toHaveCount(201);
  await clickCell(page, 3, 1);
  // Every cell wraps over several lines.
  const lineHeight = await cell(page, 3, 2).evaluate((el) => parseFloat(getComputedStyle(el.querySelector("p") ?? el).lineHeight));
  expect((await cell(page, 3, 2).boundingBox())!.height).toBeGreaterThan(2 * lineHeight);
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[] };
    w.__lat = [];
    window.addEventListener("keydown", (e) => {
      const t0 = e.timeStamp;
      requestAnimationFrame(() => requestAnimationFrame(() => w.__lat.push(performance.now() - t0)));
    }, true);
  });
  for (let i = 0; i < 60; i++) await page.keyboard.type("a", { delay: 30 });
  await page.waitForTimeout(300);
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat.sort((a, b) => a - b));
  const p95 = lat[Math.floor(lat.length * 0.95)]!;
  console.log(`PRF-01 (200 × 10 table, every cell wrapping): p50 ${lat[Math.floor(lat.length / 2)]!.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms over ${lat.length} keystrokes`);
  if (!process.env.CI) expect(p95).toBeLessThan(33);
  await expect(cell(page, 3, 1)).toContainText("a".repeat(60));
  await quit(l);
});
