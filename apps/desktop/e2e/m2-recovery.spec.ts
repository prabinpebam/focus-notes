/**
 * M2 journeys for the recovery journal (WP-2.6, QLT-03): a crash while typing loses at most about a
 * second, and the next launch puts the text back with a calm notice; a note changed while the app
 * was closed keeps both versions; a clean quit leaves no journal behind; and Close without saving
 * means the text isn't brought back.
 */
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { crash, LOSS_BUDGET_MS, START, typedPart, typeTimed } from "./recovery.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function startTyping(l: Launched) {
  const editor = l.page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await l.page.keyboard.press(`${mod}+End`);
  await l.page.keyboard.press("Enter");
  return editor;
}

test("QLT-03: a crash while typing loses at most about a second, and the next launch restores it with a calm notice", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, START);
  const l = await launch(dirs);
  await startTyping(l);
  // Typing that never pauses long enough to save: only the journal has it.
  const typed = await typeTimed(l.page, "the quick brown fox jumps over the lazy dog again and again while the app keeps up");
  const killedAt = await crash(l, dirs.userData);
  const onDisk = typedPart(readFileSync(note, "utf8"));
  // At most an earlier part was saved (typing never paused long enough): the journal has more.
  expect(typed.text.startsWith(onDisk)).toBe(true);

  const again = await launch(dirs);
  const restored = typedPart(readFileSync(note, "utf8"));
  // Only a prefix of what was typed, nothing invented or garbled, and only the last second lost.
  expect(typed.text.startsWith(restored)).toBe(true);
  expect(typed.lostMs(restored.length, killedAt)).toBeLessThanOrEqual(LOSS_BUDGET_MS);
  const editor = again.page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText(restored);
  // One calm sentence, not an alarm: an information toast in the polite live region.
  const toast = again.page.getByRole("status").filter({ hasText: "Restored what you were writing in “Welcome to Focus Notes” before Focus Notes closed." });
  await expect(toast).toBeVisible();
  // The journal is emptied once its text is back in the note.
  expect(readFileSync(join(dirs.userData, "recovery-journal.jsonl"), "utf8")).toBe("");
  await quit(again);
  expect(existsSync(join(dirs.userData, "recovery-journal.jsonl"))).toBe(false);
});

test("QLT-03: a note changed while the app was closed keeps both versions, and the notice says where the text went", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, START);
  const l = await launch(dirs);
  await startTyping(l);
  await typeTimed(l.page, "my unsaved thoughts about the plan");
  await crash(l, dirs.userData);
  writeFileSync(note, `${START}\nChanged in another editor.\n`);

  const again = await launch(dirs);
  await expect(again.page.getByRole("status").filter({ hasText: "“Welcome to Focus Notes” changed while Focus Notes was closed, so what you were writing is kept beside it, in “Welcome (recovered)”." })).toBeVisible();
  expect(readFileSync(note, "utf8")).toBe(`${START}\nChanged in another editor.\n`);
  const copy = readFileSync(join(dirs.docs, "Welcome (recovered).md"), "utf8");
  expect("my unsaved thoughts about the plan".startsWith(typedPart(copy))).toBe(true);
  expect(typedPart(copy).length).toBeGreaterThan(0);
  await quit(again);
});

test("QLT-03: a clean quit saves and leaves no journal; Close without saving isn't brought back", async () => {
  test.skip(process.platform !== "win32", "Read-only files block replacing only on Windows");
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, START);
  const l = await launch(dirs);
  await startTyping(l);
  await l.page.keyboard.type("saved on the way out");
  await quit(l);
  expect(typedPart(readFileSync(note, "utf8"))).toBe("saved on the way out");
  expect(existsSync(join(dirs.userData, "recovery-journal.jsonl"))).toBe(false);

  // The note can't be saved; the person chooses to close without saving: the text isn't restored.
  const again = await launch(dirs);
  await startTyping(again);
  await again.page.keyboard.type("throw this away");
  const { chmodSync } = await import("node:fs");
  chmodSync(note, 0o444);
  await again.page.waitForTimeout(1200); // the journal has it
  await again.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await quit(again);
  chmodSync(note, 0o644);
  expect(existsSync(join(dirs.userData, "recovery-journal.jsonl"))).toBe(false);
  const third = await launch(dirs);
  await expect(third.page.getByRole("textbox", { name: "Note" })).toContainText("saved on the way out");
  await expect(third.page.getByRole("textbox", { name: "Note" })).not.toContainText("throw this away");
  await expect(third.page.getByRole("status").filter({ hasText: "Restored" })).toHaveCount(0);
  await quit(third);
});
