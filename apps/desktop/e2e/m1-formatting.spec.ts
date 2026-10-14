/**
 * WP-1.2 journeys: inline formatting (EDT-03), the contextual formatting toolbar (EDT-12), the link
 * editor and hover card (EDT-13), and formatting UI that shows only in context (UI-06).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";

/** The on-screen box of a word in the note. */
async function wordBox(page: Page, word: string, nth = 0) {
  return page.evaluate(({ word, nth }) => {
    const root = document.querySelector("[data-editor]")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let seen = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let i = n.textContent!.indexOf(word);
      while (i >= 0) {
        if (seen++ === nth) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + word.length);
          const b = r.getBoundingClientRect();
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, x: b.left + b.width / 2, y: b.top + b.height / 2 };
        }
        i = n.textContent!.indexOf(word, i + 1);
      }
    }
    throw new Error(`"${word}" isn't on screen`);
  }, { word, nth });
}

/** Selects a word by dragging across it, as a person does with the mouse. */
async function dragSelect(page: Page, word: string) {
  const b = await wordBox(page, word);
  await page.mouse.move(b.left + 1, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.move(b.right - 1, b.y, { steps: 3 });
  await page.mouse.up();
}

/** Waits for an element's entrance fade, so contrast is checked on what people finally see. */
const settled = (l: Locator) => l.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));

const selectionText = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? "");

async function start(markdown: string): Promise<Launched & { note: string; saved: () => string }> {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, markdown);
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  return { ...l, note, saved: () => readFileSync(note, "utf8") };
}

test("EDT-12, EDT-03: a selection shows the toolbar above it, and each button toggles its mark", async () => {
  const l = await start("Bold italic strike code link end.\n\nA second paragraph keeps room below.\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(toolbar).toBeHidden();

  await dragSelect(page, "Bold");
  await expect(toolbar).toBeVisible();
  // It never covers the selection: the whole toolbar is above the word, with a gap.
  const word = await wordBox(page, "Bold");
  const box = (await toolbar.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(word.top);
  expect(Math.abs(box.x + box.width / 2 - word.x)).toBeLessThan(box.width / 2);
  await expect(toolbar.getByRole("button", { name: "Turn into: Text" })).toBeVisible();
  for (const name of ["Bold", "Italic", "Strikethrough", "Inline code"]) await expect(toolbar.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(toolbar.getByRole("button", { name: "Link" })).toBeVisible();
  await page.screenshot({ path: "../../test-results/screens/format-toolbar.png" });

  // Each click is a toggle: pressed, the text formatted, and the caret still in the note.
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator("strong")).toHaveText("Bold");
  await expect(editor).toBeFocused();
  expect(await selectionText(page)).toBe("Bold");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(editor.locator("strong")).toHaveCount(0);
  await bold.click();
  // Bold widens the word, so the next word is measured only once it's applied.
  await expect(editor.locator("strong")).toHaveText("Bold");

  for (const [w, name, tag] of [["italic", "Italic", "em"], ["strike", "Strikethrough", "s"], ["code", "Inline code", "code"]] as const) {
    await dragSelect(page, w);
    // The toolbar follows the new selection, with none of its marks, before a button is pressed.
    for (const mark of ["Bold", "Italic", "Strikethrough", "Inline code"]) await expect(toolbar.getByRole("button", { name: mark, exact: true })).toHaveAttribute("aria-pressed", "false");
    const button = toolbar.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(editor.locator(tag)).toHaveText(w);
  }

  // A selection that's only partly bold shows Bold half-pressed.
  const b = await wordBox(page, "Bold");
  const i = await wordBox(page, "italic");
  await page.mouse.move(b.left + 1, b.y);
  await page.mouse.down();
  await page.mouse.move(i.right - 1, i.y, { steps: 5 });
  await page.mouse.up();
  await expect(bold).toHaveAttribute("aria-pressed", "mixed");
  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();

  // Link: the toolbar turns into the link editor in the same spot.
  await dragSelect(page, "link");
  await toolbar.getByRole("button", { name: "Link" }).click();
  const linkEditor = page.getByRole("region", { name: "Link editor" });
  await expect(linkEditor).toBeVisible();
  await expect(toolbar).toBeHidden();
  await expect(linkEditor.getByRole("textbox", { name: "Link address" })).toBeFocused();
  await page.keyboard.type("example.com");
  await page.keyboard.press("Enter");
  await expect(linkEditor).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("link");

  await expect.poll(l.saved, { timeout: 5000 }).toBe(
    "**Bold** *italic* ~~strike~~ `code` [link](https://example.com) end.\n\nA second paragraph keeps room below.\n",
  );
  await quit(l);
});

test("EDT-12: Alt+F10 moves into the toolbar, arrows move, Esc returns with the selection kept, Turn into changes the block", async () => {
  const l = await start("# Notes\n\nFirst line of text.\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
  // A keyboard selection: Shift+Home from the end of the line.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press(caret.selectToLineStart);
  await expect(toolbar).toBeVisible();
  // Opening it doesn't move focus.
  await expect(editor).toBeFocused();
  await settled(toolbar);
  expect(await axeViolations(page)).toEqual([]);

  await page.keyboard.press("Alt+F10");
  const turnInto = toolbar.getByRole("button", { name: "Turn into: Text" });
  await expect(turnInto).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Bold", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(toolbar.getByRole("button", { name: "Link" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(turnInto).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(toolbar.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Activated from the keyboard, focus stays in the toolbar.
  await expect(toolbar.getByRole("button", { name: "Bold", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  expect(await selectionText(page)).toBe("First line of text.");

  // Back in, focus returns to the control used last; Home goes to Turn into.
  await page.keyboard.press("Alt+F10");
  await expect(toolbar.getByRole("button", { name: "Bold", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(turnInto).toBeFocused();
  // Turn into: ↓ opens the menu, the current type is checked, and choosing one changes the block.
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Turn into: Text" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemcheckbox", { name: /^Text/ })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "../../test-results/screens/format-turn-into.png" });
  await menu.getByRole("menuitemcheckbox", { name: /^Heading 2/ }).click();
  await expect(editor.locator("h2")).toHaveText("First line of text.");
  await expect(toolbar.getByRole("button", { name: "Turn into: Heading 2" })).toBeVisible();
  // The menu hands focus back to the note once it has closed.
  await expect(editor).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press(caret.lineEnd);
  await expect(toolbar).toBeHidden();
  await expect.poll(l.saved, { timeout: 5000 }).toBe("# Notes\n\n## **First line of text.**\n");
  await quit(l);
});

test("UI-06: the toolbar shows only for a selection and leaves when it's not needed", async () => {
  const l = await start("Alpha beta gamma delta.\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const toolbar = page.getByRole("toolbar", { name: "Text formatting" });

  // Typing never shows it.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(" More words.");
  await page.waitForTimeout(500);
  await expect(toolbar).toBeHidden();

  // A collapsed selection hides it at once.
  await dragSelect(page, "beta");
  await expect(toolbar).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar).toBeHidden();

  // Typing over a selection hides it.
  await dragSelect(page, "gamma");
  await expect(toolbar).toBeVisible();
  await page.keyboard.type("G");
  await expect(toolbar).toBeHidden();
  await expect(editor).toContainText("Alpha beta G delta.");

  // Esc hides it and keeps the selection, until the selection changes.
  await dragSelect(page, "delta");
  await expect(toolbar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();
  expect(await selectionText(page)).toBe("delta");
  await page.waitForTimeout(500);
  await expect(toolbar).toBeHidden();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(toolbar).toBeVisible();

  // The find bar takes over.
  await page.keyboard.press(`${mod}+f`);
  await expect(page.getByRole("region", { name: "Find in note" })).toBeVisible();
  await expect(toolbar).toBeHidden();
  await quit(l);
});

test("EDT-13: Mod+K edits links in place; the hover card opens, copies, edits, and removes", async () => {
  const l = await start("# Links\n\nRead the docs and the guide today.\n\nMore text below the line.\n");
  const { page, app } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  // The shell's side is recorded instead of opening a browser or touching the real clipboard.
  type Spy = { opened: string[]; copied: string[] };
  await app.evaluate(({ shell, clipboard }) => {
    const spy = globalThis as unknown as Spy;
    spy.opened = [];
    spy.copied = [];
    shell.openExternal = async (url: string) => { spy.opened.push(url); };
    clipboard.writeText = (text: string) => { spy.copied.push(text); };
  });
  const opened = () => app.evaluate(() => (globalThis as unknown as Spy).opened);
  const copied = () => app.evaluate(() => (globalThis as unknown as Spy).copied);

  // Mod+K with a selection: the link editor, focused, never covering the words.
  await dragSelect(page, "docs");
  await page.keyboard.press(`${mod}+k`);
  const linkEditor = page.getByRole("region", { name: "Link editor" });
  await expect(linkEditor).toBeVisible();
  const url = linkEditor.getByRole("textbox", { name: "Link address" });
  await expect(url).toBeFocused();
  await expect(linkEditor.getByRole("textbox", { name: "Link text" })).toHaveCount(0);
  const word = await wordBox(page, "docs");
  const box = (await linkEditor.boundingBox())!;
  expect(box.y + box.height <= word.top || box.y >= word.bottom).toBe(true);
  await settled(linkEditor);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/link-editor.png" });

  // An invalid address is refused inline; the editor stays.
  await page.keyboard.type("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await expect(linkEditor.getByText("Use a full web address, like https://example.com.")).toBeVisible();
  await expect(url).toBeFocused();
  await url.fill("https://example.com/docs");
  await page.keyboard.press("Enter");
  await expect(linkEditor).toBeHidden();
  await expect(editor).toBeFocused();
  expect(await selectionText(page)).toBe("docs");
  await expect(editor.locator('a[href="https://example.com/docs"]')).toHaveText("docs");

  // The caret in a link shows the hover card.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  const card = page.getByRole("region", { name: "Link", exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText("example.com/docs");
  await settled(card);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/link-card.png" });

  // Open goes through the shell; the window stays on the app.
  await card.getByRole("button", { name: "Open" }).click();
  await expect.poll(opened).toEqual(["https://example.com/docs"]);
  expect(page.url()).toMatch(/index\.html/);
  await card.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Link copied.")).toBeVisible();
  await expect.poll(copied).toEqual(["https://example.com/docs"]);

  // Edit: the editor opens filled in, on the whole link.
  await card.getByRole("button", { name: "Edit" }).click();
  await expect(url).toBeFocused();
  await expect(url).toHaveValue("https://example.com/docs");
  await url.fill("https://example.com/new");
  await page.keyboard.press("Enter");
  await expect(editor.locator('a[href="https://example.com/new"]')).toHaveText("docs");

  // Hovering a link shows the card; it leaves when the pointer does.
  await page.keyboard.press(caret.docEnd);
  await expect(card).toBeHidden();
  const link = await wordBox(page, "docs");
  await page.mouse.move(link.x, link.y);
  await expect(card).toBeVisible();
  await page.mouse.move(link.x, link.y + 200);
  await expect(card).toBeHidden();

  // Mod+click opens; a plain click only places the caret.
  await page.mouse.click(link.x, link.y);
  await expect.poll(opened).toHaveLength(1);
  await page.keyboard.down(mod);
  await page.mouse.click(link.x, link.y);
  await page.keyboard.up(mod);
  await expect.poll(opened).toEqual(["https://example.com/docs", "https://example.com/new"]);

  // Remove keeps the words.
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Remove" }).click();
  await expect(editor.locator("a")).toHaveCount(0);
  await expect(editor).toContainText("Read the docs and");

  // Pasting a web address over selected text links it; Mod+Z straight after leaves the address.
  await dragSelect(page, "guide");
  const paste = (text: string) => page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
  await paste("https://example.com/guide");
  await expect(editor.locator('a[href="https://example.com/guide"]')).toHaveText("guide");
  await page.keyboard.press(`${mod}+z`);
  await expect(editor).toContainText("and the https://example.com/guide today.");
  await page.keyboard.press(`${mod}+y`);
  await expect(editor.locator('a[href="https://example.com/guide"]')).toHaveText("guide");

  // Mod+K with nothing selected asks for the text too, and inserts a new link at the caret.
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(" See ");
  await page.keyboard.press(`${mod}+k`);
  await expect(url).toBeFocused();
  await page.keyboard.type("example.org");
  await linkEditor.getByRole("textbox", { name: "Link text" }).fill("Example");
  await page.keyboard.press("Enter");
  await expect(editor.locator('a[href="https://example.org"]')).toHaveText("Example");

  await expect.poll(l.saved, { timeout: 5000 }).toBe(
    "# Links\n\nRead the docs and the [guide](https://example.com/guide) today.\n\nMore text below the line. See [Example](https://example.org)\n",
  );
  await quit(l);
});

test("EDT-03: Markdown input rules format as you type", async () => {
  const l = await start("");
  const { page } = l;
  await page.keyboard.type("Type **bold** and *italic* and ~~gone~~ and `code` and [site](https://example.com) and https://e.com done");
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor.locator("strong")).toHaveText("bold");
  await expect(editor.locator("em")).toHaveText("italic");
  await expect(editor.locator("s")).toHaveText("gone");
  await expect(editor.locator("code")).toHaveText("code");
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("site");
  await expect.poll(l.saved, { timeout: 5000 }).toBe(
    "Type **bold** and *italic* and ~~gone~~ and `code` and [site](https://example.com) and <https://e.com> done\n",
  );
  await quit(l);
});
