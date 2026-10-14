/**
 * MW journeys for the Files panel (WP-2.4): open it by keyboard and from the toolbar, create,
 * rename, and delete notes and nested folders (FIL-01, FIL-02), select several (FIL-08), move by
 * drag and drop and with Move to… (FIL-03), and see every change at once, before it's written,
 * put back with a reason when it's refused (PRF-09).
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
/** A folder's notes and folders, as the Files panel lists them (dot files, like .gitkeep, aren't). */
const ls = (dir: string) => readdirSync(dir).filter((n) => !n.startsWith(".")).sort();
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
/** Records the system trash instead of using the real one, and empties the item away. */
async function fakeTrash(l: Launched) {
  await l.app.evaluate(({ shell }) => {
    const fs = process.getBuiltinModule("node:fs");
    const g = globalThis as unknown as { trashed: string[] };
    g.trashed = [];
    shell.trashItem = async (p: string) => { g.trashed.push(p); fs.rmSync(p, { recursive: true }); };
  });
  return () => l.app.evaluate(() => (globalThis as unknown as { trashed: string[] }).trashed);
}
/**
 * Times a change from the event that caused it (its own timestamp, before any handler ran) to the
 * first frame where a row matching `shown` is in the tree. Resolves to milliseconds.
 */
async function timeToShow(page: Page, event: "keydown" | "drop", shown: { level: number; text: string }) {
  await page.evaluate(({ event, shown }) => {
    const w = window as unknown as { act?: number; seen?: number };
    w.act = undefined;
    w.seen = undefined;
    addEventListener(event, (e) => { w.act ??= e.timeStamp; }, { capture: true, once: true });
    const look = () => {
      if (w.act === undefined || w.seen !== undefined) return;
      const hit = [...document.querySelectorAll('[role="treeitem"]')].some((r) => r.getAttribute("aria-level") === String(shown.level) && r.textContent?.includes(shown.text));
      if (hit) w.seen = performance.now();
    };
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }, { event, shown });
  return async () => {
    await page.waitForFunction(() => (window as unknown as { seen?: number }).seen !== undefined, null, { timeout: 5000 });
    return page.evaluate(() => { const w = window as unknown as { act: number; seen: number }; return w.seen - w.act; });
  };
}

test("FIL-01, FIL-02: the panel opens by keyboard and from the toolbar; notes and nested folders are created, renamed, and deleted", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome to Focus Notes\n\nHello.\n");
  writeFileSync(join(dirs.docs, "ideas.md"), "# Ideas\n\nSome.\n");
  mkdirSync(join(dirs.docs, "journal"));
  writeFileSync(join(dirs.docs, "journal", "day-one.md"), "# Day one\n");
  const l = await launch(dirs);
  const { page } = l;
  const trashed = await fakeTrash(l);
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Hello.");
  // The editor takes the caret on a deferred task after opening; let it settle first.
  await expect(editor).toBeFocused();
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string | RegExp) => tree.getByRole("treeitem", { name, exact: typeof name === "string" });

  // Mod+O opens it with the current note revealed and focused; Esc closes, and the caret returns.
  await page.keyboard.press(`${mod}+O`);
  await expect(row("Welcome to Focus Notes")).toBeFocused();
  await expect(row("Welcome to Focus Notes")).toHaveAttribute("aria-selected", "true");
  await expect(tree).toHaveAttribute("aria-multiselectable", "true");
  await expect(row("Notes")).toHaveAttribute("aria-level", "1");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/files-panel.png" });
  await page.keyboard.press("Escape");
  await expect(files).toBeHidden();
  await expect(editor).toBeFocused();

  // Open… in the toolbar opens it too.
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("toolbar", { name: "Toolbar" }).getByRole("button", { name: "Open…" }).click();
  await expect(row("Welcome to Focus Notes")).toBeFocused();

  // Arrow keys follow the tree pattern; typing jumps to a row by name.
  await page.keyboard.press("Home");
  await expect(row("Notes")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(row("journal")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(row("journal")).toHaveAttribute("aria-expanded", "true");
  await expect(row("Day one")).toHaveAttribute("aria-level", "3");
  await page.keyboard.type("id");
  await expect(row("Ideas")).toBeFocused();

  // A new folder is named in place (Mod+Shift+N, or New → New folder), nested in the focused folder.
  await page.keyboard.press("Home");
  await page.keyboard.press(`${mod}+Shift+N`);
  const name = tree.getByRole("textbox", { name: "Folder name" });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("New folder");
  await page.keyboard.type("Projects");
  await page.keyboard.press("Enter");
  await expect(row("Projects")).toBeFocused();
  await expect.poll(() => existsSync(join(dirs.docs, "Projects"))).toBe(true);
  await files.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: /^New folder/ }).click();
  await expect(name).toBeFocused();
  await page.keyboard.type("Drafts");
  await page.keyboard.press("Enter");
  await expect.poll(() => existsSync(join(dirs.docs, "Projects", "Drafts"))).toBe(true);
  await expect(row("Drafts")).toHaveAttribute("aria-level", "3");
  // A taken name keeps the field open and says why; Esc cancels.
  await page.keyboard.press("ArrowLeft");
  await expect(row("Projects")).toBeFocused();
  await page.keyboard.press(`${mod}+Shift+N`);
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.type("drafts");
  await page.keyboard.press("Enter");
  await expect(files.getByText("That name is taken here.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(name).toBeHidden();
  await expect(row("Projects")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(row("Drafts")).toBeFocused();

  // New note goes into the focused folder; the panel closes and the caret is in the note.
  await page.keyboard.press(`${mod}+N`);
  await expect(files).toBeHidden();
  // The new, empty note has opened (until then the keys would go to the note being left).
  await expect(editor).toHaveText("");
  await expect(editor).toBeFocused();
  await page.keyboard.type("# Plan for drafts");
  await expect.poll(() => ls(join(dirs.docs, "Projects", "Drafts")), { timeout: 5000 }).toEqual(["plan-for-drafts.md"]);

  // Renaming a note (F2) edits its title; the file name follows.
  await page.keyboard.press(`${mod}+O`);
  await expect(row("Plan for drafts")).toBeFocused();
  await page.keyboard.press(process.platform === "darwin" ? "Enter" : "F2");
  const title = tree.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue("Plan for drafts");
  await title.fill("Drafting plan");
  await page.keyboard.press("Enter");
  await expect(row("Drafting plan")).toBeVisible();
  await expect.poll(() => ls(join(dirs.docs, "Projects", "Drafts"))).toEqual(["drafting-plan.md"]);
  expect(readFileSync(join(dirs.docs, "Projects", "Drafts", "drafting-plan.md"), "utf8")).toBe("# Drafting plan\n");
  await expect(editor).toContainText("Drafting plan");

  // Renaming a folder moves what's in it.
  await row("Drafts").click();
  await page.keyboard.press(process.platform === "darwin" ? "Enter" : "F2");
  await tree.getByRole("textbox", { name: "Folder name" }).fill("Sketches");
  await page.keyboard.press("Enter");
  await expect.poll(() => ls(join(dirs.docs, "Projects"))).toEqual(["Sketches"]);
  expect(existsSync(join(dirs.docs, "Projects", "Sketches", "drafting-plan.md"))).toBe(true);

  // One note is deleted without asking, to the trash; a folder with notes asks first.
  await row("Ideas").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Backspace" : "Delete");
  await expect(page.locator("#toasts").getByText("Moved “Ideas” to the trash.")).toBeVisible();
  await expect(row("Ideas")).toHaveCount(0);
  expect(await trashed()).toEqual([join(dirs.docs, "ideas.md")]);
  await row("Projects").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Backspace" : "Delete");
  const confirm = page.getByRole("dialog", { name: "Delete" });
  await expect(confirm).toContainText("Delete “Projects”? This deletes 1 note.");
  expect(await settledAxe(page)).toEqual([]);
  await confirm.getByRole("button", { name: "Delete 1 note" }).click();
  await expect.poll(() => existsSync(join(dirs.docs, "Projects"))).toBe(false);
  await quit(l);
});

test("FIL-08, FIL-03, PRF-09: several notes are selected and moved by Move to… and by drag and drop, shown within 100 ms; a refusal puts them back", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome to Focus Notes\n");
  writeFileSync(join(dirs.docs, "a.md"), "# Alpha\n");
  writeFileSync(join(dirs.docs, "b.md"), "# Beta\n");
  writeFileSync(join(dirs.docs, "c.md"), "# Gamma\n");
  mkdirSync(join(dirs.docs, "Box"));
  writeFileSync(join(dirs.docs, "Box", "x.md"), "# Inside\n");
  mkdirSync(join(dirs.docs, "Shelf"));
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Welcome");
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press(`${mod}+O`);
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const selected = () => tree.locator('[role="treeitem"][aria-selected="true"]').evaluateAll((els) => els.map((e) => e.textContent));
  await expect(row("Alpha")).toBeVisible();

  // Mod+click adds, Shift+click selects a range, Shift+arrows extend it from the anchor.
  await row("Alpha").click();
  await row("Gamma").click({ modifiers: [mod] });
  expect(await selected()).toEqual(["Alpha", "Gamma"]);
  await expect(files.getByText("2 selected")).toBeVisible();
  await row("Alpha").click();
  await row("Gamma").click({ modifiers: ["Shift"] });
  expect(await selected()).toEqual(["Alpha", "Beta", "Gamma"]);
  await page.keyboard.press("Shift+ArrowUp");
  expect(await selected()).toEqual(["Alpha", "Beta"]);
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/files-multi-select.png" });

  // Move to… (Mod+Shift+M): one batch, shown before it's written.
  await page.keyboard.press(`${mod}+Shift+M`);
  const dialog = page.getByRole("dialog", { name: "Move 2 items to…" });
  await expect(dialog.getByRole("combobox", { name: "Find a folder" })).toBeFocused();
  await page.keyboard.type("box");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/files-move-to.png" });
  const moveShown = await timeToShow(page, "keydown", { level: 3, text: "Alpha" });
  await page.keyboard.press("Enter");
  const moveMs = await moveShown();
  console.log(`PRF-09: Move to… shown ${moveMs.toFixed(1)} ms after Enter`);
  expect(moveMs).toBeLessThanOrEqual(100);
  await expect.poll(() => ls(join(dirs.docs, "Box"))).toEqual(["a.md", "b.md", "x.md"]);
  // The moved notes stay selected, in their open folder.
  expect(await selected()).toEqual(["Alpha", "Beta"]);
  await expect(page.locator("#toasts").getByText("Moved 2 items to “Box”.")).toBeVisible();

  // Drag and drop onto a folder.
  const dropShown = await timeToShow(page, "drop", { level: 3, text: "Gamma" });
  await row("Gamma").dragTo(row("Shelf"));
  const dropMs = await dropShown();
  console.log(`PRF-09: drop shown ${dropMs.toFixed(1)} ms after the drop`);
  expect(dropMs).toBeLessThanOrEqual(100);
  await expect.poll(() => existsSync(join(dirs.docs, "Shelf", "c.md"))).toBe(true);
  // A note isn't a place to drop things: nothing moves.
  await row("Box").dragTo(row("Alpha"));
  expect(ls(join(dirs.docs, "Box"))).toEqual(["a.md", "b.md", "x.md"]);

  // A refused write: the change shows at once, then the tree goes back and says why.
  await l.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("workspace:apply");
    ipcMain.handle("workspace:apply", async () => {
      await new Promise((r) => setTimeout(r, 800));
      throw new Error("taken");
    });
  });
  const refusedShown = await timeToShow(page, "drop", { level: 3, text: "Welcome to Focus Notes" });
  await row("Welcome to Focus Notes").dragTo(row("Shelf"));
  expect(await refusedShown()).toBeLessThanOrEqual(100);
  await expect(page.locator("#toasts").getByText("Couldn't move “Welcome to Focus Notes”: that name is taken.")).toBeVisible({ timeout: 5000 });
  await expect(row("Welcome to Focus Notes")).toHaveAttribute("aria-level", "2");
  await expect(row("Welcome to Focus Notes")).toBeFocused();
  expect(existsSync(join(dirs.docs, "Welcome.md"))).toBe(true);
  expect(ls(join(dirs.docs, "Shelf"))).toEqual(["c.md"]);
  await page.screenshot({ path: "../../test-results/screens/files-refused.png" });
  await quit(l);
});
