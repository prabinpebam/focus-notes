import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";
import { scheme } from "./surfaces.ts";

const OUT = process.env.FOCUS_NOTES_SHARE_PROGRESS_OUT ?? join(import.meta.dirname, "..", "..", "..", "test-results", "review", "share-progress");
const STATES = ["Done", "Working on this now", "Not started yet", "Stopped here"];
const STILL = "Still working… GitHub is taking longer than usual. Nothing is lost: you can keep waiting, or close this and you’ll be told when it’s done.";

/**
 * D-427, the owner (25 Nov): "Sharing/publishing takes time and involves multiple steps, the progress indicator when
 * it's in progress should be detailed and understandable by a layman user." Every long share or publish operation
 * shows its real steps in order (done ticked, the current one working, the rest waiting), a plain line with the
 * step's elapsed time, Still working… past GitHub's usual time, and a failed step named with Retry carrying on.
 * GitHub and its website are a loopback fake whose website can be held back (slow) or whose builds can fail.
 */
test("D-427: Turn on, Share, Withdraw, Publish and Turn off show their real steps, Still working, and Retry from a failed step", async () => {
  test.setTimeout(360_000);
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
  write(diary, "# Diary\n\nSynthetic diary line.\n");
  write(join(root, "notes", "trips", "lisbon.md"), "# Lisbon\n\nTram 28 at dawn.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: diary }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Fixture");
  git(root, "push", "-qu", "origin", "main");
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  const access = (): AccessFile => JSON.parse(readFileSync(join(root, "access.json"), "utf8"));
  const uploads = () => github.calls.filter(c => c.method === "PATCH" && c.path === "/repos/ada/notes-site/git/refs/heads/main").length;
  const reruns = () => github.calls.filter(c => c.method === "POST" && /\/actions\/runs\/\d+\/rerun-failed-jobs$/.test(c.path)).length;
  let l: Launched | undefined;
  try {
    l = await launch(dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes,
      FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
      // GitHub's usual build time, shortened so Still working… shows within the journey.
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
    const shot = async (dialog: Locator, name: string) => {
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      const box = (await dialog.boundingBox())!;
      const png = await app.evaluate(async ({ BrowserWindow }, rect) => {
        const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes("index.html"))!;
        return (await w.webContents.capturePage(rect)).toPNG().toString("base64");
      }, { x: Math.max(0, Math.floor(box.x) - 8), y: Math.max(0, Math.floor(box.y) - 8), width: Math.ceil(box.width) + 16, height: Math.ceil(box.height) + 16 });
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(png, "base64"));
    };
    /** The step marks' text twins, in on-screen order. */
    const marks = async (dialog: Locator) =>
      (await dialog.getByRole("img").evaluateAll(els => els.map(e => e.getAttribute("aria-label") ?? ""))).filter(n => STATES.includes(n));
    /** The steps in order, the current one working with its plain line and elapsed time, then Still working… */
    const watchSlow = async (dialog: Locator, steps: string[], at: number, line: RegExp, name: string) => {
      fake.git.setStale(true);
      return async () => {
        await expect(dialog.getByText(line)).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => marks(dialog), { timeout: 15_000 }).toEqual(steps.map((_, i) => STATES[i < at ? 0 : i === at ? 1 : 2]));
        const ys = await Promise.all(steps.map(s => dialog.getByText(s, { exact: true }).boundingBox().then(b => b!.y)));
        expect([...ys].sort((a, b) => a - b)).toEqual(ys);
        await expect(dialog.getByText(STILL, { exact: true })).toBeVisible({ timeout: 30_000 });
        await shot(dialog, `${name}-still.dark`);
        await scheme(page, "light");
        await shot(dialog, `${name}-still.light`);
        await scheme(page, "dark");
        fake.git.setStale(false);
      };
    };
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const openSettings = async (p: Page, tab: string) => {
      await p.keyboard.press("Control+,");
      await settings.getByRole("tab", { name: tab, exact: true }).click();
    };
    const files = async () => {
      if (!(await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).isVisible())) await page.keyboard.press("Control+Shift+E");
      await expect(page.getByRole("treeitem", { name: /^trips(, Shared)?$/ })).toBeVisible();
    };
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Synthetic diary line.");
    await scheme(page, "dark");

    // 1. Turn on sharing: GitHub's build is slow, so Still working… shows; then the website is live.
    await openSettings(page, "Sharing");
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });
    await expect(confirmation).toContainText("ada/notes-site", { timeout: 30_000 });
    const turnOn = await watchSlow(confirmation, ["Make your notes site", "Upload your notes site", "GitHub puts your website up", "Your website is live"], 2,
      /^GitHub is putting your website up\. This usually takes 1–2 minutes\. \d+:\d\d$/, "turn-on");
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await turnOn();
    await expect(confirmation).toHaveCount(0, { timeout: 60_000 });
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    // 2. Share a folder: Lock the note → Upload it → GitHub updates your website → Get the link ready.
    await files();
    await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
    await expect(share).toBeVisible();
    const shareSteps = ["Lock the note", "Upload it", "GitHub updates your website", "Get the link ready"];
    const sharing = await watchSlow(share, shareSteps, 2, /^GitHub is updating your website\. This usually takes 1–2 minutes\. \d+:\d\d$/, "share");
    await share.getByRole("button", { name: "Copy share information", exact: true }).click();
    await sharing();
    await expect(share.getByText("Share information copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await marks(share)).toEqual(["Done", "Done", "Done", "Done"]);
    const grant = access().grants.find(g => !g.owner && !g.revokedAt)!;

    // 3. Withdraw, where GitHub's build fails twice: the failed step is named, earlier steps stay ticked, and the
    // same press carries on from that step: GitHub builds the same upload again, with no second upload.
    // The now-shared folder's menu offers Share details… (D-431), where Withdraw is.
    await share.press("Escape");
    await expect(share).toHaveCount(0);
    await files();
    await page.getByRole("treeitem", { name: "trips, Shared", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share details…", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Share details", exact: true });
    await details.getByRole("button", { name: "Withdraw", exact: true }).first().click();
    const withdraw = page.getByRole("dialog", { name: "Withdraw this share?", exact: true });
    fake.git.failPagesRuns(2);
    const before = reruns();
    await withdraw.getByRole("button", { name: "Withdraw share", exact: true }).click();
    await expect(withdraw.getByText("Stopped at “GitHub updates your website”. The steps before it are done and kept. GitHub couldn’t update your website, even after trying twice. Your notes stay private. Retry in a minute.", { exact: true }))
      .toBeVisible({ timeout: 60_000 });
    expect(await marks(withdraw)).toEqual(["Done", "Done", "Stopped here"]);
    expect(access().grants.find(g => g.id === grant.id)?.revokedAt).toBeTruthy();
    await shot(withdraw, "withdraw-failed.dark");
    await scheme(page, "light");
    await shot(withdraw, "withdraw-failed.light");
    await scheme(page, "dark");
    const uploaded = uploads();
    await withdraw.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(withdraw).toHaveCount(0, { timeout: 60_000 });
    expect(reruns()).toBe(before + 2);
    expect(uploads()).toBe(uploaded);
    await details.press("Escape");
    await expect(details).toHaveCount(0);

    // 4. Publish a note: Prepare the notes → Upload them → GitHub updates your website.
    await files();
    const lisbon = page.getByRole("treeitem", { name: /^Lisbon/ });
    if (!(await lisbon.isVisible())) { await page.getByRole("treeitem", { name: /^trips(, Shared)?$/ }).click(); await page.keyboard.press("ArrowRight"); }
    await lisbon.click();
    await lisbon.press("Enter");
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Tram 28");
    await page.keyboard.press("Control+.");
    await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    const publish = page.getByRole("dialog", { name: /Publish/ });
    const publishing = await watchSlow(publish, ["Prepare the notes", "Upload them", "GitHub updates your website"], 2,
      /^GitHub is updating your website\. This usually takes 1–2 minutes\. \d+:\d\d$/, "publish");
    await publish.getByRole("button", { name: "Publish", exact: true }).click();
    await publishing();
    await expect(page.getByRole("status").filter({ hasText: "Published “Lisbon”" })).toHaveCount(1, { timeout: 60_000 });
    await page.keyboard.press("Escape");

    // 5. Turn off sharing: Keep your notes safe → Empty your website → GitHub updates your website → Sharing is off.
    await openSettings(page, "Sharing");
    await settings.getByRole("button", { name: "Turn off sharing…", exact: true }).click();
    const off = page.getByRole("dialog", { name: /^Turn off sharing for/ });
    const turningOff = await watchSlow(off, ["Keep your notes safe", "Empty your website", "GitHub updates your website", "Sharing is off"], 2,
      /^GitHub is taking your notes off your website\. This usually takes 1–2 minutes\. \d+:\d\d$/, "turn-off");
    await off.getByRole("button", { name: "Turn off sharing", exact: true }).click();
    await turningOff();
    await expect(off).toHaveCount(0, { timeout: 60_000 });
    await expect(settings.getByRole("button", { name: "Turn on sharing…", exact: true })).toBeVisible({ timeout: 30_000 });
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
