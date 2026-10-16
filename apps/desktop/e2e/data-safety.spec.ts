/** Journeys for the M0 review fixes: data safety on failed saves, and no navigation (review issues 3, 4). */
import { test, expect } from "./fixtures.ts";
import { chmodSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { launch, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("the window can't be navigated away from the app, even to a local file", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const before = page.url();
  await page.evaluate(() => { location.href = "file:///"; });
  await page.waitForTimeout(500);
  // Ask the main process: Playwright keeps waiting for a navigation that was blocked.
  const after = await l.app.evaluate(async ({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents;
    return { url: wc.getURL(), hasEditor: await wc.executeJavaScript("Boolean(document.querySelector('[data-editor]'))") };
  });
  expect(after.url).toBe(before);
  expect(after.hasEditor).toBe(true);
  await l.app.close();
});

/**
 * Makes saving the note fail, then lets it succeed again (DEF-22). On Windows a read-only file can't
 * be replaced. On Linux and macOS replacing a file is the folder's to allow, not the file's, so a
 * read-only note is still saved there (nothing is lost); the folder is made read-only instead, and the
 * save's temporary file can't be created. Root ignores both, so the journey says so rather than pass
 * without proving anything.
 */
function blockSaving(note: string): () => void {
  if (process.platform === "win32") {
    chmodSync(note, 0o444);
    return () => chmodSync(note, 0o644);
  }
  if (process.getuid?.() === 0) throw new Error("Run as a user other than root: root writes into read-only folders");
  const folder = dirname(note);
  const mode = statSync(folder).mode & 0o777;
  chmodSync(folder, 0o555);
  return () => chmodSync(folder, mode);
}

test("a failed save keeps the window open until the text is saved or the person chooses to discard it", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page, app } = l;
  const note = join(dirs.docs, "Welcome.md");
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const allowSaving = blockSaving(note);
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.type("Unsaved precious text");
  // Answer the "Couldn't save" dialog with "Keep the window open".
  await app.evaluate(({ dialog }) => {
    (globalThis as { asked?: number }).asked = 0;
    dialog.showMessageBox = (async () => { (globalThis as { asked?: number }).asked!++; return { response: 0, checkboxChecked: false }; }) as typeof dialog.showMessageBox;
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await expect.poll(() => app.evaluate(() => (globalThis as { asked?: number }).asked), { timeout: 10_000 }).toBe(1);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await expect(page.getByRole("button", { name: /Couldn't save/ })).toBeVisible();

  // Once the file can be written again, closing saves and closes.
  allowSaving();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await app.waitForEvent("close", { timeout: 10_000 });
  expect(readFileSync(note, "utf8")).toBe("Unsaved precious text\n");
});
