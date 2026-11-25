import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

/**
 * D-418 (D6 in the owner's share review): Share… from the first share in a GitHub-linked project made
 * by New project, and the Share dialog's offline and signed-out states. GitHub and Pages are loopback fakes.
 */
async function linkedProject() {
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
  write(diary, "# Diary\n\nPrivate.\n");
  write(join(root, "notes", "rome.md"), "# Rome\n\nCoffee at the corner.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: diary }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Private fixture");
  git(root, "push", "-qu", "origin", "main");
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  const l = await launch(dirs, {
    FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes,
    FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
  });
  await l.app.evaluate((_electron, origin) => {
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return url.hostname.endsWith(".github.io") ? nativeFetch(`${origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
    };
  }, fake.origin);
  await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Private.");
  return { l, github, fake };
}

async function close(l: Launched | undefined, fake: { close(): Promise<void> }) {
  try { if (l) await quit(l); } finally {
    if (l && process.platform === "win32") for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    await fake.close();
  }
}

/** Files → right-click Rome → Share…; with sharing off, the first share turns it on and opens Rome's Share dialog. */
async function shareRome(l: Launched, turnOn = true) {
  const { page } = l;
  const rome = page.getByRole("treeitem", { name: /^Rome/ });
  if (!(await rome.isVisible())) await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
  await rome.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
  const first = page.getByRole("dialog", { name: /^Turn on sharing for/ });
  if (turnOn) {
    await expect(first).toContainText("ada/notes-site");
    await first.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(first).toHaveCount(0, { timeout: 30_000 });
  }
  return { first, share: page.getByRole("dialog", { name: "Share “Rome”", exact: true }) };
}

test("D6/06: Share… on a note in a linked project with sharing off turns sharing on, then opens that note's Share dialog", async () => {
  test.setTimeout(120_000);
  const { l, github, fake } = await linkedProject();
  try {
    // Closing it turns nothing on and opens no Share dialog.
    const cancelled = await shareRome(l, false);
    await expect(cancelled.first).toContainText("ada/notes-site");
    await cancelled.first.getByRole("button", { name: "Close", exact: true }).click();
    await expect(cancelled.first).toHaveCount(0);
    await expect(cancelled.share).toHaveCount(0);
    expect(github.repo("notes-site")).toBeUndefined();
    const { share } = await shareRome(l);
    await expect(share).toBeVisible();
    await expect(share.getByRole("button", { name: "Copy share information", exact: true })).toBeEnabled();
    expect(github.repo("notes-site")).toMatchObject({ private: false });
  } finally { await close(l, fake); }
});

test("D6/24: offline, the Share dialog says it publishes when back online, keeps the draft, and the same action then copies", async () => {
  test.setTimeout(180_000);
  const { l, github, fake } = await linkedProject();
  try {
    const { share } = await shareRome(l);
    github.offline = true;
    await share.getByRole("button", { name: "Copy link", exact: true }).click();
    // D-427: a failed share names the step it stopped at, then the reason.
    await expect(share.getByText("Stopped at “Upload it”. The steps before it are done and kept. You're offline. Your share will publish when you're back online. Try the same action again to copy it.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(share.getByText("Sharing couldn’t finish. Your draft is kept. Try again.", { exact: true })).toHaveCount(0);
    github.offline = false;
    await share.getByRole("group", { name: "Copy", exact: true }).getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "")).toMatch(/^https:\/\/ada\.github\.io\/notes-site\/s\/#/);
  } finally { await close(l, fake); }
});

test("D6/25: signed out of GitHub, the Share dialog asks to sign in again with Sign in, keeps the draft, and the same action resumes", async () => {
  test.setTimeout(180_000);
  const { l, github, fake } = await linkedProject();
  try {
    const { share } = await shareRome(l);
    github.revoked = true;
    await share.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Stopped at “Upload it”. The steps before it are done and kept. Sign in to GitHub again to publish this share. Your draft is kept.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(share.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    // Signed in again (the fake accepts the token): the same action finishes without a second share.
    github.revoked = false;
    await share.getByRole("group", { name: "Copy", exact: true }).getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(share.getByText(/Sign in to GitHub again to publish this share\. Your draft is kept\./)).toHaveCount(0);
  } finally { await close(l, fake); }
});
