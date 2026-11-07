/**
 * A project New project made (owner's report, 7 November; D-pending): its own Git repository with
 * notes/, no `.focus-notes/workspace.json` and no remote. Delete project reaches its first confirmation
 * (owner, 17:48: "It doesn't even reach the first dialog asking me to confirm if I want to delete."),
 * also when creating its GitHub repository failed, and the Backup card never claims a backup to GitHub
 * for commits that only exist on this computer.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const UNAVAILABLE = "Couldn't check this project, so nothing was deleted. Try again.";

/** New project's shape (projects.ts create): notes/, Git on main, an empty first commit, then a note at the root. */
function newProject(opts: { firstCommit?: boolean } = {}) {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "notes"));
  git(dirs.docs, "init", "-q", "-b", "main");
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nWritten here.\n");
  if (opts.firstCommit !== false) {
    git(dirs.docs, "commit", "-q", "--allow-empty", "-m", "Start the project");
    git(dirs.docs, "add", "-A");
    git(dirs.docs, "commit", "-q", "-m", "Create Welcome.md");
  }
  return dirs;
}

/**
 * Choosing Delete project opens the first confirmation with the project's name, which the dialog only
 * has once the check before it succeeded, and no error notification. It never confirms the delete.
 */
async function reachesFirstConfirmation(page: Page, kind: "offline" | "linked") {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("tab", { name: "Project", exact: true }).click();
  await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: /^Delete .+\?$/ });
  await expect(confirm).toBeVisible();
  if (kind === "offline") await expect(confirm.getByRole("textbox", { name: /^Type .+ to confirm$/ })).toBeVisible();
  else await expect(confirm.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await expect(page.getByText(UNAVAILABLE)).toHaveCount(0);
  // The check's failure closes the dialog and shows the notification: neither happens afterwards.
  await page.waitForTimeout(1_000);
  await expect(confirm).toBeVisible();
  await expect(page.getByText(UNAVAILABLE)).toHaveCount(0);
}

test("D-pending: a project kept on this computer says Saved on this computer, and Delete project reaches its first confirmation", async () => {
  const dirs = newProject();
  const l = await launch(dirs);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    const icon = page.locator("#saveState");
    await expect(icon).toBeVisible();
    // Git is open, but nothing tracks a remote: saved here, never backed up.
    await expect(icon).toHaveAttribute("data-state", "savedLocal");
    await icon.hover();
    const card = page.getByRole("dialog", { name: "Backup", exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Saved on this computer");
    await expect(card).toContainText("Not backed up to GitHub");
    await expect(card).not.toContainText(/Backed up at|Last backup|No changes waiting for backup/);
    await expect(card.getByRole("button", { name: "Backup to GitHub", exact: true })).toBeDisabled();
    await page.mouse.move(500, 300);
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();

    await reachesFirstConfirmation(page, "offline");
    expect(existsSync(join(dirs.docs, "Welcome.md"))).toBe(true);
  } finally { await quit(l); }
});

test("D-pending: a project whose GitHub creation failed before its first commit reaches the first delete confirmation", async () => {
  const dirs = newProject({ firstCommit: false });
  const l = await launch(dirs);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await reachesFirstConfirmation(page, "offline");
    expect(existsSync(join(dirs.docs, "Welcome.md"))).toBe(true);
  } finally { await quit(l); }
});

test("D-pending: a project whose GitHub repository was never made, its remote already set, reaches the first delete confirmation and isn't backed up", async () => {
  const dirs = newProject();
  // The journeys' stand-in for github.com: a URL under FOCUS_NOTES_GIT_REMOTES reads as owner/name, and no repository is there.
  const remotes = join(dirs.docs, "..", "remotes");
  mkdirSync(remotes, { recursive: true });
  git(dirs.docs, "remote", "add", "origin", join(remotes, "ada", "never-made.git"));
  const l = await launch(dirs, { FOCUS_NOTES_GIT_REMOTES: remotes });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await expect(page.locator("#saveState")).not.toHaveAttribute("data-state", "synced");
    await reachesFirstConfirmation(page, "linked");
    expect(existsSync(join(dirs.docs, "Welcome.md"))).toBe(true);
  } finally { await quit(l); }
});