/**
 * M3 journeys for save and sync with Git (WP-3.3, EDT-11, D-23, D-07): the workspace is a clone
 * of a local bare remote with `private/` as a submodule, so nothing touches the network. Mod+S
 * commits and pushes, private first and then the pointer; quitting commits and pushes; 60 s with
 * no typing does too (shortened here); and a push that fails shows the problem, nothing else.
 */
import { test, expect } from "./fixtures.ts";
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit } from "./helpers.ts";
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
 * Waits for the save to land on disk, polling often so it's seen as soon as it lands. The timeout is
 * generous because a loaded runner can be twice as slow; the save's latency budget is measured by
 * the PRF-03 journey, not here. The idle timer starts only once the write lands (Cadence.edited after
 * the write), so the commit can't come sooner than the idle time after this returns.
 */
const onDisk = (docs: string, text: string) =>
  expect.poll(() => readFileSync(welcome(docs), "utf8"), { timeout: 10_000, intervals: [50] }).toContain(text);
const pointer = (notesRemote: string) => git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2];

async function typeAtEnd(page: import("@playwright/test").Page, text: string) {
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");
  await editor.click();
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.type(text);
}

// M3 demo, step 2: a note is committed and pushed.
test("EDT-11: Mod+S commits and pushes at once, private first, then the pointer moves (D-07); nothing is shown", async () => {
  const { dirs, notesRemote, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  await typeAtEnd(page, " Saved now.");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Saved now.");
  expect(git(privateRemote, "log", "-1", "--format=%s", "main")).toBe("Update notes/welcome.md");
  await expect.poll(() => pointer(notesRemote), { timeout: 15_000 }).toBe(git(privateRemote, "rev-parse", "main"));
  expect(git(notesRemote, "log", "-1", "--format=%s", "main")).toMatch(/^Update private notes to [0-9a-f]{7}$/);
  // Only problems are shown.
  await expect(page.getByText(/Couldn't (sync|save)/)).toHaveCount(0);
  await quit(l);
});

test("EDT-11: quitting commits and pushes", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  await typeAtEnd(l.page, " Written before quitting.");
  await onDisk(dirs.docs, "Written before quitting.");
  expect(commits(join(dirs.docs, "private"), "HEAD")).toBe(1);
  expect(commits(privateRemote)).toBe(1);
  await quit(l);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Written before quitting.");
});

test("EDT-11: a pause in typing commits and pushes on its own (60 s, shortened for the test)", async () => {
  const { dirs, privateRemote } = instance();
  // Well above the save's latency on a slow runner, so "written but not committed" is a real window.
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "5000" });
  await typeAtEnd(l.page, " Then a pause.");
  // Written to disk, but not committed yet: neither in the workspace nor on the remote.
  await onDisk(dirs.docs, "Then a pause.");
  expect(commits(join(dirs.docs, "private"), "HEAD")).toBe(1);
  expect(commits(privateRemote)).toBe(1);
  // Then the pause commits and pushes on its own.
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Then a pause.");
  await quit(l);
});

test("EDT-11: a push that can't reach the remote shows the problem, keeps the commit, and pushes it later", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  renameSync(privateRemote, `${privateRemote}.away`);
  await typeAtEnd(page, " Offline.");
  await page.keyboard.press(`${mod}+S`);
  await expect(page.getByText("Couldn't sync: you're offline. Your changes are safe on this computer and will sync later.")).toBeVisible({ timeout: 15_000 });
  expect(git(join(dirs.docs, "private"), "log", "-1", "--format=%s")).toBe("Update notes/welcome.md");
  renameSync(`${privateRemote}.away`, privateRemote);
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Offline.");
  await quit(l);
});
