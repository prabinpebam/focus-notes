import { test, expect } from "./fixtures.ts";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { SiteReader } from "../../../packages/seal/src/reader.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-425 (the owner, 24 November: "I should be able to share any private file."): a project with public notes/ and a
 * private/ submodule (the older layout, as the template makes) turns sharing on from the first Share… and shares a
 * private note with a link and a passcode. GitHub and Pages are loopback fakes; every remote is a local bare repository.
 */
test("D-425: public+private layout: Share… on a private note turns sharing on, copies a link that decrypts, enforces passcode and expiry, withdraws", async () => {
  test.setTimeout(240_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  const SECRET = "Synthetic diary line for the recipient.";
  const UNRELATED = "Unrelated private line that must never be exposed.";
  const PUBLIC = "Already public words on the main site.";
  write(join(priv, "notes", "diary.md"), `# Diary\n\n${SECRET}\n`);
  write(join(priv, "notes", "other.md"), `# Other\n\n${UNRELATED}\n`);
  write(join(docs, "notes", "hello.md"), `# Hello\n\n${PUBLIC}\n`);
  git(priv, "add", "-A");
  git(priv, "commit", "-qm", "Fixture notes");
  git(priv, "push", "-q", "origin", "main");
  git(priv, "remote", "add", "identity", "https://github.com/ada/book-private.git");
  git(docs, "add", "-A");
  git(docs, "commit", "-qm", "Fixture pointer");
  git(docs, "push", "-q", "origin", "main");
  const publicHead = git(docs, "rev-parse", "HEAD:notes");
  write(join(inst.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(priv, "notes", "diary.md") }));

  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book-private", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  const siteUrl = "https://ada.github.io/notes-site/";
  const deployed = () => fake.git.site("ada/notes-site");
  const reader = () => new SiteReader(async path => deployed().get(path));
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
  const access = (): AccessFile => JSON.parse(readFileSync(join(priv, "access.json"), "utf8"));
  const siteText = () => [...deployed().values()].join("\n");
  let l: Launched | undefined;
  try {
    l = await launch(inst.dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "",
      FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
    });
    const { page, app } = l;
    await app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
    }, { origin: fake.origin });
    const copied = () => app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText(SECRET);
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    const rowMenu = async (name: string) => {
      if (!(await tree.isVisible())) await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
      await tree.getByRole("treeitem", { name, exact: true }).click({ button: "right" });
    };

    // 1. Share… on the private note: no "can't" banner; the first share's confirmation names the paired site.
    await rowMenu("Diary diary.md");
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/notes-site", { timeout: 30_000 });
    await expect(confirmation).toContainText(siteUrl);
    await expect(page.getByText(/can’t be turned on|isn’t available yet|publish it/)).toHaveCount(0);
    expect(github.calls.filter(c => c.method !== "GET")).toEqual([]);
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0, { timeout: 60_000 });

    // 2. It continues into the note's Share dialog: 7 days, link and passcode.
    const share = page.getByRole("dialog", { name: "Share “Diary”", exact: true });
    await expect(share).toBeVisible({ timeout: 30_000 });
    await expect(share.getByText(/can’t be turned on|isn’t available yet|publish it/)).toHaveCount(0);
    await share.getByRole("radiogroup", { name: "Expires in", exact: true }).getByText("7 days", { exact: true }).click();
    await expect(share.getByRole("switch", { name: "Link", exact: true })).toBeChecked();
    await share.getByText("Passcode", { exact: true }).click();
    const code = share.locator("[data-code-block] code");
    await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4} [a-z]+(-[a-z]+){3}$/);
    const accessCode = (await code.textContent())!;

    // 3. Copy link: seals and deploys the share to the paired site, then copies the link.
    const before = Date.now();
    await share.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;
    expect(await copied()).toBe(`${siteUrl}s/#${grant.id}.${grant.link!.secret}`);
    const expiresAt = Date.parse(grant.expiresAt!);
    expect(expiresAt - before).toBeGreaterThan(6.9 * 86_400_000);
    expect(expiresAt - before).toBeLessThan(7.1 * 86_400_000);

    // 4. Leak scan of every deployed byte: no plaintext of the shared note, the unrelated note or the public notes.
    for (const text of [SECRET, UNRELATED, PUBLIC, "diary", "other.md", "book-private"]) expect(siteText()).not.toContain(text);
    expect(deployed().has("s/index.html")).toBe(true);
    const session = await reader().openLinkSession(grant.id, grant.link!.secret);
    expect(JSON.stringify(session)).not.toContain(UNRELATED);

    // 5. A fresh recipient: the link decrypts the note; the access code opens it; a wrong passcode and an expired clock don't.
    const browser = await chromium.launch();
    try {
      const recipient = await (await browser.newContext()).newPage();
      await recipient.goto(`${siteOrigin}/notes-site/s/#${grant.id}.${grant.link!.secret}`);
      await expect(recipient.getByRole("heading", { level: 1 })).toHaveText("Diary");
      await expect(recipient.getByText(SECRET)).toBeVisible();
      await expect(recipient.getByText(UNRELATED)).toHaveCount(0);
      await expect(recipient.getByRole("textbox")).toHaveCount(0);
      const byCode = await (await browser.newContext()).newPage();
      await byCode.goto(`${siteOrigin}/notes-site/s/`);
      await byCode.getByRole("textbox", { name: "Access code", exact: true }).fill(accessCode);
      await byCode.getByRole("button", { name: "Open", exact: true }).click();
      await expect(byCode.getByText(SECRET)).toBeVisible();
      const wrong = await (await browser.newContext()).newPage();
      await wrong.goto(`${siteOrigin}/notes-site/s/`);
      await wrong.getByRole("textbox", { name: "Access code", exact: true }).fill(accessCode.replace(/ .*/, " wrong-words-for-this"));
      await wrong.getByRole("button", { name: "Open", exact: true }).click();
      await expect(wrong.getByRole("alert").or(wrong.getByRole("status")).first()).toBeVisible({ timeout: 30_000 });
      await expect(wrong.getByText(SECRET)).toHaveCount(0);
      const late = await (await browser.newContext()).newPage();
      await late.clock.setFixedTime(new Date(expiresAt + 86_400_000));
      await late.goto(`${siteOrigin}/notes-site/s/#${grant.id}.${grant.link!.secret}`);
      await expect(late.getByRole("alert").or(late.getByRole("status")).first()).toBeVisible({ timeout: 30_000 });
      await expect(late.getByText(SECRET)).toHaveCount(0);
    } finally { await browser.close(); }

    // 6. The records went to private/ first, then the pointer; notes/ and the main repository's own site are untouched.
    await expect.poll(() => git(priv, "log", "--format=%H", "-1", "--", "access.json"), { timeout: 30_000 }).not.toBe("");
    expect(git(docs, "rev-parse", "HEAD:notes")).toBe(publicHead);
    expect(github.calls.filter(c => c.method !== "GET" && /\/repos\/ada\/book-private\b/.test(c.path) && !/pages/.test(c.path))).toEqual([]);

    // 7. Withdraw: readers stop after the next deploy.
    await share.getByRole("button", { name: "Withdraw", exact: true }).first().click();
    const withdraw = page.getByRole("dialog", { name: "Withdraw this share?", exact: true });
    await withdraw.getByRole("button", { name: "Withdraw share", exact: true }).click();
    await expect.poll(() => access().grants.find(g => g.id === grant.id)?.revokedAt).toBeTruthy();
    await expect.poll(async () => (await Promise.allSettled([reader().openLinkSession(grant.id, grant.link!.secret)]))[0]!.status, { timeout: 60_000 }).toBe("rejected");
    for (const text of [SECRET, UNRELATED, PUBLIC]) expect(siteText()).not.toContain(text);
    expect(readFileSync(join(priv, "notes", "other.md"), "utf8")).toBe(`# Other\n\n${UNRELATED}\n`);
    await page.keyboard.press("Escape");

    // 8. Publish in this layout is still the move to public notes/ (D-424), never the paired site's Publish….
    await rowMenu("Other other.md");
    await expect(page.getByRole("menuitem", { name: "Publish", exact: true })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Publish…", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  } finally {
    try { if (l) await quit(l); } finally {
      if (l && process.platform === "win32") {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
      await fake.close();
      pages.closeAllConnections();
      await new Promise<void>(resolve => pages.close(() => resolve()));
      rmSync(inst.dirs.userData, { recursive: true, force: true });
      rmSync(join(docs, ".."), { recursive: true, force: true });
    }
  }
});
