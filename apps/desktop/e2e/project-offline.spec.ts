/**
 * A project New project made (owner's report, 7 November; D-pending): its own Git repository with
 * notes/, no `.focus-notes/workspace.json` and no remote. Delete project reaches its first confirmation
 * (owner, 17:48: "It doesn't even reach the first dialog asking me to confirm if I want to delete."),
 * also when creating its GitHub repository failed, and the Backup card never claims a backup to GitHub
 * for commits that only exist on this computer.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";
import { makeFakes } from "../test/fakes/fakes.ts";

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

test("D-394: actual in-app DELETE refusal keeps disposable bytes and offers GitHub fallback", async () => {
  const fakes = makeFakes({ gcm: true, token: "ghp_DELETE0123456789abcdefTOKEN" });
  fakes.store("ghp_DELETE0123456789abcdefTOKEN");
  const dirs = newProject();
  const note = join(dirs.docs, "Welcome.md");
  const before = readFileSync(note);
  const head = git(dirs.docs, "rev-parse", "HEAD").toString();
  const remotes = join(dirs.userData, "remotes");
  const remote = join(remotes, "ada", "notes.git");
  mkdirSync(join(remotes, "ada"), { recursive: true });
  execFileSync("git", ["init", "-q", "--bare", remote]);
  git(dirs.docs, "remote", "add", "origin", remote);
  git(dirs.docs, "push", "-qu", "origin", "main");
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url === "/user") return send(200, { id: 1, login: "ada", name: "Ada" });
    if (req.url === "/repos/ada/notes" && req.method === "GET") return send(200, { id: 42, owner: { login: "ada", type: "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
    if (req.url === "/repos/ada/notes" && req.method === "DELETE") return send(403, { message: "Forbidden" });
    send(404, { message: "Not found" });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Delete fixture did not bind");
  const l = await launch(dirs, {
    ...fakes.env,
    FOCUS_NOTES_GITHUB_API: `http://127.0.0.1:${address.port}`,
    FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}`,
    FOCUS_NOTES_GIT_REMOTES: remotes, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes,
  });
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    const field = dialog.getByRole("textbox", { name: /^Type .+ to confirm$/ });
    await expect(field).toBeVisible();
    const name = (await dialog.getByRole("heading", { name: /^Delete .+\?$/ }).innerText()).replace(/^Delete /, "").replace(/\?$/, "");
    if (!name) throw new Error("Delete confirmation did not name its target");
    await field.fill(name);
    await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
    await expect(dialog).toContainText("GitHub refused deletion");
    await expect(dialog.getByRole("button", { name: "Open on GitHub", exact: true })).toBeVisible();
    expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
    expect(readFileSync(note)).toEqual(before);
    expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
    if (process.env.FOCUS_NOTES_DELETE_REVIEW) {
      const at = process.env.FOCUS_NOTES_DELETE_REVIEW;
      mkdirSync(at, { recursive: true });
      const image = await l.app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"));
        if (!window) throw new Error("Delete renderer missing");
        return (await window.webContents.capturePage()).toPNG().toString("base64");
      });
      writeFileSync(join(at, "refused.png"), Buffer.from(image, "base64"));
      writeFileSync(join(at, "provenance.json"), JSON.stringify({ state: "actual-refused", source: "built-invisible-renderer", pid: l.pid, requests, preservedNote: before.toString(), preservedHead: head, sixStateComplete: false }, null, 2));
    }
    await dialog.getByRole("button", { name: "Open on GitHub", exact: true }).click();
    await expect.poll(() => l.log.some(line => line.includes("https://github.com/ada/notes/settings"))).toBe(true);
    await dialog.getByRole("button", { name: "Keep project", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(readFileSync(note)).toEqual(before);
  } finally {
    await quit(l);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});