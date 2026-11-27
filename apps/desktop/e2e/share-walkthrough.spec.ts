import { test, expect } from "./fixtures.ts";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { SiteReader } from "../../../packages/seal/src/reader.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

/**
 * The owner's whole share workflow in one built-app walk (24 Nov, "Get that end to end share workflow ready"):
 * a project made by New project (GitHub-linked, modern layout), its GitHub and Pages on a loopback fake only.
 */
test("Share walk-through: turn on, share a folder with link and access code, recipient opens, withdraw, publish, unpublish, invite", async () => {
  test.setTimeout(240_000);
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
  const SECRET = "This private sentence must never reach the public site.";
  const diary = join(root, "notes", "diary.md");
  write(diary, `# Diary\n\n${SECRET}\n`);
  write(join(root, "notes", "trips", "rome.md"), "# Rome\n\nCoffee at the corner, then the Forum.\n");
  write(join(root, "notes", "trips", "lisbon.md"), "# Lisbon\n\nTram 28 at dawn.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: diary }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Private fixture");
  git(root, "push", "-qu", "origin", "main");
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  const siteUrl = "https://ada.github.io/notes-site/";
  const deployed = () => fake.git.site("ada/notes-site");
  const reader = () => new SiteReader(async path => deployed().get(path));
  // The deployed site's exact bytes over loopback, as Pages serves them at /<repository>/.
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
  const pages = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, "http://site").pathname).replace(/^\/notes-site\//, "");
    const file = path.endsWith("/") || path === "" ? `${path}index.html` : path;
    const bytes = fake.git.siteBytes("ada/notes-site").get(file);
    if (!bytes) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(bytes);
  });
  await new Promise<void>(resolve => pages.listen(0, "127.0.0.1", resolve));
  const siteOrigin = `http://127.0.0.1:${(pages.address() as AddressInfo).port}`;
  const access = (): AccessFile => JSON.parse(readFileSync(join(root, "access.json"), "utf8"));
  let l: Launched | undefined;
  try {
    l = await launch(dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes,
      FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
    });
    const { page, app } = l;
    // Pages answers from the fake: the app's own readiness checks read the deployed site, never github.io.
    await app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
      Reflect.set(globalThis, "openedLinks", []);
    }, { origin: fake.origin });
    const copied = () => app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");
    const note = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText(SECRET);
    const files = async () => {
      if (!(await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).isVisible())) await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
      await expect(page.getByRole("treeitem", { name: /^trips(, Shared)?$/ })).toBeVisible();
    };
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const openSettings = async (tab: string) => {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      await settings.getByRole("tab", { name: tab, exact: true }).click();
    };

    // 1. Not set up: Share… is already in Files (it starts with turning sharing on, D-418); Settings → Sharing offers Turn on sharing….
    await files();
    await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Share…", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await openSettings("Sharing");

    // 2. Turn on sharing: the named public site, then on.
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/notes-site");
    await expect(confirmation).toContainText(siteUrl);
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0, { timeout: 30_000 });
    await expect(settings.getByRole("button", { name: "Turn off sharing…", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    // 3. Share a folder: Files → right-click → Share…; link on, passcode on, access code with Copy.
    await files();
    await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
    await expect(share).toBeVisible();
    await expect(share.getByRole("switch", { name: "Link", exact: true })).toBeChecked();
    await share.getByText("Access code", { exact: true }).click();
    const code = share.locator("[data-code-block] code");
    await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4} [a-z]+(-[a-z]+){3}$/);
    const accessCode = (await code.textContent())!;
    await expect(share.locator("[data-code-block]").getByRole("button", { name: "Copy access code", exact: true })).toBeVisible();

    // 4. Copy share information: publishes the sealed share to the paired site, then copies the D-409 message.
    await share.getByRole("button", { name: "Copy share information", exact: true }).click();
    await expect(share.getByText("Share information copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;
    const message = await copied();
    expect(message).toContain("I’ve shared “trips” with you to read.");
    expect(message).toContain(`${siteUrl}s/#${grant.id}.${grant.link!.secret}`);
    expect(message).toContain(accessCode);
    const site = [...deployed().values()].join("\n");
    expect(site).not.toContain(SECRET);
    expect(site).not.toContain("Coffee at the corner");

    // 5. The recipient, in a browser, on the deployed site: the link opens the folder; the access code opens it too.
    expect(deployed().has("s/index.html")).toBe(true);
    const browser = await chromium.launch();
    try {
      const recipient = await browser.newPage();
      await recipient.goto(`${siteOrigin}/notes-site/s/#${grant.id}.${grant.link!.secret}`);
      await expect(recipient.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
      await expect(recipient.getByRole("main").getByRole("link")).toHaveText(["Lisbon", "Rome"]);
      await recipient.getByRole("main").getByRole("link", { name: "Rome", exact: true }).click();
      await expect(recipient.getByRole("heading", { level: 1 })).toHaveText("Rome");
      await expect(recipient.getByText("Coffee at the corner, then the Forum.")).toBeVisible();
      await expect(recipient.getByRole("textbox")).toHaveCount(0);
      const second = await browser.newPage();
      await second.goto(`${siteOrigin}/notes-site/s/`);
      await second.getByRole("textbox", { name: "Access code", exact: true }).fill(accessCode);
      await second.getByRole("button", { name: "Open", exact: true }).click();
      await expect(second.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
    } finally { await browser.close(); }

    // 6. Settings → Sharing holds Share settings and Site appearance only; shares aren't listed there (D-431).
    await page.keyboard.press("Escape");
    await openSettings("Sharing");
    await expect(settings.getByRole("heading", { name: "Share settings", exact: true })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Site appearance", exact: true })).toBeVisible();
    await expect(settings.getByText("trips", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // 7. Withdraw: confirm, then readers stop after the next publication.
    await files();
    await page.getByRole("treeitem", { name: "trips, Shared", exact: true }).click({ button: "right" });
    // D-431: a shared item's menu offers Share details… instead of Share….
    await page.getByRole("menuitem", { name: "Share details…", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Share details", exact: true });
    await details.getByRole("button", { name: "Withdraw", exact: true }).first().click();
    const withdraw = page.getByRole("dialog", { name: "Withdraw this share?", exact: true });
    await withdraw.getByRole("button", { name: "Withdraw share", exact: true }).click();
    await expect.poll(() => access().grants.find(g => g.id === grant.id)?.revokedAt).toBeTruthy();
    await expect.poll(async () => (await Promise.allSettled([reader().openLinkSession(grant.id, grant.link!.secret)]))[0]!.status, { timeout: 60_000 }).toBe("rejected");
    // The confirmation must be gone before Escape, or the key lands outside Share details and the dialog stays over Files.
    await expect(withdraw).toHaveCount(0);
    await details.press("Escape");
    await expect(details).toHaveCount(0);

    // 8. Publish a note, then Unpublish it.
    await files();
    const lisbon = page.getByRole("treeitem", { name: /^Lisbon/ });
    if (!(await lisbon.isVisible())) { await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).click(); await page.keyboard.press("ArrowRight"); }
    await lisbon.click();
    await lisbon.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Enter");
    await expect(note).toContainText("Tram 28");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    const publish = page.getByRole("dialog", { name: /Publish/ });
    await publish.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published “Lisbon”" })).toHaveCount(1, { timeout: 60_000 });
    expect([...deployed().values()].join("\n")).toContain("Tram 28");
    await page.keyboard.press("Escape");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Removed “Lisbon” from your site." })).toHaveCount(1, { timeout: 60_000 });
    expect([...deployed().values()].join("\n")).not.toContain("Tram 28");
    expect(deployed().has("s/index.html")).toBe(true);

    // 9. People: Settings → Project. This fixture has no signed-in account, so the people list can't load:
    // the reason and a Retry show (never a dead end). Sending an invitation is sharing-people.spec.ts.
    await openSettings("Project");
    const people = settings.getByRole("button", { name: "Invite…", exact: true });
    await expect(people).toBeDisabled();
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toBeVisible({ timeout: 30_000 });
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toBeVisible({ timeout: 30_000 });
    expect(readFileSync(diary, "utf8")).toBe(`# Diary\n\n${SECRET}\n`);
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
