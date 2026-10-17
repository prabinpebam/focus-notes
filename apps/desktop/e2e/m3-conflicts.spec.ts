/**
 * M3 journeys for conflicts and Recently deleted (WP-3.5): a note changed on two computers stops
 * the sync with [Resolve], the resolver shows both versions, and each choice ends in the promised
 * commits without losing text (FIL-12, DD-FB-04); a file changed outside while this window has
 * unsaved edits is never saved over (D-92); deleted notes are listed from Git history and restored
 * (FIL-10); and a delete's toast offers Undo. Keyboard and pointer, axe clean. Local bare remotes
 * only: nothing touches the network.
 */
import { test, expect, type Locator, type Page } from "./fixtures.ts";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { configure, git, instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const show = (repo: string, spec: string) => {
  try {
    return git(repo, "show", spec);
  } catch {
    return "";
  }
};
/** Every version of a file in a repository's history, so a test can tell that no text was lost. */
const everything = (repo: string) => git(repo, "log", "--all", "-p", "--format=%H");
/** Another computer: a clone of the private remote that rewrites welcome.md and pushes. */
function elsewhere(root: string, privateRemote: string, text: string) {
  const other = join(root, "other");
  git(root, "clone", "-q", privateRemote, other);
  configure(other);
  writeFileSync(join(other, "notes", "welcome.md"), text);
  git(other, "commit", "-q", "-am", "Edit on the other computer");
  git(other, "push", "-q");
}
async function typeAtEnd(page: Page, text: string) {
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");
  await editor.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(text);
}
// Enough presses to pass the trigger and, on Windows and Linux, the three window buttons (D-14).
async function tabTo(page: Page, target: Locator, max = 16) {
  for (let i = 0; i < max && !(await target.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}
const THEIRS = "# Welcome\n\nFirst line.\n\nWritten on the other computer.\n";

// M3 demo, step 4: the conflict resolver, with nothing lost.
test("FIL-12: a sync conflict offers Resolve; Take the other version by keyboard keeps mine in Recently deleted, which restores it (FIL-10)", async () => {
  const { dirs, privateRemote } = instance();
  elsewhere(join(dirs.docs, ".."), privateRemote, THEIRS);
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_POINTER_GAP_MS: "0" });
  const { page } = l;
  const priv = join(dirs.docs, "private");
  await typeAtEnd(page, " Typed on this computer.");
  await page.keyboard.press(`${mod}+S`);
  const toast = page.locator("#toasts").getByText("Couldn't sync: GitHub has changes that don't fit with yours. Both versions are kept.");
  await expect(toast).toBeVisible({ timeout: 20_000 });
  // F6 reaches the toast's action: Resolve.
  await page.keyboard.press("F6");
  const resolveButton = page.locator("#toasts").getByRole("button", { name: "Resolve" });
  await expect(resolveButton).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "“Welcome” changed on another computer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "This computer" })).toContainText("First line. Typed on this computer.");
  await expect(dialog.getByRole("region", { name: /^Other version, pushed / })).toContainText("Written on the other computer.");
  // The note is never shown half-merged: no conflict markers from the rebase that stopped.
  await page.waitForTimeout(500);
  await expect(page.getByRole("textbox", { name: "Note" })).not.toContainText("<<<<<<<");
  // The paragraphs that differ are marked, in words too.
  await expect(dialog.locator("[data-changed]").first()).toContainText("Changed:");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/conflict-resolver.png" });
  // Decide later (Esc) changes nothing.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(readFileSync(join(priv, "notes", "welcome.md"), "utf8")).toContain("Typed on this computer.");
  // Mod+S tries again and offers Resolve; the keyboard reaches each choice.
  await page.keyboard.press(`${mod}+S`);
  await expect(resolveButton).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("F6");
  await expect(resolveButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await tabTo(page, dialog.getByRole("button", { name: "Take the other version" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("#toasts").getByText("Took the other version of “Welcome”. Yours is in Recently deleted.")).toBeVisible({ timeout: 20_000 });
  // The editor shows the other version, and the remote has it.
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Written on the other computer.", { timeout: 10_000 });
  await expect.poll(() => show(privateRemote, "main:notes/welcome.md"), { timeout: 20_000 }).toBe(THEIRS.trim());
  expect(git(privateRemote, "log", "-1", "--format=%s", "main")).toMatch(/^Delete notes\/welcome-your-version-.+\.md$/);
  // Nothing was lost: this computer's text is in history.
  expect(everything(priv)).toContain("+First line. Typed on this computer.");

  // Recently deleted lists it; Restore puts it back in a commit.
  await page.keyboard.press(`${mod}+O`);
  const sheet = page.getByRole("complementary", { name: "Files" });
  const footer = sheet.getByRole("button", { name: /^Recently deleted/ });
  await tabTo(page, footer, 20);
  await page.keyboard.press("Enter");
  // Showing the list, the footer leads back to the tree (D-189).
  await expect(sheet.getByRole("button", { name: "Browse files" })).toBeVisible();
  await expect(sheet.getByRole("status").filter({ hasText: "1 note deleted in the last 30 days." })).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText(/^Welcome \(your version, /)).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/recently-deleted.png" });
  // Tab wraps past the trigger (and the window buttons on Windows and Linux), where the notes come from (its links and
  // Open local folder, D-188, D-189), the header's way back to Files, New note, New folder, Sort (D-175) and pin (D-161) to the panel's list.
  await tabTo(page, sheet.getByRole("button", { name: "Restore", exact: true }), 16);
  await page.keyboard.press("Enter");
  await expect(page.locator("#toasts").getByText(/^Restored “Welcome \(your version, .+\)” to “Private”\.$/)).toBeVisible({ timeout: 15_000 });
  // Back in the tree, selected and focused, and on disk with this computer's text.
  await expect(sheet.getByRole("treeitem", { name: /^Welcome \(your version, / })).toBeFocused();
  const copy = readdirSync(join(priv, "notes")).find((n) => n.startsWith("welcome-your-version-"))!;
  expect(readFileSync(join(priv, "notes", copy), "utf8")).toContain("First line. Typed on this computer.");
  expect(git(priv, "log", "-1", "--format=%s")).toBe(`Restore notes/${copy}`);
  await quit(l);
});

test("FIL-12: Keep both and Keep this computer's version by pointer, each ending in a pushed commit", async () => {
  const { dirs, privateRemote } = instance();
  elsewhere(join(dirs.docs, ".."), privateRemote, THEIRS);
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_POINTER_GAP_MS: "0" });
  const { page } = l;
  const priv = join(dirs.docs, "private");
  await typeAtEnd(page, " Mine, first time.");
  await page.keyboard.press(`${mod}+S`);
  await page.locator("#toasts").getByRole("button", { name: "Resolve" }).click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: "“Welcome” changed on another computer" });
  await dialog.getByRole("button", { name: "Keep both" }).click();
  await expect(page.locator("#toasts").getByText("Kept both versions of “Welcome”.")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => show(privateRemote, "main:notes/welcome-conflict-copy.md"), { timeout: 20_000 }).toContain("# Welcome (conflict copy)");
  expect(show(privateRemote, "main:notes/welcome-conflict-copy.md")).toContain("First line. Mine, first time.");
  expect(show(privateRemote, "main:notes/welcome.md")).toBe(THEIRS.trim());
  expect(existsSync(join(priv, "notes", "welcome-conflict-copy.md"))).toBe(true);
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Written on the other computer.", { timeout: 10_000 });

  // A second round: the other computer edits again, and this time mine is kept.
  const other = join(dirs.docs, "..", "other");
  git(other, "pull", "-q");
  writeFileSync(join(other, "notes", "welcome.md"), "# Welcome\n\nThe other computer, again.\n");
  git(other, "commit", "-q", "-am", "Again");
  git(other, "push", "-q");
  await typeAtEnd(page, " Mine, second time.");
  await page.keyboard.press(`${mod}+S`);
  await page.locator("#toasts").getByRole("button", { name: "Resolve" }).click({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Keep this computer's version" }).click();
  await expect(page.locator("#toasts").getByText("Kept this computer's version of “Welcome”. The other version is kept too.")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => show(privateRemote, "main:notes/welcome.md"), { timeout: 20_000 }).toContain("Mine, second time.");
  // The other version stays in history, right under the resolution.
  expect(show(privateRemote, "main^:notes/welcome.md")).toBe("# Welcome\n\nThe other computer, again.");
  expect(git(privateRemote, "log", "-1", "--format=%s", "main")).toBe("Resolve conflict in notes/welcome.md");
  await expect(page.getByRole("button", { name: "Couldn't sync" })).toHaveCount(0);
  await quit(l);
});

test("D-92, FIL-12: a file changed outside while this window has unsaved edits is never saved over; Keep this computer's version keeps the other in Recently deleted", async () => {
  const { dirs } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  const note = join(dirs.docs, "private", "notes", "welcome.md");
  await typeAtEnd(page, " Typed here.");
  // Another program writes the file before this window has saved (the save follows typing by 400 ms).
  writeFileSync(note, "# Welcome\n\nFirst line.\n\nChanged by another program.\n");
  await expect(page.locator("#toasts").getByText("“Welcome” changed outside Focus Notes. Your edits are kept here, and aren't saved over it until you choose.")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  expect(readFileSync(note, "utf8")).toContain("Changed by another program.");
  expect(readFileSync(note, "utf8")).not.toContain("Typed here.");
  // Mod+S asks for the choice instead of overwriting.
  await page.keyboard.press(`${mod}+S`);
  const dialog = page.getByRole("dialog", { name: "“Welcome” changed outside Focus Notes" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "This computer" })).toContainText("Typed here.");
  await expect(dialog.getByRole("region", { name: /^On disk, changed / })).toContainText("Changed by another program.");
  expect(await settledAxe(page)).toEqual([]);
  await tabTo(page, dialog.getByRole("button", { name: "Keep this computer's version" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("#toasts").getByText("Kept this computer's version of “Welcome”. The other version is kept too.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 5000 }).toContain("Typed here.");
  // The other program's text went to Recently deleted (a commit that adds it, then one that deletes it).
  const priv = join(dirs.docs, "private");
  expect(everything(priv)).toContain("+Changed by another program.");
  expect(git(priv, "log", "-1", "--format=%s")).toMatch(/^Delete notes\/welcome-other-version-.+\.md$/);
  await quit(l);
});

// M3 demo, step 7: delete a note and restore it.
test("FIL-10, DD-FB-01: a delete's toast offers Undo, which restores the note from history", async () => {
  const { dirs, notesRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("First line.");
  await page.keyboard.press(`${mod}+O`);
  const sheet = page.getByRole("complementary", { name: "Files" });
  const hello = sheet.getByRole("treeitem", { name: "Hello, public" });
  await hello.click();
  // Delete is ⌘⌫ on macOS, as in Finder (Keyboard shortcuts → Files panel).
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Backspace" : "Delete");
  // A public note asks first.
  await page.getByRole("dialog", { name: /Delete/ }).getByRole("button", { name: "Delete and unpublish" }).click();
  await expect(page.locator("#toasts").getByText("Moved “Hello” to the trash.")).toBeVisible({ timeout: 15_000 });
  expect(existsSync(join(dirs.docs, "notes", "hello.md"))).toBe(false);
  await page.keyboard.press("F6");
  await expect(page.locator("#toasts").getByRole("button", { name: "Undo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#toasts").getByText("Restored “Hello”.")).toBeVisible({ timeout: 15_000 });
  expect(readFileSync(join(dirs.docs, "notes", "hello.md"), "utf8")).toBe("# Hello\n");
  expect(git(dirs.docs, "log", "-2", "--format=%s").split("\n")).toEqual(["Restore notes/hello.md", "Delete notes/hello.md"]);
  await expect(sheet.getByRole("treeitem", { name: "Hello, public" })).toBeVisible();
  await expect.poll(() => show(notesRemote, "main:notes/hello.md"), { timeout: 20_000 }).toBe("# Hello");
  await quit(l);
});
