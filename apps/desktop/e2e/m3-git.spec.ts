/**
 * M3 journeys for save and sync with Git (WP-3.3, EDT-11, D-132, D-07): the workspace is a clone
 * of a local bare remote with `private/` as a submodule, so nothing touches the network. Save to
 * cloud (Mod+Shift+S, and Mod+S) commits and pushes, private first and then the pointer; quitting
 * commits and pushes; a pause backs up only once enough changed (D-133, thresholds shortened here);
 * a push that fails shows the problem. The bottom-left pill's icon shows each state, and focus never
 * leaves the note.
 */
import { test, expect } from "./fixtures.ts";
import { renameSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, onDisk, PROMPTLY, quit } from "./helpers.ts";
import { git, instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const remoteText = (remote: string) => {
  try {
    return git(remote, "show", "main:notes/welcome.md");
  } catch {
    return "";
  }
};
const commits = (repo: string, ref = "main") => Number(git(repo, "rev-list", "--count", ref));
const welcome = (docs: string) => join(docs, "private", "notes", "welcome.md");
/**
 * Waits for the save to land on disk (helpers.ts `onDisk`); the save's latency budget is measured by
 * the PRF-03 journey, not here. The idle timer starts only once the write lands (Cadence.edited after
 * the write), so the commit can't come sooner than the idle time after this returns.
 */
const saved = (docs: string, text: string) => onDisk(welcome(docs), text);
const pointer = (notesRemote: string) => git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2];

/** The save state's icon in the bottom-left pill (D-132), and the state it shows. */
const saveIcon = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Account" }).locator("button[data-state]");
const stateOf = (page: import("@playwright/test").Page) => saveIcon(page).getAttribute("data-state");
const noteFocused = (page: import("@playwright/test").Page) => expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();

async function typeAtEnd(page: import("@playwright/test").Page, text: string) {
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");
  await editor.click();
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(text);
}

// M3 demo, step 2: a note is committed and pushed.
test("EDT-11: Mod+S commits and pushes at once, private first, then the pointer moves (D-07); the icon says backed up", async () => {
  const { dirs, notesRemote, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  await typeAtEnd(page, " Saved now.");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Saved now.");
  expect(git(privateRemote, "log", "-1", "--format=%s", "main")).toBe("Update notes/welcome.md");
  await expect.poll(() => pointer(notesRemote), { timeout: 15_000 }).toBe(git(privateRemote, "rev-parse", "main"));
  expect(git(notesRemote, "log", "-1", "--format=%s", "main")).toMatch(/^Update private notes to [0-9a-f]{7}$/);
  // Only problems pop up; the icon says it's backed up, and the note keeps focus (D-132).
  await expect(page.getByText(/Couldn't (sync|save)/)).toHaveCount(0);
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("synced");
  await noteFocused(page);
  await quit(l);
});

test("EDT-11: typing shows saved here at once, then not backed up yet; Mod+Shift+S backs up with the label, keeping focus (D-132)", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  // Every state the icon shows, in order, from before the first keystroke.
  await saveIcon(page).evaluate((el) => {
    const seen: string[] = [];
    (window as unknown as { __saveStates: string[] }).__saveStates = seen;
    new MutationObserver(() => seen.push(el.getAttribute("data-state") ?? "")).observe(el, { attributes: true, attributeFilter: ["data-state"] });
  });
  await typeAtEnd(page, " Cloud");
  await saved(dirs.docs, "Cloud");
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("pending");
  const seen = await page.evaluate(() => (window as unknown as { __saveStates: string[] }).__saveStates);
  // Attribute records repeat the value React sets; what matters is each change after the first keystroke.
  const changes = seen.filter((s, i) => s !== seen[i - 1]);
  while (changes[0] === "synced") changes.shift();
  expect(changes.slice(0, 2), "saved here at once, then not backed up yet").toEqual(["savedLocal", "pending"]);
  await expect(saveIcon(page)).toHaveAccessibleName("Saved here · not backed up yet");
  await page.keyboard.press(`${mod}+Shift+S`);
  await expect(saveIcon(page)).toContainText(/Backing up…|Backed up/, PROMPTLY);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Cloud");
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("synced");
  await noteFocused(page);
  // The label closes again after a moment; the tooltip keeps the words.
  await expect(saveIcon(page)).toHaveText("", { timeout: 5_000 });
  await expect(saveIcon(page)).toHaveAccessibleName(/^Backed up at /);
  await noteFocused(page);
  await quit(l);
});

test("EDT-11: small edits under the threshold aren't backed up after the pause; a large edit backs up on its own (D-133)", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "1500", FOCUS_NOTES_BACKUP_SHORT_MS: "1000", FOCUS_NOTES_BACKUP_BIG_CHARS: "60" });
  const { page } = l;
  await typeAtEnd(page, " Small.");
  await saved(dirs.docs, "Small.");
  // Well past the pause: nothing committed, and the icon says it isn't backed up yet.
  await page.waitForTimeout(4_000);
  expect(commits(join(dirs.docs, "private"), "HEAD")).toBe(1);
  expect(commits(privateRemote)).toBe(1);
  expect(await stateOf(page)).toBe("pending");
  // Enough change backs up after the short pause, with no key pressed.
  await page.keyboard.type(" And now a much longer passage that crosses the large-edit line.");
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toContain("crosses the large-edit line.");
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("synced");
  await noteFocused(page);
  await quit(l);
});

test("EDT-11: quitting commits and pushes", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  await typeAtEnd(l.page, " Written before quitting.");
  await saved(dirs.docs, "Written before quitting.");
  expect(commits(join(dirs.docs, "private"), "HEAD")).toBe(1);
  expect(commits(privateRemote)).toBe(1);
  await quit(l);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Written before quitting.");
});

test("EDT-11: a pause in typing commits and pushes on its own once enough changed (60 s and 200 characters, shortened); the icon follows", async () => {
  const { dirs, privateRemote } = instance();
  // Well above the save's latency on a slow runner, so "written but not committed" is a real window.
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "5000", FOCUS_NOTES_BACKUP_MIN_CHARS: "10" });
  await typeAtEnd(l.page, " Then a pause.");
  // Written to disk, but not committed yet: neither in the workspace nor on the remote.
  await saved(dirs.docs, "Then a pause.");
  expect(commits(join(dirs.docs, "private"), "HEAD")).toBe(1);
  expect(commits(privateRemote)).toBe(1);
  await expect.poll(() => stateOf(l.page), PROMPTLY).toBe("pending");
  // Then the pause commits and pushes on its own, and the icon says so without taking focus.
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Then a pause.");
  await expect.poll(() => stateOf(l.page), PROMPTLY).toBe("synced");
  await noteFocused(l.page);
  await quit(l);
});

test("EDT-11: a push that can't reach the remote shows the problem, keeps the commit, and pushes it later", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  renameSync(privateRemote, `${privateRemote}.away`);
  await typeAtEnd(page, " Offline.");
  await page.keyboard.press(`${mod}+Shift+S`);
  await expect(page.getByText("Couldn't sync: you're offline. Your changes are safe on this computer and will sync later.")).toBeVisible({ timeout: 15_000 });
  expect(git(join(dirs.docs, "private"), "log", "-1", "--format=%s")).toBe("Update notes/welcome.md");
  // The icon shows offline (D-132), and the note keeps focus.
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("offline");
  await expect(saveIcon(page)).toHaveAccessibleName("Offline · will back up when you're back");
  await noteFocused(page);
  renameSync(`${privateRemote}.away`, privateRemote);
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Offline.");
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("synced");
  await noteFocused(page);
  await quit(l);
});

test("D-157: a workspace whose remote is a template never pushes to it: the commit stays here, and the toast offers Run setup again", async () => {
  const { dirs, privateRemote } = instance();
  // The private repository's remote has the Focus Notes template's name, under the journeys' local remotes.
  const remotes = join(dirs.docs, "..", "remotes");
  const template = join(remotes, "prabinpebam", "focus-notes-workspace.git");
  git(dirs.docs, "clone", "-q", "--bare", privateRemote, template);
  const priv = join(dirs.docs, "private");
  git(priv, "remote", "set-url", "origin", template);
  git(priv, "fetch", "-q");
  const before = git(template, "rev-parse", "main");
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_GIT_REMOTES: remotes });
  const { page } = l;
  await typeAtEnd(page, " Not for a template.");
  await page.keyboard.press(`${mod}+Shift+S`);
  await expect(page.getByText("This is a template repository. Your notes weren't saved to it.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Run setup again" })).toBeVisible();
  expect(git(priv, "log", "-1", "--format=%s"), "the commit stays here").toBe("Update notes/welcome.md");
  expect(git(template, "rev-parse", "main"), "nothing reached the template").toBe(before);
  expect(remoteText(privateRemote)).toBe("# Welcome\n\nFirst line.");
  await expect.poll(() => stateOf(page), PROMPTLY).toBe("error");
  await noteFocused(page);
  await quit(l);
});
