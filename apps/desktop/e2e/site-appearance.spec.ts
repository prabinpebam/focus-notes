import { test, expect } from "./fixtures.ts";
import { chromium, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-430 (the owner, 26 November: "We should have the option to change the theme and font of the published site from
 * the app ... it should be the same for both") and D-431 ("There's too many things in the share settings"): Settings →
 * Sharing has Share settings and Site appearance only. A new theme or font rebuilds the one public site, and the
 * deployed published page (n/) and shared notes' page (s/) both show it in a browser. A failed rebuild keeps the
 * choice with Retry; Preview site's Apply reaches the live site too. GitHub and Pages are loopback fakes.
 */
test("D-430: Site appearance changes the theme and font of the published pages and the share page; failure keeps the choice with Retry", async () => {
  test.setTimeout(360_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  write(join(priv, "notes", "diary.md"), "# Diary\n\nSynthetic diary line.\n");
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
  github.add({ owner: "ada", name: "book", private: false, files: [".focus-notes/workspace.json"] });
  const fake = await serveFakeGitHub(github);
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
  /** What a reader sees: the page's theme and font, how dark its background is, and the font its note text uses. */
  const look = (p: Page, selector: string) => p.evaluate(async (sel) => {
    await document.fonts.ready;
    const html = document.documentElement;
    let el: Element | null = document.querySelector(sel);
    let bg = "rgba(0, 0, 0, 0)";
    for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") { bg = c; break; } }
    const [r, g, b] = (bg.match(/\d+(\.\d+)?/g) ?? ["255", "255", "255"]).map(Number);
    return { theme: html.dataset.theme, font: html.dataset.contentFont, dark: (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255 < 0.35,
      family: el ? getComputedStyle(el).fontFamily : "",
      // The bundled face is actually there (self-hosted, D-430), not a system fallback.
      inter: [...document.fonts].some(f => /Inter/.test(f.family) && f.status === "loaded") };
  }, selector);
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
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Synthetic diary line.");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await page.keyboard.press("Control+,");
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/book", { timeout: 30_000 });
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0, { timeout: 90_000 });

    // 1. Settings → Sharing has two groups (D-431): Share settings and Site appearance; the list of shares is gone.
    await expect(settings.getByRole("heading", { name: "Share settings", exact: true })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Site appearance", exact: true })).toBeVisible();
    await expect(settings.getByText("All shares", { exact: true })).toHaveCount(0);
    await expect(settings.getByRole("searchbox", { name: "Find by item" })).toHaveCount(0);
    const theme = settings.getByRole("radiogroup", { name: "Theme", exact: true });
    const font = settings.getByRole("radiogroup", { name: "Font", exact: true });
    await expect(theme.getByRole("radio", { name: "Paper", exact: true })).toBeChecked();
    await expect(font.getByRole("radio", { name: "Serif", exact: true })).toBeChecked();
    const done = page.getByRole("status").filter({ hasText: "Your website has its new look." });

    // 2. GitHub's build fails twice: the step is named, the chosen theme stays, and Retry carries on.
    fake.git.failPagesRuns(2);
    await theme.getByText("Dusk", { exact: true }).click();
    await expect(settings.getByText(/^Stopped at “GitHub updates your website”\./)).toBeVisible({ timeout: 90_000 });
    await expect(theme.getByRole("radio", { name: "Dusk", exact: true })).toBeChecked();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(done).toBeVisible({ timeout: 90_000 });
    await expect(settings.getByText(/^Stopped at/)).toHaveCount(0);

    // 3. D-432: someone else's push lands during every upload attempt: the step says why and what helps, the choice
    // stays, their pushes stay, and Retry finishes.
    fake.git.pushElsewhere("ada/book", 4);
    await font.getByText("Hyperlegible", { exact: true }).click();
    await expect(settings.getByText("Stopped at “Upload your notes site”. The steps before it are done and kept. Your website’s repository kept changing on GitHub while uploading, even after trying 4 times. Retry. Your choice is kept.", { exact: true }))
      .toBeVisible({ timeout: 90_000 });
    await expect(font.getByRole("radio", { name: "Hyperlegible", exact: true })).toBeChecked();
    expect(fake.git.headFiles("ada/book")).toEqual(expect.arrayContaining(["elsewhere-1.txt", "elsewhere-4.txt"]));
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(done).toBeVisible({ timeout: 90_000 });
    await expect(settings.getByText(/^Stopped at/)).toHaveCount(0);
    await expect(done).toHaveCount(0, { timeout: 30_000 });

    // 3b. The owner's 26 Nov case, Font → Sans: the backup's pointer push lands between the upload's head read and its
    // ref update (twice). The person sees no failure, only the new look, and the backup's commits stay on the branch.
    fake.git.pushElsewhere("ada/book", 2);
    await font.getByText("Sans", { exact: true }).click();
    await expect(done).toBeVisible({ timeout: 90_000 });
    await expect(settings.getByText(/^Stopped at/)).toHaveCount(0);
    expect(fake.git.headFiles("ada/book")).toEqual(expect.arrayContaining(["elsewhere-5.txt", "elsewhere-6.txt"]));
    // Every page of the site carries the look: the published notes' pages and index, and the share page.
    const looked = () => [...deployed().entries()].filter(([f, html]) => f.endsWith(".html") && html.includes('data-page="reader"'));
    await expect.poll(() => looked().length > 0 && looked().every(([, html]) => html.includes('data-theme="dusk" data-content-font="sans"')), { timeout: 90_000 }).toBe(true);
    const article = [...deployed().keys()].find(f => /^n\/.+\/index\.html$/.test(f))!;
    expect(article).toBeTruthy();
    expect(looked().map(([f]) => f)).toEqual(expect.arrayContaining([article, "n/index.html", "s/index.html"]));

    const browser = await chromium.launch();
    try {
      // 4. A reader sees it: the published page and the share page are both Dusk, and the note text is in Sans (Inter).
      const reader = await (await browser.newContext()).newPage();
      await reader.goto(`${siteOrigin}/book/${article.replace(/index\.html$/, "")}`);
      await expect.poll(() => look(reader, "main h1")).toMatchObject({ theme: "dusk", font: "sans", dark: true, family: expect.stringMatching(/^"?Inter/), inter: true });
      const shareReader = await (await browser.newContext()).newPage();
      await shareReader.goto(`${siteOrigin}/book/s/`);
      await expect(shareReader.getByRole("textbox", { name: "Access code", exact: true })).toBeVisible();
      await expect.poll(() => look(shareReader, "main")).toMatchObject({ theme: "dusk", font: "sans", dark: true });

      // 5. Preview site's Apply reaches the live site through the same path (D-430): Sepia, light again. A push from
      // elsewhere during its upload is absorbed without a word (D-432).
      fake.git.pushElsewhere("ada/book", 1);
      await settings.getByRole("button", { name: "Preview site…", exact: true }).click();
      const preview = page.getByRole("region", { name: "Preview site", exact: true });
      await expect(preview).toBeVisible({ timeout: 30_000 });
      await expect(preview.getByRole("radiogroup", { name: "Default size" })).toHaveCount(0);
      await preview.getByRole("radiogroup", { name: "Site theme", exact: true }).getByText("Sepia", { exact: true }).click();
      await preview.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(theme.getByRole("radio", { name: "Sepia", exact: true })).toBeChecked({ timeout: 30_000 });
      await expect.poll(() => deployed().get(article)?.includes('data-theme="sepia" data-content-font="sans"'), { timeout: 90_000 }).toBe(true);
      expect(deployed().get("s/index.html")).toContain('data-theme="sepia" data-content-font="sans"');
      await reader.reload();
      await expect.poll(() => look(reader, "main h1")).toMatchObject({ theme: "sepia", font: "sans", dark: false });
      expect(fake.git.headFiles("ada/book")).toContain("elsewhere-7.txt");
      await expect(settings.getByText(/^Stopped at/)).toHaveCount(0);
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
