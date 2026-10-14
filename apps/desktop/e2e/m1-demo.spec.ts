/**
 * The M1 demo script (Implementation plan → M1) as journeys: once with the pointer where the script
 * uses it, and once with the keyboard alone (step 9). Each step's requirement is named beside it.
 * The screen-reader passes (NVDA on Windows, VoiceOver on macOS) are scripted for the owner in
 * Performance and quality → Accessibility audit, since they can't be automated.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";
/** Selects the word before the caret. */
const selectWordLeft = mac ? "Alt+Shift+ArrowLeft" : "Control+Shift+ArrowLeft";
/** Files opens the focused note with Enter (⌘↓ on macOS, where Enter renames). */
const openKey = mac ? "Meta+ArrowDown" : "Enter";

/** An existing note in shapes the editor must keep byte for byte when they're not edited (EDT-10). */
const EXISTING = [
  "# Existing", "",
  "Some *star italic* and __underscore bold__ and ***both***.", "",
  "Line one  ", "line two with a hard break.", "",
  "A [reference link][ref] and an ![image](img.png).", "",
  "[ref]: https://example.com \"Title\"", "",
  "Setext Heading", "==============", "",
  "* star bullet", "* another", "",
  "Text.", "",
].join("\n");

/** 50,000 words for the typing check (step 4). */
const FIFTY = (() => {
  const para = "The quick brown fox jumps over the lazy dog and keeps writing calmly. ".repeat(10).trim();
  return "# Fifty thousand words\n\n" + Array.from({ length: 715 }, (_, i) => (i % 40 === 0 ? `## Section ${i / 40 + 1}\n\n${para}` : para)).join("\n\n") + "\n";
})();

/** About 110 words of prose for each body paragraph. */
const PROSE = "Calm writing starts with a quiet page and a steady rhythm. The words arrive one after another, and nothing on the screen asks for attention. When a thought needs structure, a heading or a list appears from a few typed characters, and the page stays calm. Formatting waits until it is wanted, and it leaves again when the sentence moves on. The note is plain Markdown on disk, readable anywhere, and nothing about it is locked away. A steady rhythm builds a long document out of short sessions, and every session ends with the text safely written. That is the whole promise of a calm editor.";

const editorOf = (page: Page) => page.getByRole("textbox", { name: "Note" });
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const settledAxe = async (page: Page) => {
  await settled(page);
  return axeViolations(page);
};

/** The on-screen box of the last place a word is in the note. */
const wordBox = (page: Page, word: string) => page.evaluate((w) => {
  const walker = document.createTreeWalker(document.querySelector("[data-editor]")!, NodeFilter.SHOW_TEXT);
  let hit: { node: Node; at: number } | undefined;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.textContent!.lastIndexOf(w);
    if (i >= 0) hit = { node: n, at: i };
  }
  if (!hit) throw new Error(`"${w}" isn't in the note`);
  const r = document.createRange();
  r.setStart(hit.node, hit.at);
  r.setEnd(hit.node, hit.at + w.length);
  const b = r.getBoundingClientRect();
  return { left: b.left, right: b.right, y: b.top + b.height / 2, x: b.left + b.width / 2 };
}, word);

/** Pastes as the browser does: a paste event with the clipboard's text and HTML (see m1-slash-paste). */
const paste = (page: Page, data: { text: string; html?: string }) => page.evaluate((d) => {
  const dt = new DataTransfer();
  if (d.html) dt.setData("text/html", d.html);
  dt.setData("text/plain", d.text);
  document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, data);

/** Moves through an open menu with the arrow keys to the item named `name`, then presses Enter. */
async function chooseByKeyboard(page: Page, name: string) {
  const focused = page.getByRole("menu").locator('[role^="menuitem"]:focus');
  await expect(focused).toHaveCount(1);
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { id, text } = await focused.evaluate((el) => ({ id: el.id, text: (document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.firstElementChild?.firstElementChild ?? el).textContent ?? "" }));
    if (text.replace("✓", "").trim() === name) {
      await page.keyboard.press("Enter");
      return;
    }
    if (seen.has(id)) break;
    seen.add(id);
    await page.keyboard.press("ArrowDown");
    await expect(focused).not.toHaveId(id);
  }
  throw new Error(`No menu item "${name}"`);
}

/** Opens a note from Files: by pointer (a click on its row) or by keyboard (arrows to it). */
async function openFromFiles(page: Page, title: string, keyboardOnly: boolean) {
  await page.keyboard.press(`${mod}+O`);
  const files = page.getByRole("complementary", { name: "Files" });
  const row = files.getByRole("treeitem", { name: title, exact: true });
  await expect(files.getByRole("tree")).toBeVisible();
  if (keyboardOnly) {
    await expect(files.getByRole("treeitem").and(page.locator(":focus"))).toHaveCount(1);
    await page.keyboard.press("Home");
    for (let i = 0; i < 20 && !(await row.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("ArrowDown");
  } else {
    await row.click();
  }
  await expect(row).toBeFocused();
  await page.keyboard.press(openKey);
  await expect(files).toBeHidden();
  await expect(editorOf(page).locator("h1").first()).toHaveText(title);
  await expect(editorOf(page)).toBeFocused();
}

/** The band of focus mode and the caret, in the column's coordinates (FOC-01). */
const bandAndCaret = (page: Page) => page.evaluate(() => {
  const column = document.querySelector<HTMLElement>("[data-focus-mode]")!;
  const props = [...Array(column.style.length)].map((_, i) => column.style[i]!).filter((p) => p.startsWith("--"));
  const values = props.map((p) => parseFloat(column.style.getPropertyValue(p)));
  const origin = column.getBoundingClientRect().top;
  const sel = window.getSelection()!;
  const r = sel.getRangeAt(0).getClientRects()[0] ?? sel.getRangeAt(0).getBoundingClientRect();
  const line = parseFloat(getComputedStyle(sel.anchorNode!.parentElement!).lineHeight);
  return { top: Math.min(...values), bottom: Math.max(...values), caret: (r.top + r.bottom) / 2 - origin, line };
});

async function demo(l: Launched, dirs: { docs: string }, keyboardOnly: boolean) {
  const { page, app } = l;
  const editor = editorOf(page);
  await expect(editor).toBeFocused();
  if (keyboardOnly) {
    // Proof that no step used the pointer.
    await page.evaluate(() => {
      const w = window as unknown as { __pointer: string[] };
      w.__pointer = [];
      for (const t of ["pointerdown", "mousedown", "click", "dblclick", "contextmenu"]) addEventListener(t, (e) => { if (e.isTrusted) w.__pointer.push(t); }, true);
    });
  }

  // 1. Create a note and write 1,000 words with #, lists, task lists, quotes, and code blocks (EDT-02).
  await page.keyboard.press(`${mod}+N`);
  await expect(editor).toHaveText("");
  await expect(editor).toBeFocused();
  const type = (s: string) => page.keyboard.type(s);
  const enter = () => page.keyboard.press("Enter");
  await type("# A demo of calm writing"); await enter();
  for (let i = 0; i < 10; i++) {
    if (i === 2) { await type("## A list"); await enter(); await type("- first point"); await enter(); await type("second point"); await enter(); await enter(); }
    if (i === 4) { await type("[ ] a task to finish"); await enter(); await enter(); }
    if (i === 5) { await type("> a quote to keep"); await enter(); await enter(); }
    if (i === 7) { await type("```"); await enter(); await type("const calm = true;"); await page.keyboard.press("ArrowDown"); }
    await page.keyboard.insertText(PROSE);
    await enter();
  }
  await type("The last word is calm");
  await expect(editor.locator("h1")).toHaveText("A demo of calm writing");
  await expect(editor.locator("ul:not([data-type]) > li")).toHaveCount(2);
  await expect(editor.locator('ul[data-type="taskList"] > li')).toHaveCount(1);
  await expect(editor.locator("blockquote")).toHaveText("a quote to keep");
  await expect(editor.locator("pre code")).toHaveText("const calm = true;");
  const words = await editor.evaluate((el) => (el as HTMLElement).innerText.split(/\s+/).filter(Boolean).length);
  expect(words).toBeGreaterThanOrEqual(1_000);

  // 2. Select text: the contextual toolbar appears. Bold, then a link with Mod+K (EDT-03, EDT-12, EDT-13).
  const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
  if (keyboardOnly) {
    await page.keyboard.press(selectWordLeft);
    await expect(toolbar).toBeVisible();
    await page.keyboard.press("Alt+F10");
    await expect(toolbar.getByRole("button", { name: /^Turn into/ })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(toolbar.getByRole("button", { name: "Bold", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toolbar.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(editor).toBeFocused();
  } else {
    const b = await wordBox(page, "calm");
    await page.mouse.move(b.left + 1, b.y);
    await page.mouse.down();
    await page.mouse.move(b.right - 1, b.y, { steps: 4 });
    await page.mouse.up();
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Bold", exact: true }).click();
  }
  await expect(editor.locator("p strong").last()).toHaveText("calm");
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press(`${mod}+K`);
  const linkEditor = page.getByRole("region", { name: "Link editor" });
  const url = linkEditor.getByRole("textbox", { name: "Link address" });
  await expect(url).toBeFocused();
  await page.keyboard.type("example.com/calm");
  await page.keyboard.press("Enter");
  await expect(linkEditor).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(editor.locator('a[href="https://example.com/calm"]')).toHaveText("calm");

  // 3. /table; rows and columns from the hover + (or the cell menu), Tab between cells, and a pasted
  // spreadsheet range (TBL-01, TBL-02, TBL-03, TBL-07, TBL-08, TBL-10).
  await page.keyboard.press(caret.docEnd);
  await enter();
  await type("/table");
  await expect(page.getByRole("listbox", { name: "Insert a block" }).getByRole("option")).toHaveText([/^Table/]);
  await enter();
  const table = editor.locator("table");
  await expect(table.locator("tr")).toHaveCount(3);
  await type("Item"); await page.keyboard.press("Tab"); await type("Owner"); await page.keyboard.press("Tab"); await type("Due");
  await page.keyboard.press("Tab");
  await type("Draft"); await page.keyboard.press("Tab"); await type("Me");
  await expect(table.locator("tr").nth(1).locator("td").nth(1)).toHaveText("Me");
  // A range from a spreadsheet fills from the caret's cell and grows the table, in one undo step.
  await paste(page, { text: "a\tb\n1\t2\nx\ty\n", html: "<google-sheets-html-origin><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr><tr><td>x</td><td>y</td></tr></table>" });
  await expect(page.getByText("Pasted 3 × 2. Table grew by 1 row.")).toBeVisible();
  await expect(table.locator("tr")).toHaveCount(4);
  await expect(table.locator("tr").nth(3).locator("td").nth(2)).toHaveText("y");
  if (keyboardOnly) {
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu", { name: "Cell options" })).toBeVisible();
    await chooseByKeyboard(page, "Insert row below");
    await expect(table.locator("tr")).toHaveCount(5);
    await expect(editor).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await chooseByKeyboard(page, "Insert column right");
  } else {
    // The + on the boundary between rows 1 and 2, on the table's left edge, then New column.
    const frame = (await table.boundingBox())!;
    const row2 = (await table.locator("tr").nth(1).boundingBox())!;
    await page.mouse.move(frame.x + 3, row2.y + 1);
    await page.getByRole("button", { name: "Insert row between rows 1 and 2" }).click();
    await expect(table.locator("tr")).toHaveCount(5);
    const cell = (await table.locator("tr").nth(2).locator("td").first().boundingBox())!;
    await page.mouse.move(cell.x + 10, cell.y + cell.height / 2);
    await page.getByRole("button", { name: "New column" }).click();
  }
  await expect(table.locator("tr").first().locator("th")).toHaveCount(4);
  await expect(editor).toBeFocused();
  expect(await settledAxe(page)).toEqual([]);

  // 4. Focus mode from the trigger toolbar: only the caret's row is bright (FOC-01, UI-03, UI-07).
  const toolbarButton = async (name: string) => {
    await page.keyboard.press(`${mod}+.`);
    const button = page.getByRole("toolbar", { name: "Toolbar" }).getByRole("button", { name });
    if (keyboardOnly) {
      // Focus lands on the first action, or the one used last (React Aria's toolbar, D-100); Home is the first.
      await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
      await page.keyboard.press("Home");
      for (let i = 0; i < 6 && !(await button.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("ArrowRight");
      await expect(button).toBeFocused();
      await page.keyboard.press("Enter");
    } else {
      await button.click();
    }
    await expect(page.getByRole("toolbar", { name: "Toolbar" })).toBeHidden();
    await expect(editor).toBeFocused();
    await settled(page);
  };
  const focusMode = () => page.evaluate(() => document.documentElement.dataset.focus ?? "off");
  // New installs start with it on (D-04): off from the toolbar, then on again.
  await toolbarButton("Focus mode");
  await expect.poll(focusMode).toBe("off");
  await toolbarButton("Focus mode");
  await expect.poll(focusMode).toBe("on");
  await page.keyboard.press(caret.docStart);
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => { const b = await bandAndCaret(page); return b.caret > b.top && b.caret < b.bottom && b.bottom - b.top < 2 * b.line; }).toBe(true);
  // In the 50,000-word fixture, typing stays inside the keystroke budget (PRF-01).
  await openFromFiles(page, "Fifty thousand words", keyboardOnly);
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[] };
    w.__lat = [];
    addEventListener("keydown", (e) => { const t0 = e.timeStamp; requestAnimationFrame(() => requestAnimationFrame(() => w.__lat.push(performance.now() - t0))); }, true);
  });
  for (let i = 0; i < 40; i++) await page.keyboard.type("a", { delay: 30 });
  await page.waitForTimeout(300);
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat.sort((a, b) => a - b));
  const p95 = lat[Math.floor(lat.length * 0.95)]!;
  console.log(`M1 demo (${keyboardOnly ? "keyboard" : "pointer"}): typing in 50,000 words, p95 ${p95.toFixed(1)} ms`);
  if (!process.env.CI) expect(p95).toBeLessThan(33);
  await openFromFiles(page, "A demo of calm writing", keyboardOnly);

  // 5. Light and dark with Mod+Shift+L; in System, the app follows the OS (THM-01, THM-02).
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const first = await theme();
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect.poll(theme).not.toBe(first);
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect.poll(theme).toBe(first);
  await page.keyboard.press(`${mod}+.`);
  const more = page.getByRole("button", { name: "More" });
  if (keyboardOnly) {
    await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("End");
    await expect(more).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await chooseByKeyboard(page, "System");
  } else {
    await more.click();
    await page.getByRole("menu", { name: "More" }).getByRole("menuitemcheckbox", { name: "System" }).click();
  }
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(editor).toBeFocused();
  // The OS changing its appearance, as the main process hears it: Electron doesn't report a change
  // made through themeSource, so the event the OS would send is sent with it.
  const osAppearance = (source: "dark" | "light" | "system") => app.evaluate(({ nativeTheme }, s) => {
    nativeTheme.themeSource = s;
    nativeTheme.emit("updated");
  }, source);
  await osAppearance("dark");
  await expect.poll(theme).toBe("ink");
  expect(await settledAxe(page)).toEqual([]);
  await osAppearance("light");
  await expect.poll(theme).toBe("paper");
  await osAppearance("system");

  // 6. Find with Mod+F, replace all, then undo it in one step (FND-01, FND-02).
  const count = (w: string) => editor.evaluate((el, word) => (el.textContent!.match(new RegExp(word, "g")) ?? []).length, w);
  const steady = await count("steady");
  expect(steady).toBeGreaterThan(9);
  await page.keyboard.press(`${mod}+F`);
  const bar = page.getByRole("region", { name: "Find in note" });
  await expect(bar.getByRole("searchbox", { name: "Find" })).toBeFocused();
  await page.keyboard.type("steady");
  await expect(bar.getByRole("status").first()).toHaveText(new RegExp(`of ${steady}$`));
  await page.keyboard.press(mac ? "Meta+Alt+f" : "Control+h");
  await expect(bar.getByRole("searchbox", { name: "Replace with" })).toBeFocused();
  await page.keyboard.type("even");
  await page.keyboard.press(mac ? "Meta+Enter" : "Control+Alt+Enter");
  await expect(page.getByRole("status").filter({ hasText: `Replaced ${steady} matches` })).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  expect(await count("steady")).toBe(0);
  await page.keyboard.press(`${mod}+Z`);
  await expect.poll(() => count("steady")).toBe(steady);

  // 7. The cheat sheet with Mod+Shift+/, searched (KEY-05).
  await page.keyboard.press(`${mod}+Shift+Slash`);
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  const search = sheet.getByRole("searchbox", { name: "Search shortcuts" });
  await expect(search).toBeFocused();
  await page.keyboard.type("bold");
  await expect(sheet.getByRole("status")).toHaveText("1 shortcut");
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(editor).toBeFocused();

  // 8. An existing note, edited in one place, keeps everything else byte for byte (EDT-10).
  await openFromFiles(page, "Existing", keyboardOnly);
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(" Added.");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => readFileSync(join(dirs.docs, "Existing.md"), "utf8")).toBe(EXISTING.replace("Text.\n", "Text. Added.\n"));

  if (keyboardOnly) expect(await page.evaluate(() => (window as unknown as { __pointer: string[] }).__pointer)).toEqual([]);
}

async function setUp() {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nStart here.\n");
  writeFileSync(join(dirs.docs, "Existing.md"), EXISTING);
  writeFileSync(join(dirs.docs, "Fifty.md"), FIFTY);
  return dirs;
}

/** Step 8, after the demo: closed and reopened, every note is as it was saved, and untouched ones byte for byte. */
async function reopen(dirs: { userData: string; docs: string }, before: Map<string, string>) {
  const l = await launch(dirs);
  const editor = editorOf(l.page);
  await expect(editor).toBeFocused();
  // It reopens the note it was on.
  await expect(editor.locator("h1").first()).toHaveText("Existing");
  await expect(editor).toContainText("Text. Added.");
  await quit(l);
  for (const [name, text] of before) expect(readFileSync(join(dirs.docs, name), "utf8"), name).toBe(text);
}
const snapshot = (docs: string) => new Map(readdirSync(docs).filter((n) => n.endsWith(".md")).map((n) => [n, readFileSync(join(docs, n), "utf8")]));

test("M1 demo: write, format, link, table, focus mode, themes, find and replace, the cheat sheet, and a byte-for-byte reopen", async () => {
  test.setTimeout(240_000);
  const dirs = await setUp();
  const l = await launch(dirs);
  await demo(l, dirs, false);
  await quit(l);
  const before = snapshot(dirs.docs);
  expect(before.get("Welcome.md")).toBe("# Welcome\n\nStart here.\n");
  expect([...before.keys()].some((n) => /demo/i.test(n))).toBe(true);
  await reopen(dirs, before);
});

test("M1 demo with the keyboard alone (step 9)", async () => {
  test.setTimeout(240_000);
  const dirs = await setUp();
  const l = await launch(dirs);
  await demo(l, dirs, true);
  await quit(l);
  const before = snapshot(dirs.docs);
  expect(before.get("Welcome.md")).toBe("# Welcome\n\nStart here.\n");
  await reopen(dirs, before);
});
