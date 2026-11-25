import { test, expect } from "./fixtures.ts";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { applyAccessChange } from "../../../packages/seal/src/access.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-429 migration: a Private + Public project that turned sharing on under D-425 has a separate `notes-site` paired
 * with its private repository. The next Turn on moves its shares into the project's own public repository (same
 * records, re-sealed there), says the links change, empties the old site, and offers deleting it: by the owner, on
 * GitHub, after typing its name, never automatically. GitHub and Pages are loopback fakes.
 */
test("D-429: shares on an old notes-site move into the public repository, the old site empties, and its deletion is offered", async () => {
  test.setTimeout(300_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  const SECRET = "Synthetic diary line shared before the move.";
  write(join(priv, "notes", "diary.md"), `---\nid: n-diary-0001\n---\n# Diary\n\n${SECRET}\n`);
  // The share made under D-425, kept in access.json; and the pairing with the old separate site.
  const { access: shared } = applyAccessChange({ version: 1, grants: [] }, {
    op: "createItem", item: { path: "diary.md", label: "Diary", folder: false, includeLater: false }, notes: ["diary.md"], link: true, expiresAt: null,
  }, new Date(), { resolvedItemNotes: { notes: ["diary.md"], ids: ["n-diary-0001"] } });
  write(join(priv, "access.json"), `${JSON.stringify(shared, null, 2)}\n`);
  write(join(priv, ".focus-notes", "site-pairing.json"), `${JSON.stringify({
    version: 1, project: "ada/book-private", owner: "ada", name: "notes-site", intent: "0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e", phase: "ready", site: "https://ada.github.io/notes-site/",
  }, null, 2)}\n`);
  git(priv, "add", "-A");
  git(priv, "commit", "-qm", "Fixture notes and the old pairing");
  git(priv, "push", "-q", "origin", "main");
  git(priv, "remote", "add", "identity", "https://github.com/ada/book-private.git");
  git(docs, "remote", "add", "identity", "https://github.com/ada/book.git");
  git(docs, "add", "-A");
  git(docs, "commit", "-qm", "Fixture pointer");
  git(docs, "push", "-q", "origin", "main");
  write(join(inst.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(priv, "notes", "diary.md") }));
  const grant = shared.grants[0]!;

  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book-private", private: true, files: ["notes/diary.md"] });
  github.add({ owner: "ada", name: "book", private: false, files: [".focus-notes/workspace.json"] });
  const old = github.add({ owner: "ada", name: "notes-site", private: false, files: [".github/workflows/pages.yml", "site/focus-notes.json", "site/s/index.html"] });
  old.fileContents.set("site/focus-notes.json", JSON.stringify({ build: "old-build" }));
  old.fileContents.set("site/s/index.html", "<!doctype html><title>Old share page</title>");
  const fake = await serveFakeGitHub(github);
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
  const pages = createServer((req, res) => {
    const [, repo, rest] = /^\/([^/]+)\/(.*)$/.exec(decodeURIComponent(new URL(req.url!, "http://site").pathname)) ?? [];
    const file = !rest || rest.endsWith("/") ? `${rest ?? ""}index.html` : rest;
    const bytes = repo ? fake.git.siteBytes(`ada/${repo}`).get(file) : undefined;
    if (!bytes) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(bytes);
  });
  await new Promise<void>(resolve => pages.listen(0, "127.0.0.1", resolve));
  const siteOrigin = `http://127.0.0.1:${(pages.address() as AddressInfo).port}`;
  const pairing = () => JSON.parse(readFileSync(join(priv, ".focus-notes", "site-pairing.json"), "utf8")) as { name: string; from?: string; phase: string };
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
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText(SECRET);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const openSharing = async () => {
      if (!(await settings.isVisible())) await page.keyboard.press("Control+,");
      await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    };

    // 1. The old pairing isn't used: Settings offers Turn on sharing, whose confirmation says the shares move and their links change.
    await openSharing();
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/book", { timeout: 30_000 });
    await expect(confirmation).toContainText("Your shares move here from ada/notes-site. Their links change, so send the new ones.");
    expect(github.calls.filter(c => c.method !== "GET")).toEqual([]);
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0, { timeout: 60_000 });

    // 2. The pairing now names the public repository and remembers the old site; nothing was created or deleted.
    expect(pairing()).toMatchObject({ name: "book", from: "ada/notes-site", phase: "ready" });
    expect(github.calls.filter(c => (c.method === "POST" && c.path === "/user/repos") || c.method === "DELETE")).toEqual([]);
    expect(github.repos.has("ada/notes-site")).toBe(true);

    // 3. The same share, re-sealed in the public repository: its new link decrypts there, and nothing private is in plaintext.
    const book = () => [...fake.git.site("ada/book").values()].join("\n");
    for (const text of [SECRET, "diary", "book-private"]) expect(book()).not.toContain(text);
    const browser = await chromium.launch();
    try {
      const recipient = await (await browser.newContext()).newPage();
      await recipient.goto(`${siteOrigin}/book/s/#${grant.id}.${grant.link!.secret}`);
      await expect(recipient.getByRole("heading", { level: 1 })).toHaveText("Diary");
      await expect(recipient.getByText(SECRET)).toBeVisible();
    } finally { await browser.close(); }

    // 4. The old site is emptied in the background, so its old links stop.
    await expect.poll(() => fake.git.site("ada/notes-site").has("s/index.html"), { timeout: 60_000 }).toBe(false);
    expect(fake.git.site("ada/notes-site").has("focus-notes.json")).toBe(true);

    // 5. Settings offers deleting the old site: the owner types its name, then deletes it on GitHub.
    await openSharing();
    await expect(settings.getByText("ada/notes-site isn’t used any more. Your shares moved to your public repository.")).toBeVisible({ timeout: 30_000 });
    await settings.getByRole("button", { name: "Delete old site…", exact: true }).click();
    const remove = page.getByRole("dialog", { name: "Delete ada/notes-site on GitHub?", exact: true });
    const open = remove.getByRole("button", { name: "Open GitHub settings", exact: true });
    await expect(open).toBeDisabled();
    await remove.getByRole("textbox", { name: "Type notes-site to continue", exact: true }).fill("notes");
    await expect(open).toBeDisabled();
    await remove.getByRole("textbox", { name: "Type notes-site to continue", exact: true }).fill("notes-site");
    await open.click();
    await expect.poll(() => l!.log.join("\n")).toContain("[focus-notes] open-external https://github.com/ada/notes-site/settings");
    await remove.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(remove.getByText("ada/notes-site is still on GitHub. Delete it there, then check again.", { exact: true })).toBeVisible();
    expect(github.calls.filter(c => c.method === "DELETE")).toEqual([]);
    // The owner deletes it on GitHub.
    github.repos.delete("ada/notes-site");
    await remove.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(remove).toHaveCount(0, { timeout: 30_000 });
    await expect(settings.getByText("Your old shares site is deleted.")).toBeVisible();
    await expect(settings.getByRole("button", { name: "Delete old site…", exact: true })).toHaveCount(0);
    expect(pairing().from).toBeUndefined();
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
