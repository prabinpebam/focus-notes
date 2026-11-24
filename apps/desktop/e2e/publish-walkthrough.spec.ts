import { test, expect } from "./fixtures.ts";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

const seg = (marker: number, payload: Buffer) => { const h = Buffer.from([0xff, marker, 0, 0]); h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
const jpeg = (exif: string) => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe1, Buffer.from(`Exif\0\0MM\0*\0\0\0\x08${exif}`, "latin1")),
  seg(0xdb, Buffer.alloc(65, 1)), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9])]);
const SECRET = "This private sentence must never reach the public site.";
const SECRET_IMAGE = "privatepasskeyphoto";
const CAPTURES = process.env.FOCUS_NOTES_PUBLISH_CAPTURES;

/**
 * The owner's whole publish workflow in one built-app walk (24 Nov, "Where are we on the publish workflow?
 * I want to test that also."): a New-project style project, its GitHub and Pages on a loopback fake only.
 * Every published byte is scanned: no private note, private image, private file name or link to one.
 */
test("Publish walk-through: not set up, turn on, publish a folder, read the site, unpublish, a failure and Retry, turn off", async () => {
  test.setTimeout(300_000);
  const dirs = tempDirs();
  const root = dirs.docs;
  writeFileSync(join(dirs.userData, "project-folder.txt"), root);
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: root, kind: "local" }));
  const remotes = join(dirs.userData, "remotes");
  mkdirSync(join(remotes, "ada"), { recursive: true });
  git(root, "init", "-q", "-b", "main");
  configure(root);
  git(root, "init", "-q", "--bare", join(remotes, "ada", "book.git"));
  git(root, "remote", "add", "origin", join(remotes, "ada", "book.git"));
  git(root, "remote", "add", "identity", "https://github.com/ada/book.git");
  write(join(root, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  const diary = join(root, "notes", "diary.md");
  const DIARY = `# Diary\n\n${SECRET}\n\n![Key](../assets/images/key.jpg)\n`;
  write(diary, DIARY);
  write(join(root, "notes", "trips", "rome.md"), "# Rome\n\nCoffee at the corner, then the Forum.\n");
  write(join(root, "notes", "trips", "lisbon.md"), "# Lisbon\n\nTram 28 at dawn.\n\n![Tram](../../assets/images/tram.jpg)\n\nMore in [my diary](../diary.md).\n");
  mkdirSync(join(root, "assets", "images"), { recursive: true });
  writeFileSync(join(root, "assets", "images", "tram.jpg"), jpeg("Canon GPS 38.7N"));
  writeFileSync(join(root, "assets", "images", "key.jpg"), jpeg(SECRET_IMAGE));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(root, "notes", "trips", "lisbon.md") }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Private fixture");
  git(root, "push", "-qu", "origin", "main");
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  const deployed = () => fake.git.siteBytes("ada/notes-site");
  /** Every deployed byte holds no private text, private image, private file name or link to one. */
  const scan = () => {
    const site = deployed();
    for (const [path, bytes] of site) {
      const text = bytes.toString("latin1");
      expect(path).not.toMatch(/diary|key\.jpg/);
      expect(text, path).not.toContain(SECRET);
      expect(text, path).not.toContain(SECRET_IMAGE);
      expect(text, path).not.toContain("Canon");
      if (/\.(md|html|json|js)$/.test(path)) expect(text, path).not.toMatch(/diary\.md|key\.jpg|\/diary\b/);
    }
  };
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg" };
  const pages = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, "http://site").pathname).replace(/^\/notes-site\//, "");
    const file = path.endsWith("/") || path === "" ? `${path}index.html` : path;
    const bytes = deployed().get(file);
    if (!bytes) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(bytes);
  });
  await new Promise<void>(resolve => pages.listen(0, "127.0.0.1", resolve));
  const siteOrigin = `http://127.0.0.1:${(pages.address() as AddressInfo).port}`;
  const published = () => JSON.parse(readFileSync(join(root, ".focus-notes", "published.json"), "utf8")).notes as string[];
  let l: Launched | undefined;
  try {
    l = await launch(dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes,
      FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
      FOCUS_NOTES_PAGES_WAIT_MS: "4000",
    });
    const { page, app } = l;
    await app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
    }, { origin: fake.origin });
    let shot = 0;
    const capture = async (name: string) => { if (CAPTURES) await page.screenshot({ path: join(CAPTURES, `${String(++shot).padStart(2, "0")}-${name}.png`) }); };
    const note = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText("Tram 28");
    const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
    const more = async () => {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
      await toolbar.getByRole("button", { name: "More", exact: true }).click();
    };
    const files = async () => {
      if (!(await page.getByRole("treeitem", { name: "trips", exact: true }).isVisible())) await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
      await expect(page.getByRole("treeitem", { name: "trips", exact: true })).toBeVisible();
    };
    const row = (name: RegExp | string) => page.getByRole("treeitem", { name, exact: typeof name === "string" });
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const openSettings = async (tab: string) => {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      await settings.getByRole("tab", { name: tab, exact: true }).click();
    };
    const openNote = async (name: RegExp, text: string) => {
      await files();
      if (!(await row(name).isVisible())) { await row("trips").click(); await page.keyboard.press("ArrowRight"); }
      await row(name).click();
      await row(name).press(process.platform === "darwin" ? "Meta+ArrowDown" : "Enter");
      await expect(note).toContainText(text);
    };

    // 1. Not set up: ⋯ → Publish… says what to do first, and Turn on sharing is in Settings → Sharing.
    await more();
    const publishItem = page.getByRole("menuitem", { name: "Publish…", exact: true });
    await expect(publishItem).toBeDisabled();
    await capture("not-set-up-more-menu");
    await page.keyboard.press("Escape");
    await openSettings("Sharing");
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/notes-site");
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0, { timeout: 30_000 });
    await expect(settings.getByRole("button", { name: "Turn off sharing…", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    scan();

    // 2. Files → right-click the folder → Publish…: one dialog, then Published once Pages serves it.
    await files();
    await row("trips").click({ button: "right" });
    await capture("files-menu-publish");
    await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Publish/ });
    await expect(dialog).toContainText("trips");
    await capture("publish-folder-dialog");
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published “trips”" })).toHaveCount(1, { timeout: 60_000 });
    await capture("published-folder");
    expect(published()).toEqual(["trips/lisbon.md", "trips/rome.md"]);
    scan();
    const site = deployed();
    if (CAPTURES) writeFileSync(join(CAPTURES, "deployed-files.txt"), `${[...site.keys()].sort().join("\n")}\n`);
    expect(site.has("assets/images/tram.jpg")).toBe(true);

    // 3. A reader opens the deployed site: home, the folder's notes, the article and its photo; no diary anywhere.
    const browser = await chromium.launch();
    try {
      const reader = await browser.newPage();
      await reader.goto(`${siteOrigin}/notes-site/`);
      await expect(reader.getByRole("link", { name: /Lisbon/ }).first()).toBeVisible();
      await expect(reader.getByRole("link", { name: /Rome/ }).first()).toBeVisible();
      await expect(reader.getByText(/Diary/)).toHaveCount(0);
      await reader.getByRole("link", { name: /Lisbon/ }).first().click();
      await expect(reader.getByRole("heading", { level: 1 })).toHaveText("Lisbon");
      await expect(reader.getByRole("img", { name: "Tram" })).toBeVisible();
      await expect(reader.getByText("Tram 28 at dawn.")).toBeVisible();
      await expect(reader.locator("a[href*='diary']")).toHaveCount(0);
      if (CAPTURES) await reader.screenshot({ path: join(CAPTURES, `${String(++shot).padStart(2, "0")}-reader-article.png`) });
    } finally { await browser.close(); }

    // 4. A never-published note offers no Unpublish; a published one does, in ⋯ and in Files.
    await openNote(/^Diary/, SECRET);
    await more();
    await expect(page.getByRole("menuitem", { name: "Unpublish", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await files();
    await row(/^Rome/).click({ button: "right" });
    await capture("files-menu-unpublish");
    await page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Removed “Rome” from your site." })).toHaveCount(1, { timeout: 60_000 });
    expect(published()).toEqual(["trips/lisbon.md"]);
    expect([...deployed().values()].map(b => b.toString("utf8")).join("\n")).not.toContain("Coffee at the corner");
    scan();

    // 5. A failed Publish says why in the dialog and keeps Retry; Retry publishes.
    await openNote(/^Rome/, "Coffee at the corner");
    github.offline = true;
    await more();
    await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    const failed = dialog.locator("[data-status-row=danger]");
    await expect(failed).toBeVisible({ timeout: 60_000 });
    await capture("publish-failed-retry");
    expect(published()).toEqual(["trips/lisbon.md"]);
    github.offline = false;
    await failed.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published “Rome”" })).toHaveCount(1, { timeout: 60_000 });
    expect(published()).toEqual(["trips/lisbon.md", "trips/rome.md"]);
    scan();

    // 6. ⋯ → Unpublish on the open note.
    await more();
    await page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Removed “Rome” from your site." })).toHaveCount(1, { timeout: 60_000 });

    // 6b. Pages slower than the wait (O4): Still publishing, not an error; the dialog closes; Published with Copy link once live.
    const publishedRome = page.getByRole("status").filter({ hasText: "Published “Rome”" });
    await expect(publishedRome).toHaveCount(0, { timeout: 20_000 });
    fake.git.setStale(true);
    await more();
    await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(dialog.getByText(/^Still publishing\./)).toBeVisible({ timeout: 60_000 });
    await expect(dialog.locator("[data-status-row=danger]")).toHaveCount(0);
    await capture("still-publishing");
    // Recorded now: the commit is on the site's branch, so Pages will serve it.
    expect(published()).toEqual(["trips/lisbon.md", "trips/rome.md"]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(publishedRome).toHaveCount(0);
    fake.git.setStale(false);
    await expect(publishedRome).toHaveCount(1, { timeout: 30_000 });
    await expect(publishedRome.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
    await capture("published-after-wait");
    scan();

    // 6c. Renaming a published note follows the rename (D-423): one deploy, one notification with Copy link, the old page gone.
    await files();
    await row(/^Rome/).click();
    await page.keyboard.press("F2");
    const fileName = page.getByRole("textbox", { name: "File name" });
    await expect(fileName).toHaveValue("rome");
    await fileName.fill("roma");
    await page.keyboard.press("Enter");
    const moved = page.getByRole("status").filter({ hasText: "Published at the new address" });
    await expect(moved).toHaveCount(1, { timeout: 60_000 });
    await capture("rename-followed");
    expect(published()).toEqual(["trips/lisbon.md", "trips/roma.md"]);
    const renamed = deployed();
    expect(renamed.has("notes/trips/roma.md")).toBe(true);
    expect(renamed.has("notes/trips/rome.md") || renamed.has("n/trips/rome/index.html")).toBe(false);
    expect((await fetch(`${siteOrigin}/notes-site/n/trips/roma/`)).status).toBe(200);
    expect((await fetch(`${siteOrigin}/notes-site/n/trips/rome/`)).status).toBe(404);
    scan();
    await moved.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Public link to .* copied/ })).toHaveCount(1);

    // 7. Turn off sharing: the site is emptied and nothing published comes back on Turn on.
    await openSettings("Sharing");
    await settings.getByRole("button", { name: "Turn off sharing…", exact: true }).click();
    const off = page.getByRole("dialog", { name: /^Turn off sharing for/ });
    await off.getByRole("button", { name: "Turn off sharing", exact: true }).click();
    await expect(page.getByText("Sharing is off. The site is empty, and its history stays on GitHub.")).toBeVisible({ timeout: 60_000 });
    expect([...deployed().keys()].some(p => p.startsWith("notes/") && p.endsWith(".md"))).toBe(false);
    expect(published()).toEqual([]);
    scan();
    expect(readFileSync(diary, "utf8")).toBe(DIARY);
  } finally {
    try { if (l) await quit(l); } finally {
      if (l && process.platform === "win32") {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
      await fake.close();
      pages.closeAllConnections();
      await new Promise<void>(resolve => pages.close(() => resolve()));
      rmSync(dirs.userData, { recursive: true, force: true });
      rmSync(dirs.docs, { recursive: true, force: true });
    }
  }
});
