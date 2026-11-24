/**
 * Deleting a project (PRJ-23, D-413): offline projects, projects whose GitHub repository was never
 * created, and GitHub-linked projects using the web-delete step with automatic detection (authenticated
 * GET /repos/{owner}/{repo} === 404 AND GET /user === 200). Fakes only: never touches real GitHub.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { makeFakes } from "../test/fakes/fakes.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const UNAVAILABLE = "Couldn't check this project, so nothing was deleted. Try again.";

/** A project folder as New project makes it: notes/, Git on main, no .focus-notes/workspace.json. */
function newProject(opts: { firstCommit?: boolean } = {}) {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
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
  await page.waitForTimeout(1_000);
  await expect(confirm).toBeVisible();
  await expect(page.getByText(UNAVAILABLE)).toHaveCount(0);
}

/** Synthetic Recycle Bin: moves the approved fixture folder into recycle instead of touching OS trash. */
async function installRecycleFake(l: Launched, folder: string, recycle: string) {
  await l.app.evaluate(({ shell }, paths) => {
    const fs = process.getBuiltinModule("fs").promises;
    shell.trashItem = async path => {
      if (path !== paths.folder) throw new Error("Refused foreign fixture folder");
      await fs.rename(path, paths.recycle);
    };
  }, { folder, recycle });
}

test("D-pending: a project kept on this computer says Saved on this computer, and Delete project reaches its first confirmation", async () => {
  const dirs = newProject();
  const l = await launch(dirs);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    const icon = page.locator("#saveState");
    await expect(icon).toBeVisible();
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

async function startLinkedProject(opts: {
  siteRepo?: string;
  handler: (req: IncomingMessage, res: ServerResponse, send: (status: number, body: unknown, headers?: Record<string, string>) => void) => void;
}) {
  const dirs = newProject();
  const fakes = makeFakes({ gcm: true, token: "ghp_DELETE0123456789abcdefTOKEN" });
  fakes.store("ghp_DELETE0123456789abcdefTOKEN");
  const remotes = join(dirs.userData, "remotes");
  mkdirSync(join(remotes, "ada"), { recursive: true });
  const remote = join(remotes, "ada", "notes.git");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  if (opts.siteRepo) {
    const [owner, name] = opts.siteRepo.split("/");
    mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
    writeFileSync(join(dirs.docs, ".focus-notes", "site-pairing.json"), JSON.stringify({
      version: 1, project: "ada/notes", owner, name, intent: "11111111-2222-3333-4444-555555555555", phase: "ready", site: `https://${owner}.github.io/${name}/`,
    }, null, 2));
    git(dirs.docs, "add", "-A");
    git(dirs.docs, "commit", "-qm", "Pair public site");
  }
  git(dirs.docs, "remote", "add", "origin", remote);
  git(dirs.docs, "push", "-qu", "origin", "main");
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    opts.handler(req, res, send);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Delete fixture server did not bind");
  const l = await launch(dirs, {
    ...fakes.env,
    FOCUS_NOTES_GITHUB_API: `http://127.0.0.1:${address.port}`,
    FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}`,
    FOCUS_NOTES_GIT_REMOTES: remotes,
    FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes,
  });
  const recycle = join(dirs.userData, "recycled-project");
  await installRecycleFake(l, dirs.docs, recycle);
  return { dirs, fakes, l, recycle, requests, close: async () => { await quit(l); await new Promise<void>((r, j) => server.close(e => e ? j(e) : r())); } };
}

async function captureIfRequested(l: Launched, name: string) {
  const dir = process.env.FOCUS_NOTES_DELETE_CAPTURES;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const png = await l.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes("index.html"));
    if (!w) throw new Error("Renderer window missing");
    return (await w.webContents.capturePage()).toPNG().toString("base64");
  });
  writeFileSync(join(dir, `${name}.png`), Buffer.from(png, "base64"));
}

async function advanceToWebDelete(page: Page, l?: Launched, capturePrefix?: string) {
  await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("tab", { name: "Project", exact: true }).click();
  await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Delete .+\?$/ });
  await expect(dialog).toBeVisible();
  // D-374 & spacing: no Cancel beside close x; item gap < section gap.
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  const gaps = await dialog.evaluate(el => {
    const section = el.querySelector<HTMLElement>("[data-section]");
    const cards = [...el.querySelectorAll<HTMLElement>("[data-item-card]")];
    const outer = section?.parentElement;
    if (!section || !outer || cards.length < 2) return null;
    const prev = section.previousElementSibling as HTMLElement | null;
    const sectionGap = prev ? section.getBoundingClientRect().top - prev.getBoundingClientRect().bottom : 0;
    const cardBoxGap = cards[1]!.getBoundingClientRect().top - cards[0]!.getBoundingClientRect().bottom;
    const c0Style = getComputedStyle(cards[0]!);
    const c1Style = getComputedStyle(cards[1]!);
    const visualItemGap = cardBoxGap + parseFloat(c0Style.paddingBottom) + parseFloat(c1Style.paddingTop);
    return { sectionGap: Math.round(sectionGap), cardBoxGap: Math.round(cardBoxGap), visualItemGap: Math.round(visualItemGap) };
  });
  expect(gaps).not.toBeNull();
  expect(gaps!.cardBoxGap).toBeLessThan(gaps!.sectionGap);
  expect(gaps!.visualItemGap).toBeLessThan(gaps!.sectionGap);
  if (l && capturePrefix) {
    await captureIfRequested(l, `${capturePrefix}-consequences-light`);
    await page.evaluate(() => { document.documentElement.dataset.theme = "ink"; document.documentElement.style.colorScheme = "dark"; });
    await page.waitForTimeout(100);
    await captureIfRequested(l, `${capturePrefix}-consequences-dark`);
    await page.evaluate(() => { document.documentElement.dataset.theme = "paper"; document.documentElement.style.colorScheme = "light"; });
  }
  // No typed name for a linked project: Continue goes straight to the GitHub step (D-413, owner 24 Nov).
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Delete on GitHub", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /^Type .+ to confirm$/ })).toHaveCount(0);
  if (l && capturePrefix) {
    await captureIfRequested(l, `${capturePrefix}-github-light`);
    await page.evaluate(() => { document.documentElement.dataset.theme = "ink"; document.documentElement.style.colorScheme = "dark"; });
    await page.waitForTimeout(100);
    await captureIfRequested(l, `${capturePrefix}-github-dark`);
    await page.evaluate(() => { document.documentElement.dataset.theme = "paper"; document.documentElement.style.colorScheme = "light"; });
  }
  return dialog;
}

test("D-413: opening GitHub settings uses external link, auto-advances when fake repo disappears, and completes local cleanup", async () => {
  let gone = false;
  const fx = await startLinkedProject({
    handler: (req, _res, send) => {
      if (req.url === "/user") return send(200, { id: 1, login: "ada", name: "Ada" });
      if (req.url === "/repos/ada/notes" && req.method === "GET") {
        return gone ? send(404, { message: "Not Found" }) : send(200, { id: 42, owner: { login: "ada", type: "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
      }
      send(404, { message: "Not Found" });
    },
  });
  const beforeBytes = readFileSync(join(fx.dirs.docs, "Welcome.md"));
  try {
    const dialog = await advanceToWebDelete(fx.l.page, fx.l, "after");
    await expect(dialog.locator("[data-icon-layout]")).toBeVisible();
    await expect(dialog).toContainText("1. Scroll to Danger Zone.");
    await expect(dialog).toContainText("2. Choose Delete this repository.");
    await expect(dialog).toContainText("3. Type the repository name and confirm.");
    await expect(dialog).toContainText("4. Come back here — Focus Notes finishes automatically.");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("textbox", { name: "One-time token" })).toHaveCount(0);

    // Clicking Open GitHub settings opens the Danger Zone settings URL via the external-link route.
    await dialog.locator("[data-icon-layout-actions]").getByRole("button", { name: "Open GitHub settings", exact: true }).click();
    await expect.poll(() => fx.l.log.join("\n")).toContain("[focus-notes] open-external https://github.com/ada/notes/settings");
    expect(existsSync(fx.dirs.docs)).toBe(true);

    // Repo disappears on GitHub (404 + GET /user 200) -> automatic polling detects it and finishes locally.
    gone = true;
    await expect(dialog.getByRole("heading", { name: "Project deleted", exact: true })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(fx.dirs.docs)).toBe(false);
    expect(readFileSync(join(fx.recycle, "Welcome.md"))).toEqual(beforeBytes);
    expect(fx.requests.filter(r => r.startsWith("DELETE "))).toEqual([]);
    expect(fx.requests.filter(r => r.includes("/login/"))).toEqual([]);

    await dialog.getByRole("button", { name: "Open projects", exact: true }).click();
    await expect(dialog).toBeHidden();
  } finally { await fx.close(); }
});

test("D-413: Check again verifies status; 401, 403, 429 and 404-with-invalid-session never delete the project", async () => {
  let repoMode: "exists" | "401" | "403" | "429" | "404-invalid-user" | "gone" = "exists";
  const fx = await startLinkedProject({
    handler: (req, _res, send) => {
      if (req.url === "/user") {
        if (repoMode === "404-invalid-user") return send(401, { message: "Bad credentials" });
        return send(200, { id: 1, login: "ada", name: "Ada" });
      }
      if (req.url === "/repos/ada/notes" && req.method === "GET") {
        if (repoMode === "exists") return send(200, { id: 42, owner: { login: "ada", type: "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
        if (repoMode === "401") return send(401, { message: "Bad credentials" });
        if (repoMode === "403") return send(403, { message: "Forbidden" });
        if (repoMode === "429") return send(429, { message: "API rate limit exceeded" }, { "Retry-After": "30" });
        return send(404, { message: "Not Found" });
      }
      send(404, { message: "Not Found" });
    },
  });
  try {
    const dialog = await advanceToWebDelete(fx.l.page);
    const checkAgain = dialog.locator("[data-icon-layout-actions]").getByRole("button", { name: "Check again", exact: true });

    repoMode = "401";
    await checkAgain.click();
    await expect(dialog).toContainText("GitHub needs you to sign in again.");
    await expect(checkAgain).toBeEnabled();
    expect(existsSync(fx.dirs.docs)).toBe(true);

    repoMode = "403";
    await checkAgain.click();
    await expect(dialog).toContainText("Couldn't check GitHub right now.");
    await expect(checkAgain).toBeEnabled();
    expect(existsSync(fx.dirs.docs)).toBe(true);

    repoMode = "429";
    await checkAgain.click();
    await expect(dialog).toContainText("GitHub asked Focus Notes to wait.");
    await expect(checkAgain).toBeEnabled();
    expect(existsSync(fx.dirs.docs)).toBe(true);

    // 404 on repo + 401 on /user MUST NOT be treated as deleted!
    repoMode = "404-invalid-user";
    await checkAgain.click();
    await expect(dialog).toContainText("GitHub needs you to sign in again.");
    await expect(checkAgain).toBeEnabled();
    expect(existsSync(fx.dirs.docs)).toBe(true);

    // Now 404 on repo + 200 on /user -> Check again (or an in-flight background poll) finishes cleanly.
    repoMode = "gone";
    if (await checkAgain.isVisible()) await checkAgain.click({ timeout: 2_000 }).catch(() => {});
    await expect(dialog.getByRole("heading", { name: "Project deleted", exact: true })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(fx.dirs.docs)).toBe(false);
    expect(existsSync(join(fx.recycle, "Welcome.md"))).toBe(true);
  } finally { await fx.close(); }
});

test("D-413: paired public site repository shows a second link and requires both repos gone before local cleanup", async () => {
  const gone = new Set<string>();
  const fx = await startLinkedProject({
    siteRepo: "ada/notes-site",
    handler: (req, _res, send) => {
      if (req.url === "/user") return send(200, { id: 1, login: "ada", name: "Ada" });
      if (req.url === "/repos/ada/notes" && req.method === "GET") {
        return gone.has("ada/notes") ? send(404, { message: "Not Found" }) : send(200, { id: 42, owner: { login: "ada", type: "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
      }
      if (req.url === "/repos/ada/notes-site" && req.method === "GET") {
        return gone.has("ada/notes-site") ? send(404, { message: "Not Found" }) : send(200, { id: 43, owner: { login: "ada", type: "User" }, name: "notes-site", default_branch: "main", permissions: { admin: true, push: true } });
      }
      send(404, { message: "Not Found" });
    },
  });
  try {
    const dialog = await advanceToWebDelete(fx.l.page);
    await expect(dialog).toContainText("paired public site repository");
    await expect(dialog).toContainText("ada/notes");
    await expect(dialog).toContainText("ada/notes-site");

    // Delete only the notes repo -> folder stays until paired site repo is also gone.
    gone.add("ada/notes");
    const checkAgain = dialog.locator("[data-icon-layout-actions]").getByRole("button", { name: "Check again", exact: true });
    await checkAgain.click();
    await expect(dialog).toContainText("Deleted on GitHub");
    await expect(dialog).toContainText("Waiting for deletion on GitHub…");
    expect(existsSync(fx.dirs.docs)).toBe(true);

    // Primary Open GitHub settings now opens the remaining paired site repo's settings.
    await dialog.locator("[data-icon-layout-actions]").getByRole("button", { name: "Open GitHub settings", exact: true }).click();
    await expect.poll(() => fx.l.log.join("\n")).toContain("[focus-notes] open-external https://github.com/ada/notes-site/settings");

    // Delete paired site repo -> auto-advances to local cleanup and completion state.
    gone.add("ada/notes-site");
    await checkAgain.click();
    await expect(dialog.getByRole("heading", { name: "Project deleted", exact: true })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(fx.dirs.docs)).toBe(false);
    expect(existsSync(join(fx.recycle, "Welcome.md"))).toBe(true);
  } finally { await fx.close(); }
});

test("owner, 24 Nov: a project fully on GitHub reads backed up, and Delete shows no unsaved warning for the blank Untitled", async () => {
  const fx = await startLinkedProject({
    handler: (req, _res, send) => {
      if (req.url === "/user") return send(200, { id: 1, login: "ada", name: "Ada" });
      if (req.url === "/repos/ada/notes" && req.method === "GET") return send(200, { id: 42, owner: { login: "ada", type: "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
      send(404, { message: "Not Found" });
    },
  });
  const { page } = fx.l;
  try {
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
    // The blank Untitled project entry leaves on disk (D-397): made empty, outside sync, holding nothing.
    writeFileSync(join(fx.dirs.docs, "Untitled.md"), "");
    writeFileSync(join(fx.dirs.docs, "notes", "Untitled.md"), "\n");
    await expect(page.locator("#saveState")).toHaveAttribute("data-state", "synced", { timeout: 15_000 });

    await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText(/on GitHub yet|Couldn't check what's backed up/);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    // Straight to the GitHub settings step (D-413, no typed-name step): no Not on GitHub yet step.
    await expect(dialog.getByRole("button", { name: "Open GitHub settings", exact: true })).toBeVisible();
    await expect(dialog).not.toContainText(/on GitHub yet|Delete without saving|Couldn't check what's backed up/);
    expect(existsSync(fx.dirs.docs)).toBe(true);
  } finally { await fx.close(); }
});

test("D-413: unsynced notes warn with optional Save a copy and allow Delete without saving", async () => {
  let gone = false;
  const fx = await startLinkedProject({
    handler: (req, _res, send) => {
      if (req.url === "/user") return send(200, { id: 1, login: "ada", name: "Ada" });
      if (req.url === "/repos/ada/notes" && req.method === "GET") {
        return gone ? send(404, { message: "Not Found" }) : send(200, { id: 42, owner: { login: "ada", type: "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
      }
      send(404, { message: "Not Found" });
    },
  });
  try {
    // Create an unpushed note so the unsynced step appears.
    writeFileSync(join(fx.dirs.docs, "Draft.md"), "# Draft\n\nNot pushed to GitHub.\n");
    await expect(fx.l.page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    await fx.l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = fx.l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
    const dialog = fx.l.page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();

    // Unsynced step: Save a copy is optional, Delete without saving is enabled immediately.
    await expect(dialog).toContainText("1 note isn't on GitHub yet");
    await expect(dialog.getByRole("button", { name: "Save a copy…", exact: true })).toBeVisible();
    const skipSave = dialog.getByRole("button", { name: "Delete without saving", exact: true });
    await expect(skipSave).toBeEnabled();
    await skipSave.click();

    // No second typed-name step: straight to the GitHub step (D-413, owner 24 Nov).
    await expect(dialog.getByRole("heading", { name: "Delete on GitHub", exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^Type .+ to confirm$/ })).toHaveCount(0);

    gone = true;
    await dialog.locator("[data-icon-layout-actions]").getByRole("button", { name: "Check again", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Project deleted", exact: true })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(fx.dirs.docs)).toBe(false);
    expect(existsSync(join(fx.recycle, "Draft.md"))).toBe(true);
  } finally { await fx.close(); }
});
