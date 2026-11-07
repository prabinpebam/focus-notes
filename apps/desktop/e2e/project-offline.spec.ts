/**
 * A project New project made (owner's report, 7 November; D-pending): its own Git repository with
 * notes/, no `.focus-notes/workspace.json` and no remote. Delete project reaches its confirmation, and
 * the Backup card never claims a backup to GitHub for commits that only exist on this computer.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });

/** New project's shape (projects.ts create): notes/, Git on main, an empty first commit, then a note at the root. */
function newProject() {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "notes"));
  git(dirs.docs, "init", "-q", "-b", "main");
  git(dirs.docs, "commit", "-q", "--allow-empty", "-m", "Start the project");
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nWritten here.\n");
  git(dirs.docs, "add", "-A");
  git(dirs.docs, "commit", "-q", "-m", "Create Welcome.md");
  return dirs;
}

test("D-pending: a project kept on this computer says Saved on this computer, and Delete project reaches its confirmation", async () => {
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

    await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await expect(confirm).toBeVisible();
    await expect(page.getByText("Couldn't check this project, so nothing was deleted. Try again.")).toHaveCount(0);
    // Only the confirmation: the folder is never deleted by this journey.
    expect(existsSync(join(dirs.docs, "Welcome.md"))).toBe(true);
  } finally { await quit(l); }
});
