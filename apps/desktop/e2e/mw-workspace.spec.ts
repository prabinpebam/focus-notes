/**
 * MW journeys for the workspace model (WP-2.3): changes made outside the app reach the open note
 * in time (PRF-11), file names follow titles (FIL-07), and a newer workspace format is never
 * written (DST-05).
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("PRF-11: a change made in another editor shows in the open note within 500 ms of the watcher's report", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Before\n\nOriginal text.\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Original text.");
  // Let the watcher settle after the app's own startup, then change the file as another editor would.
  await page.waitForTimeout(500);
  const reportsBefore = l.log.filter((x) => x.includes("workspace-changed")).length;
  writeFileSync(note, "# After\n\nChanged in another editor.\n");
  await page.waitForFunction(() => document.querySelector("[data-editor]")?.textContent?.includes("Changed in another editor."), null, { polling: "raf", timeout: 5000 });
  const shownAt = Date.now();
  const report = l.log.filter((x) => x.includes("workspace-changed"))[reportsBefore];
  expect(report, "the watcher reported the change").toBeTruthy();
  const reportedAt = Number(/at=(\d+)/.exec(report!)![1]);
  console.log(`PRF-11: shown ${shownAt - reportedAt} ms after the watcher's report`);
  expect(shownAt - reportedAt).toBeLessThanOrEqual(500);
  await expect(editor).not.toContainText("Original text.");

  // The reloaded note is still the one being written: typing saves to the same file.
  await editor.click();
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(" And mine.");
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 5000 }).toBe("# After\n\nChanged in another editor. And mine.\n");
  await quit(l);
});

test("FIL-07: a new note's file follows its title as it's typed", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+N`);
  // The new note is open and empty before typing starts.
  await expect(editor).toHaveText("");
  await expect(editor).toBeFocused();
  await expect.poll(() => readdirSync(dirs.docs).sort()).toEqual(["Untitled.md", "Welcome.md"]);
  await page.keyboard.type("# On focus");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Writing happens one line at a time.");
  await expect.poll(() => readdirSync(dirs.docs).sort(), { timeout: 5000 }).toEqual(["Welcome.md", "on-focus.md"]);
  await expect.poll(() => readFileSync(join(dirs.docs, "on-focus.md"), "utf8"), { timeout: 5000 }).toBe("# On focus\n\nWriting happens one line at a time.\n");
  // A note whose name was chosen by hand keeps it.
  expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toContain("# Welcome to Focus Notes");
  await quit(l);

  // Reopening finds the note under its new name.
  const again = await launch(dirs);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toContainText("Writing happens one line at a time.");
  await quit(again);
});

test("DST-05: a workspace saved by a newer Focus Notes opens read-only, says why, and is never written", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  const format = join(dirs.docs, ".focus-notes", "workspace.json");
  const note = join(dirs.docs, "private", "notes", "welcome.md");
  writeFileSync(format, '{ "formatVersion": 99 }\n');
  writeFileSync(note, "# From the future\n\nWritten by a newer app.\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Written by a newer app.");
  await expect(page.getByText(/saved by a newer Focus Notes \(format 99\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Read only · Needs a newer Focus Notes" })).toBeVisible();

  await editor.click();
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(" Typed anyway.");
  await page.keyboard.press(`${mod}+S`);
  await page.keyboard.press(`${mod}+N`);
  await page.waitForTimeout(1200);
  expect(readFileSync(note, "utf8")).toBe("# From the future\n\nWritten by a newer app.\n");
  expect(readFileSync(format, "utf8")).toBe('{ "formatVersion": 99 }\n');
  expect(readdirSync(join(dirs.docs, "private", "notes"))).toEqual(["welcome.md"]);
  expect(existsSync(join(dirs.docs, "Welcome.md"))).toBe(false);
  await quit(l);
});
