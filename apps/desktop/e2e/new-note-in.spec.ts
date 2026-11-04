import { test, expect } from "./fixtures.ts";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("FIL-17: New note in picks this workspace's folder; Cancel writes nothing; New folder stays inline", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), JSON.stringify({ formatVersion: 1 }));
  mkdirSync(join(dirs.docs, "private", "notes", "Drafts"), { recursive: true });
  mkdirSync(join(dirs.docs, "notes", "Essays"), { recursive: true });
  const note = join(dirs.docs, "private", "notes", "Drafts", "start.md");
  writeFileSync(note, "# Start\n\nKeep this.\n");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("Keep this.");
    await page.keyboard.press(`${mod}+Shift+N`);
    const picker = page.getByRole("dialog", { name: "New note in…" });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("treeitem", { name: "Drafts", exact: true })).toHaveAttribute("aria-selected", "true");
    await picker.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(picker).toBeHidden();
    expect(readdirSync(join(dirs.docs, "private", "notes", "Drafts"))).toEqual(["start.md"]);
    await page.keyboard.press(`${mod}+Shift+N`);
    await picker.getByRole("treeitem", { name: "Essays", exact: true }).click();
    await picker.getByRole("button", { name: "New folder…", exact: true }).click();
    const name = picker.getByRole("textbox", { name: "Folder name" });
    await name.fill("Chapters");
    await name.press("Enter");
    await expect(picker.getByRole("treeitem", { name: "Chapters", exact: true })).toHaveAttribute("aria-selected", "true");
    await picker.getByRole("button", { name: "Create note", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(editor).toBeFocused();
    expect(readdirSync(join(dirs.docs, "notes", "Essays", "Chapters")).sort()).toEqual([".gitkeep", "Untitled.md"]);
    expect(readdirSync(join(dirs.docs, "private", "notes", "Drafts"))).toEqual(["start.md"]);
  } finally {
    await quit(l);
  }
});
