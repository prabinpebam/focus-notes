/**
 * M3 journeys for Settings → Account and Workspace (WP-3.6: FRE-07, PRV-02, IA-VIEW-SETTINGS):
 * opening Settings by keyboard and from the ⋯ menu, signing out with and without Git's saved
 * credential, signing in again and switching account through the same helper, running setup again,
 * opening another workspace from GitHub (D-124), and removing the workspace (refused while changes aren't on GitHub, allowed after Sync now). The
 * app data folder is listed before and after, and must hold only what the data inventory names and
 * lose exactly what it says. GitHub is the in-memory fake, its repositories local bare remotes, and
 * the sign-in helpers fakes on PATH: nothing touches the network or a real account.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CHROMIUM_FOLDERS, DATA_FILES, DATA_FOLDERS, LOCK_FILES, filesRemovedBy } from "../../../packages/core/src/inventory.ts";
import { fileRow, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { card, existingInstance, GRACE, heading, noTokenInArgs, opened, press, start, world, type World } from "./github-world.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
/** axe once dialogs have finished fading in, so contrast is measured at rest. */
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const INVENTORY = new Set<string>([...Object.values(DATA_FILES), ...Object.values(DATA_FOLDERS), ...Object.values(CHROMIUM_FOLDERS), ...LOCK_FILES]);

/** The app data folder's top-level entries. */
const top = (dir: string) => readdirSync(dir).sort();
const state = (w: World) => JSON.parse(readFileSync(join(w.dirs.userData, DATA_FILES.state), "utf8")) as Record<string, unknown>;
/** What the terminal's Git gets for github.com with prompts off: the password, or nothing. */
const terminal = (w: World) => {
  const r = spawnSync("git", ["credential", "fill"], { cwd: w.fakes.home, env: { ...w.fakes.env, GIT_TERMINAL_PROMPT: "0" }, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
  return r.status === 0 ? /password=(.*)/.exec(r.stdout)?.[1] : undefined;
};

/**
 * A computer that finished the first run in this workspace: the instance cloned with its private
 * notes, Git signed in through GCM, and the data folder as the first run and setup leave it.
 */
async function setUp(opts: { note?: string } = {}) {
  const w = await world({ gcm: true });
  // Saving commits on Mod+S and Sync now here, not on the 60-second idle timer, so "unpushed" is certain.
  w.env.FOCUS_NOTES_IDLE_COMMIT_MS = "600000";
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  for (const dir of [w.dirs.docs, join(w.dirs.docs, "private")]) {
    w.git(dir, "config", "user.name", "Ada");
    w.git(dir, "config", "user.email", "ada@example.com");
  }
  const note = join(w.dirs.docs, "private", "notes", opts.note ?? "secret.md");
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.firstRun), JSON.stringify({ version: 1 }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, steps: {} }));
  const l = await start(w, false);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  await expect(l.page.locator("#saveState")).toBeVisible({ timeout: 15_000 });
  return { w, l, note };
}
const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });

/** Open a project from GitHub: since Settings has no storage category (project model, slice 2), Spotlight's command. */
async function openFromGitHub(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  const spot = page.getByRole("dialog", { name: "Actions", exact: true });
  await page.keyboard.press(`${mod}+/`);
  await spot.getByRole("combobox").fill("Open a project from GitHub");
  const action = spot.getByRole("option", { name: /^Open a project from GitHub…/ });
  await expect(action).toBeVisible();
  // Enabled once the account's login is known, as the Settings button it replaces waited to be.
  await expect(action).not.toHaveAttribute("aria-disabled", "true", { timeout: 15_000 });
  await action.click();
}
async function openSettings(page: Page, section: "Account" | "Project" = "Account") {
  await press(page, `${mod}+,`);
  await expect(settings(page)).toBeVisible();
  const tab = settings(page).getByRole("tab", { name: section });
  // The categories are a vertical tab list: the arrow keys move between them.
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await settings(page).getByRole("tab", { selected: true }).focus();
    const count = await settings(page).getByRole("tab").count();
    for (let i = 0; i < count && await tab.getAttribute("aria-selected") !== "true"; i++) {
      await press(page, "ArrowDown");
    }
  }
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
const toast = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 15_000 });
/**
 * Waits for an account step that runs Git and the sign-in helper several times, each allowed 30 s by
 * the app (account.ts), so a helper a busy runner starts slowly doesn't fail the journey while the
 * app is still within its own limits; a failure carries the app's log, which names a slow or stopped
 * call (DEF-18).
 */
async function accountStep(l: Launched, done: () => Promise<void>): Promise<void> {
  try {
    await done();
  } catch (e) {
    const log = l.log.filter((x) => x.includes("account:")).join(" | ") || "no slow Git or helper call";
    throw new Error(`${(e as Error).message}\nApp log: ${log}`);
  }
}
const ACCOUNT_STEP_MS = 45_000;

test.describe.configure({ mode: "serial" });

async function secondProfile(w: World) {
  const profile = join(w.dirs.userData, DATA_FOLDERS.projectProfiles, "second");
  const docs = join(w.root, "second-project");
  mkdirSync(profile, { recursive: true });
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", join(w.remotes, "ada", "notes.git"), docs);
  w.git(join(docs, "private"), "checkout", "--quiet", "main");
  const note = join(docs, "private", "notes", "secret.md");
  writeFileSync(join(profile, DATA_FILES.projectFolder), docs);
  writeFileSync(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: docs }));
  writeFileSync(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, filesPins: [join(docs, "notes", "hello.md")], fontSize: 17 }));
  const dirs = { ...w.dirs, docs, userData: profile };
  const env = { ...w.env, FOCUS_NOTES_PROJECTS_PROFILE: w.dirs.userData };
  return { profile, docs, note, dirs, env, l: await launch(dirs, env, { firstRun: false }) };
}
async function searchSecret(page: Page, present: boolean) {
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+/`);
  const dialog = page.getByRole("dialog", { name: "Actions", exact: true });
  await dialog.getByRole("combobox").fill("Secret");
  const result = dialog.getByRole("option", { name: /^Secret/ });
  if (present) await expect(result).toBeVisible({ timeout: 15_000 });
  else await expect(result).toHaveCount(0);
  await page.keyboard.press("Escape");
}
async function pinHello(page: Page) {
  await page.keyboard.press(`${mod}+o`);
  const tree = page.getByRole("tree", { name: "Notes and folders", exact: true });
  await expect(tree).toBeVisible();
  const publicRoot = fileRow(tree, "Public");
  if (await publicRoot.count() && await publicRoot.getAttribute("aria-expanded") === "false") await publicRoot.press("ArrowRight");
  const row = fileRow(tree, "Hello");
  await row.hover();
  await row.getByRole("button", { name: "Pin Hello", exact: true }).click();
  await expect(row.getByRole("button", { name: "Unpin Hello", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}
function closeOwned(l: Launched) {
  for (const extra of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", resolve(import.meta.dirname, "../../../tools/dev/close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...extra], { stdio: "inherit" });
}
async function finishOwned(l: Launched) {
  try { if (!l.page.isClosed() && l.app.process().exitCode === null) await quit(l); }
  finally { closeOwned(l); }
}
function metadataIdentity(l: Launched) {
  return l.app.evaluate(({ app }, files) => {
    const fs = process.getBuiltinModule("node:fs");
    const path = process.getBuiltinModule("node:path");
    const root = process.env.FOCUS_NOTES_PROJECTS_PROFILE ?? process.env.FOCUS_NOTES_USER_DATA ?? app.getPath("userData");
    return { parent: fs.realpathSync.native(root), database: fs.realpathSync.native(path.join(root, files.database)), signal: fs.realpathSync.native(path.join(root, files.signal)) };
  }, { database: DATA_FILES.projectMetadata, signal: DATA_FILES.projectMetadataNotify });
}

for (const event of ["signOut", "removeWorkspace"] as const) test(`G7 cross-profile ${event}: live caches and restart stay cleared without losing another project's notes`, async () => {
  test.setTimeout(150_000);
  const { w, l: first, note } = await setUp();
  let a = first;
  const second = await secondProfile(w);
  let b = second.l;
  try {
    const [firstMetadata, secondMetadata] = await Promise.all([metadataIdentity(a), metadataIdentity(b)]);
    expect(firstMetadata.parent === secondMetadata.parent, "live profiles share the canonical notification parent").toBe(true);
    expect(firstMetadata.database === secondMetadata.database, "live profiles share the canonical metadata database").toBe(true);
    expect(firstMetadata.signal === secondMetadata.signal, "live profiles share the canonical notification file").toBe(true);
    await pinHello(a.page);
    await searchSecret(a.page, true);
    await searchSecret(b.page, true);
    const firstState = join(w.dirs.userData, DATA_FILES.state), secondState = join(second.profile, DATA_FILES.state);
    await expect.poll(() => JSON.parse(readFileSync(firstState, "utf8")).filesPins).toEqual([join(w.dirs.docs, "notes", "hello.md")]);
    const source = readFileSync(note, "utf8"), otherSource = readFileSync(second.note, "utf8");
    const heads = [w.git(w.dirs.docs, "rev-parse", "HEAD"), w.git(second.docs, "rev-parse", "HEAD")];
    const remote = w.git(w.dirs.docs, "remote", "get-url", "origin");
    if (event === "removeWorkspace") {
      await b.page.evaluate(async ({ removed, kept }) => {
        const saved = await window.focusNotes.loadAppState();
        await window.focusNotes.saveAppState({ ...saved, filesPins: [removed, kept], filesRecent: [removed, kept] });
      }, { removed: join(w.dirs.docs, "notes", "hello.md"), kept: join(second.docs, "notes", "hello.md") });
      await b.app.evaluate(({ safeStorage }, { profile, removed, kept }) => {
        const fs = process.getBuiltinModule("node:fs");
        const path = process.getBuiltinModule("node:path");
        const record = { rank: 1234, pinned: true, notes: [removed, kept].map(p => ({ path: p, rank: 1234, pinned: true })) };
        fs.writeFileSync(path.join(profile, "project-recent.dat"), safeStorage.encryptString(JSON.stringify(record)).toString("base64"));
      }, { profile: second.profile, removed: note, kept: second.note });
    }
    const stale = JSON.parse(readFileSync(firstState, "utf8"));
    await openSettings(a.page, event === "signOut" ? "Account" : "Project");
    if (event === "signOut") {
      await settings(a.page).getByRole("button", { name: "Sign out…" }).click();
      const dialog = a.page.getByRole("dialog", { name: "Sign out of GitHub?" });
      await dialog.getByRole("radio", { name: "Keep it for the terminal" }).focus();
      await dialog.getByRole("radio", { name: "Keep it for the terminal" }).press("Space");
      await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
      await toast(a.page, "Signed out of Focus Notes. Git on this computer is still signed in as @ada.");
    } else {
      await settings(a.page).getByRole("button", { name: "Remove from this computer…" }).click();
      const dialog = a.page.getByRole("dialog", { name: "Remove this project?" });
      await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole("button", { name: "Remove", exact: true }).click();
      try { await expect(dialog).toHaveCount(0, { timeout: 20_000 }); }
      catch (error) {
        const pending = await a.page.evaluate(async () => (await window.focusNotes.firstRun!.account())?.cleanupPending);
        const roots = await b.page.evaluate(() => window.focusNotes.removedRoots!());
        throw new Error(`${error instanceof Error ? error.message : "Removal failed"}\nPending cleanup: ${JSON.stringify(pending)}\nSource spelling matches: ${roots.some(root => note.toLowerCase().startsWith(root.toLowerCase()))}; cache format: ${readFileSync(join(second.profile, DATA_FILES.projectRecent), "utf8").slice(0, 6)}\n${[...a.log, ...b.log].filter(line => line.includes("cleanup") || line.includes("ranking")).join("\n")}`);
      }
    }
    // An already admitted renderer callback cannot restore pins or a recent note after cleanup.
    await a.page.evaluate(saved => window.focusNotes.saveAppState(saved), stale);
    await expect.poll(() => JSON.parse(readFileSync(firstState, "utf8")).filesPins).toBeUndefined();
    expect(JSON.parse(readFileSync(firstState, "utf8"))).not.toHaveProperty("lastNotePath");
    await searchSecret(b.page, event !== "signOut");
    const otherState = JSON.parse(readFileSync(secondState, "utf8"));
    expect(otherState.fontSize).toBe(17);
    if (event === "signOut") expect(otherState.filesPins).toBeUndefined();
    else expect(otherState.filesPins).toEqual([join(second.docs, "notes", "hello.md")]);
    if (event === "removeWorkspace") {
      const entries = await b.page.evaluate(() => window.focusNotes.projects!.list());
      expect(entries.some(entry => entry.folder === realpathSync.native(w.dirs.docs))).toBe(false);
      expect(entries.find(entry => entry.folder === realpathSync.native(second.docs))).toMatchObject({ rank: 1234, pinned: true, recent: [{ path: second.note, pinned: true }] });
    }
    for (const active of [a, b]) await finishOwned(active);
    a = await launch(w.dirs, { ...w.env, FOCUS_NOTES_PROJECTS_PROFILE: w.dirs.userData }, { firstRun: false });
    b = await launch(second.dirs, second.env, { firstRun: false });
    await searchSecret(b.page, event !== "signOut");
    expect(JSON.parse(readFileSync(firstState, "utf8"))).not.toHaveProperty("filesPins");
    if (event === "signOut") expect(JSON.parse(readFileSync(secondState, "utf8"))).not.toHaveProperty("filesPins");
    expect(readFileSync(note, "utf8")).toBe(source);
    expect(readFileSync(second.note, "utf8")).toBe(otherSource);
    expect([w.git(w.dirs.docs, "rev-parse", "HEAD"), w.git(second.docs, "rev-parse", "HEAD")]).toEqual(heads);
    expect(w.git(w.dirs.docs, "remote", "get-url", "origin")).toBe(remote);
    expect(terminal(w)).toBe(w.gh.token);
  } finally {
    for (const active of [a, b]) await finishOwned(active);
    w.server.close();
  }
});

test("G7.3: a locked second profile reports redacted pending scope and Retry clears it after restart", async () => {
  test.setTimeout(150_000);
  const { w, l } = await setUp();
  const second = await secondProfile(w);
  let b = second.l;
  let lock: ReturnType<typeof spawn> | undefined;
  try {
    await searchSecret(b.page, true);
    await quit(b); closeOwned(b);
    const stateFile = join(second.profile, DATA_FILES.state);
    lock = spawn("pwsh", ["-NoProfile", "-Command", '$file = [System.IO.File]::Open($env:FN_LOCK_PATH, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); [Console]::WriteLine("locked"); [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null; $file.Dispose()'], { env: { ...process.env, FN_LOCK_PATH: stateFile }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    await Promise.race([once(lock.stdout!, "data"), once(lock, "exit").then(() => { throw new Error("The disposable cache lock did not start."); })]);
    await openSettings(l.page);
    await settings(l.page).getByRole("button", { name: "Sign out…" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Sign out of GitHub?" });
    await dialog.getByRole("radio", { name: "Keep it for the terminal" }).focus();
    await dialog.getByRole("radio", { name: "Keep it for the terminal" }).press("Space");
    await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(dialog.getByText("Some local traces remain. Your notes are unchanged. Close any app holding the cache files, then retry cleanup.")).toBeVisible({ timeout: 15_000 });
    await dialog.locator("summary").filter({ hasText: "Details" }).click();
    await expect(dialog).toContainText(/[a-f0-9]{12}:state\.json/);
    expect(await dialog.innerText()).not.toMatch(/Only mine|ghp_|secret\.md|second-project/);
    await expect(l.page.getByText("Signed out of Focus Notes. Git on this computer is still signed in as @ada.", { exact: true })).toHaveCount(0);
    const released = once(lock, "exit");
    lock.stdin!.end("\n");
    await released;
    lock = undefined;
    await dialog.getByRole("button", { name: "Retry cleanup", exact: true }).click();
    await toast(l.page, "Local traces cleared.");
    expect(JSON.parse(readFileSync(stateFile, "utf8"))).not.toHaveProperty("filesPins");
    b = await launch(second.dirs, second.env, { firstRun: false });
    await searchSecret(b.page, false);
    expect(readFileSync(second.note, "utf8")).toBe("# Secret\n\nOnly mine.\n");
    expect(terminal(w)).toBe(w.gh.token);
  } finally {
    if (lock) { const exited = once(lock, "exit"); lock.stdin?.end("\n"); await exited; }
    for (const active of [l, b]) await finishOwned(active);
    w.server.close();
  }
});

test("A11Y-01, DEF-12: Tab while Settings checks the account rests on the panel, then on Sign in once it appears; focus never falls to the page", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nText.\n");
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  // The check answers after 1.5 s, as a busy runner's credential helpers do: Tab lands while it runs.
  await l.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("firstRun:account");
    ipcMain.handle("firstRun:account", () => new Promise((r) => setTimeout(() => r({ gcm: false, gh: false, via: "helper" }), 1_500)));
  });
  // Every moment focus rests on the page itself, checked after each task.
  await page.evaluate(() => {
    const w = window as unknown as { __onBody: string[] };
    w.__onBody = [];
    document.addEventListener("focusout", (e) => setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) w.__onBody.push(`after ${(e.target as Element).tagName} ${(e.target as Element).getAttribute("role") ?? ""}`);
    }), true);
  });
  await press(page, `${mod}+,`);
  await expect(settings(page).getByRole("tab", { name: "Account" })).toBeFocused();
  await expect(settings(page).getByText(/^Checking/)).toBeVisible();
  // The list's foot comes before the panel, in the order they read (D-203).
  await press(page, "Tab");
  await expect(settings(page).getByRole("button", { name: "Send feedback" })).toBeFocused();
  await press(page, "Tab");
  await expect(settings(page).getByRole("tabpanel")).toBeFocused();
  await expect(settings(page).getByRole("button", { name: /^Sign in/ })).toBeFocused({ timeout: 10_000 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __onBody: string[] }).__onBody)).toEqual([]);
  await quit(l);
});

test("IA-VIEW-SETTINGS, FRE-07: Settings opens with Mod+, and from ⋯; signing out of Focus Notes alone keeps Git's sign-in, and Sign in offers it again", async () => {
  test.setTimeout(120_000);
  const { w, l } = await setUp();
  const { page } = l;
  try {
    await press(page, `${mod}+,`);
    await expect(settings(page)).toBeVisible();
    await expect(settings(page).getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
    await expect(settings(page).getByText("@ada", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(settings(page).getByText("Signed in through Git Credential Manager. Git uses the same sign-in in your terminal.")).toBeVisible();
    expect(await settledAxe(page)).toEqual([]);
    // The categories are a vertical tab list: the arrow keys move between them.
    await settings(page).getByRole("tab", { name: "Account" }).focus();
    await press(page, "ArrowDown");
    await expect(settings(page).getByRole("tab", { name: "Project", exact: true })).toHaveAttribute("aria-selected", "true");
    // Where it's kept is part of Project (project model, slice 2).
    await expect(settings(page).getByText(w.dirs.docs)).toBeVisible();
    expect(await settledAxe(page)).toEqual([]);
    await press(page, "Escape");
    await expect(settings(page)).toHaveCount(0);

    // From the ⋯ menu, with its shortcut shown.
    await press(page, `${mod}+.`);
    await page.getByRole("button", { name: "More" }).click();
    const item = page.getByRole("menuitem", { name: /^Settings…/ });
    await expect(item).toContainText(process.platform === "darwin" ? "⌘," : "Ctrl+,");
    await item.click();
    await expect(settings(page)).toBeVisible();
    // It opens where it was left.
    await expect(settings(page).getByRole("tab", { name: "Project", exact: true })).toHaveAttribute("aria-selected", "true");
    await settings(page).getByRole("tab", { name: "Account" }).click();

    // Sign out, keeping Git's sign-in for the terminal.
    await settings(page).getByRole("button", { name: "Sign out…" }).click();
    const confirm = page.getByRole("dialog", { name: "Sign out of GitHub?" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("radio", { name: "Remove it too" })).toBeChecked();
    expect(await settledAxe(page)).toEqual([]);
    // A radio group: the arrow keys choose.
    await confirm.getByRole("radio", { name: "Remove it too" }).focus();
    await press(page, "ArrowRight");
    await expect(confirm.getByRole("radio", { name: "Keep it for the terminal" })).toBeChecked();
    await expect(confirm.getByText("Git keeps its sign-in, so git push in your terminal, and saving your notes to GitHub, keep working.")).toBeVisible();
    await confirm.getByRole("button", { name: "Sign out", exact: true }).click();
    await toast(page, "Signed out of Focus Notes. Git on this computer is still signed in as @ada.");
    await expect(page.getByRole("button", { name: /Signed in to GitHub as @ada/ })).toHaveCount(0);
    expect(terminal(w)).toBe(w.gh.token);
    expect(top(w.dirs.userData)).toContain(DATA_FILES.account);
    expect(readFileSync(join(w.dirs.userData, DATA_FILES.account), "utf8")).not.toContain("ada");

    // Sign in again: the first run's Connect card, alone, offering the account Git still has.
    await openSettings(page);
    await expect(settings(page).getByText("Git on this computer is still signed in as", { exact: true })).toBeVisible({ timeout: 15_000 });
    const gitProfile = settings(page).getByRole("button", { name: "Open @ada on GitHub", exact: true });
    await expect(gitProfile).toBeVisible();
    await gitProfile.focus();
    await expect(gitProfile).toBeFocused();
    await press(page, "Enter");
    await expect.poll(() => opened(l)).toContain("https://github.com/ada");
    expect(terminal(w)).toBe(w.gh.token);
    await settings(page).getByRole("button", { name: "Sign in…" }).click();
    await heading(page, "You're connected");
    await expect(card(page).getByRole("img", { name: /^Step \d of 4$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    expect(await settledAxe(page)).toEqual([]);
    await press(page, "Enter");
    await expect(card(page)).toHaveCount(0);
    await toast(page, "Signed in to GitHub as @ada.");
    await expect(page.locator("#saveState")).toBeVisible();
    expect(top(w.dirs.userData)).not.toContain(DATA_FILES.account);
    // The note is back as it was.
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

// M3 demo, step 8: the terminal's Git follows the app's sign-in.
test("FRE-07: Switch account signs in again through the same helper; the terminal follows", async () => {
  test.setTimeout(120_000);
  const { w, l } = await setUp();
  const { page } = l;
  try {
    w.fakes.signInAs(GRACE.token, GRACE.login);
    await openSettings(page);
    await settings(page).getByRole("button", { name: "Switch account" }).click();
    await heading(page, "Connect your GitHub account");
    // Esc leaves the old account as it was.
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Escape");
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator("#saveState")).toBeVisible({ timeout: 15_000 });
    expect(terminal(w)).toBe(w.gh.token);

    await openSettings(page);
    await settings(page).getByRole("button", { name: "Switch account" }).click();
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Grace" })).toBeFocused({ timeout: 20_000 });
    await press(page, "Enter");
    await toast(page, "Signed in to GitHub as @grace.");
    await expect(page.locator("#saveState")).toBeVisible();
    expect(terminal(w)).toBe(GRACE.token);
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

// M3 demo, step 9: sign out removes everything in the data inventory.
test("PRV-02, FRE-07: signing out with Git's credential deletes exactly what the data inventory lists, and the terminal must sign in again", async () => {
  test.setTimeout(90_000);
  const { w, l, note } = await setUp();
  const { page } = l;
  try {
    const before = top(w.dirs.userData);
    for (const f of before) expect(INVENTORY, `${f} isn't in the data inventory`).toContain(f);
    for (const f of [DATA_FILES.state, DATA_FILES.workspace, DATA_FILES.firstRun, DATA_FILES.setup, CHROMIUM_FOLDERS.session]) expect(before).toContain(f);
    expect(state(w).lastNotePath).toBe(note);

    await openSettings(page);
    await settings(page).getByRole("button", { name: "Sign out…" }).click();
    const confirm = page.getByRole("dialog", { name: "Sign out of GitHub?" });
    await expect(confirm.getByRole("radio", { name: "Remove it too" })).toBeChecked();
    await confirm.getByRole("button", { name: "Sign out", exact: true }).click();
    // The dialog stays, its Sign out busy, until the app has signed out (DEF-18).
    await accountStep(l, () => expect(confirm).toBeHidden({ timeout: ACCOUNT_STEP_MS }));
    await toast(page, "Signed out of GitHub on this computer, in the app and in the terminal.");

    const after = top(w.dirs.userData);
    expect(after).toEqual([...new Set([...before.filter((f) => !(filesRemovedBy("signOut") as string[]).includes(f)), DATA_FILES.account])].sort());
    expect(state(w)).not.toHaveProperty("lastNotePath");
    expect(state(w).firstRun).toBe("done");
    expect(w.fakes.stored()).toBe("{}");
    // FRE-07: the terminal's next fetch from GitHub would have to ask for credentials.
    expect(terminal(w)).toBeUndefined();
    // The notes themselves are untouched, here and on the remote.
    expect(existsSync(note)).toBe(true);
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-07: Run setup again walks the first run from Connect; Esc goes back to the note", async () => {
  test.setTimeout(90_000);
  const { w, l } = await setUp();
  const { page } = l;
  try {
    await openSettings(page, "Project");
    await settings(page).getByRole("button", { name: "Run setup again" }).click();
    await heading(page, "You're connected");
    await expect(card(page).getByRole("img", { name: "Step 2 of 4" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Note" })).toHaveCount(0);
    expect(top(w.dirs.userData)).not.toContain(DATA_FILES.setup);
    await expect(card(page).getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    expect(await settledAxe(page)).toEqual([]);
    await press(page, "Escape");
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");
    expect(state(w).firstRun).toBe("done");
  } finally {
    await quit(l);
    w.server.close();
  }
});

// D-124: a signed-in person picks an existing workspace without running setup again.
test("FRE-06: Settings → Open another workspace from GitHub shows the notes the account has; Open clones one beside the open workspace and starts writing in it", async () => {
  test.setTimeout(120_000);
  const { w, l } = await setUp();
  const { page } = l;
  try {
    await openSettings(page, "Project");
    await openFromGitHub(page);
    await heading(page, "We found your notes");
    await expect(card(page).getByText(/^Step \d of 4$/)).toHaveCount(0);
    await expect(card(page).getByText("notes", { exact: true })).toBeVisible();
    // A row: its name, when it was updated, and who can see it (D-126).
    await expect(card(page).getByText("Updated 3 days ago", { exact: true })).toBeVisible();
    await expect(card(page).getByText("Public", { exact: true })).toBeVisible();
    const open = card(page).getByRole("button", { name: "Open", exact: true });
    await expect(open).toBeFocused({ timeout: 15_000 });
    expect(await settledAxe(page)).toEqual([]);
    // Esc goes back to the note, as it was.
    await press(page, "Escape");
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");

    await openSettings(page, "Project");
    await openFromGitHub(page);
    await expect(open).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    // D-155: the notes go in a folder named after their repository, Documents/notes, beside the open workspace, and writing starts there.
    const second = join(dirname(w.dirs.docs), "notes");
    const folderNow = () => (existsSync(join(w.dirs.userData, DATA_FILES.workspace)) ? resolve((JSON.parse(readFileSync(join(w.dirs.userData, DATA_FILES.workspace), "utf8")) as { folder: string }).folder) : "");
    await expect.poll(folderNow, { timeout: 30_000 }).toBe(resolve(second));
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toHaveCount(0);
    expect(existsSync(join(second, "private", "notes", "secret.md"))).toBe(true);
    expect(state(w).firstRun).toBe("done");
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-07, PRV-02: removing the workspace preserves source notes and Git after Sync now; only cached traces go", async () => {
  test.setTimeout(150_000);
  const { w, l } = await setUp();
  const { page } = l;
  try {
    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.click();
    await press(page, `${mod}+End`);
    await page.keyboard.type("\n\nWords not on GitHub yet.");
    await expect.poll(() => readFileSync(join(w.dirs.docs, "private", "notes", "secret.md"), "utf8"), { timeout: 10_000 }).toContain("Words not on GitHub yet.");
    const before = top(w.dirs.userData);

    await openSettings(page, "Project");
    await settings(page).getByRole("button", { name: "Remove from this computer…" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this project?" });
    await expect(dialog.getByText("1 change isn't on GitHub yet. Sync first, so nothing is lost.")).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    expect(await settledAxe(page)).toEqual([]);
    expect(existsSync(w.dirs.docs)).toBe(true);

    await dialog.getByRole("button", { name: "Sync now" }).click();
    await expect(dialog.getByText(`This removes the project from Focus Notes on this computer. Your notes in ${w.dirs.docs}, Git history and GitHub repositories stay unchanged.`)).toBeVisible({ timeout: 30_000 });
    const priv = join(w.remotes, "ada", "notes-private.git");
    expect(execFileSync("git", ["--git-dir", priv, "show", "main:notes/secret.md"], { encoding: "utf8" })).toContain("Words not on GitHub yet.");
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();

    // The window starts again at the first run's Your notes step, which finds the notes on GitHub.
    await heading(page, "We found your notes");
    expect(existsSync(w.dirs.docs)).toBe(true);
    expect(existsSync(join(w.dirs.docs, ".git"))).toBe(true);
    const after = top(w.dirs.userData);
    for (const f of after) expect(INVENTORY).toContain(f);
    expect(after).toEqual([...new Set([...before.filter((f) => !(filesRemovedBy("removeWorkspace") as string[]).includes(f)), DATA_FILES.projectFolder])].sort());
    expect(state(w)).not.toHaveProperty("lastNotePath");
    expect(state(w).firstRun).toBe("notes");
    // Nothing on GitHub is touched, and Git's sign-in stays.
    expect(execFileSync("git", ["--git-dir", priv, "show", "main:notes/secret.md"], { encoding: "utf8" })).toContain("Words not on GitHub yet.");
    expect(terminal(w)).toBe(w.gh.token);
    expect(await settledAxe(page)).toEqual([]);
  } finally {
    await quit(l as Launched);
    w.server.close();
  }
});
