/**
 * M3 journeys for the desktop's first run (WP-3.2: FRE-01 to FRE-06, SEC-03, UI-12; D-124: four
 * steps in words anyone understands), keyboard only. GitHub is the in-memory fake behind a local
 * HTTP port, its repositories are local bare remotes, and Git's sign-in helpers are fakes on PATH (a
 * credential helper, Git Credential Manager, the GitHub CLI), so nothing touches the network or a
 * real account. Every program the app starts is logged, and no token may appear in any of their
 * arguments. The main path never shows the words the setup word rules keep out.
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { card, existingInstance, heading, noTokenInArgs, openAccountSettings, opened, press, start, tabTo, world } from "./github-world.ts";

test.describe.configure({ mode: "serial" });

/** D-124: what the main path never says (Foundations → Words). Disclosures are closed here, so their words aren't shown. */
const JARGON = /\b(repositor(y|ies)|Git|commits?|tokens?|credentials?|CLI|instances?|Pages)\b/;
const plainWords = async (page: Page) => expect(await card(page).innerText()).not.toMatch(JARGON);

// M3 demo, step 1 (first run with a fake GitHub; a clean machine without Git is the owner's check).
test("FRE-01, FRE-04, FRE-05, FRE-08: the short path: a new install connects with the existing sign-in and creates its notes by keyboard alone, in plain words", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await expect(card(page).getByRole("img", { name: "Step 1 of 4" })).toBeVisible();
    await expect(card(page).getByText("Your notes are saved online for free using GitHub.")).toBeVisible();
    await plainWords(page);
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");

    // Git is checked silently; the credential Git already has is offered (FRE-04): no code, no helper started.
    // D-142: the title names the state: already connected.
    await heading(page, "You're connected");
    await expect(card(page).getByRole("group", { name: "This computer is connected to GitHub as @ada (Ada)." })).toBeVisible({ timeout: 15_000 });
    await plainWords(page);
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused();
    await press(page, "Enter");
    expect(w.fakes.argv()).not.toContain('"login"');

    // No notes on GitHub yet: Create my notes, with the defaults and no passphrase.
    await heading(page, "Create your notes");
    await expect(page.getByRole("button", { name: "Create my notes" })).toBeFocused({ timeout: 15_000 });
    await expect(card(page).getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "false");
    await plainWords(page);
    expect(await axeViolations(page)).toEqual([]);
    await press(page, "Enter");
    await expect(card(page).getByText("Backing up carries on in the background.")).toBeVisible({ timeout: 60_000 });
    await expect(card(page).getByText("Your site: https://ada.github.io/notes/")).toBeVisible({ timeout: 30_000 });
    await plainWords(page);
    await expect(card(page).getByRole("button", { name: "Continue" })).toBeEnabled();
    await tabTo(page, card(page).getByRole("button", { name: "Continue" }));
    await press(page, "Enter");

    // The window starts again in the new notes (D-98), at Ready.
    await heading(page, "Ready");
    await expect(card(page).getByRole("img", { name: "Step 4 of 4" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start writing" })).toBeFocused();
    await press(page, "Enter");

    await expect(card(page)).toHaveCount(0);
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("# First private note\n\nWritten after the first run.");
    // D-155: the folder is named after the notes' repository, beside Documents/Focus Notes.
    const ws = join(dirname(w.dirs.docs), "notes");
    const priv = join(ws, "private", "notes");
    await expect.poll(() => readdirSync(priv).filter((f) => f.endsWith(".md")).length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(w.git(ws, "config", "--get", "push.recurseSubmodules")).toBe("check");
    // FRE-05: the account's name and noreply address, for the notes only; Git's global settings untouched.
    expect(w.git(ws, "config", "--local", "--get", "user.email")).toBe("583231+ada@users.noreply.github.com");
    expect(w.git(join(ws, "private"), "config", "--local", "--get", "user.email")).toBe("583231+ada@users.noreply.github.com");
    expect(() => w.git(w.fakes.home, "config", "--global", "--get", "user.email")).toThrow();
    expect(w.gh.repo("notes")?.pages?.build_type).toBe("workflow");
    expect(JSON.parse(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).folder).toBe(ws);

    // UI-12: the corner is icon-only; backup options live in its hover card.
    const pill = page.locator("#saveState");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveText("");
    await pill.hover();
    await expect(page.getByRole("dialog", { name: "Backup", exact: true }).getByRole("button", { name: "Backup to GitHub", exact: true })).toBeVisible();
    await press(page, "Escape");
    // Gone, not still fading out (outside the landmarks while it does), before the page is checked.
    await expect(page.locator('[data-surface="popover"][aria-label="Backup"]')).toHaveCount(0);
    expect(await axeViolations(page)).toEqual([]);
    noTokenInArgs(w, l);
    expect(readFileSync(join(w.dirs.userData, "setup.json"), "utf8") + readFileSync(join(w.dirs.userData, "state.json"), "utf8")).not.toContain(w.gh.token);
  } finally {
    await quit(l);
    w.server.close();
  }
});

// M3 demo, step 3: a second computer opens the existing notes (the owner's question, D-124).
test("FRE-02, FRE-06: connect with the GitHub CLI's code, then We found your notes opens the existing notes with one press, private notes too", async () => {
  test.setTimeout(150_000);
  const w = await world({ gh: true, delayMs: 2500 });
  existingInstance(w);
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await heading(page, "Connect your GitHub account");
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await expect(card(page).getByRole("button", { name: "Create a free GitHub account" })).toBeVisible();
    await press(page, "Enter");
    // The CLI's one-time code, shown in the app.
    await expect(card(page).getByText("WDJB-MJHT")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy code and open GitHub" })).toBeFocused();
    await press(page, "Enter");
    await expect.poll(() => opened(l)).toContain("https://github.com/login/device");
    await expect(card(page).getByRole("group", { name: "This computer is connected to GitHub as @ada (Ada)." })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused();
    await press(page, "Enter");

    await heading(page, "We found your notes");
    await expect(card(page).getByText("notes", { exact: true })).toBeVisible();
    // A row: its name, when it was updated, and who can see it (D-126).
    await expect(card(page).getByText("Updated 3 days ago", { exact: true })).toBeVisible();
    await expect(card(page).getByText("Public", { exact: true })).toBeVisible();
    await plainWords(page);
    expect(await axeViolations(page)).toEqual([]);
    await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused();
    await press(page, "Enter");

    await heading(page, "Ready");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    const ws = join(dirname(w.dirs.docs), "notes");
    expect(readFileSync(join(ws, "private", "notes", "secret.md"), "utf8")).toContain("Only mine.");
    expect(w.git(join(ws, "private"), "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(w.fakes.argv()).toContain('["gh","auth","setup-git","--hostname","github.com"]');
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-06: no sign-in helper: Having trouble? → a pasted token, then More options → a folder already on this computer", async () => {
  test.setTimeout(120_000);
  const w = await world({});
  const { notes } = existingInstance(w);
  const clone = join(w.root, "my clone");
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, clone);
  const l = await start(w);
  const { page } = l;
  try {
    await l.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    }, clone);
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Install the sign-in helper");
    await expect(card(page).getByText("To connect, Focus Notes needs GitHub's free sign-in helper. Install it, then check again.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Install the sign-in helper" })).toBeFocused();
    await plainWords(page);
    const trouble = card(page).getByRole("button", { name: "Having trouble?" });
    await tabTo(page, trouble);
    await expect(trouble).toHaveAttribute("aria-expanded", "false");
    await press(page, "Enter");
    await expect(trouble).toHaveAttribute("aria-expanded", "true");
    expect(await axeViolations(page)).toEqual([]);
    await tabTo(page, page.getByRole("button", { name: "Use a token instead" }));
    await press(page, "Enter");
    await tabTo(page, page.getByRole("button", { name: "Create a token on GitHub" }), true);
    await press(page, "Enter");
    await expect.poll(async () => (await opened(l)).join()).toContain("https://github.com/settings/personal-access-tokens/new?name=Focus+Notes");
    await tabTo(page, page.getByLabel("Token"));
    await page.keyboard.type("not a token");
    await press(page, "Enter");
    await expect(card(page).getByText("That doesn't look like a GitHub token. Paste the whole token.")).toBeVisible();
    await page.keyboard.type(w.gh.token);
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    // FRE-03: Git's helper has it now, for the terminal too; the app kept no copy.
    expect(JSON.parse(w.fakes.stored())["github.com"].password).toBe(w.gh.token);
    await press(page, "Enter");

    await heading(page, "We found your notes");
    const more = card(page).getByRole("button", { name: "More options" });
    await tabTo(page, more);
    await press(page, "Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await tabTo(page, page.getByRole("button", { name: "Open a folder…" }));
    await press(page, "Enter");
    await heading(page, "Open a folder");
    await expect(page.getByRole("button", { name: "Choose a folder…" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Ready");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 15_000 });
    expect(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).toContain("my clone");
    noTokenInArgs(w, l);
    for (const f of readdirSync(w.dirs.userData)) if (!f.endsWith(".json")) continue; else expect(readFileSync(join(w.dirs.userData, f), "utf8")).not.toContain(w.gh.token);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, D-135: a token GitHub rejects is said on the token form, which stays, with focus in the field it describes", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await card(page).getByRole("button", { name: "Having trouble?" }).click();
    await card(page).getByRole("button", { name: "Use a token instead" }).click();
    const token = card(page).getByLabel("Token");
    await expect(token).toBeFocused();
    // Shaped like a token, but not one GitHub knows.
    await page.keyboard.type(`ghp_${"Q".repeat(36)}`);
    await press(page, "Enter");
    const said = "GitHub didn't accept that token, so it was cleared. Make a new one and paste it.";
    await expect(card(page).getByText(said)).toBeVisible({ timeout: 15_000 });
    await expect(token).toBeFocused();
    await expect(token).toHaveValue("");
    await expect(token).toHaveAttribute("aria-invalid", "true");
    await expect(token).toHaveAccessibleDescription(said);
    expect(await axeViolations(page)).toEqual([]);
    // Typing again clears it; the right token connects.
    await page.keyboard.type(w.gh.token);
    await expect(card(page).getByText(said)).toHaveCount(0);
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-01: declined and offline say so in plain words and recover without restarting, and quitting mid-way resumes at the same step", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  w.fakes.outcomes(["declined"]);
  let l = await start(w);
  try {
    const { page } = l;
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Connect your GitHub account");
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect(card(page).getByText("Connecting didn't finish. Try again when you're ready.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused();
    // Offline: GitHub can't be reached to check the sign-in; connecting again once it's back.
    w.gh.offline = true;
    await press(page, "Enter");
    await expect(card(page).getByText("Can't reach GitHub. Check your internet connection, then try again.")).toBeVisible({ timeout: 15_000 });
    w.gh.offline = false;
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused();
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await heading(page, "Create your notes");
    await expect(page.getByRole("button", { name: "Create my notes" })).toBeFocused({ timeout: 15_000 });
  } finally {
    await quit(l);
  }
  // Quit mid-way: the next start resumes at the same step.
  l = await start(w);
  try {
    await heading(l.page, "Create your notes");
    await expect(card(l.page).getByRole("img", { name: "Step 3 of 4" })).toBeVisible();
    // Esc goes back.
    await expect(l.page.getByRole("button", { name: "Create my notes" })).toBeFocused({ timeout: 15_000 });
    await press(l.page, "Escape");
    await heading(l.page, "You're connected");
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-08, D-135, D-201: a sign-in that can't add workflows: setup says so plainly before making anything; Try again then finishes setup to Ready, from the template the app carries", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  // A classic token without the workflow scope: GitHub lists its scopes, so setup stops before making anything.
  w.gh.scopes = ["repo", "gist"];
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await heading(page, "Create your notes");
    // The card is the action: one button, named by what it shows.
    const create = card(page).getByRole("button", { name: "Create my notes Private unless you share. Backed up to GitHub.", exact: true });
    await expect(create).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect(card(page).getByText("Your GitHub sign-in can't add workflows. Sign in again and allow them.")).toBeVisible({ timeout: 30_000 });
    expect(await card(page).innerText()).not.toMatch(/permissions|doesn't allow/);
    expect(w.gh.repo("notes"), "nothing is made before the sign-in can finish").toBeUndefined();
    // The status says it in one sentence, with Try again as the step's action and no disabled Continue.
    await expect(card(page).getByRole("button", { name: "Continue" })).toHaveCount(0);
    const again = card(page).getByRole("button", { name: "Try again" });
    await expect(again).toBeFocused();
    // Signed in again with the workflow scope: Try again runs the rest of setup, not just that step (D-98, D-135).
    w.gh.scopes = ["repo", "gist", "workflow"];
    await press(page, "Enter");
    await expect(card(page).getByText("Backing up carries on in the background.")).toBeVisible({ timeout: 60_000 });
    await expect(card(page).getByText("Your site: https://ada.github.io/notes/")).toBeVisible({ timeout: 30_000 });
    const cont = card(page).getByRole("button", { name: "Continue" });
    await expect(cont).toBeEnabled();
    await cont.click();
    await heading(page, "Ready");
    expect(w.gh.repo("notes-private")).toBeTruthy();
    // D-201: GitHub copied no template; the instance's first commit was made here, from the app's own.
    expect(w.gh.calls.some((c) => c.path.endsWith("/generate"))).toBe(false);
    const notes = join(w.remotes, "ada", "notes.git");
    expect(w.git(notes, "log", "--reverse", "--format=%s", "main").split("\n")[0]).toBe("Start my Focus Notes");
    expect(w.git(notes, "ls-tree", "-r", "--name-only", "main")).toContain(".github/workflows/pages.yml");
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-01: Just use this computer for now starts writing with no account, in the notes folder on this computer", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await tabTo(page, page.getByRole("button", { name: "Just use this computer for now" }));
    await press(page, "Enter");
    await expect(card(page)).toHaveCount(0);
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("# Kept here\n\nOn this computer only.");
    await expect.poll(() => (existsSync(w.dirs.docs) ? readdirSync(w.dirs.docs, { recursive: true }).map(String).filter((f) => f.endsWith(".md")).length : 0), { timeout: 10_000 }).toBeGreaterThan(0);
    // Nothing signed in, and no workspace was chosen: the default folder, not saved to GitHub.
    expect(w.fakes.argv()).not.toContain('"login"');
    expect(existsSync(join(w.dirs.userData, "workspace.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(w.dirs.userData, "state.json"), "utf8")).firstRun).toBe("done");
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("D-126: nothing outside setup is there or works until it's done: no trigger, toolbar or account pill, app keys open nothing, focus stays in setup; then everything works", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await start(w);
  const { page } = l;
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  const chrome = async () => ({
    trigger: await page.getByRole("button", { name: "Focus Notes menu" }).count(),
    toolbar: await page.getByRole("toolbar", { name: "Toolbar" }).count(),
    pill: await page.getByRole("region", { name: "Account" }).count(),
    note: await page.getByRole("textbox", { name: "Note" }).count(),
  });
  // Focus is in setup, or on the window's own controls (minimize, maximize, close), which stay.
  const focusInSetup = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="main"][aria-label="Set up Focus Notes"], [data-window-controls]')));
  try {
    await heading(page, "A quiet place to write");
    expect(await chrome()).toEqual({ trigger: 0, toolbar: 0, pill: 0, note: 0 });
    await press(page, "Enter");
    // Signed in: the account is known, and still no pill while setup runs.
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 20_000 });
    expect(await chrome()).toEqual({ trigger: 0, toolbar: 0, pill: 0, note: 0 });
    for (const key of [`${mod}+K`, `${mod}+O`, `${mod}+/`, `${mod}+N`, `${mod}+.`]) {
      await press(page, key);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("complementary")).toHaveCount(0);
      expect(await focusInSetup(), key).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await press(page, "Tab");
      expect(await focusInSetup(), `Tab ${i + 1}`).toBe(true);
    }
    // Back to Welcome, then Just use this computer for now: setup is done and the app is all there.
    await card(page).getByRole("button", { name: "Back", exact: true }).click();
    await heading(page, "A quiet place to write");
    await card(page).getByRole("button", { name: "Just use this computer for now" }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Focus Notes menu" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await press(page, `${mod}+/`);
    await expect(page.getByRole("dialog", { name: "Spotlight" })).toBeVisible();
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-01: Git missing: one free helper app to install and Check again, in plain words; the details wait under Having trouble?", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  // No Git on PATH: only the fakes and Node.
  w.env.PATH = w.env.PATH!.split(delimiter).filter((d) => !existsSync(join(d, "git.exe")) && !existsSync(join(d, "git"))).join(delimiter);
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await heading(page, "Install the helper app");
    // D-135: the helper app's card, with its icon, and one install button.
    await expect(card(page).getByText("One free helper app")).toBeVisible({ timeout: 15_000 });
    await expect(card(page).getByText("Focus Notes needs it to save your notes.")).toBeVisible();
    await plainWords(page);
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Install the helper app" })).toBeFocused();
    await press(page, "Enter");
    await expect.poll(() => opened(l)).toContain("https://git-scm.com/downloads");
    // Check again looks again, and stays here while Git is still missing.
    await card(page).getByRole("button", { name: "Check again" }).click();
    await expect(card(page).getByText("One free helper app")).toBeVisible({ timeout: 15_000 });
    await card(page).getByRole("button", { name: "Having trouble?" }).click();
    await expect(card(page).getByText("Git isn't installed.")).toBeVisible();
    await expect(card(page).getByText(process.platform === "darwin" ? "xcode-select --install" : process.platform === "win32" ? "winget install --id Git.Git -e" : "sudo apt install git")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("UI-12: once set up, the next start shows the save indicator, and Settings signs Git out", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const l = await start(w, false);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    const pill = page.locator("#saveState");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    const settings = await openAccountSettings(page);
    await settings.getByRole("button", { name: "Sign out…" }).click();
    // It asks first (FRE-07, WP-3.6); Git's sign-in goes too by default.
    await page.getByRole("dialog", { name: "Sign out of GitHub?" }).getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Signed out of GitHub on this computer, in the app and in the terminal.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Signed in to GitHub as @ada/ })).toHaveCount(0);
    expect(w.fakes.stored()).toBe("{}");
    expect(existsSync(join(w.dirs.userData, "workspace.json"))).toBe(false);
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});
