/**
 * M3 journeys for save and sync with Git (WP-3.3, EDT-11, D-23, D-07): the workspace is a clone
 * of a local bare remote with `private/` as a submodule, so nothing touches the network. Mod+S
 * commits and pushes, private first and then the pointer; quitting commits and pushes; 60 s with
 * no typing does too (shortened here); and a push that fails shows the problem, nothing else.
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "protocol.file.allow=always", "-c", "core.autocrlf=false", ...(cwd.endsWith(".git") ? [`--git-dir=${cwd}`] : []), ...args], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
const configure = (dir: string) => {
  for (const [k, v] of [["user.name", "Test"], ["user.email", "test@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git(dir, "config", k!, v!);
};
const write = (p: string, text: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

/** An instance: a notes repository with `private/` as a submodule, each with a local bare remote, cloned as the workspace. */
function instance() {
  const root = mkdtempSync(join(tmpdir(), "fn-m3-"));
  const notesRemote = join(root, "notes.git");
  const privateRemote = join(root, "private.git");
  git(root, "init", "-q", "--bare", "-b", "main", notesRemote);
  git(root, "init", "-q", "--bare", "-b", "main", privateRemote);
  const seedP = join(root, "seed-private");
  git(root, "clone", "-q", privateRemote, seedP);
  configure(seedP);
  write(join(seedP, "notes", "welcome.md"), "# Welcome\n\nFirst line.\n");
  git(seedP, "add", "-A");
  git(seedP, "commit", "-q", "-m", "Start");
  git(seedP, "push", "-q", "-u", "origin", "main");
  const seedN = join(root, "seed-notes");
  git(root, "clone", "-q", notesRemote, seedN);
  configure(seedN);
  write(join(seedN, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  write(join(seedN, "notes", "hello.md"), "# Hello\n");
  git(seedN, "submodule", "add", "-q", "-b", "main", privateRemote, "private");
  git(seedN, "add", "-A");
  git(seedN, "commit", "-q", "-m", "Start");
  git(seedN, "push", "-q", "-u", "origin", "main");
  const docs = join(root, "ws");
  git(root, "clone", "-q", "--recurse-submodules", notesRemote, docs);
  configure(docs);
  configure(join(docs, "private"));
  git(join(docs, "private"), "checkout", "-q", "main");
  return { dirs: { docs, userData: mkdtempSync(join(tmpdir(), "fn-user-")) }, notesRemote, privateRemote };
}
const remoteText = (remote: string) => {
  try {
    return git(remote, "show", "main:notes/welcome.md");
  } catch {
    return "";
  }
};
const commits = (remote: string) => Number(git(remote, "rev-list", "--count", "main"));
const pointer = (notesRemote: string) => git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2];

async function typeAtEnd(page: import("@playwright/test").Page, text: string) {
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");
  await editor.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(text);
}

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
  await expect.poll(() => readFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "utf8"), { timeout: 5000 }).toContain("Written before quitting.");
  expect(commits(privateRemote)).toBe(1);
  await quit(l);
  await expect.poll(() => remoteText(privateRemote), { timeout: 15_000 }).toBe("# Welcome\n\nFirst line. Written before quitting.");
});

test("EDT-11: a pause in typing commits and pushes on its own (60 s, shortened for the test)", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "2000" });
  await typeAtEnd(l.page, " Then a pause.");
  // Written to disk within a second, but not committed yet.
  await expect.poll(() => readFileSync(join(dirs.docs, "private", "notes", "welcome.md"), "utf8"), { timeout: 1500 }).toContain("Then a pause.");
  expect(commits(privateRemote)).toBe(1);
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
