/**
 * Every surface the visual quality journeys open (Foundations → Visual quality, D-111), and how to
 * reach each one from the keyboard: shared by `vq-surfaces.spec.ts`, which checks their geometry,
 * and `baselines.spec.ts`, which captures them for the owner's baseline review.
 */
import { expect, type Locator, type Page } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, tempDirs, type Launched } from "./helpers.ts";
import { settled, type VisualOptions } from "./visual-quality.ts";

export const mac = process.platform === "darwin";
export const mod = mac ? "Meta" : "Control";
export const custom = !mac;

/** A long note: it scrolls, so its edges fade, and every block a surface opens on is in it. */
export const LONG_NOTE = [
  "# Visual quality", "",
  "A paragraph with a [link](https://example.com/audit) and more words to select here.", "",
  ...Array.from({ length: 24 }, (_, i) => [`Paragraph ${i + 1} has a few words, enough to wrap at a narrow window and fill the canvas.`, ""]).flat(),
  "- [ ] A short task", "- [x] A done task that's long enough to wrap onto a second line when the window is narrow", "",
  "| Task | Owner |", "| --- | --- |", "| Draft | Me |", "| Ship | You |", "",
  ...Array.from({ length: 12 }, (_, i) => [`More text ${i + 1}, so the note goes on below the table.`, ""]).flat(),
  "Last line",
].join("\n") + "\n";

export const SIZES = [
  { name: "default", size: undefined },
  { name: "small", size: { width: 480, height: 360 } },
] as const;

/** Starts the app on the long note, with notes and folders enough for the Files panel to scroll. */
export async function start(size?: { width: number; height: number }): Promise<Launched> {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), LONG_NOTE);
  for (let i = 1; i <= 24; i++) writeFileSync(join(dirs.docs, `Idea ${String(i).padStart(2, "0")}.md`), `# Idea ${i}\n\nA thought.\n`);
  mkdirSync(join(dirs.docs, "Projects"));
  writeFileSync(join(dirs.docs, "Projects", "plan.md"), "# Plan\n\n## Steps\n\nFirst.\n\n## Later\n\nThen.\n");
  if (size) writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  // Focus mode dims all but the line being written; the review reads the whole note.
  await l.page.keyboard.press("F8");
  await expect.poll(() => l.page.evaluate(() => document.documentElement.dataset.focus)).toBeUndefined();
  return l;
}


/** Light or dark, switched by keyboard. */
export async function scheme(page: Page, want: "light" | "dark") {
  if ((await page.evaluate(() => document.documentElement.style.colorScheme)) !== want) await page.keyboard.press(`${mod}+Shift+L`);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe(want);
}

/** Back to the note with nothing open. */
export async function reset(page: Page) {
  for (let i = 0; i < 8; i++) {
    const state = await page.evaluate(() => ({
      toolbar: Boolean(document.querySelector("[data-morph-panel][data-open]")),
      inToolbar: Boolean(document.activeElement?.closest("[data-morph-panel]")),
      other: Boolean(document.querySelector('[role="menu"], [role="dialog"][aria-modal="true"], [data-surface="sheet"]')) || !document.activeElement?.hasAttribute("data-editor"),
    }));
    if (!state.toolbar && !state.other) break;
    await page.keyboard.press(state.toolbar && !state.inToolbar && !state.other ? `${mod}+.` : "Escape");
    await page.waitForTimeout(60);
  }
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await settled(page);
}

/** Puts the caret in the table's first body cell, by keyboard. */
export async function caretInTable(page: Page) {
  await page.keyboard.press(caret.docStart);
  const inCell = () => page.evaluate(() => Boolean(getSelection()?.anchorNode?.parentElement?.closest("td")));
  for (let i = 0; i < 120 && !(await inCell()); i++) await page.keyboard.press("ArrowDown");
  expect(await inCell()).toBe(true);
}

export async function openToolbar(page: Page) {
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
}
export async function moreMenu(page: Page) {
  await openToolbar(page);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "More" })).toBeVisible();
}
export async function spotlight(page: Page, keys: string) {
  await page.keyboard.press(keys);
  await expect(page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox")).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Spotlight" }).getByRole("option").first()).toBeVisible({ timeout: 15_000 });
}
export async function files(page: Page) {
  await page.keyboard.press(`${mod}+O`);
  await expect(page.getByRole("complementary", { name: "Files" }).getByRole("treeitem").and(page.locator(":focus"))).toHaveCount(1);
}
export async function settings(page: Page, category: string) {
  await page.keyboard.press(`${mod}+,`);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: category }).click();
  await expect(dialog.getByRole("tab", { name: category })).toHaveAttribute("aria-selected", "true");
}

export interface Surface {
  name: string;
  open: (page: Page) => Promise<void>;
  /** Controls whose tooltips are checked too. */
  tooltips?: (page: Page) => Locator;
  opts?: VisualOptions;
}

export const SURFACES: Surface[] = [
  { name: "canvas", open: async () => {} },
  { name: "canvas scrolled", open: async (page) => {
    await page.evaluate(() => {
      let sc = document.querySelector<HTMLElement>("[data-editor]");
      while (sc && getComputedStyle(sc).overflowY !== "auto") sc = sc.parentElement;
      sc?.scrollTo({ top: (sc.scrollHeight - sc.clientHeight) / 2 });
    });
  } },
  { name: "trigger toolbar", open: openToolbar, tooltips: (page) => page.getByRole("toolbar", { name: "Toolbar" }).getByRole("button") },
  { name: "more menu", open: moreMenu },
  { name: "more submenu", open: async (page) => {
    await moreMenu(page);
    await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Light theme" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menu", { name: "Light theme" })).toBeVisible();
  } },
  { name: "find", open: async (page) => {
    await page.keyboard.press(`${mod}+F`);
    const bar = page.getByRole("region", { name: "Find in note" });
    await expect(bar.getByRole("searchbox", { name: "Find" })).toBeFocused();
    await page.keyboard.type("words");
    await expect(bar.getByRole("status").first()).toHaveText(/of \d+$/);
  }, tooltips: (page) => page.getByRole("region", { name: "Find in note" }).getByRole("button") },
  { name: "find and replace", open: async (page) => {
    await page.keyboard.press(mac ? "Meta+Alt+f" : "Control+h");
    const bar = page.getByRole("region", { name: "Find in note" });
    await expect(bar.getByRole("searchbox", { name: "Replace with" })).toBeVisible();
    await bar.getByRole("searchbox", { name: "Find" }).fill("words");
    await expect(bar.getByRole("status").first()).toHaveText(/of \d+$/);
  }, tooltips: (page) => page.getByRole("region", { name: "Find in note" }).getByRole("button") },
  { name: "find in all notes", open: async (page) => {
    await page.keyboard.press(`${mod}+Shift+F`);
    const sheet = page.getByRole("complementary", { name: "Find in all notes" });
    await expect(sheet.getByRole("combobox", { name: "Search all notes" })).toBeFocused();
    await page.keyboard.type("a");
    await expect(sheet.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
  }, tooltips: (page) => page.getByRole("complementary", { name: "Find in all notes" }).getByRole("button") },
  { name: "cheat sheet", open: async (page) => {
    await page.keyboard.press(`${mod}+Shift+Slash`);
    await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  }, tooltips: (page) => page.getByRole("dialog", { name: "Keyboard shortcuts" }).getByRole("button", { name: "Close" }) },
  { name: "cheat sheet scrolled", open: async (page) => {
    await page.keyboard.press(`${mod}+Shift+Slash`);
    await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
    await page.locator("[data-dialog-body]").evaluate((el) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) / 2 }));
  } },
  { name: "files", open: files },
  { name: "files new menu", open: async (page) => {
    await files(page);
    await page.getByRole("complementary", { name: "Files" }).getByRole("button", { name: "New" }).click();
    await expect(page.getByRole("menuitem", { name: /^New folder/ })).toBeVisible();
  } },
  { name: "files selection", open: async (page) => {
    await files(page);
    await page.keyboard.press("Shift+ArrowUp");
    await expect(page.getByRole("complementary", { name: "Files" }).getByRole("treeitem", { selected: true })).toHaveCount(2);
  }, tooltips: (page) => page.getByRole("complementary", { name: "Files" }).getByRole("button") },
  { name: "move to", open: async (page) => {
    await files(page);
    await page.keyboard.press(`${mod}+Shift+M`);
    await expect(page.getByRole("dialog", { name: /^Move/ }).getByRole("combobox")).toBeFocused();
  } },
  { name: "delete confirmation", open: async (page) => {
    await files(page);
    const tree = page.getByRole("complementary", { name: "Files" });
    await page.keyboard.press("Home");
    for (let i = 0; i < 6 && !(await tree.getByRole("treeitem", { name: "Projects" }).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press(mac ? "Meta+Backspace" : "Delete");
    await expect(page.getByRole("dialog", { name: "Delete" })).toBeVisible();
  } },
  { name: "spotlight", open: (page) => spotlight(page, `${mod}+Slash`) },
  { name: "spotlight notes", open: (page) => spotlight(page, `${mod}+P`) },
  { name: "spotlight commands", open: (page) => spotlight(page, `${mod}+Shift+P`) },
  { name: "spotlight headings", open: (page) => spotlight(page, `${mod}+Shift+O`) },
  { name: "spotlight actions", open: async (page) => {
    await spotlight(page, `${mod}+P`);
    await page.keyboard.press(`${mod}+K`);
    await expect(page.getByRole("dialog", { name: "Spotlight" }).getByRole("option").first()).toBeVisible();
  } },
  { name: "theme manager", open: async (page) => {
    await moreMenu(page);
    await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Theme…/ }).click();
    await expect(page.getByRole("complementary", { name: "Theme" })).toBeVisible();
  }, tooltips: (page) => page.getByRole("complementary", { name: "Theme" }).getByRole("button") },
  // Each of the theme manager's tabs, chosen from the keyboard so the tab shows its focus ring.
  ...(["Themes", "Reading", "Edit colors"] as const).map((tab) => ({ name: `theme manager ${tab.toLowerCase()}`, open: async (page: Page) => {
    await moreMenu(page);
    await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Theme…/ }).click();
    const sheet = page.getByRole("complementary", { name: "Theme" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("tab").first().focus();
    const target = sheet.getByRole("tab", { name: tab });
    for (let i = 0; i < 4 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("ArrowRight");
    if ((await target.getAttribute("aria-selected")) !== "true") await page.keyboard.press("Enter");
    await expect(sheet.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await expect(sheet.getByRole("tab", { name: tab })).toBeFocused();
    if (tab === "Reading") await expect(sheet.getByRole("slider").first()).toBeVisible();
  } })),
  { name: "settings account", open: (page) => settings(page, "Account"), tooltips: (page) => page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Close" }) },
  { name: "settings workspace", open: (page) => settings(page, "Workspace") },
  { name: "settings appearance", open: (page) => settings(page, "Appearance") },
  { name: "formatting toolbar", open: async (page) => {
    await page.keyboard.press(caret.docStart);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(mac ? "Alt+Shift+ArrowRight" : "Control+Shift+ArrowRight");
    await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  }, tooltips: (page) => page.getByRole("toolbar", { name: "Text formatting" }).getByRole("button") },
  { name: "turn into menu", open: async (page) => {
    await page.keyboard.press(caret.docEnd);
    await page.keyboard.press(mac ? "Alt+Shift+ArrowLeft" : "Control+Shift+ArrowLeft");
    await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
    await page.keyboard.press("Alt+F10");
    await expect(page.getByRole("toolbar", { name: "Text formatting" }).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu").first()).toBeVisible();
  } },
  { name: "link editor", open: async (page) => {
    await page.keyboard.press(caret.docStart);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(mac ? "Alt+Shift+ArrowRight" : "Control+Shift+ArrowRight");
    await page.keyboard.press(`${mod}+K`);
    await expect(page.getByRole("region", { name: "Link editor" }).getByRole("textbox", { name: "Link address" })).toBeFocused();
  } },
  { name: "link card", open: async (page) => {
    await page.keyboard.press(caret.docStart);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(caret.lineStart);
    for (let i = 0; i < 21; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("region", { name: "Link", exact: true })).toBeVisible();
  } },
  { name: "slash menu", open: async (page) => {
    await page.keyboard.press(caret.docStart);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(caret.lineEnd);
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
  } },
  { name: "table cell menu", open: async (page) => {
    await caretInTable(page);
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu", { name: "Cell options" })).toBeVisible();
  } },
  { name: "toast", open: async (page) => {
    await caretInTable(page);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "one\ntwo");
      document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.getByRole("status").filter({ hasText: "A table cell holds one line" })).toBeVisible();
  } },
  ...(custom ? [
    { name: "window controls", open: async (page: Page) => {
      await openToolbar(page);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Minimize" })).toBeFocused();
    } },
    { name: "snap layouts", open: async (page: Page) => {
      await openToolbar(page);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Maximize" })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("dialog", { name: "Snap layouts" }).getByRole("button", { name: "Left half" })).toBeFocused();
    } },
    { name: "system menu", open: async (page: Page) => {
      await page.keyboard.press("Alt+Space");
      await expect(page.getByRole("menu", { name: "Window menu" }).getByRole("menuitem", { name: "Move" })).toBeFocused();
    } },
  ] : []),
];
