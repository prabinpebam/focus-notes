/**
 * MW journey for link updates (WP-2.5, FIL-09): moving a note, renaming a folder, and renaming a
 * note by its title rewrite the relative links to them in other notes on disk, and the moved
 * note's own links, in the same all-or-nothing batch; only the link destinations change. The open
 * note shows its new links without losing what was just typed, and a refused batch puts the links
 * back together with the move.
 */
import { test, expect } from "./fixtures.ts";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const rename = process.platform === "darwin" ? "Enter" : "F2";

test("FIL-09: renames and moves update relative links in other notes on disk, byte for byte, and a refusal puts them back", async () => {
  const dirs = tempDirs();
  const docs = dirs.docs;
  const read = (...p: string[]) => readFileSync(join(docs, ...p), "utf8");
  writeFileSync(join(docs, "Welcome.md"), "# Welcome to Focus Notes\n\n![pic](Box/assets/pic.png)\n\nSee [the plan](plan.md#steps) and [inside](Box/inner.md).\n");
  writeFileSync(join(docs, "plan.md"), "# Plan\n\nBack [home](Welcome.md). Not a link: `[home](Welcome.md)`.\n");
  mkdirSync(join(docs, "Box", "assets"), { recursive: true });
  writeFileSync(join(docs, "Box", "assets", "pic.png"), "");
  writeFileSync(join(docs, "Box", "inner.md"), "# Inner\n\nSee [the plan][p].\n\n[p]: <../plan.md> \"The plan\"\n");
  mkdirSync(join(docs, "Locked"));
  const blocker = join(docs, "Locked", "blocker.md");
  writeFileSync(blocker, "# Blocker\n\n[plan](../plan.md)\n");
  mkdirSync(join(docs, "Shelf"));
  // A note the shell can't write: on Windows a read-only file, elsewhere a read-only folder.
  const lock = (on: boolean) => (process.platform === "win32" ? chmodSync(blocker, on ? 0o444 : 0o644) : chmodSync(join(docs, "Locked"), on ? 0o555 : 0o755));
  lock(true);

  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("See the plan");
  await expect(editor).toBeFocused();
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const toast = (text: string) => page.locator("#toasts").getByText(text);

  // Typing in the open note, then moving a note it links to: what was typed is kept (saved first).
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Typed before the move.");

  // A batch the shell refuses part-way (one linking note can't be written): nothing changes on disk.
  await page.keyboard.press(`${mod}+O`);
  await row("Plan").dragTo(row("Shelf"));
  await expect(toast("Couldn't move “Plan”: the file system refused it, and nothing was changed.")).toBeVisible({ timeout: 10_000 });
  await expect(row("Plan")).toHaveAttribute("aria-level", "2");
  expect(existsSync(join(docs, "plan.md"))).toBe(true);
  expect(existsSync(join(docs, "Shelf", "plan.md"))).toBe(false);
  expect(read("Box", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../plan.md> \"The plan\"\n");
  expect(read("Locked", "blocker.md")).toBe("# Blocker\n\n[plan](../plan.md)\n");
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Box/assets/pic.png)\n\nSee [the plan](plan.md#steps) and [inside](Box/inner.md).\n\nTyped before the move.\n");
  await expect(editor.locator('a[href="plan.md#steps"]')).toHaveCount(1);

  // Moving a note: links to it, in every form, and its own links follow, in one batch.
  lock(false);
  await row("Plan").dragTo(row("Shelf"));
  await expect(toast("Moved “Plan” to “Shelf”. Updated links in 4 notes.")).toBeVisible({ timeout: 10_000 });
  expect(read("Shelf", "plan.md")).toBe("# Plan\n\nBack [home](../Welcome.md). Not a link: `[home](Welcome.md)`.\n");
  expect(read("Box", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../Shelf/plan.md> \"The plan\"\n");
  expect(read("Locked", "blocker.md")).toBe("# Blocker\n\n[plan](../Shelf/plan.md)\n");
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Box/assets/pic.png)\n\nSee [the plan](Shelf/plan.md#steps) and [inside](Box/inner.md).\n\nTyped before the move.\n");
  // The open note shows its new link, and still has what was typed.
  await expect(editor.locator('a[href="Shelf/plan.md#steps"]')).toHaveCount(1);
  await expect(editor).toContainText("Typed before the move.");

  // Renaming a folder: links to anything in it (an image too) follow; links inside it stay.
  await row("Box").click();
  await page.keyboard.press(rename);
  await tree.getByRole("textbox", { name: "Folder name" }).fill("Crate");
  await page.keyboard.press("Enter");
  await expect(toast("Renamed to “Crate”. Updated links in 1 note.")).toBeVisible({ timeout: 10_000 });
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Crate/assets/pic.png)\n\nSee [the plan](Shelf/plan.md#steps) and [inside](Crate/inner.md).\n\nTyped before the move.\n");
  expect(read("Crate", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../Shelf/plan.md> \"The plan\"\n");

  // Renaming a note by its title renames the file (FIL-07), and links to it follow.
  await row("Plan").click();
  await page.keyboard.press(rename);
  await tree.getByRole("textbox", { name: "Title" }).fill("Master plan");
  await page.keyboard.press("Enter");
  await expect(toast("Renamed to “Master plan”. Updated links in 3 notes.")).toBeVisible({ timeout: 10_000 });
  expect(read("Shelf", "master-plan.md")).toBe("# Master plan\n\nBack [home](../Welcome.md). Not a link: `[home](Welcome.md)`.\n");
  expect(existsSync(join(docs, "Shelf", "plan.md"))).toBe(false);
  expect(read("Crate", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../Shelf/master-plan.md> \"The plan\"\n");
  expect(read("Locked", "blocker.md")).toBe("# Blocker\n\n[plan](../Shelf/master-plan.md)\n");
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Crate/assets/pic.png)\n\nSee [the plan](Shelf/master-plan.md#steps) and [inside](Crate/inner.md).\n\nTyped before the move.\n");
  await expect(editor.locator('a[href="Shelf/master-plan.md#steps"]')).toHaveCount(1);
  await quit(l);
});
