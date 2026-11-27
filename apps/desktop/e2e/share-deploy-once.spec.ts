import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { SiteReader, type OpenShare } from "../../../packages/seal/src/reader.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-436 (27 November): in the Private + Public layout every change to the website is built and deployed once, with one
 * backup. Before, the rebuild after an action's own backup saved again and re-sealed the whole site under a new build
 * id, so a reader opening a just-shared link read files that had gone ("This note is private"). Share, a backup that
 * touches the public notes, then the reader opens the link; a reader opening the link while that rebuild switches builds
 * still opens it (main's condition 5); then editing a public note, Publish, Unpublish, Withdraw
 * and Delete each deploy exactly once and back up once. GitHub and Pages are loopback fakes.
 */
test("D-436: share, then a backup of the public notes: the reader still opens the link; every change deploys once and backs up once", async () => {
  test.setTimeout(360_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  write(join(priv, "notes", "diary.md"), "# Diary\n\nSynthetic diary line.\n");
  write(join(priv, "notes", "essay.md"), "# Essay\n\nEssay words the owner publishes.\n");
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
  const build = () => JSON.parse(deployed().get("focus-notes.json") ?? "{}").build as string | undefined;
  const pageOf = (name: string) => deployed().has(`n/${name}/index.html`);
  const access = (): AccessFile => JSON.parse(readFileSync(join(priv, "access.json"), "utf8"));
  const reader = () => new SiteReader(async path => deployed().get(path));
  let l: Launched | undefined;
  try {
    l = await launch(inst.dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "",
      FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
    });
    const { page, app } = l;
    const log = l.log;
    await app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
    }, { origin: fake.origin });
    /** Site uploads to the public repository, and backups (a sync for saved notes or a Files change). */
    const pushes = () => fake.git.pushes.filter(k => k === "ada/book").length;
    const saves = () => log.filter(x => /git-sync reasons=\S*\b(save|batch)\b/.test(x)).length;
    /** Waits for the action's deploy, then long enough for a second one to have started: there must be none. */
    const once = async (what: string, action: () => Promise<void>, landed: () => boolean) => {
      const p = pushes(), s = saves();
      await action();
      await expect.poll(landed, { message: what, timeout: 90_000 }).toBe(true);
      await expect.poll(pushes, { timeout: 30_000 }).toBe(p + 1);
      await page.waitForTimeout(6_000);
      expect(pushes(), `${what}: site deploys`).toBe(p + 1);
      expect(saves(), `${what}: backups`).toBe(s + 1);
    };
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Synthetic diary line.");
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    const row = (name: string) => tree.getByRole("treeitem", { name: new RegExp(`^${name}`) });
    const openFiles = async () => { if (!(await tree.isVisible())) await page.keyboard.press("Control+Shift+E"); await expect(tree).toBeVisible(); };
    const menu = async (name: string, item: string | RegExp) => {
      await openFiles();
      await row(name).click({ button: "right" });
      await page.getByRole("menuitem", { name: item }).click();
    };

    // Share Diary with a link.
    await menu("Diary", "Share…");
    const turnOn = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await turnOn.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(turnOn).toHaveCount(0, { timeout: 60_000 });
    const share = page.getByRole("dialog", { name: "Share “Diary”", exact: true });
    await share.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;
    await page.keyboard.press("Escape");
    // The share's own backup must not rebuild the site it just verified.
    const shared = build();
    await page.waitForTimeout(6_000);
    expect(build(), "the share's build id").toBe(shared);

    // A reader opens the link while a real rebuild switches builds (main's condition 5): it reads the manifest of
    // the build that's served, then the rebuild below (editing a public note) replaces the site before it reads on.
    let held = false;
    const midDeploy = new SiteReader(async path => {
      const text = deployed().get(path);
      if (path === "focus-notes.json" && !held) {
        held = true;
        for (const until = Date.now() + 150_000; build() === shared && Date.now() < until;) await new Promise(r => setTimeout(r, 250));
      }
      return text;
    });
    const during: Promise<OpenShare | Error> = midDeploy.openLinkSession(grant.id, grant.link!.secret).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));

    // 1. Editing a public note, then a backup (Mod+S): its page updates once; the reader still opens the link.
    await once("edit Hello", async () => {
      await openFiles();
      await row("Hello").dblclick();
      const note = page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).not.toContainText("Synthetic diary line.");
      await expect(note).toContainText("Hello");
      await note.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Enter");
      await page.keyboard.type("An edit the site carries.");
      await page.keyboard.press("Control+s");
    }, () => (deployed().get("n/hello/index.html") ?? "").includes("An edit the site carries."));
    expect(build(), "the edit's rebuild switched builds").not.toBe(shared);
    expect(deployed().has(`_access/${shared}/l/${grant.id}.json`), "the old build's keyring is gone").toBe(false);
    const midway = await during;
    if (midway instanceof Error) throw new Error(`A reader opening the link during the rebuild saw the gate: ${midway.message}`);
    expect(await midway.share.read(midway.share.notes[0]!.path)).toContain("Synthetic diary line.");
    const { share: opened } = await reader().openLinkSession(grant.id, grant.link!.secret);
    expect(await opened.read(opened.notes[0]!.path)).toContain("Synthetic diary line.");

    // 2. Publish Essay (into the public notes): one deploy.
    await once("publish Essay", async () => {
      await menu("Essay", "Publish");
      await page.getByRole("dialog", { name: "Publish?" }).getByRole("button", { name: "Publish", exact: true }).click();
    }, () => pageOf("essay"));

    // 3. Unpublish it: one deploy, and the page is down.
    await once("unpublish Essay", async () => {
      await menu("Essay", "Unpublish");
      const ask = page.getByRole("dialog", { name: /^Unpublish/ });
      if (await ask.isVisible().catch(() => false)) await ask.getByRole("button", { name: /^Unpublish/ }).click();
    }, () => !pageOf("essay"));

    // 4. Withdraw Diary's share: one deploy, and the link stops opening.
    await once("withdraw Diary", async () => {
      await menu("Diary", "Share details…");
      const details = page.getByRole("dialog", { name: "Share details", exact: true });
      await details.getByRole("button", { name: "Withdraw", exact: true }).click();
      await page.getByRole("dialog", { name: "Withdraw this share?", exact: true }).getByRole("button", { name: "Withdraw share", exact: true }).click();
      await expect(details.getByText("Not shared any more.", { exact: true })).toBeVisible({ timeout: 60_000 });
      await page.keyboard.press("Escape");
    }, () => !deployed().has(`_access/${build()}/l/${grant.id}.json`));
    await expect(reader().openLinkSession(grant.id, grant.link!.secret)).rejects.toThrow();

    // 5. Delete the public Hello: one deploy, its page is down, and the notification says so on time.
    await once("delete Hello", async () => {
      await menu("Hello", /^Delete/);
      await page.getByRole("dialog", { name: "Delete “Hello”?", exact: true }).getByRole("button", { name: "Delete and unpublish", exact: true }).click();
      await expect(row("Hello")).toHaveCount(0, { timeout: 90_000 });
      await expect(page.getByRole("status").filter({ hasText: "Deleted. Its page is down" }).first()).toBeVisible();
    }, () => !pageOf("hello"));
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
