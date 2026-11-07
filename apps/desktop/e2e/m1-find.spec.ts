/**
 * WP-1.10 journeys: find in the note (FND-01) and replace (FND-02), keyboard-complete, announced,
 * and with focus returning to the note on the current match.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
/** Waits for fades and color transitions to end, so contrast is checked on what people finally see. */
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const mod = mac ? "Meta" : "Control";

test("FND-01: Find field actions and chevron stay aligned, with helper text below its own switch", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  try {
    const { page } = l;
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 720));
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await page.keyboard.press(`${mod}+F`);
    const bar = page.getByRole("region", { name: "Find in note" });
    const field = bar.getByRole("searchbox", { name: "Find", exact: true });
    const chevron = bar.getByRole("button", { name: /replace/i }).first();
    const actions = [
      chevron,
      bar.getByRole("button", { name: /previous match/i }),
      bar.getByRole("button", { name: /next match/i }),
      bar.getByRole("button", { name: /close find/i }),
    ];
    const fieldBox = (await field.boundingBox())!;
    const original = (await chevron.boundingBox())!;
    for (const action of actions) {
      const box = (await action.boundingBox())!;
      expect(Math.abs(box.y + box.height / 2 - (fieldBox.y + fieldBox.height / 2))).toBeLessThanOrEqual(1);
    }
    const switchBoxes = await Promise.all((await bar.getByRole("switch").all()).map((s) => s.locator("xpath=ancestor::label").boundingBox()));
    expect(switchBoxes).toHaveLength(4);
    for (const box of switchBoxes) expect(Math.abs(box!.y - switchBoxes[0]!.y)).toBeLessThanOrEqual(1);
    expect(await bar.getByRole("switch").first().locator("xpath=ancestor::label").evaluate((label) => {
      const options = getComputedStyle(label.parentElement!);
      return { inline: options.columnGap, wrap: options.rowGap };
    })).toEqual({ inline: "16px", wrap: "8px" });
    await expect(bar.getByText("Select text in the note, then open find")).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await chevron.hover();
      await chevron.focus();
      await chevron.click();
      const box = (await chevron.boundingBox())!;
      expect(box).toEqual(original);
      await expect(field).toBeVisible();
    }
    await page.screenshot({ path: "../../test-results/screens/find-alignment.png" });
  } finally { await quit(l); }
});

test("OFB.6: Find switches wrap inside a minimum writing window without hiding the match", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Needle\n\nA needle to find.\n");
  const l = await launch(dirs);
  try {
    const { page } = l;
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(360, 320));
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();
    await page.keyboard.press(`${mod}+f`);
    const bar = page.getByRole("region", { name: "Find in note" });
    await bar.getByRole("searchbox", { name: "Find", exact: true }).fill("needle");
    for (const action of await bar.getByRole("button").all()) {
      expect(await action.evaluate((button) => {
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit !== null && button.contains(hit) && r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight;
      }), "every Find action is exposed, not covered by its neighbour").toBe(true);
    }
    await bar.getByRole("button", { name: "Search options", exact: true }).click();
    const options = page.getByRole("dialog", { name: "Search options", exact: true });
    await expect(options.getByRole("switch")).toHaveCount(4);
    for (const control of await options.getByRole("switch").all()) {
      const bounds = await control.locator("xpath=ancestor::label").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(320);
    }
    await options.getByRole("switch", { name: "Match case", exact: true }).press("Space");
    await expect(options.getByRole("switch", { name: "Match case", exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(options).toBeHidden();
    await expect.poll(async () => {
      const b = await bar.boundingBox(), m = await editor.locator(".ProseMirror-active-search-match").boundingBox();
      return b && m ? m.y - (b.y + b.height) : Number.NEGATIVE_INFINITY;
    }).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => {
      const match = await editor.locator(".ProseMirror-active-search-match").boundingBox();
      return match ? match.y + match.height : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(320);
    await page.screenshot({ path: "../../test-results/screens/ofb-find-switches-minimum.png" });
  } finally { await quit(l); }
});

test("FND-01: Mod+F fills from the selection, counts, steps with Enter, wraps, and Esc returns to the match", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Focus\n\nStay in **focus** and keep focus on the café, the cafe, and FOCUS.\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  // Select the heading word, then open find.
  await editor.locator("h1").selectText();
  await page.keyboard.press(`${mod}+f`);
  const bar = page.getByRole("region", { name: "Find in note" });
  await expect(bar).toBeVisible();
  const field = bar.getByRole("searchbox", { name: "Find" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Focus");
  const status = bar.getByRole("status").first();
  await expect(status).toHaveText(/of 4$/);
  await expect(editor.locator(".ProseMirror-search-match, .ProseMirror-active-search-match")).toHaveCount(4);
  // The bar never covers the current match.
  const gap = async () => {
    const barBox = (await bar.boundingBox())!;
    const matchBox = (await editor.locator(".ProseMirror-active-search-match").boundingBox())!;
    return matchBox.y - (barBox.y + barBox.height);
  };
  await expect.poll(gap).toBeGreaterThanOrEqual(0);
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/find-bar.png" });

  // Enter steps forward and wraps; Shift+Enter steps back.
  for (const n of [2, 3, 4]) {
    await page.keyboard.press("Enter");
    await expect(status).toHaveText(`${n} of 4`);
  }
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("1 of 4");
  await expect(bar.getByText("Wrapped around")).toBeVisible();
  await page.keyboard.press("Shift+Enter");
  await expect(status).toHaveText("4 of 4");

  // Accents and case are ignored by default; the toggles narrow it down.
  await field.fill("cafe");
  await expect(status).toHaveText(/of 2$/);
  await page.keyboard.press(mac ? "Meta+Alt+c" : "Alt+c");
  await expect(bar.getByRole("switch", { name: "Match case" })).toBeChecked();
  await expect(status).toHaveText(/of 2$/);
  await field.fill("CAFE");
  await expect(status).toHaveText("No results");
  await page.keyboard.press(mac ? "Meta+Alt+c" : "Alt+c");
  await field.fill("caf(");
  await page.keyboard.press(mac ? "Meta+Alt+r" : "Alt+r");
  await expect(status).toHaveText("Not a valid regular expression");
  await page.keyboard.press(mac ? "Meta+Alt+r" : "Alt+r");

  // Recent searches with the arrow keys.
  await field.fill("keep");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await expect(field).toHaveValue("keep");

  // Esc closes the bar; the caret is on the match, so typing replaces it.
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await expect(editor).toBeFocused();
  await page.keyboard.type("hold");
  await expect(editor).toContainText("and hold focus on");
  await quit(l);
});

test("FND-02: replace current and replace all, one undo step, formatting kept, announced", async () => {
  const dirs = tempDirs();
  const file = join(dirs.docs, "Welcome.md");
  const body = "# Notes\n\n" + Array.from({ length: 50 }, (_, i) => `- a **draft** line ${i} with [draft](https://example.com) text`).join("\n") + "\n";
  writeFileSync(file, body);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(mac ? "Meta+Alt+f" : "Control+h");
  const bar = page.getByRole("region", { name: "Find in note" });
  const field = bar.getByRole("searchbox", { name: "Find" });
  const replace = bar.getByRole("searchbox", { name: "Replace with" });
  await expect(replace).toBeVisible();
  await expect(field).toBeFocused();
  await field.fill("draft");
  await expect(bar.getByRole("status").first()).toHaveText(/of 100$/);
  await replace.fill("final");
  // Typing selected the first match; Enter in the replace field replaces it and moves on.
  await replace.press("Enter");
  await expect(bar.getByRole("status").first()).toHaveText(/of 99$/);
  expect(await settledAxe(page)).toEqual([]);

  // Replace all: one step, announced.
  await page.keyboard.press(mac ? "Meta+Enter" : "Control+Alt+Enter");
  // Confirmed by a toast (IA-CMP-TOAST), announced politely, with a close button.
  const toast = page.getByRole("status").filter({ hasText: "Replaced 99 matches" });
  await expect(toast).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/toast.png" });
  await expect(bar.getByRole("status").first()).toHaveText("No results");
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+s`);
  await expect.poll(() => readFileSync(file, "utf8")).toBe(body.replaceAll("draft", "final"));

  // One undo brings back all 99; the one replaced separately stays.
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+s`);
  await expect.poll(() => (readFileSync(file, "utf8").match(/final/g) ?? []).length).toBe(1);
  await quit(l);
});

test("find is in the ⋯ menu, and the close button returns focus to the note", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Find/ }).first().click();
  const bar = page.getByRole("region", { name: "Find in note" });
  await expect(bar.getByRole("searchbox", { name: "Find" })).toBeFocused();
  // Focus stays in the field (the closing toolbar doesn't pull it back), so typing searches.
  await page.waitForTimeout(300);
  await page.keyboard.type("zz");
  await expect(bar.getByRole("searchbox", { name: "Find" })).toHaveValue("zz");
  // Mod+F again keeps the query.
  await page.keyboard.press(`${mod}+f`);
  await expect(bar.getByRole("searchbox", { name: "Find" })).toHaveValue("zz");
  // Replace keys do nothing while the replace row is hidden.
  await page.keyboard.press(mac ? "Meta+Enter" : "Control+Alt+Enter");
  await expect(page.getByRole("status").filter({ hasText: /Replaced/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Close find" }).click();
  await expect(bar).toBeHidden();
  await expect(editor).toBeFocused();
  await quit(l);
});
