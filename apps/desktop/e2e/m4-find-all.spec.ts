/**
 * M4 journeys for Find in all notes (WP-4.3, FND-04): Mod+Shift+F opens its sheet; typing searches
 * every note's text, private and public, through the search index; results are grouped by note with
 * its path, visibility, and count, each line with the match marked; the arrow keys and Enter open
 * the note at exactly that match with the find bar open on it; F4 and Shift+F4 step through results
 * across notes. Keyboard only, and axe clean. This is step 4 of the M4 demo.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { instance, write } from "./instance.ts";
import { axeViolations } from "./axe.ts";
import { scoreRegion, BUDGETS } from "./visual-score.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};

for (const theme of ["light", "dark"] as const) {
  test(`OB-d.1/OB-d.2: familiar all-notes row, options and empty/error recovery, ${theme}`, async () => {
    const { dirs } = instance();
    write(join(dirs.docs, "notes", "garden.md"), "# Garden\n\nA garden grows.\n");
    write(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: theme }));
    const l = await launch(dirs);
    try {
      const { page } = l;
      await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe(theme);
      await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
      await page.keyboard.press(`${mod}+Shift+F`);
      const panel = page.getByRole("complementary", { name: "Find in all notes" });
      const field = panel.getByRole("combobox", { name: "Search all notes" });
      const previous = panel.getByRole("button", { name: "Previous result", exact: true });
      const next = panel.getByRole("button", { name: "Next result", exact: true });
      const close = panel.getByRole("button", { name: "Close find in all notes", exact: true });
      for (const [width, height] of [[1280, 720], [360, 320]] as const) {
        await l.app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows()[0]!.setSize(width, height), { width, height });
        await field.fill("garden");
        await expect(panel.getByRole("status").first()).toHaveText("2 matches in 1 note");
        const fieldBox = (await field.boundingBox())!;
        for (const action of [previous, next, close]) {
          const box = (await action.boundingBox())!;
          expect(Math.abs(box.y + box.height / 2 - fieldBox.y - fieldBox.height / 2)).toBeLessThanOrEqual(1);
          expect(await action.evaluate(button => {
            const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight && hit !== null && button.contains(hit);
          })).toBe(true);
        }
        const pairs = await panel.getByRole("switch").first().locator("xpath=ancestor::label").evaluate(label => {
          const pair = getComputedStyle(label), group = getComputedStyle(label.parentElement!);
          return { pair: pair.columnGap, group: group.columnGap, wrap: group.rowGap, align: group.alignItems };
        });
        expect(pairs).toEqual({ pair: "8px", group: "16px", wrap: "8px", align: "flex-start" });
        await next.click();
        await expect(panel.getByRole("option").last()).toHaveAttribute("aria-selected", "true");
        await previous.click();
        await expect(panel.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
        await field.fill("zebra");
        await expect(panel.getByRole("status").first()).toHaveText("No results");
        await expect(field).toHaveValue("zebra");
        await expect(next).toBeDisabled();
        const emptyScore = await scoreRegion(panel, BUDGETS.empty);
        expect(emptyScore.economyScore).toBe(20);
        expect(emptyScore.maxLines).toBeLessThanOrEqual(2);
        await page.screenshot({ path: `../../test-results/screens/find-all-familiar-empty-${theme}-${width}.png` });
        await panel.getByRole("button", { name: "Edit search" }).click();
        await expect(field).toBeFocused();
        await expect(field).toHaveValue("zebra");
        await panel.getByRole("switch", { name: "Regular expression", exact: true }).locator("xpath=ancestor::label").click();
        await field.fill("gard(");
        await expect(panel.getByRole("status").first()).toHaveText("Not a valid regular expression");
        await expect(field).toHaveAttribute("aria-invalid", "true");
        await expect(panel.getByText("Check the pattern or turn off Regular expression.")).toBeVisible();
        await expect(field).toHaveValue("gard(");
        expect(await settledAxe(page)).toEqual([]);
        const invalidScore = await scoreRegion(panel, BUDGETS.empty);
        expect(invalidScore.economyScore).toBe(20);
        expect(invalidScore.maxLines).toBeLessThanOrEqual(2);
        await page.screenshot({ path: `../../test-results/screens/find-all-familiar-${theme}-${width}.png` });
        await panel.getByRole("button", { name: "Edit search" }).click();
        await expect(field).toBeFocused();
        await field.fill("garden");
        await expect(panel.getByRole("status").first()).toHaveText("2 matches in 1 note");
        await panel.getByRole("switch", { name: "Regular expression", exact: true }).locator("xpath=ancestor::label").click();
      }
      await field.fill("[Gg]arden");
      for (const name of ["Match case", "Whole word", "Regular expression"]) {
        await panel.getByRole("switch", { name, exact: true }).locator("xpath=ancestor::label").click();
      }
      await expect(panel.getByRole("status").first()).toHaveText("2 matches in 1 note");
      await next.click();
      await field.focus();
      await page.keyboard.press("Enter");
      await expect(panel).toBeHidden();
      await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 720));
      const bar = page.getByRole("region", { name: "Find in note" });
      await expect(bar.getByRole("searchbox", { name: "Find", exact: true })).toHaveValue("[Gg]arden");
      for (const name of ["Match case", "Whole word", "Regular expression"]) await expect(bar.getByRole("switch", { name, exact: true })).toBeChecked();
      await expect(page.getByRole("textbox", { name: "Note" }).locator(".ProseMirror-active-search-match")).toHaveText("garden");
    } finally { await quit(l); }
  });
}

test("FND-01/FND-04: Find surfaces are exclusive in both shortcut orders, retaining their queries", async () => {
  const { dirs } = instance();
  const l = await launch(dirs);
  try {
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    const bar = page.getByRole("region", { name: "Find in note" });
    const sheet = page.getByRole("complementary", { name: "Find in all notes" });
    const noteField = bar.getByRole("searchbox", { name: "Find", exact: true });
    const allField = sheet.getByRole("combobox", { name: "Search all notes" });
    await expect(editor).toBeFocused();
    await page.keyboard.press(`${mod}+F`);
    await noteField.fill("note query");
    await page.keyboard.press(`${mod}+Shift+F`);
    await expect(bar).toBeHidden();
    await expect(sheet).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(allField).toBeFocused();
    await allField.fill("all notes query");
    for (const shortcut of [`${mod}+F`, mac ? "Meta+Alt+F" : "Control+H", "F3", "Shift+F3"]) {
      await page.keyboard.press(shortcut);
      await expect(sheet).toBeHidden();
      await expect(bar).toBeVisible();
      await expect(noteField).toHaveValue("note query");
      await page.keyboard.press(`${mod}+Shift+F`);
      await expect(bar).toBeHidden();
      await expect(sheet).toBeVisible();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(allField).toBeFocused();
      await expect(allField).toHaveValue("all notes query");
    }
    await page.keyboard.press(`${mod}+.`);
    await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Find (Ctrl|⌘)/ }).click();
    await expect(sheet).toBeHidden();
    await expect(noteField).toHaveValue("note query");
    await page.keyboard.press(`${mod}+Shift+P`);
    const actions = page.getByRole("dialog", { name: "Actions", exact: true });
    await actions.getByRole("combobox").fill("find in all notes");
    await actions.getByRole("option").filter({ has: page.getByText("Find in all notes", { exact: true }) }).click();
    await expect(bar).toBeHidden();
    await expect(sheet).toBeVisible();
    await expect(allField).toHaveValue("all notes query");
  } finally { await quit(l); }
});

test("FND-04 (M4 demo, step 4): find in all notes, grouped with snippets, and open a match at exactly that match, from the keyboard", async () => {
  const { dirs } = instance();
  write(join(dirs.docs, "private", "notes", "journal", "garden-diary.md"), "# Garden diary\n\nThe heron came back.\n\nA second heron, then a third Heron by the pond.\n");
  write(join(dirs.docs, "notes", "essays", "herons.md"), "# On herons\n\nHerons wait. A heron is patient.\n");
  write(join(dirs.docs, "notes", "plain.md"), "# Plain\n\nNothing to find here.\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();

  // Mod+Shift+F opens the sheet with its field focused.
  await page.keyboard.press(`${mod}+Shift+F`);
  const sheet = page.getByRole("complementary", { name: "Find in all notes" });
  await expect(sheet).toBeVisible();
  const field = sheet.getByRole("combobox", { name: "Search all notes" });
  await expect(field).toBeFocused();
  await page.keyboard.type("heron");
  const summary = sheet.getByRole("status").first();
  await expect(summary).toHaveText("6 matches in 2 notes", { timeout: 20_000 });

  // Grouped by note: private first, then public, each with its path, visibility, and count.
  const list = sheet.getByRole("listbox", { name: "Matches" });
  const diary = list.getByRole("group", { name: /^Garden diary/ });
  const essay = list.getByRole("group", { name: /^On herons/ });
  await expect(diary.getByRole("option")).toHaveText(["The heron came back.", "A second heron, then a third Heron by the pond.", "A second heron, then a third Heron by the pond."]);
  await expect(essay.getByRole("option")).toHaveText(["On herons", "Herons wait. A heron is patient.", "Herons wait. A heron is patient."]);
  await expect(sheet.getByText("journal/garden-diary.md · Private · 3 matches")).toBeVisible();
  await expect(sheet.getByText("essays/herons.md · Public · 3 matches")).toBeVisible();
  // Each line marks its own match.
  await expect(diary.getByRole("option").nth(2).locator("mark")).toHaveText("Heron");
  await expect(essay.getByRole("option").nth(1).locator("mark")).toHaveText("Heron");
  // The first match is active; focus stays in the field, pointing at it.
  await expect(diary.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/find-all.png" });

  // Down twice, then Enter: the diary's third match, "Heron", opens with the find bar on it.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(diary.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveAttribute("aria-activedescendant", (await diary.getByRole("option").nth(2).getAttribute("id"))!);
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(editor.locator("h1")).toHaveText("Garden diary");
  const bar = page.getByRole("region", { name: "Find in note" });
  const findField = bar.getByRole("searchbox", { name: "Find" });
  const status = bar.getByRole("status").first();
  await expect(findField).toBeFocused();
  await expect(findField).toHaveValue("heron");
  await expect(status).toHaveText("3 of 3");
  await expect(editor.locator(".ProseMirror-active-search-match")).toHaveText("Heron");
  await expect(editor.locator(".ProseMirror-search-match, .ProseMirror-active-search-match")).toHaveCount(3);
  expect(await settledAxe(page)).toEqual([]);
  // Enter steps on through the note's matches, as the find bar always does.
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("1 of 3");

  // F4 and Shift+F4: the next and previous result across notes, without the sheet.
  await page.keyboard.press("F4");
  await expect(editor.locator("h1")).toHaveText("On herons");
  await expect(status).toHaveText("1 of 3");
  await expect(editor.locator(".ProseMirror-active-search-match")).toHaveText("heron");
  await expect(sheet).toBeHidden();
  await page.keyboard.press("Shift+F4");
  await expect(editor.locator("h1")).toHaveText("Garden diary");
  await expect(status).toHaveText("3 of 3");
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await expect(editor).toBeFocused();

  // Back in the sheet, the search is still there; Match case narrows it.
  await page.keyboard.press(`${mod}+Shift+F`);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("heron");
  await page.keyboard.press(mac ? "Meta+Alt+C" : "Alt+C");
  await expect(summary).toHaveText("4 matches in 2 notes");
  await expect(sheet.getByRole("switch", { name: "Match case" })).toBeChecked();
  // Esc clears the field, then closes the sheet, and the caret is back in the note.
  await field.focus();
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(editor).toBeFocused();
  await quit(l);
});

test("FND-04: a match opens at its own line where a block before it is shown as raw Markdown, and a filter narrows by visibility", async () => {
  const { dirs } = instance();
  // A list mixing tasks and items is shown as raw Markdown, which the find bar doesn't search.
  write(join(dirs.docs, "notes", "mixed.md"), "# Mixed\n\n- an otter list\n- [ ] otter task\n\nThe sea otter floats. Another otter dives.\n");
  write(join(dirs.docs, "private", "notes", "secret.md"), "# Secret\n\nA private otter.\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+Shift+F`);
  const sheet = page.getByRole("complementary", { name: "Find in all notes" });
  await page.keyboard.type("otter is:public");
  await expect(sheet.getByRole("status").first()).toHaveText("4 matches in 1 note", { timeout: 20_000 });
  const options = sheet.getByRole("listbox", { name: "Matches" }).getByRole("option");
  await expect(options).toHaveText(["an otter list", "otter task", "The sea otter floats. Another otter dives.", "The sea otter floats. Another otter dives."]);
  // The fourth match listed is the find bar's second: the raw list's two aren't its to count.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const bar = page.getByRole("region", { name: "Find in note" });
  await expect(bar.getByRole("status").first()).toHaveText("2 of 2");
  await expect(editor.locator(".ProseMirror-active-search-match")).toHaveText("otter");
  expect(await editor.evaluate((e) => [...e.querySelectorAll(".ProseMirror-search-match, .ProseMirror-active-search-match")].findIndex((m) => m.classList.contains("ProseMirror-active-search-match")))).toBe(1);
  await quit(l);
});
