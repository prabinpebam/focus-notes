/**
 * Opened files vertical tabs above Pinned in the Files panel (D-410, FIL-20):
 * single-click activation, × close on hover/focus, ⋯ Close all without confirmation,
 * section hidden when nothing is open, and open notes omitted from Recent.
 */
import { test, expect } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileRow, launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("FIL-20: Opened files vertical tabs above Pinned — activate, close, close all without confirm, omitted from Recent", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nFirst body.\n");
  writeFileSync(join(dirs.docs, "spec.md"), "# Spec ideas\n\nSecond body.\n");
  writeFileSync(join(dirs.docs, "reading.md"), "# Reading list\n\nThird body.\n");
  const l = await launch(dirs);
  const { page } = l;
  try {
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("First body.");

    // Open and dock the Files panel so Opened files, Pinned, Recent and the tree stay visible.
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    await expect(files).toBeVisible();
    await files.getByRole("button", { name: "Dock Files" }).click();

    const opened = files.locator("section#filesOpened");
    const tree = files.getByRole("tree", { name: "Notes and folders" });
    const shortcuts = files.locator("#filesShortcuts");

    // Opened files sits above Pinned and shows the active note with a border.
    await expect(opened).toBeVisible();
    const openedBox = await opened.boundingBox();
    const shortcutsBox = await shortcuts.boundingBox();
    expect(openedBox).not.toBeNull();
    expect(shortcutsBox).not.toBeNull();
    expect(openedBox!.y + openedBox!.height).toBeLessThanOrEqual(shortcutsBox!.y + 1);

    const welcomeTab = opened.getByRole("button", { name: "Welcome", exact: true });
    await expect(welcomeTab).toHaveAttribute("aria-current", "page");

    // Open two more notes from the tree; all three appear in Opened files and none in Recent.
    await fileRow(tree, "Spec ideas").dblclick();
    await expect(editor).toContainText("Second body.");
    await fileRow(tree, "Reading list").dblclick();
    await expect(editor).toContainText("Third body.");

    const specTab = opened.getByRole("button", { name: "Spec ideas", exact: true });
    const readingTab = opened.getByRole("button", { name: "Reading list", exact: true });
    await expect(welcomeTab).toBeVisible();
    await expect(specTab).toBeVisible();
    await expect(readingTab).toHaveAttribute("aria-current", "page");
    await expect(shortcuts.getByRole("treeitem", { name: /Welcome/ })).toHaveCount(0);
    await expect(shortcuts.getByRole("treeitem", { name: /Spec ideas/ })).toHaveCount(0);
    await expect(shortcuts.getByRole("treeitem", { name: /Reading list/ })).toHaveCount(0);

    // Single click activates a tab and updates the editor.
    await specTab.click();
    await expect(editor).toContainText("Second body.");
    await expect(specTab).toHaveAttribute("aria-current", "page");
    await expect(readingTab).not.toHaveAttribute("aria-current", "page");

    // Accessibility check while populated.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    expect(await axeViolations(page)).toEqual([]);

    // Hover a tab and click its × close button: removes it from Opened files and returns it to Recent.
    await readingTab.hover();
    await opened.getByRole("button", { name: "Close Reading list" }).click();
    await expect(readingTab).toHaveCount(0);
    await expect(editor).toContainText("Second body.");
    await expect(shortcuts.getByRole("treeitem", { name: /Reading list/ })).toBeVisible();

    // Header ⋯ → Close all clears all tabs with no confirmation dialog, hides Opened files, and returns notes to Recent.
    await opened.getByRole("button", { name: "Opened files actions" }).click();
    await page.getByRole("menuitem", { name: "Close all" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(opened).toHaveCount(0);
    await expect(shortcuts.getByRole("treeitem", { name: /Welcome/ })).toBeVisible();
    await expect(shortcuts.getByRole("treeitem", { name: /Spec ideas/ })).toBeVisible();
    await expect(shortcuts.getByRole("treeitem", { name: /Reading list/ })).toBeVisible();
  } finally {
    await quit(l);
  }
});
