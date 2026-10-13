/**
 * WP-1.8 journeys: the cheat sheet (KEY-05) and the Basic and Writer editor keys (KEY-02), run by
 * the editor's keymap from the command registry.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";

test("Mod+Shift+/ opens a searchable cheat sheet; Esc clears, then closes, and the caret returns", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();

  await page.keyboard.press(`${mod}+Shift+Slash`);
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  const search = sheet.getByRole("searchbox", { name: "Search shortcuts" });
  await expect(search).toBeFocused();
  for (const g of ["App and window", "Editing", "Formatting", "Blocks"]) await expect(sheet.getByRole("heading", { name: g })).toBeVisible();
  // Keys are drawn in this platform's symbols and read in words.
  await expect(sheet.getByText(mac ? "Shift Command L" : "Control Shift L")).toBeAttached();
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/cheat-sheet.png" });

  await search.fill("bold");
  await expect(sheet.getByRole("status")).toHaveText("1 shortcut");
  await expect(sheet.getByText("Bold", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Italic", { exact: true })).toBeHidden();

  // Typing keys finds what uses them, in either spelling.
  await search.fill("ctrl shift /");
  await expect(sheet.getByRole("region", { name: "Keyboard shortcuts" }).getByText("Keyboard shortcuts", { exact: true })).toBeVisible();
  await search.fill("zzz");
  await expect(sheet.getByRole("status")).toHaveText("No shortcuts match “zzz”");

  // Layer filters and the platform switch are radio groups.
  await search.fill("");
  await sheet.getByRole("radiogroup", { name: "Layer" }).getByText("Basic", { exact: true }).click();
  await expect(sheet.getByRole("radio", { name: "Basic" })).toBeChecked();
  await expect(sheet.getByText("Focus mode", { exact: true })).toBeHidden();
  await expect(sheet.getByText("Save", { exact: true })).toBeVisible();
  await sheet.getByRole("radiogroup", { name: "Show keys for" }).getByText(mac ? "Windows and Linux" : "macOS", { exact: true }).click();
  await expect(sheet.getByText(mac ? "Control S" : "Command S", { exact: true })).toBeAttached();

  // Esc clears a search first, then closes; focus goes back to the note.
  await search.fill("bold");
  await search.focus();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(editor).toBeFocused();
  await quit(l);
});

test("⋯ → Keyboard shortcuts opens the cheat sheet; the close button closes it", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /Keyboard shortcuts/ }).click();
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Toolbar" })).toBeHidden();
  await expect(sheet.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  // The menu item it was opened from is gone, so the caret goes back to the note.
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.type("x");
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("x");
  await quit(l);
});

test("Basic and Writer editor keys follow the documented keymap and save as Markdown", async () => {
  const dirs = tempDirs();
  const file = join(dirs.docs, "Welcome.md");
  writeFileSync(file, "alpha beta\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  // Tiptap puts the caret at the end on a deferred task after opening; let it settle before selecting.
  await page.waitForTimeout(300);

  // Strikethrough is Mod+Shift+X (not Tiptap's Mod+Shift+S).
  // Mod+A selects the note (one paragraph here); Home/End mean different things on macOS.
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+Shift+S`);
  await expect(editor.locator("s")).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+X`);
  await expect(editor.locator("s")).toHaveText("alpha beta");
  // Clear formatting removes every mark.
  await page.keyboard.press(`${mod}+b`);
  await expect(editor.locator("strong")).toHaveCount(1);
  await page.keyboard.press(`${mod}+Backslash`);
  await expect(editor.locator("s, strong")).toHaveCount(0);

  // Headings and back to text.
  await page.keyboard.press(`${mod}+Alt+2`);
  await expect(editor.locator("h2")).toHaveText("alpha beta");
  await page.keyboard.press(`${mod}+Alt+0`);
  await expect(editor.locator("h2")).toHaveCount(0);

  // A task list, checked with Mod+Enter; Shift+Enter is a line break, Mod+Enter isn't.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press(`${mod}+Shift+9`);
  await expect(editor.locator("ul[data-type=taskList]")).toHaveCount(1);
  await page.keyboard.press(`${mod}+Enter`);
  await expect(editor.locator("li[data-checked=true]")).toHaveCount(1);
  await page.keyboard.press(`${mod}+Enter`);
  await expect(editor.locator("li[data-checked=true]")).toHaveCount(0);
  await expect(editor.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(0);
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("gamma");
  await expect(editor.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(1);
  await page.keyboard.press(`${mod}+Enter`);
  await page.keyboard.press(`${mod}+s`);
  await expect.poll(() => readFileSync(file, "utf8")).toMatch(/^- \[x\] alpha beta\\?\s*\n\s*gamma\n$/);

  // Undo goes back step by step.
  await page.keyboard.press(`${mod}+z`);
  await expect(editor.locator("li[data-checked=true]")).toHaveCount(0);
  await quit(l);
});
