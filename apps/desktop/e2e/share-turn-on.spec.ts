import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "@playwright/test";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";
import { scheme } from "./surfaces.ts";

const OUT = process.env.FOCUS_NOTES_TURN_ON_OUT ?? join(import.meta.dirname, "..", "..", "..", "test-results", "review", "turn-on");

/**
 * The owner, 24 November ("This is not working, can't turn on sharing."): in the Private + Public layout, Turn on
 * sharing pushed the site, then GitHub's first Pages run failed ("No artifacts named github-pages"), and the dialog
 * sat at Save to GitHub for ten minutes. The fake fails the run and its re-run the same way: the dialog must say so
 * with Retry, keep its content and its top inset, and Retry must then turn sharing on.
 */
test("24 Nov: Turn on sharing when GitHub's Pages run fails shows the reason with Retry, and Retry turns it on", async () => {
  test.setTimeout(240_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  write(join(priv, "notes", "diary.md"), "# Diary\n\nSynthetic diary line.\n");
  git(priv, "add", "-A");
  git(priv, "commit", "-qm", "Fixture notes");
  git(priv, "push", "-q", "origin", "main");
  git(priv, "remote", "add", "identity", "https://github.com/ada/book-private.git");
  write(join(docs, "notes", "hello.md"), "# Hello\n\nPublic words.\n");
  git(docs, "add", "-A");
  git(docs, "commit", "-qm", "Fixture pointer");
  git(docs, "push", "-q", "origin", "main");
  write(join(inst.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(priv, "notes", "diary.md") }));

  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book-private", private: true, files: ["notes/diary.md"] });
  const fake = await serveFakeGitHub(github);
  let l: Launched | undefined;
  try {
    l = await launch(inst.dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "",
      FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000",
    });
    const { page, app } = l;
    // The owner's window size, where the grown dialog ran out of room.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))!.setSize(1074, 768));
    await app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
    }, { origin: fake.origin });
    const shot = async (dialog: Locator, name: string) => {
      await page.mouse.move(1, 1);
      await page.waitForTimeout(400);
      const box = (await dialog.boundingBox())!;
      const png = await app.evaluate(async ({ BrowserWindow }, rect) => {
        const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes("index.html"))!;
        return (await w.webContents.capturePage(rect)).toPNG().toString("base64");
      }, { x: Math.max(0, Math.floor(box.x) - 8), y: Math.max(0, Math.floor(box.y) - 8), width: Math.ceil(box.width) + 16, height: Math.ceil(box.height) + 16 });
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(png, "base64"));
    };
    /** The title keeps the dialog's top inset: nothing has scrolled it under the edge (the owner's screenshot). */
    const keepsInset = async (dialog: Locator) => {
      expect(await dialog.locator("[data-dialog-body]").evaluate(el => el.scrollTop)).toBe(0);
      const [frame, title] = await Promise.all([dialog.boundingBox(), dialog.getByRole("heading", { level: 2 }).boundingBox()]);
      expect(title!.y - frame!.y).toBeGreaterThanOrEqual(16);
    };
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Synthetic diary line.");
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    const openShare = async () => {
      if (!(await tree.isVisible())) await page.keyboard.press("Control+Shift+E");
      await tree.getByRole("treeitem", { name: "Diary diary.md", exact: true }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    };
    const confirmation = page.getByRole("dialog", { name: /^Turn on sharing for/ });

    // The confirmation in light, with More details as a disclosure; then dark.
    await scheme(page, "light");
    await openShare();
    await expect(confirmation).toContainText("ada/notes-site", { timeout: 30_000 });
    await shot(confirmation, "turn-on.light");
    const more = confirmation.getByRole("button", { name: "More details", exact: true });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(confirmation.getByText(/served by GitHub Pages/)).toBeVisible();
    await keepsInset(confirmation);
    await shot(confirmation, "turn-on-more.light");
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await scheme(page, "dark");
    await openShare();
    await expect(confirmation).toContainText("ada/notes-site", { timeout: 30_000 });
    await confirmation.getByRole("button", { name: "More details", exact: true }).click();
    await shot(confirmation, "turn-on-more.dark");

    // The first Pages run fails, and so does its one re-run: the dialog says why, offers Retry, and keeps its state.
    fake.git.failPagesRuns(2);
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    // D-427: the real steps in plain words, in order; done ones ticked, the current one active, with its elapsed time.
    const steps = ["Make your notes site", "Upload your notes site", "GitHub puts your website up", "Your website is live"];
    const states = ["Done", "Working on this now", "Not started yet", "Stopped here"];
    const marks = async () => (await confirmation.getByRole("img").evaluateAll(els => els.map(e => e.getAttribute("aria-label") ?? ""))).filter(n => states.includes(n));
    await expect(confirmation.getByText(/^GitHub is putting your website up\. This usually takes 1–2 minutes\. \d+:\d\d$/)).toBeVisible({ timeout: 30_000 });
    expect(await marks()).toEqual(["Done", "Done", "Working on this now", "Not started yet"]);
    const order = await Promise.all(steps.map(label => confirmation.getByText(label, { exact: true }).boundingBox().then(b => b!.y)));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await shot(confirmation, "turn-on-busy.dark");
    await expect(confirmation.getByText("Stopped at “GitHub puts your website up”. The steps before it are done and kept. GitHub couldn’t put your website up, even after trying twice. Your notes stay private. Retry in a minute.", { exact: true }))
      .toBeVisible({ timeout: 60_000 });
    expect(await marks()).toEqual(["Done", "Done", "Stopped here", "Not started yet"]);
    const uploads = github.calls.filter(c => c.method === "PATCH" && c.path === "/repos/ada/notes-site/git/refs/heads/main").length;
    const retry = confirmation.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeEnabled();
    await expect(confirmation).toContainText("ada/notes-site");
    await expect(confirmation.getByRole("button", { name: "More details", exact: true })).toHaveAttribute("aria-expanded", "false");
    await keepsInset(confirmation);
    expect(github.calls.filter(c => c.method === "POST" && /\/actions\/runs\/\d+\/rerun-failed-jobs$/.test(c.path))).toHaveLength(1);
    await shot(confirmation, "turn-on-error.dark");
    await scheme(page, "light").then(() => shot(confirmation, "turn-on-error.light"), () => {});
    await expect(confirmation).toBeVisible();

    // Retry carries on from the failed step: the earlier steps stay ticked, GitHub builds the same upload again (no
    // second upload, no second repository), and it continues into the note's Share.
    await retry.click();
    await expect.poll(marks, { timeout: 30_000 }).toEqual(["Done", "Done", "Working on this now", "Not started yet"]).catch(() => {});
    await expect(confirmation).toHaveCount(0, { timeout: 60_000 });
    expect(github.calls.filter(c => c.method === "POST" && /\/actions\/runs\/\d+\/rerun-failed-jobs$/.test(c.path))).toHaveLength(2);
    expect(github.calls.filter(c => c.method === "PATCH" && c.path === "/repos/ada/notes-site/git/refs/heads/main")).toHaveLength(uploads);
    await expect(page.getByRole("dialog", { name: "Share “Diary”", exact: true })).toBeVisible({ timeout: 30_000 });
    expect(github.calls.filter(c => c.method === "POST" && c.path === "/user/repos")).toHaveLength(1);
    expect(fake.git.site("ada/notes-site").has("focus-notes.json")).toBe(true);
  } finally {
    try { if (l) await quit(l); } finally {
      if (l && process.platform === "win32") {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid)], { stdio: "inherit" });
      }
      await fake.close();
      rmSync(inst.dirs.userData, { recursive: true, force: true });
      rmSync(join(docs, ".."), { recursive: true, force: true });
    }
  }
});
