import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { SiteReader } from "../../../packages/seal/src/reader.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-428 on D-429's one public repository (Private + Public layout): deleting a published note takes its page off the
 * site; deleting a shared note and a published note together turns the link off first, then takes the page down.
 * The site's root lists a published note until its delete, then doesn't; its page and the share link stop opening.
 */
test("D-428: Private + Public: deleting a published note takes its page down; a shared and a published note together lose both", async () => {
  test.setTimeout(360_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  write(join(priv, "notes", "diary.md"), "# Diary\n\nSynthetic diary line.\n");
  write(join(priv, "notes", "essay.md"), "# Essay\n\nEssay words the owner publishes.\n");
  write(join(priv, "notes", "trip.md"), "# Trip\n\nTrip words the owner publishes.\n");
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
  github.add({ owner: "ada", name: "book", private: false, files: [".focus-notes/workspace.json"] });
  const fake = await serveFakeGitHub(github);
  const deployed = () => fake.git.site("ada/book");
  const pageOf = (name: string) => [...deployed().keys()].some(k => k.startsWith("n/") && k.includes(name));
  const home = () => deployed().get("n/index.html") ?? "";
  const access = (): AccessFile => JSON.parse(readFileSync(join(priv, "access.json"), "utf8"));
  const reader = () => new SiteReader(async path => deployed().get(path));
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
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    const row = (name: string) => tree.getByRole("treeitem", { name: new RegExp(`^${name}`) });
    const openFiles = async () => { if (!(await tree.isVisible())) await page.keyboard.press("Control+Shift+E"); await expect(tree).toBeVisible(); };
    const menu = async (name: string, item: string | RegExp) => {
      await openFiles();
      await row(name).click({ button: "right" });
      await page.getByRole("menuitem", { name: item }).click();
    };

    // Turn sharing on with Diary's first share, then share Diary with a link.
    await menu("Diary", "Share…");
    const turnOn = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await turnOn.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(turnOn).toHaveCount(0, { timeout: 60_000 });
    const share = page.getByRole("dialog", { name: "Share “Diary”", exact: true });
    await share.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;
    await reader().openLinkSession(grant.id, grant.link!.secret);
    await page.keyboard.press("Escape");

    // Publish Essay and Trip: the site's root lists them.
    for (const name of ["Essay", "Trip"]) {
      await menu(name, "Publish");
      await page.getByRole("dialog", { name: "Publish?" }).getByRole("button", { name: "Publish", exact: true }).click();
      await expect.poll(() => pageOf(name.toLowerCase()), { timeout: 90_000 }).toBe(true);
    }
    await expect.poll(() => home(), { timeout: 30_000 }).toContain("Essay");
    expect(home()).toContain("Trip");

    // 1. A published note: the confirmation says its page goes; the row stays Deleting… until the page is down.
    await menu("Essay", /^Delete/);
    const ask = page.getByRole("dialog", { name: "Delete “Essay”?", exact: true });
    await expect(ask.getByText("This note is published. Deleting it also takes its web page down.", { exact: true })).toBeVisible();
    await expect(ask.getByText(/This note is shared/)).toHaveCount(0);
    fake.git.setStale(true);
    await ask.getByRole("button", { name: "Delete and unpublish", exact: true }).click();
    await expect(row("Essay")).toHaveAttribute("data-deleting", "pending", { timeout: 30_000 });
    await row("Essay").hover();
    const card = page.getByRole("dialog", { name: "Deleting “Essay”: steps", exact: true });
    for (const step of ["Delete the note", "Take the page down", "Update your website"]) await expect(card.getByText(step, { exact: true })).toBeVisible();
    fake.git.setStale(false);
    await page.mouse.move(1, 1);
    await expect(row("Essay")).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByRole("status").filter({ hasText: "Deleted. Its page is down" }).first()).toBeVisible();
    expect(pageOf("essay")).toBe(false);
    expect(home()).not.toContain("Essay");
    expect(home()).toContain("Trip");
    expect(existsSync(join(docs, "notes", "essay.md"))).toBe(false);

    // 2. Both: the shared Diary and the published Trip together. The link goes first, then the notes, then the page.
    await openFiles();
    await row("Diary").click();
    await row("Trip").click({ modifiers: ["Control"] });
    await page.keyboard.press("Delete");
    const both = page.getByRole("dialog", { name: "Delete 2 items?", exact: true });
    await expect(both.getByText("Some of these notes are shared. Deleting them also turns off their links, so people with the links can't open them.", { exact: true })).toBeVisible();
    await expect(both.getByText("Some of these notes are published. Deleting them also takes their web pages down.", { exact: true })).toBeVisible();
    await both.getByRole("button", { name: "Delete and unpublish", exact: true }).click();
    await expect(row("Diary")).toHaveCount(0, { timeout: 90_000 });
    await expect(row("Trip")).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByRole("status").filter({ hasText: "Deleted. Its link is off and its page is down" }).first()).toBeVisible();
    expect(access().grants.find(g => g.id === grant.id)?.revokedAt).toBeTruthy();
    await expect.poll(async () => (await Promise.allSettled([reader().openLinkSession(grant.id, grant.link!.secret)]))[0]!.status).toBe("rejected");
    expect(pageOf("trip")).toBe(false);
    expect(home()).not.toContain("Trip");
    expect(existsSync(join(priv, "notes", "diary.md"))).toBe(false);
    expect(existsSync(join(docs, "notes", "trip.md"))).toBe(false);
  } finally {
    try { if (l) await quit(l); } finally {
      if (l && process.platform === "win32") {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
      await fake.close();
      rmSync(inst.dirs.userData, { recursive: true, force: true });
      rmSync(join(docs, ".."), { recursive: true, force: true });
    }
  }
});
