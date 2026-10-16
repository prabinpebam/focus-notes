/**
 * WP-8.4: note history (FIL-13, D-175, IA-VIEW-HISTORY). ⋯ or Spotlight opens the open note's versions
 * from Git in a side sheet, newest first by day, an agent's labeled; ↑/↓ and Enter show one, block by
 * block against the note now; Restore this version saves its text, and the toast's Undo puts the note
 * back; Esc closes. Keyboard only, axe-clean. Local repositories only: nothing touches the network.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { git, instance, write } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};

test("FIL-13: Note history lists the note's versions, shows one against the note now, restores it, and Undo puts the note back (keyboard only)", async () => {
  const { dirs } = instance();
  const priv = join(dirs.docs, "private");
  const note = join(priv, "notes", "welcome.md");
  // Two more saved versions, the newest by an agent.
  write(note, "# Welcome\n\nFirst line, edited.\n");
  git(priv, "commit", "-q", "-am", "Save notes/welcome.md");
  write(note, "# Welcome\n\nFirst line, edited.\n\nAn agent's paragraph.\n");
  git(priv, "commit", "-q", "-am", "Agent edit: notes/welcome.md\n\nFocus-Notes-Agent: Claude Desktop");
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("An agent's paragraph.");
  // Spotlight → Note history.
  await page.keyboard.press(`${mod}+/`);
  const spotlight = page.getByRole("dialog", { name: "Spotlight" });
  await spotlight.getByRole("combobox").fill("Note history");
  await expect(spotlight.getByRole("option", { name: /^Note history/, selected: true, disabled: false })).toBeVisible();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("complementary", { name: "Note history" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/\d+ saved versions, newest first\./);
  const list = sheet.getByRole("listbox", { name: "Versions" });
  await expect(list).toBeFocused();
  // Newest first; the agent's version is labeled.
  const options = list.getByRole("option");
  expect(await options.count()).toBeGreaterThanOrEqual(3);
  await expect(options.first()).toContainText("Claude Desktop");
  await expect(options.first()).toContainText("Agent");
  expect(await settledAxe(page)).toEqual([]);
  // End to the oldest, Enter shows it, with the blocks that differ from the note now marked.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const version = sheet.getByRole("region", { name: /^Viewing the version from / });
  await expect(version).toContainText("First line.");
  await expect(version.locator("[data-changed]").first()).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  // Tab to Restore this version, Enter.
  const restore = sheet.getByRole("button", { name: "Restore this version" });
  for (let i = 0; i < 6 && !(await restore.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(restore).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(editor).not.toContainText("An agent's paragraph.");
  await expect(editor).toContainText("First line.");
  await expect.poll(() => readFileSync(note, "utf8")).toBe("# Welcome\n\nFirst line.\n");
  const toast = page.locator("#toasts");
  await expect(toast).toContainText("Restored the version from");
  // F6 reaches the toast's Undo: the note is as it was.
  await page.keyboard.press("F6");
  await expect(toast.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor).toContainText("An agent's paragraph.");
  await expect.poll(() => readFileSync(note, "utf8")).toBe("# Welcome\n\nFirst line, edited.\n\nAn agent's paragraph.\n");
  // Esc closes the sheet.
  await page.keyboard.press(`${mod}+/`);
  await spotlight.getByRole("combobox").fill("Note history");
  await expect(spotlight.getByRole("option", { name: /^Note history/, selected: true, disabled: false })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await quit(l);
});
