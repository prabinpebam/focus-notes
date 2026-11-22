/**
 * A project New project made (owner's report, 7 November; D-pending): its own Git repository with
 * notes/, no `.focus-notes/workspace.json` and no remote. Delete project reaches its first confirmation
 * (owner, 17:48: "It doesn't even reach the first dialog asking me to confirm if I want to delete."),
 * also when creating its GitHub repository failed, and the Backup card never claims a backup to GitHub
 * for commits that only exist on this computer.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";
import { makeFakes } from "../test/fakes/fakes.ts";
import { DATA_FILES } from "@focus-notes/core/inventory";

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

/** Read the mounted app's actual VM without adding a production inspection port or exposing secrets. */
async function deletionVm(page: Page) {
  return page.evaluate(() => {
    interface Fiber {
      child?: Fiber;
      sibling?: Fiber;
      stateNode?: { current?: Fiber };
      memoizedProps?: {
        app?: { store: { state: unknown }; viewModels: { select: (id: string, state: unknown) => unknown } };
      };
    }
    const root = document.getElementById("root");
    const entry = root && Object.entries(root).find(([key]) => key.startsWith("__reactContainer$"));
    if (!entry) throw new Error("Mounted React app was not found");
    const fiber = entry[1] as Fiber;
    const queue = [fiber.stateNode?.current ?? fiber];
    const seen = new Set<Fiber>();
    while (queue.length) {
      const current = queue.shift()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const app = current.memoizedProps?.app;
      if (app?.viewModels && app.store) {
        const vm = app.viewModels.select("vm.projectDelete", app.store.state);
        if (!vm || typeof vm !== "object") throw new Error("Deletion VM was not found");
        const fields = vm as Record<string, unknown>;
        return { open: fields.open, busy: fields.busy, step: fields.step, remoteState: fields.remoteState, tokenCleared: fields.remoteToken === "", codeCleared: fields.remoteCode === "" };
      }
      if (current.child) queue.push(current.child);
      if (current.sibling) queue.push(current.sibling);
    }
    throw new Error("Mounted app props were not found");
  });
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

async function actualDeletion(mode: "refused" | "partial" | "oauth" | "declined" | "devicePending" | "deviceExpired" | "deviceAbort" | "transportFailure" | "memory" | "ghblocked" | "mismatch" | "loginMismatch" | "replacement" | "policy" | "unavailable" | "fallback" | "current" | "locked") {
  const device = ["oauth", "declined", "devicePending", "deviceExpired", "deviceAbort", "transportFailure"].includes(mode);
  const cli = mode === "ghblocked";
  const fakes = makeFakes({ gcm: true, gh: cli, token: "ghp_DELETE0123456789abcdefTOKEN" });
  fakes.store("ghp_DELETE0123456789abcdefTOKEN");
  if (cli) {
    fakes.signInAs("ghp_EPHEMERAL0123456789abcdef", "ada");
    fakes.session("ghp_RETAINED0123456789abcdef");
    mkdirSync(fakes.env.GH_CONFIG_DIR!, { recursive: true });
    writeFileSync(join(fakes.env.GH_CONFIG_DIR!, "hosts.yml"), "retained CLI configuration");
    for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) fakes.env[key] = "fixture-retained-env";
  }
  const credentials = fakes.stored();
  const gitconfig = readFileSync(fakes.gitconfig);
  const ghSession = cli ? readFileSync(join(fakes.root, "session.json")) : undefined;
  const ghConfig = cli ? readFileSync(join(fakes.env.GH_CONFIG_DIR!, "hosts.yml")) : undefined;
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
  const grantedRequests: string[] = [];
  let replacement = false;
  const polls: number[] = [];
  let deleted = false;
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let allowGrant: (() => void) | undefined;
  const grantReady = new Promise<void>(resolve => { allowGrant = resolve; });
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.headers.authorization?.includes("EPHEMERAL")) {
      grantedRequests.push(`${req.method} ${req.url}`);
      if (mode === "replacement") replacement = true;
    }
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json", "X-OAuth-Scopes": ["refused", "partial", "fallback", "current", "locked"].includes(mode) ? "repo, delete_repo" : "repo" }); res.end(JSON.stringify(body)); };
    if (req.url === "/login/device/code") return send(200, { device_code: "disposable-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 30, interval: 1 });
    if (req.url === "/login/oauth/access_token") {
      polls.push(Date.now());
      if (mode === "devicePending" && polls.length < 3) return send(200, { error: polls.length === 1 ? "authorization_pending" : "slow_down" });
      if (mode === "deviceExpired") return send(200, { error: "expired_token" });
      void grantReady.then(() => send(200, mode === "declined" ? { error: "access_denied" } : { access_token: "ghp_EPHEMERAL0123456789abcdef", scope: "delete_repo" }));
      return;
    }
    if (req.url === "/user") return send(200, { id: mode === "mismatch" && req.headers.authorization?.includes("EPHEMERAL") ? 2 : 1, login: mode === "loginMismatch" && req.headers.authorization?.includes("EPHEMERAL") ? "grace" : "ada", name: "Ada" });
    if (req.url === "/repos/ada/notes" && req.method === "GET") return deleted || mode === "unavailable" && req.headers.authorization?.includes("EPHEMERAL") ? send(404, { message: "Not found" }) : send(200, { id: replacement ? 43 : 42, owner: { login: "ada", type: mode === "policy" ? "Organization" : "User" }, name: "notes", default_branch: "main", permissions: { admin: true, push: true } });
    if (req.url === "/repos/ada/notes" && req.method === "DELETE") {
      if (mode === "policy" && req.headers.authorization?.includes("EPHEMERAL")) return send(403, { message: "Organization policy forbids deletion" });
      if (mode === "partial") { res.writeHead(204); res.end(); return; }
      if (mode === "refused" || !["current", "locked"].includes(mode) && !req.headers.authorization?.includes("EPHEMERAL")) return send(403, { message: "Forbidden" });
      void pending.then(() => { deleted = true; res.writeHead(204); res.end(); });
      return;
    }
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
    ...(device ? { FOCUS_NOTES_GITHUB_OAUTH_CLIENT_ID: "focus-notes-test" } : {}),
  });
  let closed = false;
  try {
    const recycle = join(dirs.userData, "recycled-project");
    await l.app.evaluate(async ({ shell }, paths) => {
      const fs = process.getBuiltinModule("fs").promises;
      let attempts = 0;
      shell.trashItem = async path => {
        if (path !== paths.folder) throw new Error("Refused foreign fixture folder");
        if (paths.locked && attempts++ === 0) throw new Error("Fixture file in use");
        await fs.rename(path, paths.recycle);
      };
    }, { folder: dirs.docs, recycle, locked: mode === "locked" });
    if (mode === "transportFailure") await l.app.evaluate(({ ipcMain, BrowserWindow }) => {
      ipcMain.removeHandler("workspace:authorizeDelete");
      ipcMain.handle("workspace:authorizeDelete", async () => {
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))?.webContents.send("workspace:deleteCode", "ABCD-EFGH");
        await new Promise<void>(resolve => ipcMain.once("fixture:fail-authorization", () => resolve()));
        throw new Error("Fixture authorization transport failed");
      });
    });
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    const accountFile = join(dirs.userData, DATA_FILES.account);
    const accountBytes = existsSync(accountFile) ? readFileSync(accountFile) : undefined;
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
    const captures: string[] = [];
    const vmChecks: { state: string; open: unknown; busy: unknown; step: unknown; remoteState: unknown; tokenCleared: boolean; codeCleared: boolean }[] = [];
    const cleared = async (state: string) => {
      await expect.poll(() => deletionVm(page)).toMatchObject({ tokenCleared: true, codeCleared: true, busy: false });
      vmChecks.push({ state, ...await deletionVm(page) });
      await l.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))?.webContents.send("workspace:deleteCode", "LATE-CODE");
      });
      await expect.poll(() => deletionVm(page)).toMatchObject({ tokenCleared: true, codeCleared: true, busy: false });
      await expect(page.getByText(/LATE-CODE|GitHub code:/)).toHaveCount(0);
    };
    const capture = async (state: string) => {
      if (!process.env.FOCUS_NOTES_DELETE_REVIEW) return;
      const at = process.env.FOCUS_NOTES_DELETE_REVIEW;
      mkdirSync(at, { recursive: true });
      const image = await l.app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"));
        if (!window) throw new Error("Delete renderer missing");
        return (await window.webContents.capturePage()).toPNG().toString("base64");
      });
      writeFileSync(join(at, `${state}.png`), Buffer.from(image, "base64"));
      writeFileSync(join(at, `${state}-provenance.json`), JSON.stringify({ state: `actual-${state}`, source: "built-invisible-renderer", pid: l.pid, requests, preservedNote: before.toString(), preservedHead: head, sixStateComplete: false }, null, 2));
      captures.push(state);
    };
    const persistence = async () => {
      await quit(l);
      closed = true;
      expect(fakes.stored()).toBe(credentials);
      expect(readFileSync(fakes.gitconfig)).toEqual(gitconfig);
      expect(existsSync(accountFile) ? readFileSync(accountFile) : undefined).toEqual(accountBytes);
      if (cli) {
        expect(readFileSync(join(fakes.root, "session.json"))).toEqual(ghSession);
        expect(readFileSync(join(fakes.env.GH_CONFIG_DIR!, "hosts.yml"))).toEqual(ghConfig);
      }
      for (const entry of readdirSync(dirs.userData, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())) {
        expect(readFileSync(join(entry.parentPath, entry.name)).includes(Buffer.from("EPHEMERAL0123456789abcdef"))).toBe(false);
      }
      expect(l.log.join("\n")).not.toContain("EPHEMERAL0123456789abcdef");
      expect(fakes.argv()).not.toMatch(/setup-git|credential.*approve/);
      expect(fakes.argv()).not.toContain("EPHEMERAL0123456789abcdef");
      if (cli) {
        expect(fakes.argv()).not.toMatch(/"auth","(?:login|logout)"/);
        expect(existsSync(join(fakes.root, "delete-auth.log"))).toBe(false);
      }
      const at = process.env.FOCUS_NOTES_DELETE_REVIEW;
      if (at) {
        const out = join(import.meta.dirname, "..", "out");
        const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
        const rendererHtml = join(out, "renderer", "index.html");
        const entry = /assets\/(index-[^"]+\.js)/.exec(readFileSync(rendererHtml, "utf8"))?.[1];
        if (!entry) throw new Error("Compiled renderer entry was not found");
        const compiled = { main: digest(join(out, "main", "main.mjs")), preload: digest(join(out, "main", "preload.cjs")), renderer: digest(join(out, "renderer", "assets", entry)) };
        for (const state of captures) {
          const file = join(at, `${state}-provenance.json`);
          const receipt = JSON.parse(readFileSync(file, "utf8"));
          writeFileSync(file, JSON.stringify({ ...receipt, compiled, scenario: mode, checks: { sourceOrRecycledBytesAndHead: true, fakeGcmUnchanged: true, gitConfigUnchanged: true, appAccountFileUnchanged: true, appDiskContainsNoGrantToken: true, logsContainNoGrantToken: true, ...(cli ? { fakeParentGhConfigUnchanged: true, fakeParentGhSessionUnchanged: true, ghAuthLoginAndLogoutBlocked: true, ghTemporaryDirectoryCreated: false } : {}) }, vmChecks, pollIntervalsMs: polls.slice(1).map((time, index) => time - polls[index]!), requestChain: requests, grantedRequestChain: grantedRequests }, null, 2));
        }
      }
    };
    const completed = async () => {
      await expect(dialog).toContainText("Repository deleted");
      await cleared("deleted");
      await capture(`deleted-${mode}`);
      expect(existsSync(dirs.docs)).toBe(false);
      expect(readFileSync(join(recycle, "Welcome.md"))).toEqual(before);
      expect(git(recycle, "rev-parse", "HEAD").toString()).toBe(head);
      await dialog.getByRole("button", { name: "Open projects", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${name} is deleted. Its folder is in the Recycle Bin.`, { exact: true })).toBeVisible();
      await persistence();
    };
    if (mode === "current" || mode === "locked") {
      await expect(dialog).toContainText("Deleting repository");
      await expect.poll(() => requests.filter(r => r === "DELETE /repos/ada/notes").length).toBe(1);
      expect(requests.some(r => r.includes("/login/"))).toBe(false);
      await capture(`deleting-${mode}`);
      release?.();
      if (mode === "locked") {
        await expect(dialog).toContainText("still on this computer");
        expect(readFileSync(note)).toEqual(before);
        await capture("partial-local");
        await dialog.getByRole("button", { name: "Retry", exact: true }).click();
      }
      await completed();
      expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
      return;
    } else if (mode === "refused" || mode === "fallback") {
      await expect(dialog).toContainText("GitHub refused deletion");
      await expect(dialog.getByRole("button", { name: "Open on GitHub", exact: true })).toBeVisible();
      expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
      await capture("refused");
      await dialog.getByRole("button", { name: "Open on GitHub", exact: true }).click();
      await expect.poll(() => l.log.some(line => line.includes("https://github.com/ada/notes/settings"))).toBe(true);
      if (mode === "fallback") {
        deleted = true;
        const confirmExternal = dialog.getByRole("button", { name: "I deleted it", exact: true });
        await expect(confirmExternal).toBeVisible({ timeout: 10_000 });
        expect(readFileSync(note)).toEqual(before);
        await confirmExternal.click();
        await completed();
        expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
        return;
      }
    } else if (mode === "partial") {
      await expect(dialog).toContainText("Repository could not be deleted");
      await capture("partial");
      await dialog.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(dialog).toContainText("Repository could not be deleted");
      expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
    } else {
      await expect(dialog).toContainText("Allow deletion once");
      await capture(`stepup-${mode}`);
      if (!device) await dialog.getByRole("textbox", { name: "One-time token", exact: true }).fill("github_pat_EPHEMERAL0123456789abcdef");
      await dialog.getByRole("button", { name: "Authorize once", exact: true }).click();
      if (mode === "transportFailure") {
        await expect.poll(() => deletionVm(page)).toMatchObject({ codeCleared: false, busy: true });
        await expect(dialog).toContainText("GitHub code: ABCD-EFGH");
        await capture("transport-code");
        await l.app.evaluate(({ ipcMain }) => { ipcMain.emit("fixture:fail-authorization"); });
      }
      if (device && mode !== "transportFailure") {
        await expect(dialog).toContainText("GitHub code: ABCD-EFGH");
        await expect(dialog).toContainText("Authorizing deletion");
        expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
        const verification = dialog.getByRole("button", { name: "Open authorization", exact: true });
        await verification.focus();
        await expect(verification).toBeFocused();
        await verification.press("Enter");
        await expect.poll(() => l.log.some(line => line.includes("https://github.com/login/device"))).toBe(true);
        await capture(`device-verification-${mode}`);
        if (mode === "devicePending") {
          await expect.poll(() => polls.length).toBe(2);
          await expect(dialog).toContainText("Authorizing deletion");
          expect(grantedRequests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
          expect(readFileSync(note)).toEqual(before);
          await capture("device-slow-down");
        }
        if (mode === "deviceAbort") {
          await dialog.getByRole("button", { name: "Stop", exact: true }).click();
          await expect(dialog).toBeHidden();
          allowGrant?.();
          await cleared("cancelled");
          expect(grantedRequests).toHaveLength(0);
          expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
          await capture("device-cancelled");
          expect(readFileSync(note)).toEqual(before);
          expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
          await persistence();
          return;
        }
        allowGrant?.();
      }
      if (["declined", "deviceExpired", "mismatch", "loginMismatch", "replacement", "policy", "unavailable", "transportFailure"].includes(mode)) {
        await expect(dialog).toContainText(["declined", "deviceExpired"].includes(mode) ? "Deletion permission not granted" : mode === "policy" ? "GitHub refused deletion" : mode === "unavailable" || mode === "transportFailure" ? "Repository could not be deleted" : "The project or GitHub account changed");
        if (["mismatch", "loginMismatch", "replacement"].includes(mode)) {
          await expect(dialog).toContainText("Deletion stopped");
          await expect(dialog).toContainText("Reopen Delete project to check the target again.");
          await expect(dialog).not.toContainText(/GitHub refused|Ask a repository admin/);
        }
        if (mode === "policy") await expect(dialog).toContainText("Ask a repository admin");
        expect(grantedRequests.filter(r => r.startsWith("DELETE "))).toHaveLength(mode === "policy" ? 1 : 0);
        expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(mode === "policy" ? 2 : 1);
        if (mode === "replacement") expect(grantedRequests).toContain("GET /repos/ada/notes");
        await expect(dialog.getByRole("textbox", { name: "One-time token", exact: true })).toHaveCount(0);
        await cleared(mode);
        if (mode === "deviceExpired") await expect(dialog.getByRole("button", { name: "Open authorization", exact: true })).toHaveCount(0);
        await capture(mode);
      } else {
        await expect.poll(() => requests.filter(r => r === "DELETE /repos/ada/notes").length, { timeout: mode === "devicePending" ? 10_000 : 5_000 }).toBe(2);
        if (mode === "devicePending") {
          expect(polls).toHaveLength(3);
          expect(polls[2]! - polls[1]!).toBeGreaterThanOrEqual(6_000);
        }
        await expect(dialog).toContainText("Deleting repository");
        await capture(`deleting-${mode}`);
        expect(readFileSync(note)).toEqual(before);
        release?.();
        await completed();
        return;
      }
    }
    expect(readFileSync(note)).toEqual(before);
    expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
    if (mode === "refused") {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    } else await dialog.getByRole("button", { name: "Keep project", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(readFileSync(note)).toEqual(before);
    await persistence();
  } finally {
    allowGrant?.();
    release?.();
    if (!closed) await quit(l);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("D-394: actual in-app DELETE refusal keeps disposable bytes and offers GitHub fallback", () => actualDeletion("refused"));
for (const mode of ["partial", "oauth", "declined", "devicePending", "deviceExpired", "deviceAbort", "transportFailure", "memory", "ghblocked", "mismatch", "loginMismatch", "replacement", "policy", "unavailable", "fallback", "current", "locked"] as const) {
  test(`D-400: actual ${mode} authorization and verification preserve disposable bytes`, () => actualDeletion(mode));
}