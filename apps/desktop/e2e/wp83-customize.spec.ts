/**
 * WP-8.3 journey (UI-08, KEY-07, D-170): a key from keybindings.json runs its command and wins over
 * a default on the same key; Settings → Keyboard shows the file's problems and conflicts and follows
 * the file as it changes; the toolbar is customized by keyboard alone (unpin, pin, move) and keeps
 * at most six, with the unpinned action in ⋯; the choice persists; no axe violations.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
/** Presses a control by keyboard: focus, then Enter. */
async function press(target: import("@playwright/test").Locator) {
  await target.focus();
  await expect(target).toBeFocused();
  await target.page().keyboard.press("Enter");
}
const focusOn = (page: Page) => page.locator('[data-focus-mode="on"]').count();

test("UI-08, KEY-07: a key from keybindings.json takes effect, conflicts and problems show and follow the file, and the toolbar is customized by keyboard", async () => {
  const { dirs } = instance();
  const keys = join(dirs.userData, "keybindings.json");
  writeFileSync(keys, JSON.stringify([
    { command: "focus.toggle", key: "Mod+J" },
    { command: "focus.toggle", key: "Mod+Shift+S" },
    { command: "nope.cmd", key: "Mod+L" },
  ]));
  let l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();

  // The custom key runs its command; the one it shares with Save to cloud runs Focus mode.
  const before = await focusOn(page);
  await page.keyboard.press(`${mod}+j`);
  await expect.poll(() => focusOn(page)).not.toBe(before);
  await page.keyboard.press(`${mod}+Shift+S`);
  await expect.poll(() => focusOn(page)).toBe(before);

  // Settings → Keyboard: what applies, the problem by position, and the conflict.
  await page.keyboard.press(`${mod}+,`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("tab", { name: "Keyboard" }).click();
  await expect(settings.getByText("2 custom keys apply from keybindings.json.")).toBeVisible();
  await expect(settings.getByText("Entry 3 (nope.cmd): no command has that name")).toBeVisible();
  await expect(settings.getByText(/runs Focus mode, not Save to cloud$/)).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);

  // Saving the file applies it at once.
  writeFileSync(keys, JSON.stringify([{ command: "focus.toggle", key: "Mod+J" }]));
  await expect(settings.getByText("1 custom key applies from keybindings.json.")).toBeVisible({ timeout: 10_000 });
  await expect(settings.getByText("Every entry applies.")).toBeVisible();
  await expect(settings.getByText("No key runs more than one command.")).toBeVisible();

  // Customize the toolbar by keyboard alone.
  await press(settings.getByRole("button", { name: "Customize toolbar…", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Customize toolbar" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("6 of 6 pinned")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Pin Find", exact: true })).toBeDisabled();
  await press(dialog.getByRole("button", { name: "Unpin Save", exact: true }));
  await expect(dialog.getByText("5 of 6 pinned")).toBeVisible();
  await press(dialog.getByRole("button", { name: "Pin Find", exact: true }));
  await press(dialog.getByRole("button", { name: "Move Find up", exact: true }));
  expect(await settledAxe(page)).toEqual([]);
  await press(dialog.getByRole("button", { name: "Done", exact: true }));
  await expect(dialog).toBeHidden();
  // Settings closes first, so each Escape below puts the toolbar away rather than racing to close
  // Settings, which left the toolbar open and the next Mod+. toggled it shut.
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  const toolbarHas = async (name: string) => {
    await page.keyboard.press(`${mod}+.`);
    const toolbar = page.getByRole("toolbar");
    await expect(toolbar).toBeVisible();
    const n = await toolbar.getByRole("button", { name, exact: true }).count();
    // Escape reaches the toolbar only once it has taken focus; before that the keypress goes to the note.
    await expect(toolbar.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(toolbar).toBeHidden();
    return n;
  };
  expect(await toolbarHas("Find")).toBe(1);
  expect(await toolbarHas("Save")).toBe(0);
  // Save is in ⋯, in its Actions group.
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Save/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await quit(l);

  // Kept on this device.
  l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  await l.page.keyboard.press(`${mod}+.`);
  await expect(l.page.getByRole("toolbar").getByRole("button", { name: "Find", exact: true })).toBeVisible();
  await quit(l);
});
