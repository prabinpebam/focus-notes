/**
 * M3 journeys for public and private roots (WP-3.4): changing who can see a note is confirmed and
 * makes a commit in each repository, private first, then the pointer (FIL-06, SHR-02, D-97); no
 * private text reaches the public repository; new notes are private by default (SHR-01); and Import
 * notes adds an exported bundle as private notes, as ordinary commits (FRE-10). Local bare remotes
 * only: nothing touches the network.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, readdirSync, readFileSync, truncateSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, quit, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { git, instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const subject = (remote: string) => git(remote, "log", "-1", "--format=%s", "main");
/** A file on a remote's main branch, or "" until it's there. */
const show = (remote: string, path: string) => {
  try {
    return git(remote, "show", `main:${path}`);
  } catch {
    return "";
  }
};
const pointer = (notesRemote: string) => git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2];
async function more(page: Page, item: RegExp) {
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: item }).click();
}
/** Moves focus with Tab until it's on the target, then presses Enter: the dialog's keyboard path. */
async function tabTo(page: Page, target: import("@playwright/test").Locator) {
  for (let i = 0; i < 8 && !(await target.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}
/** Git commits the main process logged since a point, by repository: `notes` or `private`. */
const commitsSince = (l: Launched, from: number) => l.log.slice(from).filter((x) => x.includes("git-commit")).map((x) => /repo=(\w+)/.exec(x)![1]);

test("FIL-06, SHR-02: Make public asks first, then commits in both repositories, private first; Make private keeps private text out of the public history", async () => {
  const { dirs, notesRemote, privateRemote } = instance();
  // The pointer follows every private commit here, so each step can be checked (D-97 lets it wait 5 minutes).
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_POINTER_GAP_MS: "0" });
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");
  await expect(editor).toBeFocused();

  // ⋯ → Make public: the confirmation says who will read it, and nothing moves until it's confirmed.
  await more(page, /^Make public/);
  const confirm = page.getByRole("dialog", { name: "Make public?" });
  await expect(confirm).toContainText("Anyone with the link will be able to read “Welcome”");
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  expect(existsSync(join(dirs.docs, "private", "notes", "welcome.md"))).toBe(true);

  await more(page, /^Make public/);
  const from = l.log.length;
  await tabTo(page, confirm.getByRole("button", { name: "Make public" }));
  await expect(page.locator("#toasts").getByText("Made “Welcome” public.")).toBeVisible({ timeout: 15_000 });
  expect(existsSync(join(dirs.docs, "notes", "welcome.md"))).toBe(true);
  expect(existsSync(join(dirs.docs, "private", "notes", "welcome.md"))).toBe(false);
  expect(commitsSince(l, from).slice(0, 2)).toEqual(["private", "notes"]);
  await expect.poll(() => subject(privateRemote), { timeout: 15_000 }).toBe("Make public: notes/welcome.md");
  await expect.poll(() => show(notesRemote, "notes/welcome.md"), { timeout: 15_000 }).toContain("First line.");
  await expect.poll(() => pointer(notesRemote), { timeout: 15_000 }).toBe(git(privateRemote, "rev-parse", "main"));
  // The Files panel shows it under Public, said in its name.
  await page.keyboard.press(`${mod}+O`);
  await expect(page.getByRole("treeitem", { name: "Welcome, public" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Make private: said plainly that history keeps what was public.
  await more(page, /^Make private/);
  const back = page.getByRole("dialog", { name: "Make private?" });
  await expect(back).toContainText("history");
  await back.getByRole("button", { name: "Make private" }).click();
  await expect(page.locator("#toasts").getByText("Made “Welcome” private.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => existsSync(join(dirs.docs, "private", "notes", "welcome.md"))).toBe(true);
  // Written while private: only the private repository ever has it.
  await editor.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" A private thought: quince-73.");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => show(privateRemote, "notes/welcome.md"), { timeout: 15_000 }).toContain("quince-73");
  await expect.poll(() => subject(notesRemote), { timeout: 15_000 }).toMatch(/^Update private notes to /);
  expect(git(notesRemote, "log", "--all", "-p")).not.toContain("quince-73");
  expect(git(dirs.docs, "log", "--all", "-p")).not.toContain("quince-73");
  await quit(l);
});

test("SHR-01: a new note is private by default, even from a public note", async () => {
  const { dirs } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("First line.");
  // Open the public note from Files.
  await page.keyboard.press(`${mod}+O`);
  await page.getByRole("treeitem", { name: "Hello, public" }).click();
  // Opening is ⌘↓ on macOS, where Enter renames, as in Finder (Keyboard shortcuts → Files panel).
  await page.getByRole("treeitem", { name: "Hello, public" }).press(process.platform === "darwin" ? "Meta+ArrowDown" : "Enter");
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Hello");
  await page.keyboard.press(`${mod}+N`);
  await expect(page.getByRole("textbox", { name: "Note" })).not.toContainText("Hello");
  await page.keyboard.type("Fresh thoughts");
  const privateNotes = join(dirs.docs, "private", "notes");
  await expect.poll(() => readdirSync(privateNotes).some((n) => readFileSync(join(privateNotes, n), "utf8").includes("Fresh thoughts")), { timeout: 10_000 }).toBe(true);
  expect(readdirSync(join(dirs.docs, "notes")).sort()).toEqual(["hello.md"]);
  await quit(l);
});

test("FRE-10: Import notes adds a browser's bundle as private notes, in one commit; a file too large is refused unread", async () => {
  const { dirs, privateRemote, notesRemote } = instance();
  const bundleDir = mkdtempSync(join(tmpdir(), "fn-bundle-"));
  const bundle = join(bundleDir, "focus-notes-export-2026-10-14.json");
  writeFileSync(bundle, JSON.stringify({
    format: "focus-notes/export/v1", exported: "2026-10-14T10:00:00Z",
    notes: [
      { path: "Trip/Day one.md", text: "# Day one\n\nFrom the browser: fig-58.\n", updated: "2026-10-13T10:00:00Z" },
      { path: "welcome.md", text: "# Welcome (browser)\n", updated: "2026-10-13T10:00:00Z" },
    ],
  }));
  const huge = join(bundleDir, "huge.json");
  writeFileSync(huge, "");
  truncateSync(huge, 65 * 1024 * 1024);
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page, app } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("First line.");
  // The system's open dialog, answered for the test; only the main process reads the file.
  const answer = (file: string) => app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog; }, file);

  await answer(huge);
  await more(page, /^Import notes/);
  await expect(page.locator("#toasts").getByText("That file is too large to be a Focus Notes export. Nothing was imported.")).toBeVisible();

  await answer(bundle);
  await more(page, /^Import notes/);
  const dialog = page.getByRole("dialog", { name: "Import notes" });
  await expect(dialog).toContainText("2 notes from “focus-notes-export-2026-10-14.json”");
  await expect(dialog.getByRole("radio", { name: "Private" })).toBeChecked();
  await expect(dialog).toContainText("Only you can read them.");
  expect(await settledAxe(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(page.locator("#toasts").getByText(/^Imported 2 notes into Private; 1 kept with a new name/)).toBeVisible({ timeout: 15_000 });
  // Nothing replaced: the browser's welcome.md is kept beside the instance's own.
  expect(readFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "utf8")).toContain("First line.");
  expect(readFileSync(join(dirs.docs, "private", "notes", "welcome 2.md"), "utf8")).toBe("# Welcome (browser)\n");
  expect(readFileSync(join(dirs.docs, "private", "notes", "Trip", "Day one.md"), "utf8")).toContain("fig-58");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => subject(privateRemote), { timeout: 15_000 }).toBe("Import 2 notes");
  expect(git(notesRemote, "log", "--all", "-p")).not.toContain("fig-58");
  // The new notes show in Files under Private.
  await page.keyboard.press(`${mod}+O`);
  await expect(page.getByRole("treeitem", { name: "Trip" })).toBeVisible();
  await quit(l);
});

test("PRV-03: Sync appearance keeps the synced settings in the private repository, committed there and never in the public one", async () => {
  const { dirs, privateRemote, notesRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("First line.");
  const file = join(dirs.docs, "private", ".focus-notes", "settings.json");
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitemcheckbox", { name: /^Sync appearance/ }).click();
  await expect(page.locator("#toasts").getByText("Appearance now syncs through your private notes.")).toBeVisible();
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitemcheckbox", { name: "Dark" }).click();
  await expect.poll(() => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).appearance?.mode : undefined)).toBe("dark");
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => show(privateRemote, ".focus-notes/settings.json"), { timeout: 15_000 }).toContain('"mode": "dark"');
  expect(git(notesRemote, "log", "--all", "--format=", "--name-only")).not.toContain("settings.json");
  // This device's own state doesn't hold the synced choice: it comes from the private repository.
  expect(JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8")).appearance).toBeUndefined();
  await quit(l);
});
