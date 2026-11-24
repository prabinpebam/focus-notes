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
import type { Locator } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** A tab's resolved fill and outline, and what the given CSS custom properties resolve to in the same scope. */
async function tabColours(tab: Locator, fill: string, border: string) {
  return tab.locator("xpath=ancestor::li[1]").evaluate((li, vars) => {
    const resolve = (name: string, prop: "backgroundColor" | "borderTopColor") => {
      const probe = document.createElement("span");
      probe.style.setProperty(prop === "backgroundColor" ? "background-color" : "border-top-color", `var(${name})`);
      probe.style.borderTopStyle = "solid";
      li.parentElement!.appendChild(probe);
      const v = getComputedStyle(probe)[prop];
      probe.remove();
      return v;
    };
    const cs = getComputedStyle(li);
    const sides = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
    return {
      fill: cs.backgroundColor, border: cs.borderTopColor, sameOnAllSides: sides.every((s) => s === sides[0]),
      widths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
      expectedFill: resolve(vars.fill, "backgroundColor"), expectedBorder: resolve(vars.border, "borderTopColor"),
    };
  }, { fill, border });
}

for (const appearance of ["light", "dark"] as const) test(`FIL-20: the active opened tab takes the project accent in ${appearance}`, async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nFirst body.\n");
  writeFileSync(join(dirs.docs, "spec.md"), "# Spec ideas\n\nSecond body.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, appearance,
    projectSettings: { [dirs.docs]: { name: "Sample project", accent: "teal", logo: "rocket", watermark: "off", font: "app", theme: appearance === "light" ? "paper" : "ink" } },
  }));
  const l = await launch(dirs);
  const { page } = l;
  try {
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("First body.");
    await expect(page.locator("[data-app-root]")).toHaveAttribute("data-project-accent", "teal");
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    await files.getByRole("button", { name: "Dock Files" }).click();
    const tree = files.getByRole("tree", { name: "Notes and folders" });
    await fileRow(tree, "Spec ideas").dblclick();
    await expect(editor).toContainText("Second body.");
    const opened = files.locator("section#filesOpened");
    const specTab = opened.getByRole("button", { name: "Spec ideas", exact: true });
    const welcomeTab = opened.getByRole("button", { name: "Welcome", exact: true });
    await expect(specTab).toHaveAttribute("aria-current", "page");
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

    // The project's tint fills the active tab and its accent is the whole outline; light takes the strong shade, dark the soft one.
    const shade = appearance === "light" ? "strong" : "soft";
    const active = await tabColours(specTab, `--fn-ref-color-project-teal-${shade}-tint`, `--fn-ref-color-project-teal-${shade}`);
    expect(active.fill).toBe(active.expectedFill);
    expect(active.border).toBe(active.expectedBorder);
    expect(active.sameOnAllSides).toBe(true);
    expect(active.fill).not.toBe("rgba(0, 0, 0, 0)");

    // The other tab keeps the resting look: no fill, the neutral outline, the same box.
    const rest = await tabColours(welcomeTab, "--fn-cmp-opened-files-background", "--fn-cmp-opened-files-border");
    expect(rest.fill).toBe(rest.expectedFill);
    expect(rest.border).toBe(rest.expectedBorder);
    expect(rest.border).not.toBe(active.border);
    expect(rest.widths).toEqual(active.widths);
    const [a, r] = [await specTab.locator("xpath=ancestor::li[1]").boundingBox(), await welcomeTab.locator("xpath=ancestor::li[1]").boundingBox()];
    expect(a!.height).toBe(r!.height);
    await files.screenshot({ path: `../../test-results/screens/opened-files-accent-${appearance}.png` });
    expect(await axeViolations(page)).toEqual([]);
  } finally {
    await quit(l);
  }
});

test("FIL-20: outside a project the active opened tab keeps the quiet selected fill", async () => {
  const dirs = tempDirs();
  const path = join(dirs.docs, "Welcome.md");
  writeFileSync(path, "# Welcome\n\nLocal body.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", localNotes: true, projectIntroSeen: true, lastNotePath: path }));
  const l = await launch(dirs, { FOCUS_NOTES_LOCAL_NOTES: "1", FOCUS_NOTES_LOCAL_NOTES_HOME: dirs.docs });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Local body.");
    await expect(page.locator("[data-app-root]")).not.toHaveAttribute("data-project-accent", /.+/);
    await page.keyboard.press(`${mod}+O`);
    const tab = page.locator("section#filesOpened").getByRole("button", { name: "Welcome", exact: true });
    await expect(tab).toHaveAttribute("aria-current", "page");
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const fallback = await tabColours(tab, "--fn-cmp-opened-files-current", "--fn-cmp-opened-files-border");
    expect(fallback.fill).toBe(fallback.expectedFill);
    expect(fallback.border).toBe(fallback.expectedBorder);
    expect(fallback.sameOnAllSides).toBe(true);
    await page.getByRole("complementary").first().screenshot({ path: "../../test-results/screens/opened-files-no-project.png" });
  } finally {
    await quit(l);
  }
});

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
