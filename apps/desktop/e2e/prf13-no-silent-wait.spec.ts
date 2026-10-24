/**
 * PRF-13, D-149: no step of setup waits in silence. Each wait is slowed through the journeys' slow-down
 * (`globalThis.focusNotesSlow` in the main process, read only with FOCUS_NOTES_E2E and never in a
 * packaged app), then its sign and words are checked at their place and times: nothing before
 * `wait.signDelay` (300 ms), the words after it, the elapsed time after `wait.elapsedDelay` (3 s),
 * and the title bar band still drags the window throughout. GitHub is the fake, its repositories
 * local bare remotes; nothing touches the network.
 */
import { test, expect } from "./fixtures.ts";
import type { Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { bandProblems, quit, type Launched } from "./helpers.ts";
import { card, existingInstance, heading, openAccountSettings, press, start, world, type World } from "./github-world.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.describe.configure({ mode: "serial" });

const slow = (l: Launched, delays: Record<string, number>) =>
  l.app.evaluate((_electron, d) => void ((globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow = d), delays);

/** The wait's words show at their place, never before the sign's delay, and the window can still be moved. */
async function named(page: Page, words: RegExp, since: number, where: string) {
  await expect(card(page).getByText(words).first()).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - since, `${where}: nothing shows before wait.signDelay`).toBeGreaterThanOrEqual(280);
  expect(await bandProblems(page, where)).toEqual([]);
}
/** Past wait.elapsedDelay the words add the seconds waited. */
const counts = (page: Page, words: string) =>
  expect(card(page).getByText(new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.* · \\d+ s$`)).first()).toBeVisible({ timeout: 6_000 });

test("PRF-13: reading the account, finding the notes, downloading and opening them each say what they wait for, with skeletons and the elapsed time", async () => {
  test.setTimeout(150_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  existingInstance(w);
  const l = await start(w);
  const { page } = l;
  try {
    await slow(l, { "firstRun:account": 4500, "firstRun:repositories": 7000, "firstRun:clone": 4500, "firstRun:openWorkspace": 1500 });
    await heading(page, "A quiet place to write");
    let t = Date.now();
    await press(page, "Enter");

    // Reading the account: the profile card's skeleton and "Connecting to your account…".
    await named(page, /^Connecting to your account…/, t, "reading the account");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(1);
    // D-208: its placeholders shimmer three times, then stand still; with reduced motion they never move.
    const shimmer = card(page).locator("[data-skeleton] [data-shimmer]");
    await expect(shimmer).toHaveCount(3);
    const motion = () => shimmer.first().evaluate((el) => {
      const a = getComputedStyle(el, "::after");
      return { display: a.display, name: a.animationName, count: a.animationIterationCount, duration: a.animationDuration, hidden: el.getAttribute("aria-hidden") };
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await motion()).toMatchObject({ count: "3", duration: "1.5s", hidden: "true" });
    expect((await motion()).name).not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await motion()).display).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await counts(page, "Connecting to your account…");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 10_000 });
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(0);

    // Finding the notes, already asked at Connect: three skeleton rows and the words, then the seconds.
    t = Date.now();
    await press(page, "Enter");
    await named(page, /^Looking for your notes on GitHub…/, t, "finding the notes");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(3);
    await counts(page, "Looking for your notes on GitHub…");

    // Downloading: the part with its number, then the seconds; then opening them.
    await heading(page, "We found your notes");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused();
    t = Date.now();
    await press(page, "Enter");
    await named(page, /^Downloading your notes · 1 of 3/, t, "downloading the notes");
    // Its parts, the one it's on first (Git's percentage adds a bar once Git reports one).
    for (const part of ["Download to this computer", "Get the private notes", "Link them"]) await expect(card(page).getByText(part, { exact: true })).toBeVisible();
    await counts(page, "Downloading your notes · 1 of 3");
    await expect(card(page).getByText(/^Opening your notes…/)).toBeVisible({ timeout: 10_000 });
    expect(await bandProblems(page, "opening the notes")).toEqual([]);
    await heading(page, "Ready");
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("PRF-13: creating the notes always shows its parts in plain words and the one it's on, with its number and the elapsed time", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await start(w);
  const { page } = l;
  try {
    await slow(l, { "setup:instance": 4000 });
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await heading(page, "Create your notes");
    await expect(page.getByRole("button", { name: "Create my notes" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");

    // The parts, without Show details, and the one it's on in words with its number, then the seconds.
    await expect(card(page).getByText("Making your notes on GitHub · 2 of 9", { exact: true })).toBeVisible({ timeout: 15_000 });
    for (const part of ["Sign in to GitHub", "Make your notes on GitHub", "Download to this computer", "Turn on your website", "Save to GitHub"]) {
      await expect(card(page).getByText(part, { exact: true })).toBeVisible();
    }
    await expect(card(page).getByRole("button", { name: "Show details" })).toHaveCount(0);
    expect(await bandProblems(page, "creating the notes")).toEqual([]);
    await counts(page, "Making your notes on GitHub · 2 of 9");
    await expect(card(page).getByText("Backing up carries on in the background.")).toBeVisible({ timeout: 60_000 });
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("PRF-13: the approval wait counts its seconds and Cancel goes back; checking a folder says so", async () => {
  test.setTimeout(150_000);
  const w = await world({ gh: true, delayMs: 6000 });
  const { notes } = existingInstance(w);
  const clone = join(w.root, "my clone");
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, clone);
  const l = await start(w);
  const { page } = l;
  try {
    // The system's folder dialog answers with the clone (the journeys' stub), and checking it is slowed.
    await l.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    }, clone);
    await slow(l, { "firstRun:openFolder": 4500 });
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");

    // Waiting for approval: the seconds waited, and Cancel goes back to Connect.
    await expect(card(page).getByText("WDJB-MJHT")).toBeVisible({ timeout: 15_000 });
    await expect(card(page).getByText(/^Waiting for you to approve on GitHub…/)).toBeVisible();
    await counts(page, "Waiting for you to approve on GitHub…");
    expect(await bandProblems(page, "waiting for approval")).toEqual([]);
    await card(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeVisible({ timeout: 10_000 });

    // Signed in meanwhile (Git's helper has it): Back, and Get started again.
    w.fakes.store(w.gh.token);
    await card(page).getByRole("button", { name: "Back" }).click();
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 30_000 });
    await press(page, "Enter");
    await heading(page, "We found your notes");
    await card(page).getByRole("button", { name: "More options" }).click();
    await card(page).getByRole("button", { name: "Open a folder…" }).click();
    await heading(page, "Open a folder");
    const t = Date.now();
    await page.getByRole("button", { name: "Choose a folder…" }).click();
    await named(page, /^Checking this folder…/, t, "checking a folder");
    await counts(page, "Checking this folder…");
    await heading(page, "Ready");
  } finally {
    await quit(l);
    w.server.close();
  }
});

/** A computer that finished setup in this workspace, signed in through Git's helper (as m3-settings). */
async function workspace(): Promise<{ w: World; l: Launched }> {
  const w = await world({ gcm: true });
  w.env.FOCUS_NOTES_IDLE_COMMIT_MS = "600000";
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const note = join(w.dirs.docs, "private", "notes", "secret.md");
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.firstRun), JSON.stringify({ version: 1 }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, steps: {} }));
  const l = await start(w, false);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  await expect(l.page.locator("#saveState")).toBeVisible({ timeout: 15_000 });
  return { w, l };
}
const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });
async function workspaceSettings(page: Page) {
  await press(page, `${mod}+,`);
  await expect(settings(page)).toBeVisible();
  const tab = settings(page).getByRole("tab", { name: "Workspace" });
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await settings(page).getByRole("tab", { selected: true }).focus();
    await press(page, "ArrowDown");
  }
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test("PRF-13: Open another workspace from GitHub shows skeleton rows while it looks, and Esc goes back to writing; signing out says so on its button", async () => {
  test.setTimeout(120_000);
  const { w, l } = await workspace();
  const { page } = l;
  try {
    await slow(l, { "firstRun:repositories": 6000, "firstRun:signOut": 4500 });
    await workspaceSettings(page);
    const t = Date.now();
    await settings(page).getByRole("button", { name: "Open another workspace from GitHub…" }).click();
    await named(page, /^Looking for your notes on GitHub…/, t, "Open another workspace");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(3);
    // Back is there, and has focus, so Esc leaves while it still looks: back to the note.
    await expect(card(page).getByRole("button", { name: "Back" })).toBeFocused();
    await press(page, "Escape");
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 15_000 });

    const accountSettings = await openAccountSettings(page);
    await accountSettings.getByRole("button", { name: "Sign out…" }).click();
    const confirm = page.getByRole("dialog", { name: "Sign out of GitHub?" });
    const t2 = Date.now();
    await confirm.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(confirm.getByRole("button", { name: /^Signing out…/ })).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - t2).toBeGreaterThanOrEqual(280);
    await expect(confirm.getByRole("button", { name: /^Signing out… \d+ s$/ })).toBeVisible({ timeout: 6_000 });
    expect(await bandProblems(page, "signing out")).toEqual([]);
    await expect(page.getByText("Signed out of GitHub on this computer, in the app and in the terminal.", { exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("PRF-13: removing the workspace says Removing… on its button until the window is at Your notes", async () => {
  test.setTimeout(120_000);
  const { w, l } = await workspace();
  const { page } = l;
  try {
    await slow(l, { "workspace:remove": 2500 });
    await workspaceSettings(page);
    await settings(page).getByRole("button", { name: "Remove this workspace from this computer…" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this workspace?" });
    const remove = dialog.getByRole("button", { name: "Remove", exact: true });
    await expect(remove).toBeVisible({ timeout: 30_000 });
    const t = Date.now();
    await remove.click();
    await expect(dialog.getByRole("button", { name: /^Removing…/ })).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - t).toBeGreaterThanOrEqual(280);
    expect(await bandProblems(page, "removing the workspace")).toEqual([]);
    await heading(page, "We found your notes");
  } finally {
    await quit(l);
    w.server.close();
  }
});
