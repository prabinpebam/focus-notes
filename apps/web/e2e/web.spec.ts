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

// PKG-05: the web app runs from the site alone, holds no GitHub credential, and talks only to its own site.
// MW demo, step 2: write with no account, reload, go offline.
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
  // Quick open (Mod+P, Spotlight's notes) finds this browser's notes by name; Open… (Mod+O) is the Files panel.
  await page.keyboard.press(`${mod}+p`);
  const open = page.getByRole("dialog", { name: "Spotlight" });
  await expect(open.getByRole("option")).toHaveCount(2);
  await open.getByRole("combobox", { name: "Find a note by title or path" }).fill("welc");
  await expect(open.getByRole("group", { name: "Notes" }).getByRole("option")).toHaveCount(1);
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

// MW demo, steps 3 and 4: public notes read-only, Copy to my notes, and the visitor view.
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

  // Quick open lists the public notes, marked as such; private ones stay hidden until unlocked.
  await page.keyboard.press(`${mod}+p`);
  const open = page.getByRole("dialog", { name: "Spotlight" });
  await expect(open.getByRole("option")).toHaveCount(2);
  await expect(open.getByRole("option", { name: /Garden log/ })).toContainText("Guides/Garden.md · Public");
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

// MW demo, step 5: Unlock, Remember on this browser, and Forget.
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

  await page.keyboard.press(`${mod}+p`);
  const open = page.getByRole("dialog", { name: "Spotlight" });
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

// MW demo, step 6: export, then import into a second browser.
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
  await p2.keyboard.press(`${mod}+p`);
  const open = p2.getByRole("dialog", { name: "Spotlight" });
  await expect(open.getByRole("option")).toHaveCount(2);
  await open.getByRole("option", { name: /Welcome 2/ }).click();
  await expect(editor(p2)).toContainText("Exported text.");
  await other.close();
});

test("EDT-13 on the web: a note's links open in a new tab with noopener, and the app never navigates", async ({ page }) => {
  await noInstance(page);
  await page.goto("./");
  await expect(editor(page)).toContainText("Welcome to Focus Notes");
  await page.keyboard.press(`${mod}+Alt+n`);
  await expect(editor(page)).not.toContainText("Welcome to Focus Notes");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("# Links");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Read [the docs](https://example.com/docs) today");
  const link = editor(page).locator('a[href="https://example.com/docs"]');
  await expect(link).toHaveText("the docs");
  await page.evaluate(() => {
    const w = window as unknown as { opened: unknown[][] };
    w.opened = [];
    window.open = (...args: unknown[]) => { w.opened.push(args); return null; };
  });
  const opened = () => page.evaluate(() => (window as unknown as { opened: unknown[][] }).opened);
  const at = page.url();

  // A plain click places the caret, and the hover card offers Open.
  await link.click();
  expect(await opened()).toEqual([]);
  const card = page.getByRole("region", { name: "Link", exact: true });
  await expect(card).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await card.getByRole("button", { name: "Open" }).click();
  await expect.poll(opened).toEqual([["https://example.com/docs", "_blank", "noopener,noreferrer"]]);
  // Ctrl+click opens it too.
  await link.click({ modifiers: ["Control"] });
  await expect.poll(opened).toHaveLength(2);
  expect(page.url()).toBe(at);
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

test("Files on the web: this browser's notes go in folders and move by drag and drop; the instance's notes are read-only (FIL-01, FIL-02, FIL-03)", async ({ page }) => {
  const hosts = await watch(page);
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  // A note of this browser's own.
  await page.keyboard.press(`${mod}+Alt+n`);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("# Local idea");
  await expect.poll(() => notePaths(page), { timeout: 5000 }).toEqual(["local-idea.md"]);

  // Open… is the Files panel: this browser's notes first, then the instance's, read-only (D-90).
  await page.keyboard.press(`${mod}+o`);
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  await expect(row("Local idea")).toBeFocused();
  await expect(row("This browser")).toHaveAttribute("aria-level", "1");
  await expect(row("Public, read-only")).toHaveAttribute("aria-level", "1");
  const reading = row("Reading list, read-only");
  await expect(reading).toBeVisible();
  await expect(reading).not.toHaveAttribute("draggable", "true");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-files.png" });

  // A folder, named in place (the web keeps Ctrl+Shift+N for itself, so it's Ctrl+Alt+Shift+N here).
  await page.keyboard.press(`${mod}+Alt+Shift+N`);
  const name = tree.getByRole("textbox", { name: "Folder name" });
  await expect(name).toBeFocused();
  await page.keyboard.type("Projects");
  await page.keyboard.press("Enter");
  await expect(row("Projects")).toBeFocused();

  // Dragging the note into it moves it, in this browser's storage, in one go.
  await row("Local idea").dragTo(row("Projects"));
  await expect.poll(() => notePaths(page)).toEqual(["Projects/local-idea.md"]);
  await expect(row("Local idea")).toHaveAttribute("aria-level", "3");

  // The instance's notes can't be deleted, renamed, or moved here, and the panel says why.
  await reading.click();
  await page.keyboard.press("Delete");
  await expect(page.locator("#toasts").getByText("Couldn't delete “Reading list”: these notes are read-only here.")).toBeVisible();
  await page.keyboard.press("F2");
  await expect(tree.getByRole("textbox")).toHaveCount(0);
  // It can't be dragged: it stays in Public, and nothing changes here.
  await reading.dragTo(row("Projects"));
  await expect(reading).toHaveAttribute("aria-level", "2");
  expect(await notePaths(page)).toEqual(["Projects/local-idea.md"]);

  // Kept across a reload, the empty-folder list included; and nothing left the browser.
  await page.reload();
  await expect(editor(page)).toContainText("Local idea");
  await page.keyboard.press(`${mod}+o`);
  await expect(row("Local idea")).toBeFocused();
  await expect(row("Projects")).toHaveAttribute("aria-expanded", "true");
  expect([...hosts].filter((h) => h !== SITE)).toEqual([]);
});

test("FIL-09 on the web: moving and renaming rewrite links in this browser's notes in the same batch; the instance's notes are never written", async ({ page }) => {
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  const notes = {
    "a.md": "# Alpha\n\nSee [Beta](beta.md#top) and [x](<Box/x.md>).\n",
    "beta.md": "# Beta\n\n[back](a.md)\n",
    "Box/x.md": "# Ex\n",
  };
  await page.evaluate(async (notes) => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); });
    const store = db.transaction("notes", "readwrite").objectStore("notes");
    for (const [path, text] of Object.entries(notes)) store.put({ path, text, updated: 1 });
    await new Promise((res) => { store.transaction.oncomplete = res; });
  }, notes);
  const text = (path: string) => page.evaluate(async (path) => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("focus-notes"); r.onsuccess = () => res(r.result); });
    return new Promise<string>((res) => { const r = db.transaction("notes").objectStore("notes").get(path); r.onsuccess = () => res(r.result?.text); });
  }, path);
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await page.keyboard.press(`${mod}+o`);
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const toast = (t: string) => page.locator("#toasts").getByText(t);

  // Moving a note: the link to it, and its own link back, change in one batch.
  await row("Beta").dragTo(row("Box"));
  await expect(toast("Moved “Beta” to “Box”. Updated links in 2 notes.")).toBeVisible();
  expect(await text("a.md")).toBe("# Alpha\n\nSee [Beta](Box/beta.md#top) and [x](<Box/x.md>).\n");
  expect(await text("Box/beta.md")).toBe("# Beta\n\n[back](../a.md)\n");

  // Renaming the folder: links into it follow; the moved note's link out of it stays.
  await row("Box").click();
  await page.keyboard.press("F2");
  await tree.getByRole("textbox", { name: "Folder name" }).fill("Crate");
  await page.keyboard.press("Enter");
  await expect(toast("Renamed to “Crate”. Updated links in 1 note.")).toBeVisible();
  expect(await text("a.md")).toBe("# Alpha\n\nSee [Beta](Crate/beta.md#top) and [x](<Crate/x.md>).\n");
  expect(await text("Crate/beta.md")).toBe("# Beta\n\n[back](../a.md)\n");
  // Nothing of the instance's is ever kept or written here.
  expect((await notePaths(page)).filter((p) => p.includes(":"))).toEqual([]);
});
