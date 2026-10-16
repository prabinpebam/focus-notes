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
async function opened(dirs: ReturnType<typeof tempDirs>) {
  const l = await launch(dirs);
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
  expect(await items(ideasMenu)).toEqual(["Open", "Rename", "Duplicate", "Move to…", "Delete"]);
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
  await expect(copyMenu.getByRole("menuitem", { name: /^Open/ })).toBeFocused();
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
  expect(await items(folderMenu)).toEqual(["New note", "New folder", "Rename", "Move to…", "Delete"]);
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
  expect(await items(sectionMenu)).toEqual(["New note", "New folder"]);
  await page.keyboard.press("Escape");

  // Several selected: right-click on one of them keeps the selection, and the menu acts on all of it.
  await row("Ideas").click();
  await row("Welcome to Focus Notes").click({ modifiers: [mod] });
  await row("Ideas").click({ button: "right" });
  const many = page.getByRole("menu", { name: "Actions for 2 items" });
  await expect(many).toBeVisible();
  await expect(row("Ideas")).toHaveAttribute("aria-selected", "true");
  await expect(row("Welcome to Focus Notes")).toHaveAttribute("aria-selected", "true");
  expect(await items(many)).toEqual(["Duplicate", "Move to…", "Delete"]);
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
