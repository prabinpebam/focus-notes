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
/** An item by its words (its name adds its shortcut). */
const item = (page: Page, label: string) => menu(page).getByRole("menuitem", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: (?:Ctrl|Win|Delete)\\b.*)?$`) });
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
      // A field (the find bar): what the browser does to its own selection.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const s = target.selectionStart ?? 0;
        const e = target.selectionEnd ?? 0;
        if (kind === "copy" || kind === "cut") w.__clip = { "text/plain": target.value.slice(s, e) };
        if (kind !== "copy") {
          target.setRangeText(kind === "cut" ? "" : (w.__clip["text/plain"] ?? ""), s, e, "end");
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
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
    // It starts on the first item that does something: with text selected, Rewrite… heads the menu (RWR-72).
    await expect(item(page, "Undo")).toHaveAttribute("aria-disabled", "true");
    await expect(item(page, "Rewrite…")).toBeFocused();
    // Keys: arrows, End, Home, and typeahead.
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Undo")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Cut")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Copy")).toBeFocused();
    await page.keyboard.press("End");
    await expect(item(page, windows ? "Emoji" : "Select all")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(item(page, "Rewrite…")).toBeFocused();
    await page.keyboard.press("s");
    await expect(item(page, "Select all")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    // Focus comes back a frame after the menu unmounts.
    await expect.poll(() => selection(page)).toEqual({ ...before, editor: true });
    // The menu's shortcuts: the platform's, as the other menus write them.
    await openAt(page, word);
    await expect(item(page, "Cut")).toHaveAccessibleName("Cut Ctrl+X");
    await expect(item(page, "Paste as plain text")).toHaveAccessibleName("Paste as plain text Ctrl+Shift+V");
    await expect(item(page, "Redo")).toHaveAccessibleName(/^Redo Ctrl\+Y/);
    await expect(item(page, "Delete")).toHaveAccessibleName(/^Delete Delete/);
    if (windows) await expect(item(page, "Emoji")).toHaveAccessibleName("Emoji Win+.");
    // Its groups have no names made of internal ids.
    expect(await menu(page).getByRole("group").count()).toBeGreaterThan(1);
    for (const g of await menu(page).getByRole("group").all()) expect(await g.getAttribute("aria-label")).toBeNull();
    // Enter on an unavailable item leaves the menu open.
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Undo")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    // Enter chooses: Copy takes the selected word.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Copy")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __clip: Record<string, string> }).__clip["text/plain"] ?? "")).toBe("word");
    // Space chooses: Select all.
    await openAt(page, word);
    await page.keyboard.press("s");
    await expect(item(page, "Select all")).toBeFocused();
    // After typeahead's pause (a space straight after it is part of what's typed).
    await page.waitForTimeout(1_100);
    await page.keyboard.press(" ");
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => getSelection()!.toString())).toContain("One");

    // A right-click elsewhere while it's open closes it, opens nothing else, and gives the text back as it was.
    await selectWord(page, "word");
    const held = await selection(page);
    await openAt(page, word);
    const elsewhere = await wordAt(page, "One");
    await page.mouse.click(elsewhere.x, elsewhere.y, { button: "right" });
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(() => selection(page)).toEqual({ ...held, editor: true });
    await page.waitForTimeout(300);
    await expect(menu(page)).toHaveCount(0);

    // The window losing focus, or a resize, closes it.
    await openAt(page, word);
    await page.evaluate(() => dispatchEvent(new Event("blur")));
    await expect(menu(page)).toHaveCount(0);
    await openAt(page, word);
    await l.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      const [width, height] = w.getSize();
      w.setSize(width! - 40, height!);
    });
    await expect(menu(page)).toHaveCount(0);

    // Copy and Paste as plain text drop the formatting; Paste keeps it.
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
    // The editor must hold the selection before the menu reads it (Cut was disabled on a slow Linux runner).
    await selectWord(page, "cutme");
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

    // Keys still open the app's block menu (D-193): Shift+F10 and the Menu key.
    for (const key of ["Shift+F10", "ContextMenu"]) {
      await editor.focus();
      await page.keyboard.press(key);
      await expect(page.getByRole("menu", { name: /options$/ })).toBeVisible();
      await expect(page.locator("[data-text-menu]")).toHaveCount(0);
      await page.keyboard.press("Escape");
      // The menu gives focus back as it closes; wait, so that can't land after Find takes it (DEF-30).
      await expect(page.getByRole("menu", { name: /options$/ })).toHaveCount(0);
      await expect(editor).toBeFocused();
    }

    // A field keeps its own selection, with its direction: the find bar's Cut takes what was selected there.
    await editor.focus();
    await page.keyboard.press("Control+F");
    const field = page.getByRole("region", { name: "Find in note" }).getByRole("searchbox", { name: "Find" });
    await expect(field).toBeFocused();
    await page.keyboard.type("keep world");
    await page.keyboard.press("End");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
    const inField = await field.evaluate((el: HTMLInputElement) => {
      const cs = getComputedStyle(el);
      const c = document.createElement("canvas").getContext("2d")!;
      c.font = cs.font;
      const b = el.getBoundingClientRect();
      return { x: b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + c.measureText("keep wor").width, y: b.top + b.height / 2 };
    });
    const fieldSelection = () => field.evaluate((el: HTMLInputElement) => ({ start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection, focused: el === document.activeElement }));
    await openAt(page, inField);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(fieldSelection).toEqual({ start: 5, end: 10, direction: "backward", focused: true });
    await openAt(page, inField);
    await choose(page, "Cut");
    await expect(field).toHaveValue("keep ");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __clip: Record<string, string> }).__clip["text/plain"] ?? "")).toBe("world");
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

test("D-204: suggestions that come after the menu opened fill it in, are announced, and take focus if its item went", async () => {
  test.skip(!windows, "only Windows asks the OS spell checker after the menu has opened");
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Spelling\n\nA mistaek here.\n");
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    mkdirSync(shots, { recursive: true });
    // A slow spell checker: the word under the pointer is named late, and the answer reaches the page a
    // second after the menu. With `__noSuggestions`, it has none.
    await l.app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0]!.webContents;
      type Send = (this: Electron.WebContents, channel: string, ...args: unknown[]) => void;
      const proto = Object.getPrototypeOf(wc) as { send: Send };
      const send = proto.send;
      const g = globalThis as { __noSuggestions?: boolean };
      proto.send = function (channel, ...args) {
        if (channel === "spelling:target") {
          setTimeout(() => send.call(this, channel, ...args), 100);
          return;
        }
        const m = args[0] as { entries?: { kind: string }[] } | undefined;
        if (channel === "textMenu:open" && m?.entries && !m.entries.some((e) => e.kind === "checking")) {
          const entries = g.__noSuggestions && m.entries.some((e) => e.kind === "suggestion") ? [{ kind: "noSuggestions" }, ...m.entries.filter((e) => e.kind !== "suggestion")] : m.entries;
          setTimeout(() => send.call(this, channel, { ...m, entries }), 1_000);
          return;
        }
        send.call(this, channel, ...args);
      };
    });
    const at = await wordAt(page, "mistaek");
    // The OS's checker starts on the first right-click: open until it answers.
    await expect
      .poll(async () => {
        if (await menu(page).count()) await page.keyboard.press("Escape");
        await openAt(page, at);
        await page.waitForTimeout(2_000);
        return (await menu(page).textContent()) ?? "";
      }, { timeout: 30_000 })
      .toContain("Add to dictionary");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await openAt(page, at);
    await expect(item(page, "Checking spelling…")).toHaveAttribute("aria-disabled", "true");
    // D-208: a shimmering placeholder where the suggestion will be, beside the words, and hidden from screen readers.
    await expect(item(page, "Checking spelling…").locator('[data-shimmer][aria-hidden="true"]')).toHaveCount(1);
    await page.screenshot({ path: join(shots, "text-menu-checking.png") });
    // Focus is on the item the answer takes away: it moves to the first suggestion, and they're announced.
    await page.keyboard.press("Home");
    await expect(item(page, "Checking spelling…")).toBeFocused();
    await expect(item(page, "mistake")).toBeFocused();
    await expect(page.locator('[role="status"]').filter({ hasText: /^\d+ spelling suggestions?$/ })).toHaveCount(1);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: join(shots, "text-menu-suggestions.png") });
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    // No suggestions: said so, and unavailable.
    await l.app.evaluate(() => ((globalThis as { __noSuggestions?: boolean }).__noSuggestions = true));
    await openAt(page, at);
    await expect(item(page, "No suggestions")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator('[role="status"]').filter({ hasText: "No spelling suggestions" })).toHaveCount(1);
    await page.screenshot({ path: join(shots, "text-menu-no-suggestions.png") });
    await page.keyboard.press("Escape");
  } finally {
    await quit(l);
  }
});

test("D-204: the menu in Ink with a custom accent and a visible keyboard focus, and in forced colors", async () => {
  test.skip(mac, "macOS shows the system's menu");
  const dirs = tempDirs();
  // A workspace with a private side, where the person's own themes live (as m8-custom-themes sets it up).
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  writeFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "# Themes\n\nOne word here.\n");
  const themes = join(dirs.docs, "private", ".focus-notes", "themes");
  mkdirSync(themes, { recursive: true });
  writeFileSync(join(themes, "ink-orchid.json"), JSON.stringify({ name: "Ink orchid", kind: "dark", base: "ink", tokens: { "color.accent": "#e879f9" } }));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "dark", focusMode: false, darkTheme: "custom:ink-orchid" }));
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-accent").trim().toLowerCase()), PROMPTLY).toBe("#e879f9");
    mkdirSync(shots, { recursive: true });
    const word = await wordAt(page, "word");
    const focused = menu(page).locator('[role="menuitem"][data-focus-visible]');
    await openAt(page, word);
    await page.keyboard.press("ArrowDown");
    await expect(focused).toHaveCount(1);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: join(shots, "text-menu-ink-accent.png") });
    await page.keyboard.press("Escape");

    // Forced colors: the focused item in the system's highlight, unavailable ones in GrayText.
    await page.emulateMedia({ forcedColors: "active" });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-canvas").trim())).toBe("Canvas");
    const system = await page.evaluate(() => {
      const p = document.createElement("div");
      p.style.cssText = "forced-color-adjust: none; background-color: Highlight; color: GrayText";
      document.body.append(p);
      const cs = getComputedStyle(p);
      const r = { highlight: cs.backgroundColor, gray: cs.color };
      p.remove();
      return r;
    });
    await openAt(page, word);
    await page.keyboard.press("ArrowDown");
    await expect(focused).toHaveCSS("background-color", system.highlight);
    const undo = item(page, "Undo");
    await expect(undo).toHaveAttribute("aria-disabled", "true");
    await expect(undo.getByText("Undo", { exact: true })).toHaveCSS("color", system.gray);
    await expect(undo.locator("kbd")).toHaveCSS("color", system.gray);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: join(shots, "text-menu-forced-colors.png") });
    await page.keyboard.press("Escape");
  } finally {
    await quit(l);
  }
});
