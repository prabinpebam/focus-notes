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
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHROMIUM_FOLDERS, DATA_FILES, LOCK_FILES, filesRemovedBy } from "../../../packages/core/src/inventory.ts";
import { quit, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { card, existingInstance, GRACE, heading, noTokenInArgs, press, start, world, type World } from "./github-world.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
/** axe once dialogs have finished fading in, so contrast is measured at rest. */
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const INVENTORY = new Set<string>([...Object.values(DATA_FILES), ...Object.values(CHROMIUM_FOLDERS), ...LOCK_FILES]);

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
  await expect(l.page.getByRole("button", { name: /Signed in to GitHub as @ada/ })).toBeVisible({ timeout: 15_000 });
  return { w, l, note };
}
const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });
async function openSettings(page: Page, section: "Account" | "Workspace" = "Account") {
  await press(page, `${mod}+,`);
  await expect(settings(page)).toBeVisible();
  const tab = settings(page).getByRole("tab", { name: section });
  // The categories are a vertical tab list: the arrow keys move between them.
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await settings(page).getByRole("tab", { selected: true }).focus();
    await press(page, section === "Workspace" ? "ArrowDown" : "ArrowUp");
  }
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
const toast = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 15_000 });

test.describe.configure({ mode: "serial" });

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
    await expect(settings(page).getByRole("tab", { name: "Workspace" })).toHaveAttribute("aria-selected", "true");
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
    await expect(settings(page).getByRole("tab", { name: "Workspace" })).toHaveAttribute("aria-selected", "true");
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
    await expect(settings(page).getByText("Git on this computer is still signed in as @ada.")).toBeVisible({ timeout: 15_000 });
    await settings(page).getByRole("button", { name: "Sign in…" }).click();
    await heading(page, "Connect your GitHub account");
    await expect(card(page).getByText(/^Step \d of 4$/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused({ timeout: 15_000 });
    expect(await settledAxe(page)).toEqual([]);
    await press(page, "Enter");
    await expect(card(page)).toHaveCount(0);
    await toast(page, "Signed in to GitHub as @ada.");
    await expect(page.getByRole("button", { name: /Signed in to GitHub as @ada/ })).toBeVisible();
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
    await expect(page.getByRole("button", { name: /Signed in to GitHub as @ada/ })).toBeVisible({ timeout: 15_000 });
    expect(terminal(w)).toBe(w.gh.token);

    await openSettings(page);
    await settings(page).getByRole("button", { name: "Switch account" }).click();
    await expect(page.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as @grace" })).toBeFocused({ timeout: 20_000 });
    await press(page, "Enter");
    await toast(page, "Signed in to GitHub as @grace.");
    await expect(page.getByRole("button", { name: /Signed in to GitHub as @grace/ })).toBeVisible();
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

    // From the account pill, as before Settings existed: now it asks first.
    await page.getByRole("button", { name: /Signed in to GitHub as @ada/ }).click();
    await page.getByRole("menuitem", { name: "Sign out of GitHub" }).click();
    const confirm = page.getByRole("dialog", { name: "Sign out of GitHub?" });
    await expect(confirm.getByRole("radio", { name: "Remove it too" })).toBeChecked();
    await confirm.getByRole("button", { name: "Sign out", exact: true }).click();
    await toast(page, "Signed out of GitHub on this computer, in the app and in the terminal.");

    const after = top(w.dirs.userData);
    expect(after).toEqual(before.filter((f) => !(filesRemovedBy("signOut") as string[]).includes(f)));
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
    await openSettings(page, "Workspace");
    await settings(page).getByRole("button", { name: "Run setup again" }).click();
    await heading(page, "Connect your GitHub account");
    await expect(card(page).getByText("Step 2 of 4")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Note" })).toHaveCount(0);
    expect(top(w.dirs.userData)).not.toContain(DATA_FILES.setup);
    await expect(card(page).getByRole("button", { name: "Continue as @ada" })).toBeFocused({ timeout: 15_000 });
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
    await openSettings(page, "Workspace");
    await settings(page).getByRole("button", { name: "Open another workspace from GitHub…" }).click();
    await heading(page, "We found your notes");
    await expect(card(page).getByText(/^Step \d of 4$/)).toHaveCount(0);
    await expect(card(page).getByText("notes", { exact: true })).toBeVisible();
    await expect(card(page).getByText("Updated 3 days ago · Public")).toBeVisible();
    const open = card(page).getByRole("button", { name: "Open", exact: true });
    await expect(open).toBeFocused({ timeout: 15_000 });
    expect(await settledAxe(page)).toEqual([]);
    // Esc goes back to the note, as it was.
    await press(page, "Escape");
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");

    await openSettings(page, "Workspace");
    await settings(page).getByRole("button", { name: "Open another workspace from GitHub…" }).click();
    await expect(open).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    // The open workspace's folder is taken, so it goes in the first free one beside it, and writing starts there.
    const second = `${w.dirs.docs} 2`;
    await expect.poll(() => (existsSync(join(w.dirs.userData, DATA_FILES.workspace)) ? readFileSync(join(w.dirs.userData, DATA_FILES.workspace), "utf8") : ""), { timeout: 30_000 }).toContain("Focus Notes 2");
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

test("FRE-07, PRV-02: removing the workspace is refused while changes aren't on GitHub, then allowed after Sync now; only the local clone and the inventory's items go", async () => {
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

    await openSettings(page, "Workspace");
    await settings(page).getByRole("button", { name: "Remove this workspace from this computer…" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this workspace?" });
    await expect(dialog.getByText("1 change isn't on GitHub yet. Sync first, so nothing is lost.")).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    expect(await settledAxe(page)).toEqual([]);
    expect(existsSync(w.dirs.docs)).toBe(true);

    await dialog.getByRole("button", { name: "Sync now" }).click();
    await expect(dialog.getByText(`Your notes stay on GitHub, in ada/notes and ada/notes-private. This deletes the folder ${w.dirs.docs} from this computer, and what Focus Notes keeps about it here.`)).toBeVisible({ timeout: 30_000 });
    const priv = join(w.remotes, "ada", "notes-private.git");
    expect(execFileSync("git", ["--git-dir", priv, "show", "main:notes/secret.md"], { encoding: "utf8" })).toContain("Words not on GitHub yet.");
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();

    // The window starts again at the first run's Your notes step, which finds the notes on GitHub.
    await heading(page, "We found your notes");
    expect(existsSync(w.dirs.docs)).toBe(false);
    const after = top(w.dirs.userData);
    for (const f of after) expect(INVENTORY).toContain(f);
    expect(after).toEqual(before.filter((f) => !(filesRemovedBy("removeWorkspace") as string[]).includes(f)));
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
