/**
 * MW journeys (D-90): the web app against a built site with a fixture instance (e2e/fixture: public
 * notes, and private notes sealed for the passphrase below). Notes written here stay in the browser,
 * the instance's notes are read-only, and nothing goes anywhere but the site itself.
 */
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const PASSPHRASE = "correct horse battery staple";
const SITE = "127.0.0.1:4317";
const mod = "Control";
/** Dialogs fade in; accessibility checks run on the settled page, not mid-fade. */
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const corner = (page: Page) => page.getByRole("region", { name: "Account" });

/** Records every host the page talks to, and stubs GitHub's pages that buttons open in new tabs. */
async function watch(page: Page) {
  const hosts = new Set<string>();
  page.context().on("request", (r) => hosts.add(new URL(r.url()).host));
  await page.context().route("https://github.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>GitHub</title>" }));
  return hosts;
}
/** A site with no instance files: what local development and a fresh copy before its first deploy look like. */
const noInstance = (page: Page) => page.route("**/focus-notes.json", (route) => route.fulfill({ status: 404, body: "" }));

/** The paths of the notes kept in this browser. */
const notePaths = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); });
  return new Promise<string[]>((res) => { const r = db.transaction("notes").objectStore("notes").getAllKeys(); r.onsuccess = () => res((r.result as string[]).sort()); });
});

async function unlock(page: Page, button: "Unlock" | "Unlock and remember") {
  await corner(page).getByRole("button", { name: "Unlock" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock private notes" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Passphrase").fill(PASSPHRASE);
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test("your notes stay in this browser: written with no account, kept across reloads and offline", async ({ page, context }) => {
  const hosts = await watch(page);
  await noInstance(page);
  await page.goto("./");
  await expect(editor(page)).toContainText("Welcome to Focus Notes");
  await expect(editor(page)).toContainText("This note lives in this browser");
  // Outside an instance there's nothing to unlock and no visitor view.
  await expect(corner(page)).toHaveCount(0);

  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Written in the browser.");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(editor(page)).toContainText("Written in the browser.");

  await context.setOffline(true);
  await page.keyboard.press(`${mod}+Alt+n`);
  await expect(editor(page)).not.toContainText("Written in the browser.");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("# Offline thoughts");
  await expect(editor(page)).toContainText("Offline thoughts");
  // Saved to IndexedDB while offline: the note is there before the reload, named after its title (FIL-07).
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); });
    return new Promise<string>((res) => { const r = db.transaction("notes").objectStore("notes").get("offline-thoughts.md"); r.onsuccess = () => res(r.result?.text ?? ""); });
  })).toContain("Offline thoughts");
  expect(await notePaths(page)).toEqual(["Welcome.md", "offline-thoughts.md"]);
  await context.setOffline(false);
  await page.reload();
  await expect(editor(page)).toContainText("Offline thoughts");
  await page.keyboard.press(`${mod}+o`);
  const open = page.getByRole("dialog", { name: "Open a note" });
  await expect(open.getByRole("option")).toHaveCount(2);
  await open.getByRole("combobox", { name: "Find a note" }).fill("welc");
  await expect(open.getByRole("option")).toHaveCount(1);
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(editor(page)).toContainText("Written in the browser.");

  // The browser holds no GitHub credential and talks to nothing but its own site (D-90).
  expect([...hosts].filter((h) => h !== SITE)).toEqual([]);
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const keys = await new Promise<IDBValidKey[]>((res) => { const r = db.transaction("meta").objectStore("meta").getAllKeys(); r.onsuccess = () => res(r.result); });
    return keys.map(String);
  });
  // Only what the data inventory lists: the app state and the notes' format (DST-05).
  expect(stored).toEqual(["appState", "workspaceFormat"]);
});

test("a visitor sees the public notes read-only and how to use the app for themselves", async ({ page, context }) => {
  const hosts = await watch(page);
  await page.goto("./");
  // The first visit opens the newest public note, read-only (FRE-09, PKG-09).
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  await expect(editor(page)).toHaveAttribute("aria-readonly", "true");
  await expect(editor(page)).toHaveAttribute("contenteditable", "false");
  const c = corner(page);
  await expect(c.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Use this app for yourself" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Read only · Copy to my notes" })).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-visitor.png" });

  // Open… lists the public notes, marked as such; private ones stay hidden until unlocked.
  await page.keyboard.press(`${mod}+o`);
  const open = page.getByRole("dialog", { name: "Open a note" });
  await expect(open.getByRole("option")).toHaveCount(2);
  await expect(open.getByRole("option", { name: /Garden log/ })).toContainText("Public · Guides");
  await open.getByRole("option", { name: /Reading list/ }).click();
  await expect(editor(page)).toContainText("Books I want to read");

  // Use this app for yourself explains the model and goes only to GitHub's own pages (DST-01).
  await c.getByRole("button", { name: "Use this app for yourself" }).click();
  const about = page.getByRole("dialog", { name: "Use this app for yourself" });
  await expect(about).toContainText("Nothing here is shared with you");
  await expect(about).toContainText("Use this template");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-about.png" });
  const [template] = await Promise.all([context.waitForEvent("page"), about.getByRole("button", { name: "Make my own copy on GitHub" }).click()]);
  expect(template.url()).toBe("https://github.com/prabinpebam/focus-notes-workspace");
  await template.close();
  const [release] = await Promise.all([context.waitForEvent("page"), about.getByRole("button", { name: "Download the desktop app" }).click()]);
  expect(release.url()).toBe("https://github.com/prabinpebam/focus-notes/releases/latest");
  await release.close();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();

  // Typing changes nothing; Copy to my notes makes an editable copy here.
  await editor(page).click();
  await page.keyboard.type("nope");
  await expect(editor(page)).not.toContainText("nope");
  await c.getByRole("button", { name: "Read only · Copy to my notes" }).click();
  await expect(page.getByText("Copied to your notes in this browser as “Reading”.")).toBeVisible();
  await expect(editor(page)).not.toHaveAttribute("aria-readonly", "true");
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Mine now.");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(editor(page)).toContainText("Mine now.");
  await expect(c.getByRole("button", { name: "Read only · Copy to my notes" })).toHaveCount(0);
  expect([...hosts].filter((h) => h !== SITE && h !== "github.com")).toEqual([]);
});

test("the owner unlocks private notes read-only; the page forgets them unless asked to remember", async ({ page }) => {
  await watch(page);
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  await corner(page).getByRole("button", { name: "Unlock" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock private notes" });
  await expect(dialog).toContainText("Every site at 127.0.0.1:4317 shares this browser's storage and can reach this page");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-unlock.png" });

  // A wrong passphrase: one generic message, and the field is cleared for another try.
  await dialog.getByLabel("Passphrase").fill("not the passphrase");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("That passphrase doesn't open the private notes on this site.")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByLabel("Passphrase")).toHaveValue("");
  expect(await settledAxe(page)).toEqual([]);

  await dialog.getByLabel("Passphrase").fill(PASSPHRASE);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("1 private note unlocked until you close this page.")).toBeVisible();
  const pill = corner(page).getByRole("button", { name: "Private notes unlocked for octo" });
  await expect(pill).toHaveText("octo");
  await expect(corner(page).getByRole("button", { name: "Use this app for yourself" })).toHaveCount(0);

  await page.keyboard.press(`${mod}+o`);
  const open = page.getByRole("dialog", { name: "Open a note" });
  await expect(open.getByRole("option")).toHaveCount(3);
  await open.getByRole("option", { name: /Launch/ }).click();
  await expect(editor(page)).toContainText("second week of November");
  await expect(editor(page)).toHaveAttribute("aria-readonly", "true");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-unlocked.png" });

  // Nothing that opens the vault was stored: a reload locks it again.
  const keys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); });
    return new Promise<string[]>((res) => { const r = db.transaction("meta").objectStore("meta").getAllKeys(); r.onsuccess = () => res(r.result.map(String)); });
  });
  expect(keys).not.toContain("vaultUnlockKey");
  await page.reload();
  await expect(corner(page).getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(editor(page)).not.toContainText("second week of November");

  // Remembered: still unlocked after a reload, until Forget this browser.
  await unlock(page, "Unlock and remember");
  await page.reload();
  await expect(corner(page).getByRole("button", { name: "Private notes unlocked for octo" })).toBeVisible();
  await corner(page).getByRole("button", { name: "Private notes unlocked for octo" }).click();
  const menu = page.getByRole("menu", { name: "Private notes unlocked for octo" });
  await expect(menu.getByText("Remembered on this browser")).toBeVisible();
  await menu.getByRole("menuitem", { name: "Forget this browser" }).click();
  await expect(page.getByText("Private notes locked, and this browser forgot the key.")).toBeVisible();
  await page.reload();
  await expect(corner(page).getByRole("button", { name: "Unlock" })).toBeVisible();
});

test("export your notes, and import them into another browser without losing anything (PKG-11)", async ({ page, browser }) => {
  await watch(page);
  await noInstance(page);
  await page.goto("./");
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Exported text.");
  await page.waitForTimeout(800);

  await page.keyboard.press(`${mod}+.`);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await toolbar.getByRole("button", { name: "More" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Export my notes…" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^focus-notes-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const bundle = JSON.parse(await readFile(file, "utf8"));
  expect(bundle.format).toBe("focus-notes/export/v1");
  expect(bundle.notes).toHaveLength(1);
  await expect(page.getByText("Exported 1 note.")).toBeVisible();

  // A second browser (its own storage) with a note of the same name: both are kept.
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:4317/" });
  const p2 = await other.newPage();
  await noInstance(p2);
  await p2.goto("./");
  await expect(editor(p2)).toContainText("Welcome to Focus Notes");
  await p2.keyboard.press(`${mod}+.`);
  await p2.getByRole("toolbar", { name: "Toolbar" }).getByRole("button", { name: "More" }).click();
  const [chooser] = await Promise.all([p2.waitForEvent("filechooser"), p2.getByRole("menuitem", { name: "Import notes…" }).click()]);
  await chooser.setFiles(file);
  await expect(p2.getByText("Imported 1 note; 1 kept with a new name, because its name was taken.")).toBeVisible();
  await p2.keyboard.press(`${mod}+o`);
  const open = p2.getByRole("dialog", { name: "Open a note" });
  await expect(open.getByRole("option")).toHaveCount(2);
  await open.getByRole("option", { name: /Welcome 2/ }).click();
  await expect(editor(p2)).toContainText("Exported text.");
  await other.close();
});

test("DST-05: notes a newer Focus Notes saved in this browser open read-only and are never written", async ({ page }) => {
  await noInstance(page);
  await page.goto("./");
  await expect(editor(page)).toContainText("Welcome to Focus Notes");
  const meta = (value?: string) => page.evaluate(async (v) => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); });
    const store = db.transaction("meta", v === undefined ? "readonly" : "readwrite").objectStore("meta");
    return new Promise<string>((res) => { const r = v === undefined ? store.get("workspaceFormat") : store.put(v, "workspaceFormat"); r.onsuccess = () => res(String(r.result)); });
  }, value);
  // The current app recorded its format; a newer one has since written its own.
  expect(JSON.parse(await meta())).toEqual({ formatVersion: 1 });
  await meta('{"formatVersion":99}');
  await page.reload();
  await expect(editor(page)).toContainText("Welcome to Focus Notes");
  await expect(page.getByText(/saved by a newer Focus Notes \(format 99\)/)).toBeVisible();
  await expect(corner(page).getByRole("button", { name: "Read only · Needs a newer Focus Notes" })).toBeVisible();
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Typed anyway.");
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(editor(page)).not.toContainText("Typed anyway.");
  expect(await notePaths(page)).toEqual(["Welcome.md"]);
  expect(await meta()).toBe('{"formatVersion":99}');
});
