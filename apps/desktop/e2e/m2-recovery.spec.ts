/**
 * M2 journeys for crash recovery (WP-2.6, WP-8.9; QLT-03, QLT-06): a crash while typing loses at
 * most about a second, and the next launch puts the text back in the editor as unsaved edits with a
 * calm notice, written to the note only by the app's normal save; a note changed while the app was
 * closed opens the resolver with both versions instead of a copy beside it; a clean quit saves and
 * leaves no draft; and Close without saving means the text isn't brought back.
 */
import { test, expect } from "./fixtures.ts";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, PROMPTLY, quit, tempDirs, type Launched } from "./helpers.ts";
import { crash, draftAhead, LOSS_BUDGET_MS, readDrafts, START, typedPart, typeTimed } from "./recovery.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function startTyping(l: Launched) {
  const editor = l.page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await l.page.keyboard.press(`${mod}+End`);
  await l.page.keyboard.press("Enter");
  return editor;
}

/** Types until the draft store has text the note doesn't, then crashes; again from scratch if the save caught up first (DEF-19). */
async function crashWhileTyping(text: string) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const dirs = tempDirs();
    const note = join(dirs.docs, "Welcome.md");
    writeFileSync(note, START);
    const l = await launch(dirs);
    await startTyping(l);
    const typed = await typeTimed(l.page, text, { until: () => draftAhead(dirs.userData, dirs.docs, note) });
    const killedAt = await crash(l, dirs.userData);
    if (draftAhead(dirs.userData, dirs.docs, note)) return { dirs, note, typed, killedAt };
    console.log(`[m2-recovery] attempt ${attempt}: the save caught up before the crash, so nothing to restore; again`);
  }
  throw new Error("In 5 attempts the crash never landed with unsaved text in the draft store");
}

test("QLT-03: a crash while typing loses at most about a second, and the next launch restores it with a calm notice", async () => {
  const { dirs, note, typed, killedAt } = await crashWhileTyping("the quick brown fox jumps over the lazy dog again and again while the app keeps up, and on, and on, as long as it takes");
  const crashedDisk = readFileSync(note, "utf8");
  const onDisk = typedPart(crashedDisk);
  // At most an earlier part was saved: the draft has more.
  expect(typed.text.startsWith(onDisk)).toBe(true);

  const again = await launch(dirs);
  // The recovered text is in the editor as unsaved edits; the app's normal save then writes it (R2).
  await expect.poll(() => readFileSync(note, "utf8") !== crashedDisk, PROMPTLY).toBe(true);
  const restored = typedPart(readFileSync(note, "utf8"));
  // Only a prefix of what was typed, nothing invented or garbled, and only the last second lost.
  expect(typed.text.startsWith(restored)).toBe(true);
  expect(restored.length).toBeGreaterThan(onDisk.length);
  const lostMs = typed.lostMs(restored.length, killedAt);
  console.log(`[m2-recovery] lost ${lostMs} ms of typing`);
  expect(lostMs).toBeLessThanOrEqual(LOSS_BUDGET_MS);
  const editor = again.page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText(restored);
  // One calm sentence, not an alarm: an information toast in the polite live region.
  const toast = again.page.getByRole("status").filter({ hasText: "Restored what you were writing in “Welcome to Focus Notes”." });
  await expect(toast).toBeVisible();
  // Nothing else was written to the workspace, and the draft goes once the save covers it.
  expect(readdirSync(dirs.docs).filter((n) => !n.startsWith("."))).toEqual(["Welcome.md"]);
  await expect.poll(() => readDrafts(dirs.userData, dirs.docs).length, PROMPTLY).toBe(0);
  await quit(again);
  expect(readDrafts(dirs.userData, dirs.docs)).toEqual([]);
});

test("QLT-03, QLT-06: a note changed while the app was closed opens the resolver with Recovered and On disk; nothing is written until a choice", async () => {
  const { dirs, note } = await crashWhileTyping("my unsaved thoughts about the plan and what comes after it, which keep coming");
  const kept = readDrafts(dirs.userData, dirs.docs)[0]!;
  writeFileSync(note, `${START}\nChanged in another editor.\n`);

  const again = await launch(dirs);
  const { page } = again;
  await expect(page.getByRole("status").filter({ hasText: "“Welcome to Focus Notes” changed while Focus Notes was closed. Compare to keep what you need." })).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /changed while Focus Notes was closed/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Recovered" })).toContainText(typedPart(kept.text));
  await expect(dialog.getByRole("region", { name: "On disk" })).toContainText("Changed in another editor.");
  // Saves wait for the choice: the note is as the other editor left it, and no copy appears beside it.
  await page.waitForTimeout(1500);
  expect(readFileSync(note, "utf8")).toBe(`${START}\nChanged in another editor.\n`);
  expect(readdirSync(dirs.docs).filter((n) => !n.startsWith("."))).toEqual(["Welcome.md"]);
  // The draft is still kept: nothing is lost before the person chooses.
  expect(readDrafts(dirs.userData, dirs.docs).map((d) => d.header.draft)).toEqual([kept.header.draft]);
  await again.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await quit(again);
});

test("QLT-03: a clean quit saves and leaves no draft; Close without saving isn't brought back", async () => {
  test.skip(process.platform !== "win32", "Read-only files block replacing only on Windows");
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, START);
  const l = await launch(dirs);
  await startTyping(l);
  await l.page.keyboard.type("saved on the way out");
  await quit(l);
  expect(typedPart(readFileSync(note, "utf8"))).toBe("saved on the way out");
  expect(readDrafts(dirs.userData, dirs.docs)).toEqual([]);

  // The note can't be saved; the person chooses to close without saving: the text isn't restored.
  const again = await launch(dirs);
  await startTyping(again);
  await again.page.keyboard.type("throw this away");
  const { chmodSync } = await import("node:fs");
  chmodSync(note, 0o444);
  // The draft store has it (the note can't take it), so closing without saving has something to drop.
  await expect.poll(() => draftAhead(dirs.userData, dirs.docs, note), PROMPTLY).toBe(true);
  await again.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await quit(again);
  chmodSync(note, 0o644);
  expect(readDrafts(dirs.userData, dirs.docs)).toEqual([]);
  const third = await launch(dirs);
  await expect(third.page.getByRole("textbox", { name: "Note" })).toContainText("saved on the way out");
  await expect(third.page.getByRole("textbox", { name: "Note" })).not.toContainText("throw this away");
  await expect(third.page.getByRole("status").filter({ hasText: "Restored" })).toHaveCount(0);
  await quit(third);
});