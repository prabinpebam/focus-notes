/**
 * WP-4.4 journeys: the Power layer (KEY-03). Whole-block keys, back and forward between notes, the
 * cheat sheet's Power filter, and Spotlight listing the new commands with their keys.
 */
import { test, expect } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";

test("Power block keys move, duplicate, and delete the block with the caret, and save as Markdown", async () => {
  const dirs = tempDirs();
  const file = join(dirs.docs, "Welcome.md");
  writeFileSync(file, "one\n\ntwo\n\nthree\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.waitForTimeout(300);
  const paragraphs = editor.locator("p");

  // The caret starts at the end, in "three". Up twice puts it first (Alt+↑ is the VS Code variant).
  await page.keyboard.press(`${mod}+Shift+ArrowUp`);
  await expect(paragraphs).toHaveText(["one", "three", "two"]);
  await page.keyboard.press(mac ? "Meta+Shift+ArrowUp" : "Alt+ArrowUp");
  await expect(paragraphs).toHaveText(["three", "one", "two"]);
  await page.keyboard.press(`${mod}+Shift+ArrowDown`);
  await expect(paragraphs).toHaveText(["one", "three", "two"]);

  // Duplicate puts a copy below with the caret in it; typing goes into the copy.
  await page.keyboard.press(`${mod}+d`);
  await expect(paragraphs).toHaveText(["one", "three", "three", "two"]);
  await page.keyboard.type("!");
  await expect(paragraphs).toHaveText(["one", "three", "three!", "two"]);

  // Delete block removes the copy.
  await page.keyboard.press(`${mod}+Shift+k`);
  await expect(paragraphs).toHaveText(["one", "three", "two"]);
  await page.keyboard.press(`${mod}+s`);
  await expect.poll(() => readFileSync(file, "utf8")).toBe("one\n\nthree\n\ntwo\n");
  await quit(l);
});

test("Back and forward step between the notes opened, and the cheat sheet's Power filter and Spotlight list them", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "first note\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toHaveText("first note");

  await page.keyboard.press(`${mod}+n`);
  await expect(editor).toHaveText("");
  await page.keyboard.type("second note");
  await page.keyboard.press(mac ? "Meta+BracketLeft" : "Alt+ArrowLeft");
  await expect(editor).toHaveText("first note");
  await page.keyboard.press(mac ? "Meta+BracketRight" : "Alt+ArrowRight");
  await expect(editor).toHaveText("second note");

  // The cheat sheet's Power filter shows the Power keys, and not the Basic ones.
  await page.keyboard.press(`${mod}+Shift+Slash`);
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radiogroup", { name: "Layer" }).getByText("Power", { exact: true }).click();
  await expect(sheet.getByRole("radio", { name: "Power" })).toBeChecked();
  for (const name of ["Move block up", "Move block down", "Duplicate block", "Delete block", "Back to the previous note", "Forward to the next note", "Find and replace"]) {
    await expect(sheet.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(sheet.getByText("Save", { exact: true })).toBeHidden();
  await expect(sheet.getByText(mac ? "Command D" : "Control D", { exact: true })).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Spotlight lists them as commands, with their keys.
  await page.keyboard.press(`${mod}+Shift+p`);
  const spotlight = page.getByRole("dialog", { name: "Spotlight" });
  await spotlight.getByRole("combobox").fill("duplicate block");
  await expect(spotlight.getByRole("listbox").getByRole("option", { name: /Duplicate block/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await quit(l);
});
