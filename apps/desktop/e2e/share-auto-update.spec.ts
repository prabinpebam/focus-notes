import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SiteReader } from "@focus-notes/seal";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

/**
 * D-433 (the owner, 26 November: changes to a shared file should update the share automatically): after a shared
 * note is saved and backed up, its existing share carries the new text, with the same link, code and expiry, and no
 * new share; an unshared private note's text never reaches the site. GitHub and Pages are loopback fakes.
 */
test("D-433: saving a shared note updates its existing share by itself: same link and code, new text, nothing else", async () => {
  test.setTimeout(300_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  const FIRST = "First version for the recipient.";
  const EDIT = "Edited after sharing";
  const UNRELATED = "Unrelated private line that must never be exposed.";
  write(join(priv, "notes", "diary.md"), `# Diary\n\n${FIRST}\n`);
  write(join(priv, "notes", "other.md"), `# Other\n\n${UNRELATED}\n`);
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
  const siteUrl = "https://ada.github.io/book/";
  const reader = () => new SiteReader(async (p) => fake.git.get(new URL(p, siteUrl).href));
  const access = (): AccessFile => JSON.parse(readFileSync(join(priv, "access.json"), "utf8"));
  const shared = async (id: string, secret: string) => {
    const { share } = await reader().openLinkSession(id, secret);
    return Promise.all(share.notes.map((n) => share.read(n.path)));
  };
  let l: Launched | undefined;
  try {
    l = await launch(inst.dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "",
      FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "800", FOCUS_NOTES_SHARE_UPDATE_MS: "500",
    });
    const { page, app } = l;
    await app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
    }, { origin: fake.origin });
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText(FIRST);
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    if (!(await tree.isVisible())) await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    await tree.getByRole("treeitem", { name: "Diary diary.md", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click({ timeout: 30_000 });
    await expect(confirmation).toHaveCount(0, { timeout: 60_000 });
    const share = page.getByRole("dialog", { name: "Share “Diary”", exact: true });
    await share.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");
    const grant = access().grants.find((g) => !g.owner && !g.revokedAt)!;
    expect((await shared(grant.id, grant.link!.secret)).join("\n")).toContain(FIRST);
    const pushes = fake.git.pushes.length;

    // Edit the shared note and leave it: the backup runs, then the share is updated without asking.
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(` ${EDIT}.`);
    await expect.poll(async () => (await shared(grant.id, grant.link!.secret).catch(() => [""])).join("\n"), { timeout: 120_000 }).toContain(EDIT);
    expect(fake.git.pushes.length).toBeGreaterThan(pushes);
    // The same share: one grant, its link, code and expiry unchanged; nothing else shared or leaked.
    const after = access().grants.filter((g) => !g.owner);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(grant);
    expect([...fake.git.site("ada/book").values()].join("\n")).not.toContain(UNRELATED);
    await expect(page.getByRole("region", { name: "Notifications", exact: true })).not.toContainText("Couldn’t update your share");
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
