import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { SiteReader } from "../../../packages/seal/src/reader.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

/**
 * D-428, the owner (25 Nov): "If I delete a note that was shared/published note, that note should be taken down and
 * become immediately unavailable from the shared/published state. A confirmation dialog should be shown for all
 * delete…" Every delete asks; a shared note's link is turned off and the website updated before the note is deleted,
 * its row staying, Deleting…, with its steps on hover. GitHub and its website are a loopback fake held back on demand.
 */
test("D-428: deleting a shared note asks, keeps the row Deleting… while its link goes, then deletes it; a plain note asks too", async () => {
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
  const lisbon = join(root, "notes", "trips", "lisbon.md");
  const plain = join(root, "notes", "plain.md");
  write(diary, "# Diary\n\nSynthetic diary line.\n");
  write(lisbon, "# Lisbon\n\nTram 28 at dawn.\n");
  write(plain, "# Plain\n\nNothing shared here.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: diary }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Fixture");
  git(root, "push", "-qu", "origin", "main");
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  const access = (): AccessFile => JSON.parse(readFileSync(join(root, "access.json"), "utf8"));
  const reader = () => new SiteReader(async path => fake.git.site("ada/notes-site").get(path));
  let l: Launched | undefined;
  try {
    l = await launch(dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes,
      FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
      FOCUS_NOTES_PAGES_SLOW_MS: "1000",
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
    const files = async () => {
      if (!(await page.getByRole("treeitem", { name: "trips", exact: true }).isVisible())) await page.keyboard.press("Control+Shift+E");
      await expect(page.getByRole("treeitem", { name: "trips", exact: true })).toBeVisible();
    };
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });

    // Turn on sharing, then share Lisbon with a link.
    await page.keyboard.press("Control+,");
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const turnOn = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await turnOn.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(turnOn).toHaveCount(0, { timeout: 60_000 });
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await files();
    const lisbonRow = page.getByRole("treeitem", { name: /^Lisbon/ });
    if (!(await lisbonRow.isVisible())) { await page.getByRole("treeitem", { name: "trips", exact: true }).click(); await page.keyboard.press("ArrowRight"); }
    await lisbonRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “Lisbon”", exact: true });
    await share.getByRole("button", { name: "Copy share information", exact: true }).click();
    await expect(share.getByText("Share information copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;
    await reader().openLinkSession(grant.id, grant.link!.secret);
    await share.press("Escape");
    await expect(share).toHaveCount(0);

    // Delete it from its row menu: the confirmation says its link goes too, with one danger action and no Cancel.
    await files();
    await lisbonRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Delete/ }).click();
    const confirm = page.getByRole("dialog", { name: "Delete “Lisbon”?", exact: true });
    await expect(confirm.getByText("This note is shared. Deleting it also turns off its link, so people with the link can't open it.", { exact: true })).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toHaveCount(0);
    // GitHub's website build is held back, so the row is seen while the link goes.
    fake.git.setStale(true);
    await confirm.getByRole("button", { name: "Delete 1 note", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(lisbonRow).toHaveAttribute("data-deleting", "pending", { timeout: 30_000 });
    await expect(lisbonRow).toContainText("Deleting…");
    await expect(lisbonRow.locator("[data-border-progress='pending']")).toHaveCount(1);
    expect(existsSync(lisbon)).toBe(true);
    await lisbonRow.hover();
    const card = page.getByRole("dialog", { name: "Deleting “Lisbon”: steps", exact: true });
    await expect(card).toBeVisible();
    for (const step of ["Turn off the link", "Update your website", "Delete the note"]) await expect(card.getByText(step, { exact: true })).toBeVisible();
    await expect(card.getByText(/^GitHub is updating your website\. This usually takes 1–2 minutes\. \d+:\d\d$/)).toBeVisible({ timeout: 30_000 });
    expect(existsSync(lisbon)).toBe(true);
    fake.git.setStale(false);
    await page.mouse.move(1, 1);

    // Done: the row goes, one notification, the link no longer opens, and the file is gone.
    await expect(lisbonRow).toHaveCount(0, { timeout: 60_000 });
    // One notification (the second status is the screen reader's live region saying the same).
    await expect(page.getByRole("status").filter({ hasText: "Deleted. Its link is off" }).first()).toBeVisible();
    expect(access().grants.find(g => g.id === grant.id)?.revokedAt).toBeTruthy();
    await expect.poll(async () => (await Promise.allSettled([reader().openLinkSession(grant.id, grant.link!.secret)]))[0]!.status).toBe("rejected");
    expect(existsSync(lisbon)).toBe(false);

    // A plain private note asks too, without the explanation, then goes.
    const plainRow = page.getByRole("treeitem", { name: /^Plain/ });
    await plainRow.click();
    await page.keyboard.press("Delete");
    const ask = page.getByRole("dialog", { name: "Delete “Plain”?", exact: true });
    await expect(ask).toBeVisible();
    await expect(ask.getByText(/This note is shared/)).toHaveCount(0);
    expect(existsSync(plain)).toBe(true);
    await ask.getByRole("button", { name: "Delete 1 note", exact: true }).click();
    await expect(plainRow).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => existsSync(plain)).toBe(false);
    expect(readFileSync(diary, "utf8")).toBe("# Diary\n\nSynthetic diary line.\n");
  } finally {
    try { if (l) await quit(l); } finally {
      if (l && process.platform === "win32") {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
      await fake.close();
      rmSync(dirs.userData, { recursive: true, force: true });
      rmSync(dirs.docs, { recursive: true, force: true });
    }
  }
});
