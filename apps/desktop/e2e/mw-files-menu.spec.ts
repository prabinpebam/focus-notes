/**
 * The Files rows' menus (D-162) and pinning the panel (D-161): right-click, the row's ⋯, Shift+F10 and
 * the Menu key open the item's menu, which duplicates, moves and deletes what's acted on; a pinned
 * panel stays open while notes open, and the note's text moves clear of it.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const ls = (dir: string) => readdirSync(dir).filter((n) => !n.startsWith(".")).sort();
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
async function fakeTrash(l: Launched) {
  await l.app.evaluate(({ shell }) => {
    const fs = process.getBuiltinModule("node:fs");
    const g = globalThis as unknown as { trashed: string[] };
    g.trashed = [];
    shell.trashItem = async (p: string) => { g.trashed.push(p); fs.rmSync(p, { recursive: true }); };
  });
  return () => l.app.evaluate(() => (globalThis as unknown as { trashed: string[] }).trashed);
}
const OPEN_FOLDER = process.platform === "darwin" ? "Open in Finder" : process.platform === "linux" ? "Open in file manager" : "Open in File Explorer";
async function opened(dirs: ReturnType<typeof tempDirs>, env: Record<string, string> = {}) {
  const l = await launch(dirs, env);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Hello.");
  await expect(editor).toBeFocused();
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const items = (menu: ReturnType<Page["getByRole"]>) => menu.getByRole("menuitem").evaluateAll((els) => els.map((e) => e.querySelector("span span span")?.textContent ?? e.textContent));
  return { l, page, editor, files, tree, row, items };
}

test("D-192: a row's menu opens its folder, and copies it as a file, as a path, or as text; Ctrl+C in the tree copies the selection", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome to Focus Notes\n\nHello.\n");
  writeFileSync(join(dirs.docs, "ideas.md"), "---\nid: n-1\n---\n# Ideas\n\nSee [welcome](Welcome.md).\n");
  mkdirSync(join(dirs.docs, "journal"));
  writeFileSync(join(dirs.docs, "journal", "day-one.md"), "# Day one\n");
  // Journeys copy into memory, never the computer's clipboard, and never open Explorer or Finder.
  const { l, page, row } = await opened(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  await l.app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { shown: string[]; openedDirs: string[] };
    g.shown = [];
    g.openedDirs = [];
    shell.showItemInFolder = (p: string) => void g.shown.push(p);
    shell.openPath = async (p: string) => (g.openedDirs.push(p), "");
  });
  const shown = () => l.app.evaluate(() => (globalThis as unknown as { shown: string[] }).shown);
  const openedDirs = () => l.app.evaluate(() => (globalThis as unknown as { openedDirs: string[] }).openedDirs);
  const clipboard = () => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");
  const toasts = page.locator("#toasts");
  const menuItem = async (name: string, key: string) => {
    await row(name).click({ button: "right" });
    const menu = page.getByRole("menu", { name: `Actions for “${name}”` });
    await menu.locator(`[role="menuitem"][data-key="files.${key}"]`).click();
    await expect(menu).toBeHidden();
  };
  await page.keyboard.press(`${mod}+O`);
  const ideas = join(dirs.docs, "ideas.md");

  await menuItem("Ideas", "revealItem");
  await expect.poll(shown).toEqual([ideas]);
  // A folder opens itself in File Explorer, Finder or the file manager.
  await menuItem("journal", "openFolderItem");
  await expect.poll(openedDirs).toEqual([join(dirs.docs, "journal")]);
  await menuItem("Ideas", "copyPath");
  await expect.poll(clipboard).toBe(ideas);
  await expect(toasts.getByText("Copied the path to “Ideas”.")).toBeVisible();
  // The note's Markdown, without the app's own id.
  await menuItem("Ideas", "copyText");
  await expect.poll(clipboard).toBe("# Ideas\n\nSee [welcome](Welcome.md).\n");
  await menuItem("Ideas", "copyItem");
  await expect.poll(clipboard).toBe(`files:\n${ideas}`);
  await expect(toasts.getByText("Copied “Ideas”. Paste it in a folder, a mail or a chat.")).toBeVisible();
  // A folder: its own items; Ctrl+C (⌘C) in the tree copies the selection, folder and note together.
  await row("journal").click({ button: "right" });
  const journalMenu = page.getByRole("menu", { name: "Actions for “journal”" });
  expect(await journalMenu.getByRole("menuitem").evaluateAll((els) => els.map((e) => e.querySelector("span span span")?.textContent ?? e.textContent)))
    .toEqual(["New note", "New folder", OPEN_FOLDER, "Copy", "Copy as path", "Rename", "Move to…", "Delete"]);
  await page.keyboard.press("Escape");
  await row("journal").click();
  await row("Ideas").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await page.keyboard.press(`${mod}+C`);
  await expect.poll(async () => (await clipboard()).split("\n").sort()).toEqual([ideas, join(dirs.docs, "journal"), "files:"].sort());
  await expect(toasts.getByText("Copied 2 items. Paste it in a folder, a mail or a chat.")).toBeVisible();
  // Nothing in the folder changed.
  expect(ls(dirs.docs)).toEqual(["Welcome.md", "ideas.md", "journal"]);
  await quit(l);
});

test("D-162: right-click, the row's ⋯, Shift+F10 and the Menu key open an item's menu; it duplicates, deletes, makes folders and moves a selection", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome to Focus Notes\n\nHello.\n");
  writeFileSync(join(dirs.docs, "ideas.md"), "# Ideas\n\nSee [welcome](Welcome.md).\n");
  mkdirSync(join(dirs.docs, "journal"));
  writeFileSync(join(dirs.docs, "journal", "day-one.md"), "# Day one\n");
  const { l, page, files, tree, row, items } = await opened(dirs);
  const trashed = await fakeTrash(l);
  await page.keyboard.press(`${mod}+O`);
  await expect(row("Welcome to Focus Notes")).toBeFocused();

  // Right-click on a row outside the selection selects it, and its menu opens at the pointer.
  await row("Ideas").click({ button: "right" });
  const ideasMenu = page.getByRole("menu", { name: "Actions for “Ideas”" });
  await expect(ideasMenu).toBeVisible();
  await expect(row("Ideas")).toHaveAttribute("aria-selected", "true");
  await expect(row("Welcome to Focus Notes")).toHaveAttribute("aria-selected", "false");
  expect(await items(ideasMenu)).toEqual(["Open", "Open containing folder", "Copy", "Copy as path", "Copy text", "Rename", "Duplicate", "Move to…", "Delete"]);
  // Each item shows its shortcut.
  await expect(ideasMenu.getByRole("menuitem", { name: /^Rename/ })).toContainText(process.platform === "darwin" ? "↩" : "F2");
  await expect(ideasMenu.getByRole("menuitem", { name: /^Delete/ })).toContainText(process.platform === "darwin" ? "⌘⌫" : "Delete");
  // At the pointer: its top left corner is near where the row was clicked, inside the panel's row.
  const menuBox = (await ideasMenu.boundingBox())!;
  const rowBox = (await row("Ideas").boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(rowBox.y);
  expect(menuBox.x).toBeGreaterThanOrEqual(rowBox.x);
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/files-row-menu.png" });

  // Duplicate: "Ideas copy" next to it, retitled, links unchanged, selected and focused, with Undo.
  await ideasMenu.getByRole("menuitem", { name: /^Duplicate/ }).click();
  await expect(row("Ideas copy")).toHaveAttribute("aria-selected", "true");
  await expect(row("Ideas copy")).toBeFocused();
  await expect(page.locator("#toasts").getByText("Duplicated “Ideas”.")).toBeVisible();
  await expect.poll(() => ls(dirs.docs)).toEqual(["Welcome.md", "ideas-copy.md", "ideas.md", "journal"]);
  expect(readFileSync(join(dirs.docs, "ideas-copy.md"), "utf8")).toBe("# Ideas copy\n\nSee [welcome](Welcome.md).\n");
  await expect(files).toBeVisible();

  // Shift+F10 on the focused row: its menu, first item focused; Esc closes it and focus goes back to the row.
  await page.keyboard.press("Shift+F10");
  const copyMenu = page.getByRole("menu", { name: "Actions for “Ideas copy”" });
  await expect(copyMenu.getByRole("menuitem", { name: /^Open(?! containing)/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(copyMenu).toBeHidden();
  await expect(files).toBeVisible();
  await expect(row("Ideas copy")).toBeFocused();
  // The Menu key does the same; Delete from it deletes the copy.
  await page.keyboard.press("ContextMenu");
  await expect(copyMenu).toBeVisible();
  await page.keyboard.press("End");
  await expect(copyMenu.getByRole("menuitem", { name: /^Delete/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row("Ideas copy")).toHaveCount(0);
  await expect.poll(() => trashed()).toEqual([join(dirs.docs, "ideas-copy.md")]);
  await expect(page.locator("#toasts").getByText("Moved “Ideas copy” to the trash.")).toBeVisible();

  // A folder's ⋯ opens its menu on pointer-down: new things go in it.
  await row("journal").hover();
  const more = row("journal").locator("[data-row-more]");
  await expect(more).toBeVisible();
  await more.dispatchEvent("pointerdown", { button: 0, pointerType: "mouse", isPrimary: true });
  const folderMenu = page.getByRole("menu", { name: "Actions for “journal”" });
  await expect(folderMenu).toBeVisible();
  expect(await items(folderMenu)).toEqual(["New note", "New folder", OPEN_FOLDER, "Copy", "Copy as path", "Rename", "Move to…", "Delete"]);
  await folderMenu.getByRole("menuitem", { name: /^New folder/ }).click();
  const name = tree.getByRole("textbox", { name: "Folder name" });
  await expect(name).toBeFocused();
  await page.keyboard.type("Later");
  await page.keyboard.press("Enter");
  await expect.poll(() => ls(join(dirs.docs, "journal"))).toEqual(["Later", "day-one.md"]);

  // The section's menu: new things only.
  await tree.getByRole("treeitem", { name: "Notes", exact: true }).click({ button: "right" });
  const sectionMenu = page.getByRole("menu", { name: "Actions for “Notes”" });
  await expect(sectionMenu).toBeVisible();
  expect(await items(sectionMenu)).toEqual(["New note", "New folder", OPEN_FOLDER, "Copy as path"]);
  await page.keyboard.press("Escape");

  // Several selected: right-click on one of them keeps the selection, and the menu acts on all of it.
  await row("Ideas").click();
  await row("Welcome to Focus Notes").click({ modifiers: [mod] });
  await row("Ideas").click({ button: "right" });
  const many = page.getByRole("menu", { name: "Actions for 2 items" });
  await expect(many).toBeVisible();
  await expect(row("Ideas")).toHaveAttribute("aria-selected", "true");
  await expect(row("Welcome to Focus Notes")).toHaveAttribute("aria-selected", "true");
  expect(await items(many)).toEqual(["Duplicate", "Move to…", "Copy", "Copy as path", "Delete"]);
  expect(await settledAxe(page)).toEqual([]);
  await many.getByRole("menuitem", { name: /^Move to…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Move 2 items to…" });
  await expect(dialog.getByRole("combobox", { name: "Find a folder" })).toBeFocused();
  await page.keyboard.type("journal");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect.poll(() => ls(join(dirs.docs, "journal"))).toEqual(["Later", "Welcome.md", "day-one.md", "ideas.md"]);
  expect(existsSync(join(dirs.docs, "ideas.md"))).toBe(false);
  await quit(l);
});

test("D-161: pinned, Files stays open while notes open; the text moves clear of it, the caret's line kept; Esc and Mod+O go between them; unpinning puts it back", async () => {
  const dirs = tempDirs();
  const para = (n: number) => `Paragraph ${n} has enough words in it to wrap across more than one line once the column gets narrower beside the panel.`;
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Welcome to Focus Notes\n\nHello.\n\n${Array.from({ length: 30 }, (_, i) => para(i + 1)).join("\n\n")}\n`);
  writeFileSync(join(dirs.docs, "ideas.md"), "# Ideas\n\nSome.\n");
  const { l, page, editor, files, row } = await opened(dirs);
  // A window where the column has to narrow beside the sheet, so the text reflows.
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(880, 760));
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(900);
  // The caret at the end of the note: its line is what must stay put. Its own scroll there is made
  // instant, so nothing is still gliding (in a background window's few frames) when the pin is pressed.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  /** The last line's top (where the caret is) and the text's left edge, in the window. */
  const where = () => page.evaluate(() => {
    const prose = document.querySelector('[contenteditable="true"]') as HTMLElement;
    const last = [...prose.querySelectorAll("p")].at(-1)!.lastChild as Text;
    const r = document.createRange();
    r.setStart(last, last.length);
    return { line: r.getClientRects()[0]!.top, left: prose.getBoundingClientRect().left };
  });
  /** Samples the last line's top each painted frame for a while, from now. */
  const sample = () => page.evaluate(() => {
    const w = window as unknown as { tops: number[] };
    w.tops = [];
    const prose = document.querySelector('[contenteditable="true"]') as HTMLElement;
    const start = performance.now();
    const tick = () => setTimeout(() => {
      const last = [...prose.querySelectorAll("p")].at(-1)!.lastChild as Text;
      const r = document.createRange();
      r.setStart(last, last.length);
      w.tops.push(r.getClientRects()[0]!.top);
      if (performance.now() - start < 500) requestAnimationFrame(tick);
    }, 0);
    requestAnimationFrame(tick);
  });
  const sampled = async () => {
    await page.waitForTimeout(600);
    return page.evaluate(() => (window as unknown as { tops: number[] }).tops);
  };
  await page.keyboard.press(`${mod}+O`);
  const pin = files.getByRole("button", { name: "Dock Files" });
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  // The auto-scroll to the end is a script, not an animation: wait for the note to be still.
  await expect.poll(async () => { const a = (await where()).line; await page.waitForTimeout(150); return a === (await where()).line; }).toBe(true);
  const before = await where();
  await sample();
  await pin.click();
  const unpin = files.getByRole("button", { name: "Undock Files" });
  await expect(unpin).toHaveAttribute("aria-pressed", "true");
  const tops = await sampled();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  // The caret's line never moved while the text reflowed, and the text starts a gap after the sheet.
  // Every frame drawn while it glided (a window the journey keeps in the background draws few).
  expect(tops.length).toBeGreaterThan(0);
  for (const y of tops) expect(Math.abs(y - before.line)).toBeLessThanOrEqual(2);
  const pinned = await where();
  // It reflowed: the text is narrower than before, so its lines wrap differently.
  const width = await page.evaluate(() => (document.querySelector('[contenteditable="true"]') as HTMLElement).getBoundingClientRect().width);
  console.log(`D-161: text left ${before.left} → ${pinned.left}, width ${width}, caret line ${before.line} → ${pinned.line}, frames ${tops.length}, worst ${Math.max(...tops.map((y) => Math.abs(y - before.line)))}`);
  const sheet = (await files.boundingBox())!;
  expect(pinned.left).toBeGreaterThanOrEqual(sheet.x + sheet.width + 16 - 1);
  expect(Math.abs(pinned.line - before.line)).toBeLessThanOrEqual(1);
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/files-pinned.png" });
  await expect.poll(() => readFileSync(join(dirs.userData, "state.json"), "utf8")).toContain('"filesPinned": true');

  // Opening a note leaves it open; Esc goes back to the note, and it stays.
  await row("Ideas").dblclick();
  await expect(editor).toContainText("Some.");
  await expect(files).toBeVisible();
  await row("Ideas").focus();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await expect(files).toBeVisible();
  // Mod+O goes into the tree, and from there back to the note; a click on the note keeps it open.
  await page.keyboard.press(`${mod}+O`);
  await expect(row("Ideas")).toBeFocused();
  await page.keyboard.press(`${mod}+O`);
  await expect(editor).toBeFocused();
  await editor.click();
  await expect(files).toBeVisible();

  // Unpinned: the text goes back where it was, and the panel closes as it always did.
  await row("Welcome to Focus Notes").dblclick();
  await expect(editor).toContainText("Paragraph 30");
  await unpin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await expect.poll(async () => Math.round((await where()).left)).toBe(Math.round(before.left));
  await page.keyboard.press("Escape");
  await expect(files).toBeHidden();

  // Reduced motion: pinned at once.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press(`${mod}+O`);
  await files.getByRole("button", { name: "Dock Files" }).click();
  const moved = await page.evaluate(() => new Promise<number>((done) => requestAnimationFrame(() => done((document.querySelector('[contenteditable="true"]') as HTMLElement).getBoundingClientRect().left))));
  expect(moved).toBeGreaterThanOrEqual(sheet.x + sheet.width + 16 - 1);
  await quit(l);
});
