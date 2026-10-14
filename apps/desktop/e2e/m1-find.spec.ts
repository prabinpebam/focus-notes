/**
 * WP-1.10 journeys: find in the note (FND-01) and replace (FND-02), keyboard-complete, announced,
 * and with focus returning to the note on the current match.
 */
import { test, expect, type Page } from "@playwright/test";
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
  await expect(bar.getByRole("button", { name: "Match case" })).toHaveAttribute("aria-pressed", "true");
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
