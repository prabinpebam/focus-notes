/**
 * WP-1.1 journeys: blocks, Markdown shortcuts, and undo in the real app (EDT-02, EDT-04,
 * EDT-05, EDT-08), saved as clean Markdown (EDT-01).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("WP-1.1: Markdown shortcuts create every block type, saved as Markdown", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press("Delete");
  const type = (s: string) => page.keyboard.type(s);
  const enter = () => page.keyboard.press("Enter");

  await type("# Title"); await enter();
  await type("## Section"); await enter();
  await type("Plain paragraph."); await enter();
  await type("- bullet one"); await enter(); await type("bullet two"); await enter(); await enter();
  await type("1. first"); await enter(); await type("second"); await enter(); await enter();
  await type("[ ] a task"); await enter(); await enter();
  await type("> a quote"); await enter(); await enter();
  await type("```"); await enter(); await type("code here"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await type("---");
  await type("End.");

  await expect(editor.locator("h1")).toHaveText("Title");
  await expect(editor.locator("h2")).toHaveText("Section");
  await expect(editor.locator("ul:not([data-type]) > li")).toHaveCount(2);
  await expect(editor.locator("ol > li")).toHaveCount(2);
  await expect(editor.locator('ul[data-type="taskList"] > li')).toHaveCount(1);
  await expect(editor.locator("blockquote")).toContainText("a quote");
  await expect(editor.locator("pre code")).toHaveText("code here");
  await expect(editor.locator("hr")).toHaveCount(1);
  await expect(editor.locator("p").first()).toHaveAttribute("dir", "auto");

  const note = join(dirs.docs, "Welcome.md");
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 5000 }).toBe(
    "# Title\n\n## Section\n\nPlain paragraph.\n\n- bullet one\n- bullet two\n\n1. first\n2. second\n\n- [ ] a task\n\n> a quote\n\n```\ncode here\n```\n\n---\n\nEnd.\n",
  );
  await quit(l);
});

test("WP-1.1: undo and redo cover structural edits (EDT-08)", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press("Delete");
  // A pause starts a new undo group, so undo stops at the empty note.
  await page.waitForTimeout(700);
  await page.keyboard.type("Line");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Heading");
  await expect(editor.locator("h1")).toHaveText("Heading");
  await page.keyboard.press(`${mod}+Z`);
  await page.keyboard.press(`${mod}+Z`);
  await expect(editor.locator("h1", { hasText: "Heading" })).toHaveCount(0);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y");
  await expect(editor.locator("h1")).toHaveText("Heading");
  await quit(l);
});

test("WP-1.1: a task's checkbox toggles and saves (EDT-04)", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.type("[ ] buy milk");
  await editor.locator('ul[data-type="taskList"] input[type="checkbox"]').click();
  await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), { timeout: 5000 }).toBe("- [x] buy milk\n");
  await quit(l);
});
