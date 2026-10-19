/**
 * D-193: a misspelled word is underlined by the OS spell checker, and right-clicking it opens the OS's
 * menu with its suggestions, "Add to dictionary" and the edit actions. A journey reads the menu from
 * the app's log rather than opening a native menu over the owner's screen (D-141).
 * On Windows, where Electron reports no misspelled word, the menu comes from asking the OS's spell checker.
 * Windows and macOS only: Linux's Chromium spell checker downloads its dictionaries, which the app blocks.
 */
import { test, expect } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, PROMPTLY } from "./helpers.ts";

test.skip(process.platform === "linux", "the OS spell checker is Windows' and macOS'");

/** The middle of a word in the note, on screen. */
const wordAt = (page: import("./fixtures.ts").Page, word: string) =>
  page.evaluate((word) => {
    const walker = document.createTreeWalker(document.querySelector("[data-editor]")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(word);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + word.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    throw new Error(`"${word}" isn't on screen`);
  }, word);

test("D-193: right-clicking a misspelled word offers the OS spell checker's suggestions and the edit actions", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Spelling\n\n");
  const l = await launch(dirs);
  try {
    const { page, log } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Thsi sentence has a mistaek in it. ");
    const menus = () => log.filter((x) => x.includes("[focus-notes] context-menu "));

    // The spell checker marks words as it gets to them: right-click until the word is known to be wrong.
    const at = await wordAt(page, "mistaek");
    await expect
      .poll(async () => {
        await page.mouse.click(at.x, at.y, { button: "right" });
        return menus().at(-1) ?? "";
      }, PROMPTLY)
      .toContain("Add to dictionary");
    const menu = menus().at(-1)!;
    expect(menu).toMatch(/context-menu (?!No suggestions)\S.* \| - \| Add to dictionary \| - \| role:cut \| role:copy \| role:paste \| - \| role:selectAll$/);
    expect(menu.toLowerCase()).toContain("mistake");

    // Choosing a suggestion puts it in place as typing: the note changes, saves, and undoes.
    await l.app.evaluate(() => {
      const items = (globalThis as { __focusNotesLastMenu?: { label?: string; click?: () => void }[] }).__focusNotesLastMenu ?? [];
      items.find((i) => i.label === "mistake")!.click!();
    });
    await expect(editor).toContainText("Thsi sentence has a mistake in it.");
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toContain("a mistake in it.");
    await page.keyboard.press("Control+Z");
    await expect(editor).toContainText("has a mistaek in it.");
    await page.keyboard.press("Control+Y");
    await expect(editor).toContainText("has a mistake in it.");

    // A word spelled right: the edit actions only.
    const right = await wordAt(page, "sentence");
    const before = menus().length;
    await page.mouse.click(right.x, right.y, { button: "right" });
    await expect.poll(() => menus().length, PROMPTLY).toBe(before + 1);
    expect(menus().at(-1)).toMatch(/context-menu role:cut \| role:copy \| role:paste \| - \| role:selectAll$/);
  } finally {
    await quit(l);
  }
});
