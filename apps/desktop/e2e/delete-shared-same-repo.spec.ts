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
 * Every frame from the confirmation on, a deleted row reads Deleting… (or Stopped) until it goes, once (D-428, D-436).
 */
test("D-428: Private + Public: deleting a published note takes its page down; a shared and a published note together lose both", async () => {
  test.setTimeout(480_000);
  const inst = instance();
  const { docs } = inst.dirs;
  const priv = join(docs, "private");
  write(join(priv, "notes", "diary.md"), "# Diary\n\nSynthetic diary line.\n");
  write(join(priv, "notes", "essay.md"), "# Essay\n\nEssay words the owner publishes.\n");
  write(join(priv, "notes", "trip.md"), "# Trip\n\nTrip words the owner publishes.\n");
  write(join(priv, "notes", "rome.md"), "# Rome\n\nRome words the owner shares.\n");
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
    /**
     * Samples every frame from now: each named row's data-deleting ("normal" without one, "gone" when it isn't in the
     * tree), and whether the confirmation is still open.
     */
    const watchRows = (names: string[], confirm: string) => page.evaluate(({ names, confirm }) => {
      const w = window as unknown as { rowFrames: string[]; rowWatch: boolean };
      w.rowFrames = [];
      w.rowWatch = true;
      const tick = () => {
        if (!w.rowWatch) return;
        const items = [...document.querySelectorAll<HTMLElement>("[role=tree] [role=treeitem]")];
        const open = [...document.querySelectorAll("[role=dialog]")].some(d => (d.textContent ?? "").includes(confirm));
        w.rowFrames.push([open ? "confirm" : "closed", ...names.map(n => {
          const r = items.find(e => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().startsWith(n));
          return r ? r.getAttribute("data-deleting") ?? "normal" : "gone";
        })].join(" "));
        requestAnimationFrame(tick);
      };
      // The first sample is taken now, before Delete is clicked: a stalled first animation frame in the
      // invisible test window must not make the confirmation look closed from the start.
      tick();
    }, { names, confirm });
    /** From the first frame after the confirmation closed: every row Deleting… at once, then Deleting… or Stopped until it goes, once. */
    const expectRowsSteady = async (label: string) => {
      const frames = (await page.evaluate(() => { const w = window as unknown as { rowFrames: string[]; rowWatch: boolean }; w.rowWatch = false; return w.rowFrames; })).map(x => x.split(" "));
      const first = frames.findIndex(x => x[0] === "closed");
      expect(first, `${label}: a frame after the confirmation (${frames.length} frames, first: ${JSON.stringify(frames.slice(0, 4))})`).toBeGreaterThan(0);
      const after = frames.slice(first);
      expect(after[0]!.slice(1), `${label}: the very next frame after Delete is confirmed`).toEqual(after[0]!.slice(1).map(() => "pending"));
      for (let k = 1; k < after[0]!.length; k++) {
        const seq = after.map(x => x[k]!);
        const gone = seq.indexOf("gone");
        expect(gone, `${label}: row ${k} goes`).toBeGreaterThan(0);
        expect(seq.slice(0, gone).filter(s => s !== "pending" && s !== "failed"), `${label}: row ${k} never missing or plain before it goes`).toEqual([]);
        expect(seq.slice(gone).filter(s => s !== "gone"), `${label}: row ${k} goes once`).toEqual([]);
      }
    };
    const deletingStatus = () => page.getByRole("status").filter({ hasText: "Deleting…" }).first();

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
    /** Site uploads to the public repository and its backups' pushes; backups (a sync for saved notes or a Files change). */
    const pushes = () => fake.git.pushes.filter(k => k === "ada/book").length;
    const saves = () => l!.log.filter(x => /git-sync reasons=\S*\b(save|batch)\b/.test(x)).length;
    /** The site's uploads alone: the fake's site files change with each one. */
    const siteBuilds: string[] = [deployed().get("focus-notes.json") ?? ""];
    const watchBuilds = setInterval(() => { const b = deployed().get("focus-notes.json"); if (b && b !== siteBuilds.at(-1)) siteBuilds.push(b); }, 50);
    watchBuilds.unref();
    const counts = () => ({ builds: siteBuilds.length, saves: saves(), pushes: pushes() });
    /** Until nothing has been built, pushed or backed up for 6 s: the share's own backup and its rebuild have landed. */
    const quiet = async () => {
      let last = JSON.stringify(counts()), since = Date.now();
      while (Date.now() - since < 6_000) {
        await page.waitForTimeout(250);
        const now = JSON.stringify(counts());
        if (now !== last) { last = now; since = Date.now(); }
      }
    };

    // 1. A published note: the confirmation says its page goes; the row stays Deleting… until the page is down.
    // Counted from a quiet start: the publishes' own backups have landed.
    await page.waitForTimeout(6_000);
    const beforeEssay = counts();
    await menu("Essay", /^Delete/);
    const ask = page.getByRole("dialog", { name: "Delete “Essay”?", exact: true });
    await expect(ask.getByText("This note is published. Deleting it also takes its web page down.", { exact: true })).toBeVisible();
    await expect(ask.getByText(/This note is shared/)).toHaveCount(0);
    fake.git.setStale(true);
    await watchRows(["Essay"], "Delete “Essay”?");
    await ask.getByRole("button", { name: "Delete and unpublish", exact: true }).click();
    // The first honest status within 5 s of the confirmation, under load too.
    await expect(deletingStatus()).toBeVisible();
    await expect(row("Essay")).toHaveAttribute("data-deleting", "pending", { timeout: 30_000 });
    await row("Essay").hover();
    const card = page.getByRole("dialog", { name: "Deleting “Essay”: steps", exact: true });
    for (const step of ["Delete the note", "Take the page down", "Update your website"]) await expect(card.getByText(step, { exact: true })).toBeVisible();
    fake.git.setStale(false);
    await page.mouse.move(1, 1);
    await expect(row("Essay")).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByRole("status").filter({ hasText: "Deleted. Its page is down" }).first()).toBeVisible();
    await expectRowsSteady("Delete Essay");
    expect(pageOf("essay")).toBe(false);
    // The live site no longer serves the page: a reader opening its address gets nothing.
    expect([...deployed().keys()].filter(k => k.startsWith("n/") && k.includes("essay"))).toEqual([]);
    expect(home()).not.toContain("Essay");
    expect(home()).toContain("Trip");
    expect(existsSync(join(docs, "notes", "essay.md"))).toBe(false);
    // Long enough for a second deploy or backup to have started: one Delete is one site deploy and one backup (D-436).
    await page.waitForTimeout(6_000);
    const afterEssay = counts();
    expect(afterEssay.builds - beforeEssay.builds, "Delete Essay: site deploys").toBe(1);
    expect(afterEssay.saves - beforeEssay.saves, "Delete Essay: backups").toBe(1);
    // Recently deleted still lists it.
    await page.getByRole("button", { name: /^Recently deleted/ }).click();
    await expect(page.getByText(/^essay$/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Browse files", exact: true }).click();
    await expect(tree).toBeVisible();

    // 2. GitHub can't update the website: the shared Rome's row stays, Stopped, with Retry, and the note is kept; Retry
    // carries on, and the row goes once.
    await menu("Rome", "Share…");
    const shareRome = page.getByRole("dialog", { name: "Share “Rome”", exact: true });
    await shareRome.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(shareRome.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");
    await expect(shareRome).toHaveCount(0);
    // GitHub fails the Pages run and its retry for the next deploy: the link's withdrawal, not a rebuild still running.
    await quiet();
    fake.git.failPagesRuns(2);
    await menu("Rome", /^Delete/);
    const askRome = page.getByRole("dialog", { name: "Delete “Rome”?", exact: true });
    await expect(askRome).toBeVisible();
    await watchRows(["Rome"], "Delete “Rome”?");
    await askRome.getByRole("button", { name: "Delete 1 note", exact: true }).click();
    await expect(deletingStatus()).toBeVisible();
    await expect(row("Rome")).toHaveAttribute("data-deleting", "failed", { timeout: 90_000 });
    await expect(row("Rome")).toContainText("Stopped");
    expect(existsSync(join(priv, "notes", "rome.md"))).toBe(true);
    await row("Rome").hover();
    const romeCard = page.getByRole("dialog", { name: "Deleting “Rome”: steps", exact: true });
    await expect(romeCard.getByText(/^Stopped at /)).toBeVisible();
    await romeCard.getByRole("button", { name: "Retry", exact: true }).click();
    await page.mouse.move(1, 1);
    await expect(row("Rome")).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByRole("status").filter({ hasText: "Deleted. Its link is off" }).first()).toBeVisible();
    await expectRowsSteady("Delete Rome after a failed website update");
    expect(existsSync(join(priv, "notes", "rome.md"))).toBe(false);
     // Counted from a quiet start again.
    await page.waitForTimeout(6_000);
    const beforeBoth = counts();

    // 3. Both: the shared Diary and the published Trip together. The link goes first, then the notes, then the page.
    await openFiles();
    await row("Diary").click();
    await row("Trip").click({ modifiers: ["Control"] });
    await page.keyboard.press("Delete");
    const both = page.getByRole("dialog", { name: "Delete 2 items?", exact: true });
    await expect(both.getByText("Some of these notes are shared. Deleting them also turns off their links, so people with the links can't open them.", { exact: true })).toBeVisible();
    await expect(both.getByText("Some of these notes are published. Deleting them also takes their web pages down.", { exact: true })).toBeVisible();
    await watchRows(["Diary", "Trip"], "Delete 2 items?");
    await both.getByRole("button", { name: "Delete and unpublish", exact: true }).click();
    await expect(deletingStatus()).toBeVisible();
    await expect(row("Diary")).toHaveCount(0, { timeout: 90_000 });
    await expect(row("Trip")).toHaveCount(0, { timeout: 90_000 });
    // "Its page is down" as soon as the job is: the rows go with it, never before.
    const doneBoth = page.locator("#toasts").getByText("Deleted. Its link is off and its page is down", { exact: true });
    await expect(page.getByRole("status").filter({ hasText: "Deleted. Its link is off and its page is down" }).first()).toBeVisible();
    // Held open (a hovered notification waits) for Undo after the count.
    await doneBoth.hover();
    await expectRowsSteady("Delete Diary and Trip");
    expect(access().grants.find(g => g.id === grant.id)?.revokedAt).toBeTruthy();
    await expect.poll(async () => (await Promise.allSettled([reader().openLinkSession(grant.id, grant.link!.secret)]))[0]!.status).toBe("rejected");
    expect(pageOf("trip")).toBe(false);
    expect(home()).not.toContain("Trip");
    expect(existsSync(join(priv, "notes", "diary.md"))).toBe(false);
    expect(existsSync(join(docs, "notes", "trip.md"))).toBe(false);
    // D-428's order makes this at most two of each: the link's withdrawal saves and deploys first, then the notes'
    // delete is backed up once and the site is built once without them (joining the rebuild, never a third build).
    await page.waitForTimeout(6_000);
    const afterBoth = counts();
    for (const [what, n] of [["site deploys", afterBoth.builds - beforeBoth.builds], ["backups", afterBoth.saves - beforeBoth.saves]] as const) {
      expect(n, `Delete Diary and Trip: ${what}`).toBeGreaterThanOrEqual(1);
      expect(n, `Delete Diary and Trip: ${what}`).toBeLessThanOrEqual(2);
    }
    clearInterval(watchBuilds);
    // Undo puts both notes back.
    await page.locator("#toasts").getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => existsSync(join(priv, "notes", "diary.md")) && existsSync(join(docs, "notes", "trip.md")), { timeout: 30_000 }).toBe(true);
    await expect(row("Diary")).toHaveCount(1);
    await expect(row("Trip")).not.toHaveAttribute("data-deleting", /./);

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
