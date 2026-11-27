import { test, expect } from "./fixtures.ts";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-429 (the owner, 25 November: "We can use prabins-notes repo for the same where we have both published and share
 * files with the shared ones being encrypted"): in the Private + Public layout, Turn on sharing uses the project's own
 * public repository and creates nothing. Its site is the project's published site (the empty home, then the published
 * notes' list), never the Focus Notes app, with encrypted shares at s/ beside it. GitHub and Pages are loopback fakes;
 * every remote is a local bare repository.
 */
test("D-429: Private + Public: sharing uses the public repository, creates no repository, and its root is the published site", async () => {
  test.setTimeout(300_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  const SECRET = "Synthetic diary line for the recipient.";
  const UNRELATED = "Unrelated private line that must never be exposed.";
  const ESSAY = "Essay words the owner chooses to publish.";
  write(join(priv, "notes", "diary.md"), `# Diary\n\n${SECRET}\n`);
  write(join(priv, "notes", "other.md"), `# Other\n\n${UNRELATED}\n`);
  write(join(priv, "notes", "essay.md"), `# Essay\n\n${ESSAY}\n`);
  // Nothing published yet: the site's root must start at its empty home.
  rmSync(join(docs, "notes", "hello.md"));
  git(priv, "add", "-A");
  git(priv, "commit", "-qm", "Fixture notes");
  git(priv, "push", "-q", "origin", "main");
  git(priv, "remote", "add", "identity", "https://github.com/ada/book-private.git");
  git(docs, "remote", "add", "identity", "https://github.com/ada/book.git");
  git(docs, "add", "-A");
  git(docs, "commit", "-qm", "Fixture pointer");
  git(docs, "push", "-q", "origin", "main");
  write(join(inst.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(priv, "notes", "diary.md") }));

  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book-private", private: true, files: ["notes/diary.md"] });
  // The template's old Deploy app workflow, which put the web app at the site's root.
  const OLD_WORKFLOW = "name: Deploy app\non:\n  push:\n    branches: [main]\nenv:\n  FOCUS_NOTES_SOURCE: prabinpebam/focus-notes\njobs: {}\n";
  const book = github.add({ owner: "ada", name: "book", private: false, files: [".github/workflows/pages.yml", ".focus-notes/workspace.json"] });
  book.fileContents.set(".github/workflows/pages.yml", OLD_WORKFLOW);
  const fake = await serveFakeGitHub(github);
  const siteUrl = "https://ada.github.io/book/";
  const deployed = () => fake.git.site("ada/book");
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
  const pages = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, "http://site").pathname).replace(/^\/book\//, "");
    const file = path.endsWith("/") || path === "" ? `${path}index.html` : path;
    const bytes = fake.git.siteBytes("ada/book").get(file);
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

    // 1. The first Share… names the project's own public repository and its site: nothing new is made.
    await rowMenu("Diary diary.md");
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/book", { timeout: 30_000 });
    await expect(confirmation).toContainText("Your public repository");
    await expect(confirmation).toContainText(siteUrl);
    await expect(confirmation).not.toContainText("notes-site");
    await expect(confirmation).not.toContainText("What's created");
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0, { timeout: 60_000 });

    // 2. No repository was created; the public repository's Pages now publishes the site the app builds.
    expect(github.calls.filter(c => c.method === "POST" && (c.path === "/user/repos" || /\/generate$/.test(c.path)))).toEqual([]);
    expect([...github.repos.keys()].sort()).toEqual(["ada/book", "ada/book-private", "prabinpebam/focus-notes-workspace"]);
    expect(book.fileContents.get(".github/workflows/pages.yml")).toMatch(/^name: Publish site$/m);
    expect(book.fileContents.get(".github/workflows/pages.yml")).not.toContain("FOCUS_NOTES_SOURCE");

    // 3. With nothing published yet, the site's root is the empty home, with no app shell.
    const browser = await chromium.launch();
    try {
      const visitor = await (await browser.newContext()).newPage();
      await visitor.goto(`${siteOrigin}/book/`);
      await expect(visitor.getByText("Nothing published here yet")).toBeVisible();
      await expect(visitor.locator("#root")).toHaveCount(0);
      await expect(visitor).not.toHaveTitle("Focus Notes");

      // 4. Share the note: the link is on the public repository's site and decrypts for a fresh recipient.
      const share = page.getByRole("dialog", { name: "Share “Diary”", exact: true });
      await expect(share).toBeVisible({ timeout: 30_000 });
      await expect(share.getByRole("switch", { name: "Link", exact: true })).toBeChecked();
      await share.getByText("Access code", { exact: true }).click();
      const code = share.locator("[data-code-block] code");
      await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4} [a-z]+(-[a-z]+){3}$/);
      const accessCode = (await code.textContent())!;
      await share.getByRole("button", { name: "Copy link", exact: true }).click();
      await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
      const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;
      expect(await copied()).toBe(`${siteUrl}s/#${grant.id}.${grant.link!.secret}`);
      const recipient = await (await browser.newContext()).newPage();
      await recipient.goto(`${siteOrigin}/book/s/#${grant.id}.${grant.link!.secret}`);
      await expect(recipient.getByRole("heading", { level: 1 })).toHaveText("Diary");
      await expect(recipient.getByText(SECRET)).toBeVisible();
      await expect(recipient.getByText(UNRELATED)).toHaveCount(0);
      const byCode = await (await browser.newContext()).newPage();
      await byCode.goto(`${siteOrigin}/book/s/`);
      await byCode.getByRole("textbox", { name: "Access code", exact: true }).fill(accessCode);
      await byCode.getByRole("button", { name: "Open", exact: true }).click();
      await expect(byCode.getByText(SECRET)).toBeVisible();
      await page.keyboard.press("Escape");

      // 5. Publish (the move to public notes/, D-424): its page lands in the same repository, beside the shares.
      await rowMenu("Essay essay.md");
      await page.getByRole("menuitem", { name: "Publish", exact: true }).click();
      await page.getByRole("dialog", { name: "Publish?" }).getByRole("button", { name: "Publish", exact: true }).click();
      await expect.poll(() => deployed().has("n/index.html"), { timeout: 90_000 }).toBe(true);
      expect(deployed().has("s/index.html")).toBe(true);
      await visitor.goto(`${siteOrigin}/book/`);
      await expect(visitor.getByRole("link", { name: /Essay/ })).toBeVisible();
      await expect(visitor.locator("#root")).toHaveCount(0);
      await visitor.getByRole("link", { name: /Essay/ }).click();
      await expect(visitor.getByText(ESSAY)).toBeVisible();

      // 6. Leak scan of every deployed byte on the combined site: no private text, names or paths.
      for (const text of [SECRET, UNRELATED, "diary", "other.md", "book-private", "private/"]) expect(siteText()).not.toContain(text);
    } finally { await browser.close(); }
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
