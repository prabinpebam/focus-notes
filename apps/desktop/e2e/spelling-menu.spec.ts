/**
 * D-193, D-204, EDT-14: a right-click in text opens the menu built from one model on every platform:
 * the OS spell checker's suggestions and Add to dictionary, then Undo and Redo (the editor's history),
 * Cut, Copy, Paste, Paste as plain text, Delete, Select all, the platform's own items, and a link's.
 * On Windows and Linux the app draws it in the theme (TextMenu), so a journey reads it in the page.
 * On macOS it's the system's menu, which a journey reads from the app's log rather than opening a
 * native menu over the owner's screen (D-141); the emoji panel and the browser are logged too.
 * On Windows, where Electron reports no misspelled word, the menu comes from asking the OS's spell
 * checker. Linux's Chromium spell checker downloads its dictionaries, which the app blocks, so Linux
 * checks the edit items only.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, PROMPTLY, type Launched } from "./helpers.ts";
import { scheme } from "./surfaces.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const windows = process.platform === "win32";
const shots = join(import.meta.dirname, "../../../test-results/screens");

/** The middle of a word in the note, on screen. */
const wordAt = (page: Page, word: string) =>
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

const menu = (page: Page) => page.locator("[data-text-menu]").getByRole("menu");
/** An item by its words (its name adds its keys, read aloud). */
const item = (page: Page, label: string) => menu(page).getByRole("menuitem", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: (?:Ctrl|Win|Del)\\b.*)?$`) });
async function openAt(page: Page, at: { x: number; y: number }) {
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu(page)).toBeVisible();
}
async function choose(page: Page, label: string) {
  await item(page, label).click();
  await expect(page.locator("[data-text-menu]")).toHaveCount(0);
}
/** Selects a word in the note, as a double-click does, and waits until the editor has it. */
async function selectWord(page: Page, word: string) {
  const editor = page.locator("[data-editor]");
  if (!(await editor.evaluate((el) => el === document.activeElement))) await editor.focus();
  // The editor puts its own selection back as it takes focus: select until the word holds.
  await expect
    .poll(async () => {
      await page.evaluate((word) => {
        const walker = document.createTreeWalker(document.querySelector("[data-editor]")!, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const i = n.textContent!.indexOf(word);
          if (i < 0) continue;
          getSelection()!.setBaseAndExtent(n, i, n, i + word.length);
          return;
        }
      }, word);
      await page.waitForTimeout(100);
      return page.evaluate(() => getSelection()!.toString());
    }, PROMPTLY)
    .toBe(word);
}
const selection = (page: Page) => page.evaluate(() => {
  const s = getSelection()!;
  return { text: s.toString(), anchor: s.anchorOffset, focus: s.focusOffset, editor: document.activeElement?.hasAttribute("data-editor") ?? false };
});
/**
 * The computer's clipboard is never touched (D-141): main's cut, copy, paste and paste-and-match-style
 * still run from the menu, but play the events the browser would fire on a clipboard kept in the page,
 * so the editor answers them as it does for the real thing (plain text only for paste-and-match-style).
 * Paste is offered in editable text, as it is when the computer's clipboard holds something.
 */
async function clipboardInPage(l: Launched) {
  await l.page.evaluate(() => {
    const w = window as unknown as { __clip: Record<string, string>; __clipboard: (kind: string) => void };
    w.__clip = {};
    w.__clipboard = (kind) => {
      const dt = new DataTransfer();
      if (kind === "paste" || kind === "pasteAndMatchStyle") for (const [t, v] of Object.entries(w.__clip)) if (kind === "paste" || t === "text/plain") dt.setData(t, v);
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new ClipboardEvent(kind === "pasteAndMatchStyle" ? "paste" : kind, { clipboardData: dt, bubbles: true, cancelable: true }));
      if (kind === "copy" || kind === "cut") w.__clip = Object.fromEntries([...dt.types].map((t) => [t, dt.getData(t)]));
    };
  });
  await l.app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents;
    // Whether there's something to paste is the page clipboard's say, not the computer's.
    wc.prependListener("context-menu", (_e, p) => {
      if (p.isEditable) p.editFlags.canPaste = true;
    });
    const proto = Object.getPrototypeOf(wc) as Record<string, unknown>;
    for (const kind of ["cut", "copy", "paste", "pasteAndMatchStyle"]) {
      proto[kind] = function (this: Electron.WebContents) {
        void this.executeJavaScript(`window.__clipboard(${JSON.stringify(kind)})`);
      };
    }
  });
}
const logged = (l: Launched, line: string) => expect.poll(() => l.log.some((x) => x.includes(line)), PROMPTLY).toBe(true);

test("D-193, D-204: right-clicking a misspelled word offers the OS spell checker's suggestions, then the edit actions", async () => {
  test.skip(process.platform === "linux", "the OS spell checker is Windows' and macOS'");
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Spelling\n\n");
  const l = await launch(dirs);
  try {
    const { page, log } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();
    await page.keyboard.press(caret.docEnd);
    await page.keyboard.press("Enter");
    await page.keyboard.type("Thsi sentence has a mistaek in it. ");
    const menus = () => log.filter((x) => x.includes("[focus-notes] context-menu "));

    // The spell checker marks words as it gets to them: right-click until the word is known to be wrong.
    // On macOS, a word right-clicked (and so selected) before Chromium's idle check has reached it stays
    // unchecked, and the page has no sign of the check, so the journey waits for it, as a person waits
    // for the underline before right-clicking.
    const at = await wordAt(page, "mistaek");
    if (mac) {
      await page.waitForTimeout(2_000);
      await expect
        .poll(async () => {
          await page.mouse.click(at.x, at.y, { button: "right" });
          return menus().at(-1) ?? "";
        }, PROMPTLY)
        .toContain("Learn Spelling");
      const native = menus().at(-1)!;
      expect(native).toMatch(/context-menu (?!No Guesses)\S.* \| - \| Learn Spelling \| - \| Look Up “mistaek” \| - \| Undo \| Redo \| - \| role:cut \| role:copy \| role:paste \| role:pasteAndMatchStyle \| role:delete \| - \| role:selectAll \| - \| Speech\[role:startSpeaking, role:stopSpeaking\] \| - \| Emoji && Symbols$/);
      expect(native.toLowerCase()).toContain("mistake");
      const click = (label: string) => l.app.evaluate((_e, label) => {
        const items = (globalThis as { __focusNotesLastMenu?: { label?: string; click?: () => void }[] }).__focusNotesLastMenu ?? [];
        items.find((i) => i.label === label)!.click!();
      }, label);
      await click("mistake");
      await expect(editor).toContainText("Thsi sentence has a mistake in it.");
      // Undo and Redo in the menu run the editor's history; Emoji & Symbols opens the system's panel (logged).
      await click("Undo");
      await expect(editor).toContainText("has a mistaek in it.");
      await click("Redo");
      await expect(editor).toContainText("has a mistake in it.");
      await click("Emoji && Symbols");
      await logged(l, "[focus-notes] emoji-panel");
    } else {
      // The menu shows at once; the OS's answer fills in the suggestions when it comes.
      await expect
        .poll(async () => {
          if (await menu(page).count()) await page.keyboard.press("Escape");
          await openAt(page, at);
          await page.waitForTimeout(400);
          return (await menu(page).textContent()) ?? "";
        }, PROMPTLY)
        .toContain("Add to dictionary");
      const words = (await menu(page).textContent())!;
      expect(words).toMatch(/^mistake.*Add to dictionary.*Undo.*Redo.*Cut.*Copy.*Paste.*Paste as plain text.*Delete.*Select all.*Emoji/s);
      await expect(item(page, "Cut")).toHaveAttribute("aria-disabled", "true");
      await expect(item(page, "Add to dictionary")).not.toHaveAttribute("aria-disabled", "true");
      await choose(page, "mistake");
      await expect(editor).toContainText("Thsi sentence has a mistake in it.");
      await expect(editor).toBeFocused();
    }
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toContain("a mistake in it.");
    await page.keyboard.press(mac ? "Meta+Z" : "Control+Z");
    await expect(editor).toContainText("has a mistaek in it.");
    await page.keyboard.press(mac ? "Meta+Shift+Z" : "Control+Y");
    await expect(editor).toContainText("has a mistake in it.");

    if (!mac) {
      // Add to dictionary: main learns the word the menu named.
      const odd = await wordAt(page, "Thsi");
      await expect
        .poll(async () => {
          if (await menu(page).count()) await page.keyboard.press("Escape");
          await openAt(page, odd);
          await page.waitForTimeout(400);
          return (await menu(page).textContent()) ?? "";
        }, PROMPTLY)
        .toContain("Add to dictionary");
      // The session's dictionary is stood in for, so the computer's own dictionary is never written to.
      await l.app.evaluate(({ session }) => {
        const g = globalThis as { __learned?: string[] };
        g.__learned = [];
        // On the sessions' prototype: each webContents.session is its own wrapper.
        Object.getPrototypeOf(session.defaultSession).addWordToSpellCheckerDictionary = (w: string) => (g.__learned!.push(w), true);
      });
      await choose(page, "Add to dictionary");
      await expect.poll(() => l.app.evaluate(() => (globalThis as { __learned?: string[] }).__learned), PROMPTLY).toEqual(["Thsi"]);
      await expect(editor).toBeFocused();
    }

    // A word spelled right: no spelling items.
    const right = await wordAt(page, "sentence");
    if (mac) {
      const before = menus().length;
      await page.mouse.click(right.x, right.y, { button: "right" });
      await expect.poll(() => menus().length, PROMPTLY).toBe(before + 1);
      expect(menus().at(-1)).toMatch(/context-menu (Look Up “sentence” \| - \| )?Undo \| Redo \| - \| role:cut/);
    } else {
      await openAt(page, right);
      await page.waitForTimeout(400);
      expect((await menu(page).textContent())!).toMatch(/^Undo/);
      await page.keyboard.press("Escape");
    }
  } finally {
    await quit(l);
  }
});

test("D-204: the menu in text is the app's own on Windows and Linux: its edit actions, keys, focus, and themes", async () => {
  test.skip(mac, "macOS shows the system's menu");
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Edit\n\nOne **bold** word and a [site](https://example.com/) here zap\n");
  const l = await launch(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  try {
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();
    mkdirSync(shots, { recursive: true });
    await clipboardInPage(l);

    // Themes, checked with axe and seen in light, dark, and Sepia.
    const word = await wordAt(page, "word");
    for (const want of ["light", "dark"] as const) {
      await scheme(page, want);
      await openAt(page, word);
      expect(await axeViolations(page)).toEqual([]);
      await page.screenshot({ path: join(shots, `text-menu-${want}.png`) });
      await page.keyboard.press("Escape");
      await expect(menu(page)).toHaveCount(0);
    }
    await scheme(page, "light");

    // Esc closes it, and the caret and selection go back exactly as they were.
    await selectWord(page, "word");
    const before = await selection(page);
    await openAt(page, word);
    // Nothing to undo yet: it starts on the first item that does something.
    await expect(item(page, "Undo")).toHaveAttribute("aria-disabled", "true");
    await expect(item(page, "Cut")).toBeFocused();
    // Keys: arrows, End, Home, and typeahead.
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Copy")).toBeFocused();
    await page.keyboard.press("End");
    await expect(item(page, windows ? "Emoji" : "Select all")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(item(page, "Undo")).toBeFocused();
    await page.keyboard.press("s");
    await expect(item(page, "Select all")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    // Focus comes back a frame after the menu unmounts.
    await expect.poll(() => selection(page)).toEqual({ ...before, editor: true });
    // The menu's keys: the platform's, as key caps.
    await openAt(page, word);
    await expect(item(page, "Cut")).toHaveAccessibleName("Cut Ctrl X");
    await expect(item(page, "Paste as plain text")).toHaveAccessibleName("Paste as plain text Ctrl Shift V");
    await expect(item(page, "Redo")).toHaveAccessibleName(/^Redo Ctrl Y/);

    // Copy and Paste as plain text drop the formatting; Paste keeps it.
    await page.keyboard.press("Escape");
    const bold = await wordAt(page, "bold");
    await selectWord(page, "bold");
    await openAt(page, bold);
    await choose(page, "Copy");
    const zap = await wordAt(page, "zap");
    await selectWord(page, "zap");
    await openAt(page, zap);
    await choose(page, "Paste as plain text");
    await expect(editor).toContainText("here bold");
    await expect(editor.locator("strong", { hasText: "bold" })).toHaveCount(1);
    await page.keyboard.type(" ");
    const end = await wordAt(page, "here bold");
    await openAt(page, { x: end.x + 200, y: end.y });
    await choose(page, "Paste");
    await expect(editor.locator("strong", { hasText: "bold" })).toHaveCount(2);

    // Cut takes the selection; Delete removes it; Undo and Redo through the menu bring it back and take it again.
    const one = await wordAt(page, "One");
    await selectWord(page, "One");
    await openAt(page, one);
    await choose(page, "Delete");
    await expect(editor).not.toContainText("One ");
    await page.waitForTimeout(400);
    const near = await wordAt(page, "word");
    await openAt(page, near);
    await expect(item(page, "Undo")).not.toHaveAttribute("aria-disabled", "true");
    await choose(page, "Undo");
    await expect(editor).toContainText("One bold word");
    await page.waitForTimeout(400);
    await openAt(page, near);
    await choose(page, "Redo");
    await expect(editor).not.toContainText("One bold word");
    await page.keyboard.press(caret.docEnd);
    await page.keyboard.type(" cutme");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
    const cut = await wordAt(page, "cutme");
    await openAt(page, cut);
    await choose(page, "Cut");
    await expect(editor).not.toContainText("cutme");
    await openAt(page, near);
    await expect(item(page, "Cut")).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    // A link: Copy link copies its address; Open link goes through the app's guarded link opening (logged in a journey).
    const site = await wordAt(page, "site");
    await openAt(page, site);
    await choose(page, "Copy link");
    await expect.poll(() => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? ""), PROMPTLY).toBe("https://example.com/");
    await openAt(page, site);
    await choose(page, "Open link");
    await logged(l, "[focus-notes] open-link https://example.com/");

    // Windows' emoji panel (logged in a journey, so nothing opens over the owner's screen).
    if (windows) {
      await openAt(page, near);
      await choose(page, "Emoji");
      await logged(l, "[focus-notes] emoji-panel");
    }

    // A click or a wheel outside it closes it.
    await openAt(page, near);
    await page.mouse.click(5, 300);
    await expect(menu(page)).toHaveCount(0);
    await openAt(page, near);
    await page.mouse.move(5, 300);
    await page.mouse.wheel(0, 200);
    await expect(menu(page)).toHaveCount(0);

    // Keys still open the app's block menu (D-193).
    await editor.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu", { name: /options$/ })).toBeVisible();
    await expect(page.locator("[data-text-menu]")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Another theme: Sepia.
    await page.keyboard.press(`Control+.`);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Light theme" }).click();
    await page.getByRole("menu", { name: "Light theme" }).getByRole("menuitemradio", { name: "Sepia" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("sepia");
    await page.keyboard.press("Escape");
    await editor.focus();
    await openAt(page, await wordAt(page, "word"));
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: join(shots, "text-menu-sepia.png") });
    await page.keyboard.press("Escape");
  } finally {
    await quit(l);
  }
});
