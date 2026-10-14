/**
 * The M2 demo script (Implementation plan → M2) as one journey, Windows first (D-112): full screen
 * with F11 (step 3), a folder of notes managed in Files (step 4), a rename that updates the links to
 * it (step 5), and a crash while typing that the next launch restores (step 6). Snap, Snap Layouts,
 * Win+arrows, mixed-DPI monitors (step 1), the macOS menu bar (step 2), and the 10,000-note memory
 * and idle CPU budgets (step 7, `pnpm bench`) are the owner's checks in the gate evidence.
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, placed, quit, tempDirs, type Launched } from "./helpers.ts";
import { crash, journalAhead, LOSS_BUDGET_MS, START, typedPart, typeTimed } from "./recovery.ts";
import { axeViolations } from "./axe.ts";

const ls = (dir: string) => readdirSync(dir).filter((n) => !n.startsWith(".")).sort();
const bounds =  (l: Launched) => l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds());
const displayBounds = (l: Launched) =>
  l.app.evaluate(({ BrowserWindow, screen }) => screen.getDisplayMatching(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds()).bounds);

test.skip(process.platform !== "win32", "Windows first (D-112): macOS and Linux join at the platform parity pass");

test("M2 demo: full screen, Files, links that follow a rename, and the text back after a crash (DSK-04, FIL-01, FIL-02, FIL-03, FIL-08, FIL-09, QLT-03)", async () => {
  const dirs = tempDirs();
  const docs = dirs.docs;
  const note = join(docs, "Welcome.md");
  writeFileSync(note, START);
  writeFileSync(join(docs, "ideas.md"), "# Ideas\n\nSee [the plan](plan.md).\n");
  writeFileSync(join(docs, "plan.md"), "# Plan\n\nSteps.\n");
  writeFileSync(join(docs, "old.md"), "# Old\n");
  const l = await launch(dirs);
  const { page } = l;
  // The system trash is recorded instead of used.
  await l.app.evaluate(({ shell }) => {
    const fs = process.getBuiltinModule("node:fs");
    shell.trashItem = async (p: string) => { fs.rmSync(p, { recursive: true }); };
  });
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Start.");
  await expect(editor).toBeFocused();

  // Step 3: in and out of full screen with F11 (the app's own full screen covers the display).
  const rest = await bounds(l);
  await page.keyboard.press("F11");
  await expect.poll(() => bounds(l)).toEqual(await placed(l.app, await displayBounds(l)));
  await page.keyboard.press("F11");
  await expect.poll(() => bounds(l)).toEqual(rest);

  // Step 4: Files creates a folder, deletes a note, selects several, and moves them with Move to….
  await page.keyboard.press("Control+O");
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  await expect(row("Welcome to Focus Notes")).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+Shift+N");
  await expect(tree.getByRole("textbox", { name: "Folder name" })).toBeFocused();
  await page.keyboard.type("Archive");
  await page.keyboard.press("Enter");
  await expect.poll(() => existsSync(join(docs, "Archive"))).toBe(true);

  await row("Old").click();
  await page.keyboard.press("Delete");
  await expect(page.locator("#toasts").getByText("Moved “Old” to the trash.")).toBeVisible();
  await expect.poll(() => existsSync(join(docs, "old.md"))).toBe(false);

  // Step 5: renaming a note others link to updates their links.
  await row("Plan").click();
  await page.keyboard.press("F2");
  const title = tree.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue("Plan");
  await title.fill("Launch plan");
  await page.keyboard.press("Enter");
  await expect(row("Launch plan")).toBeVisible();
  await expect.poll(() => readFileSync(join(docs, "ideas.md"), "utf8")).toBe("# Ideas\n\nSee [the plan](launch-plan.md).\n");

  await row("Ideas").click();
  await row("Launch plan").click({ modifiers: ["Control"] });
  await expect(files.getByText("2 selected")).toBeVisible();
  await page.keyboard.press("Control+Shift+M");
  const move = page.getByRole("dialog", { name: "Move 2 items to…" });
  await expect(move.getByRole("combobox", { name: "Find a folder" })).toBeFocused();
  await page.keyboard.type("arch");
  await page.keyboard.press("Enter");
  await expect.poll(() => ls(join(docs, "Archive"))).toEqual(["ideas.md", "launch-plan.md"]);
  // Moved together, the link between them still points at the same note.
  expect(readFileSync(join(docs, "Archive", "ideas.md"), "utf8")).toBe("# Ideas\n\nSee [the plan](launch-plan.md).\n");
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(files).toBeHidden();

  // Step 6: kill the app while typing; the next launch puts the text back.
  await expect(editor).toBeFocused();
  await expect(editor).toContainText("Start.");
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  const typed = await typeTimed(page, "the demo keeps writing while the app is killed, and the words come back", { until: () => journalAhead(dirs.userData, note) });
  const killedAt = await crash(l, dirs.userData);
  const again = await launch(dirs);
  const restored = typedPart(readFileSync(note, "utf8"));
  expect(typed.text.startsWith(restored)).toBe(true);
  expect(typed.lostMs(restored.length, killedAt)).toBeLessThanOrEqual(LOSS_BUDGET_MS);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toContainText(restored);
  await expect(again.page.getByRole("status").filter({ hasText: "Restored what you were writing" })).toBeVisible();
  await quit(again);
});
