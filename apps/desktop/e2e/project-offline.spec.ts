/**
 * A project New project made (owner's report, 7 November; D-pending): its own Git repository with
 * notes/, no `.focus-notes/workspace.json` and no remote. Delete project reaches its first confirmation
 * (owner, 17:48: "It doesn't even reach the first dialog asking me to confirm if I want to delete."),
 * also when creating its GitHub repository failed, and the Backup card never claims a backup to GitHub
 * for commits that only exist on this computer.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { makeFakes } from "../test/fakes/fakes.ts";
import { DATA_FILES } from "@focus-notes/core/inventory";
import messages from "../../../packages/views/messages/en.json" with { type: "json" };

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const UNAVAILABLE = "Couldn't check this project, so nothing was deleted. Try again.";

function deletionBuild() {
  const out = join(import.meta.dirname, "..", "out");
  const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const entry = /assets\/(index-[^"]+\.js)/.exec(readFileSync(join(out, "renderer", "index.html"), "utf8"))?.[1];
  if (!entry) throw new Error("Compiled renderer entry was not found");
  return { main: digest(join(out, "main", "main.mjs")), preload: digest(join(out, "main", "preload.cjs")), renderer: digest(join(out, "renderer", "assets", entry)) };
}

async function lockFixtureFile(path: string) {
  const child = spawn("pwsh", ["-NoProfile", "-Command", "$file = [System.IO.File]::Open($env:FOCUS_NOTES_LOCK_FILE, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None); try { [Console]::WriteLine('LOCKED'); [Console]::In.ReadLine() | Out-Null } finally { $file.Dispose() }"], {
    windowsHide: true, env: { ...process.env, FOCUS_NOTES_LOCK_FILE: path }, stdio: ["pipe", "pipe", "pipe"],
  });
  if (child.pid && process.env.FOCUS_NOTES_E2E_PID_LOG) appendFileSync(process.env.FOCUS_NOTES_E2E_PID_LOG, `${child.pid}\n`);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Fixture file lock did not become ready")); }, 10_000);
    child.stdout.on("data", data => { if (data.toString().includes("LOCKED")) { clearTimeout(timer); resolve(); } });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture file lock exited before release: ${code}`)); });
  });
  return async () => {
    const exited = new Promise<void>((resolve, reject) => {
      child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture file lock failed: ${code}`)));
    });
    child.stdin.end("\n");
    await exited;
  };
}

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

/** Observe the real command's settlement and read its VM, without a production port or secret values. */
async function deletionVm(page: Page, observeOperation = false, command = "project.deleteAuthorize") {
  return page.evaluate(({ observe, command }) => {
    interface Fiber {
      child?: Fiber;
      sibling?: Fiber;
      stateNode?: { current?: Fiber };
      memoizedProps?: {
        app?: {
          store: { state: unknown };
          viewModels: { select: (id: string, state: unknown) => unknown };
          commands: { run: (id: string, args?: Record<string, unknown>) => Promise<unknown> };
        };
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
        const observation = window as Window & { deleteOperationSettled?: boolean };
        if (observe) {
          const original = app.commands.run;
          observation.deleteOperationSettled = false;
          const observed = async (id: string, args?: Record<string, unknown>) => {
            if (id !== command) return original.call(app.commands, id, args);
            try { return await original.call(app.commands, id, args); }
            finally {
              observation.deleteOperationSettled = true;
              if (app.commands.run === observed) app.commands.run = original;
            }
          };
          app.commands.run = observed;
        }
        const vm = app.viewModels.select("vm.projectDelete", app.store.state);
        if (!vm || typeof vm !== "object") throw new Error("Deletion VM was not found");
        const fields = vm as Record<string, unknown>;
        const state = app.store.state as { note?: { path?: string } };
        return { open: fields.open, busy: fields.busy, step: fields.step, problem: fields.problem, remoteState: fields.remoteState, tokenCleared: fields.remoteToken === "", codeCleared: fields.remoteCode === "", operationSettled: observation.deleteOperationSettled, notePath: state.note?.path };
      }
      if (current.child) queue.push(current.child);
      if (current.sibling) queue.push(current.sibling);
    }
    throw new Error("Mounted app props were not found");
  }, { observe: observeOperation, command });
}

/** Synthetic Recycle Bin and folder picker; records only counts and Node error codes, never a path. */
async function installDeleteFakes(l: Launched, paths: { folder: string; recycle: string; locked: boolean; copyParent?: string }) {
  await l.app.evaluate(({ dialog, shell }, paths) => {
    const record = { trashCalls: 0, foreignTrash: 0, trashErrors: [] as string[], pickerCalls: 0 };
    (globalThis as { deleteFixtureRecord?: typeof record }).deleteFixtureRecord = record;
    if (paths.copyParent) dialog.showOpenDialog = async () => { record.pickerCalls++; return { canceled: false, filePaths: [paths.copyParent!] }; };
    const fs = process.getBuiltinModule("fs").promises;
    let attempts = 0;
    shell.trashItem = async path => {
      record.trashCalls++;
      if (path !== paths.folder) { record.foreignTrash++; throw new Error("Refused foreign fixture folder"); }
      if (paths.locked && attempts++ === 0) throw new Error("Fixture file in use");
      try { await fs.rename(path, paths.recycle); }
      catch (error) { record.trashErrors.push(String((error as { code?: unknown }).code ?? "unknown")); throw error; }
    };
  }, paths);
}

/** Main-process failures, reduced to IPC channel names, Node error codes and fixed messages. */
const NODE_CODES = ["EPERM", "EBUSY", "ENOENT", "EACCES", "EEXIST", "EXDEV", "ENOTEMPTY", "EISDIR", "ENOTDIR", "EMFILE", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET"];
const MAIN_MESSAGES = ["Choose a folder outside the project", "Invalid preservation path", "The note changed during preservation", "Not this project's repository", "Invalid local deletion", "Private project retention could not be restored", "Private project history could not be preserved safely"];
function mainFailures(log: string[]) {
  const channels = new Set<string>(), codes = new Set<string>(), known = new Set<string>();
  for (const line of log) {
    const channel = /Error occurred in handler for '([A-Za-z]+:[A-Za-z]+)'/.exec(line)?.[1];
    if (channel) channels.add(channel);
    for (const code of NODE_CODES) if (new RegExp(`\\b${code}\\b`).test(line)) codes.add(code);
    for (const message of MAIN_MESSAGES) if (line.includes(message)) known.add(message);
  }
  return { channels: [...channels].sort(), codes: [...codes].sort(), messages: [...known].sort() };
}

/** The project's own files at failure, as a count and a boolean: did the app write into the project mid-flow? */
function projectWrites(folder: string, note: string, before: Buffer) {
  try {
    if (!existsSync(folder)) return { folderPresent: false };
    const status = git(folder, "status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=all").toString().split("\n").filter(Boolean).length;
    return { folderPresent: true, changedEntries: status, noteUnchanged: existsSync(note) && readFileSync(note).equals(before) };
  } catch { return { unavailable: "project state could not be read" }; }
}

async function attachDeleteFailure(l: Launched, project?: ReturnType<typeof projectWrites>) {
  const { page } = l;
  const testInfo = test.info();
  const templates = Object.entries(messages)
    .filter(([key]) => key.startsWith("project.delete.") || ["commit.retry", "project.back", "dialog.close"].includes(key))
    .filter(([, text]) => !text.replace(/\{[A-Za-z]+\}/g, "").includes("{"))
    .map(([, text]) => ({
      pattern: "^" + text.split(/\{[A-Za-z]+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*?") + "$",
      text: text.replace(/\{[A-Za-z]+\}/g, "[redacted]"),
    }));
  let diagnostic: unknown = { unavailable: "page closed" };
  if (!page.isClosed()) {
    try {
      const vm = await deletionVm(page);
      const visible = await page.evaluate(templates => {
        const sanitize = (text: string) => templates.find(template => new RegExp(template.pattern).test(text.trim()))?.text ?? "[unrecognized text redacted]";
        const shown = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
        const dialog = document.getElementById("projectDelete");
        return {
          dialogVisible: Boolean(dialog && shown(dialog)),
          statuses: [...(dialog?.querySelectorAll('[role="status"]') ?? [])].filter(shown).map(element => sanitize(element.textContent ?? "")),
          alerts: [...document.querySelectorAll('[role="alert"]')].filter(shown).map(element => sanitize(element.textContent ?? "")),
          buttons: [...(dialog?.querySelectorAll("button") ?? [])].filter(shown).map(button => ({
            text: sanitize(button.textContent || button.getAttribute("aria-label") || ""),
            enabled: !button.disabled && button.getAttribute("aria-disabled") !== "true",
          })),
        };
      }, templates);
      diagnostic = {
        step: ["consequences", "unsynced", "confirm", "github", "inApp", "progress", "stopped"].includes(String(vm.step)) ? vm.step : "unavailable",
        busy: vm.busy === true,
        problem: ["", "offline", "signin", "notAdmin", "policy", "rateLimit", "window", "gone", "partialLocal"].includes(String(vm.problem)) ? vm.problem : "unavailable",
        remoteState: ["stepup", "deleting", "deleted", "declined", "partial", "refused"].includes(String(vm.remoteState)) ? vm.remoteState : "unavailable",
        tokenCleared: vm.tokenCleared,
        codeCleared: vm.codeCleared,
        ...visible,
      };
    } catch {
      console.error("Delete failure diagnostics could not read the mounted state.");
      diagnostic = { unavailable: "mounted state could not be read" };
    }
  }
  let fixture: unknown = { unavailable: "app closed" };
  try {
    const r = await l.app.evaluate(() => (globalThis as { deleteFixtureRecord?: { trashCalls: number; foreignTrash: number; trashErrors: string[]; pickerCalls: number } }).deleteFixtureRecord);
    fixture = r ? { trashCalls: r.trashCalls, foreignTrash: r.foreignTrash, trashErrors: r.trashErrors.map(code => NODE_CODES.includes(code) ? code : "other"), pickerCalls: r.pickerCalls } : { unavailable: "not installed" };
  } catch { fixture = { unavailable: "app closed" }; }
  // A file in the test's output folder, which CI keeps with test-results/ (a body attachment it drops).
  const file = testInfo.outputPath("delete-failure-state.json");
  writeFileSync(file, JSON.stringify({ ...(diagnostic as object), fixture, main: mainFailures(l.log), ...(project ? { project } : {}) }, null, 2));
  await testInfo.attach("delete-failure-state", { path: file, contentType: "application/json" });
}

async function deletionGeometry(page: Page) {
  const dialog = page.getByRole("dialog", { name: /^Delete .+\?$/ });
  await expect(dialog).toBeVisible();
  const dimensions = await dialog.evaluate(element => {
    const root = document.querySelector<HTMLElement>("[data-app-root]");
    const body = element.querySelector<HTMLElement>("[data-dialog-body]");
    const footer = element.querySelector<HTMLElement>("[data-dialog-last]");
    if (!root || !body || !footer) throw new Error("Delete geometry regions were not found");
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    return { root: box(root), dialog: box(element), footer: box(footer), bodyOverflow: body.scrollWidth - body.clientWidth, needsScroll: body.scrollHeight > body.clientHeight + 1, buttons: [...footer.querySelectorAll("button")].filter(button => button.getClientRects().length).map(box) };
  });
  expect(dimensions.root.width).toBe(320);
  expect(dimensions.dialog.left).toBeGreaterThanOrEqual(dimensions.root.left);
  expect(dimensions.dialog.right).toBeLessThanOrEqual(dimensions.root.right);
  expect(dimensions.footer.bottom).toBeLessThanOrEqual(dimensions.root.bottom);
  expect(dimensions.bodyOverflow).toBeLessThanOrEqual(1);
  for (const button of dimensions.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(dimensions.dialog.left);
    expect(button.right).toBeLessThanOrEqual(dimensions.dialog.right);
    expect(button.bottom).toBeLessThanOrEqual(dimensions.root.bottom);
  }
  expect(dimensions.buttons.at(-1)!.right).toBeGreaterThan(dimensions.dialog.left + dimensions.dialog.width / 2);
  const body = dialog.locator("[data-dialog-body]");
  await body.focus();
  await body.press("Home");
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0);
  const beforeEnd = await body.evaluate(element => element.scrollTop);
  if (dimensions.needsScroll) {
    await body.press("End");
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  }
  const afterEnd = await body.evaluate(element => element.scrollTop);
  await page.keyboard.press("Tab");
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  const footer = await dialog.locator("[data-dialog-last]").boundingBox();
  expect(footer!.y).toBeCloseTo(dimensions.footer.top, 0);
  await body.focus();
  await body.press("Home");
  if (dimensions.needsScroll) await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0);
  return { ...dimensions, scroll: { beforeEnd, afterEnd, afterHome: await body.evaluate(element => element.scrollTop) } };
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

async function actualDeletion(mode: "refused" | "partial" | "oauth" | "declined" | "devicePending" | "deviceExpired" | "deviceAbort" | "deviceAccountMismatch" | "deviceSourceReplacement" | "deviceProjectSwitch" | "transportFailure" | "memory" | "ghblocked" | "mismatch" | "loginMismatch" | "replacement" | "policy" | "unavailable" | "fallback" | "current" | "locked", narrowDark = false, height = 672) {
  const device = mode.startsWith("device") || ["oauth", "declined", "transportFailure"].includes(mode);
  const restart = ["deviceAbort", "deviceExpired", "transportFailure", "loginMismatch", "replacement", "policy", "unavailable", "deviceAccountMismatch"].includes(mode);
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
  const oldDraft = mode === "deviceProjectSwitch" ? join(dirs.docs, "notes", "Draft.md") : undefined;
  const oldDraftBytes = Buffer.from("# Uncommitted draft\n\nKeep these words in the old project.\n");
  if (oldDraft) {
    writeFileSync(oldDraft, oldDraftBytes);
    appendFileSync(join(dirs.docs, ".git", "info", "exclude"), "\n/notes/Draft.md\n");
  }
  if (narrowDark) writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, appearance: "dark" }));
  const before = readFileSync(note);
  const head = git(dirs.docs, "rev-parse", "HEAD").toString();
  const otherProject = mode === "deviceProjectSwitch" ? newProject() : undefined;
  if (otherProject) {
    mkdirSync(join(otherProject.docs, ".focus-notes"));
    writeFileSync(join(otherProject.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1, "templateVersion": "0.0.0" }');
    git(otherProject.docs, "add", "-A");
    git(otherProject.docs, "commit", "-qm", "Mark disposable project");
  }
  const otherBytes = otherProject ? readFileSync(join(otherProject.docs, "Welcome.md")) : undefined;
  const otherHead = otherProject ? git(otherProject.docs, "rev-parse", "HEAD").toString() : undefined;
  const originalProject = join(dirs.userData, "original-project");
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
    if (req.url === "/user") return send(200, { id: ["mismatch", "deviceAccountMismatch"].includes(mode) && req.headers.authorization?.includes("EPHEMERAL") ? 2 : 1, login: mode === "loginMismatch" && req.headers.authorization?.includes("EPHEMERAL") ? "grace" : "ada", name: "Ada" });
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
  const environment = {
    ...fakes.env,
    FOCUS_NOTES_GITHUB_API: `http://127.0.0.1:${address.port}`,
    FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}`,
    FOCUS_NOTES_GIT_REMOTES: remotes, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes,
    ...(device ? { FOCUS_NOTES_GITHUB_OAUTH_CLIENT_ID: "focus-notes-test" } : {}),
  };
  const l = await launch(dirs, environment);
  let closed = false;
  try {
    const recycle = join(dirs.userData, "recycled-project");
    await installDeleteFakes(l, { folder: dirs.docs, recycle, locked: mode === "locked" });
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
    if (narrowDark) {
      await l.app.evaluate(({ BrowserWindow }, height) => {
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"));
        if (window && process.env.FOCUS_NOTES_E2E === "1") window.setOpacity(0);
        if (!window || window.getOpacity() !== 0) throw new Error("Narrow Delete geometry requires the owned invisible app");
        window.setMinimumSize(352, 480);
        window.setContentSize(352, height);
      }, height);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
      await expect.poll(() => page.locator("[data-app-root]").evaluate(element => element.getBoundingClientRect().width)).toBe(320);
    }
    const accountFile = join(dirs.userData, DATA_FILES.account);
    const accountBytes = existsSync(accountFile) ? readFileSync(accountFile) : undefined;
    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await expect(dialog).toBeVisible();
    const sections = narrowDark ? await dialog.locator("[data-section]").evaluateAll(elements => elements.map(element => {
      const header = element.querySelector<HTMLElement>(":scope > [data-section-header]");
      const body = element.querySelector<HTMLElement>(":scope > [data-section-body]");
      if (!header || !body) throw new Error("Delete Section header/body grouping is missing");
      return { headingBottom: header.getBoundingClientRect().bottom, bodyTop: body.getBoundingClientRect().top, pairGap: parseFloat(getComputedStyle(header).gap), headingGap: parseFloat(getComputedStyle(element).gap), itemGap: parseFloat(getComputedStyle(body).gap) };
    })) : undefined;
    if (sections) {
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section.headingBottom).toBeLessThan(section.bodyTop);
        expect(section.pairGap).toBeGreaterThan(0);
        expect(section.headingGap).toBeGreaterThan(section.pairGap);
        expect(section.itemGap).toBeGreaterThanOrEqual(section.headingGap);
      }
    }
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    const field = dialog.getByRole("textbox", { name: /^Type .+ to confirm$/ });
    await expect(field).toBeVisible();
    const name = (await dialog.getByRole("heading", { name: /^Delete .+\?$/ }).innerText()).replace(/^Delete /, "").replace(/\?$/, "");
    if (!name) throw new Error("Delete confirmation did not name its target");
    await field.fill(name);
    await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
    const captures: string[] = [];
    let startupEvidence: unknown;
    const vmChecks: { state: string; open: unknown; busy: unknown; step: unknown; remoteState: unknown; tokenCleared: boolean; codeCleared: boolean }[] = [];
    const cleared = async (state: string) => {
      if ((await deletionVm(page)).operationSettled !== undefined) await expect.poll(() => deletionVm(page)).toMatchObject({ operationSettled: true });
      await expect.poll(() => deletionVm(page)).toMatchObject({ tokenCleared: true, codeCleared: true, busy: false });
      vmChecks.push({ state, ...await deletionVm(page) });
      await l.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))?.webContents.send("workspace:deleteCode", "LATE-CODE");
      });
      await expect.poll(() => deletionVm(page)).toMatchObject({ tokenCleared: true, codeCleared: true, busy: false });
      await expect(page.getByText(/LATE-CODE|GitHub code:/)).toHaveCount(0);
    };
    const capture = async (state: string) => {
      const geometry = narrowDark && await dialog.isVisible() ? await deletionGeometry(page) : undefined;
      if (geometry && height === 480 && state === "device-verification-devicePending") {
        expect(geometry.root.height).toBe(448);
        expect(geometry.needsScroll).toBe(true);
      }
      if (!process.env.FOCUS_NOTES_DELETE_REVIEW) return;
      const at = process.env.FOCUS_NOTES_DELETE_REVIEW;
      mkdirSync(at, { recursive: true });
      const image = await l.app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"));
        if (!window) throw new Error("Delete renderer missing");
        return (await window.webContents.capturePage()).toPNG().toString("base64");
      });
      writeFileSync(join(at, `${state}.png`), Buffer.from(image, "base64"));
      writeFileSync(join(at, `${state}-provenance.json`), JSON.stringify({ state: `actual-${state}`, source: "built-invisible-renderer", compiled: deletionBuild(), pid: l.pid, requests, preservedNote: before.toString(), preservedHead: head, vm: await deletionVm(page), ...(geometry ? { geometry, sections, context: "dark-320px" } : {}), ...(otherProject ? { expectedProjectFolder: otherProject.docs, startupEvidence } : {}), sixStateComplete: false }, null, 2));
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
      if (restart) {
        const beforeRestart = requests.filter(r => r.startsWith("DELETE ")).length;
        const again = await launch(dirs, environment);
        try {
          await expect(again.page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
          await reachesFirstConfirmation(again.page, "linked");
          await expect.poll(() => deletionVm(again.page)).toMatchObject({ step: "consequences", tokenCleared: true, codeCleared: true, busy: false });
          vmChecks.push({ state: "restarted", ...await deletionVm(again.page) });
          expect(requests.filter(r => r.startsWith("DELETE "))).toHaveLength(beforeRestart);
          expect(readFileSync(note)).toEqual(before);
          expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
          expect(again.log.join("\n")).not.toContain("EPHEMERAL0123456789abcdef");
        } finally { await quit(again); }
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
        const compiled = deletionBuild();
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
      await deletionVm(page, true);
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
          await expect.poll(() => page.evaluate(async () => {
            const bridge = (window as Window & { focusNotes: { workspace: { openDeleteAuthorization: () => Promise<void> } } }).focusNotes;
            try { await bridge.workspace.openDeleteAuthorization(); return false; } catch { return true; }
          })).toBe(true);
          await cleared("cancelled");
          expect(grantedRequests).toHaveLength(0);
          expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
          await capture("device-cancelled");
          expect(readFileSync(note)).toEqual(before);
          expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
          await persistence();
          return;
        }
        if (mode === "deviceAccountMismatch" || mode === "deviceSourceReplacement" || mode === "deviceProjectSwitch") {
          await expect.poll(() => polls.length).toBe(1);
          await expect(dialog).toContainText("Authorizing deletion");
          expect(readFileSync(note)).toEqual(before);
          expect(grantedRequests).toHaveLength(0);
        }
        if (mode === "deviceSourceReplacement") {
          renameSync(dirs.docs, originalProject);
          cpSync(originalProject, dirs.docs, { recursive: true });
          expect(readFileSync(join(originalProject, "Welcome.md"))).toEqual(before);
          expect(git(originalProject, "rev-parse", "HEAD").toString()).toBe(head);
        }
        if (mode === "deviceProjectSwitch") {
          if (!otherProject || !oldDraft) throw new Error("Replacement project fixture was not created");
          await l.app.evaluate(({ dialog }, folder) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
          }, otherProject.docs);
          const switched = await page.evaluate(async () => {
            const bridge = (window as Window & { focusNotes: { firstRun: { openFolder: () => Promise<{ ok: boolean }>; openWorkspace: () => Promise<{ ok: boolean }> } } }).focusNotes;
            if (!(await bridge.firstRun.openFolder())?.ok) throw new Error("Disposable project admission failed");
            return (await bridge.firstRun.openWorkspace()).ok;
          });
          expect(switched).toBe(true);
          await expect(dialog).toBeHidden();
          await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
          allowGrant?.();
          await expect.poll(() => page.evaluate(async () => {
            const bridge = (window as Window & { focusNotes: { workspace: { openDeleteAuthorization: () => Promise<void> } } }).focusNotes;
            try { await bridge.workspace.openDeleteAuthorization(); return false; } catch { return true; }
          })).toBe(true);
          await cleared("switched-project");
          const startup = await page.evaluate(async () => {
            const bridge = (window as Window & { focusNotes: {
              windows: { initialNote?: string; initialOpen?: boolean; secondary?: boolean };
              projects: { lastNote: () => Promise<string | undefined> };
              loadAppState: () => Promise<{ lastNotePath?: string }>;
              workspace: { info: () => Promise<unknown> };
            } }).focusNotes;
            return { windows: { initialNote: bridge.windows.initialNote, initialOpen: bridge.windows.initialOpen, secondary: bridge.windows.secondary },
              lastNote: await bridge.projects.lastNote(), appState: await bridge.loadAppState(), workspace: await bridge.workspace.info() };
          });
          const profile = await l.app.evaluate(async (_electron, folderName) => {
            const fs = process.getBuiltinModule("fs").promises;
            const path = process.getBuiltinModule("path");
            const folderFile = path.join(process.env.FOCUS_NOTES_USER_DATA!, folderName);
            return { configuredNote: process.env.FOCUS_NOTES_PROJECT_NOTE, folderFile,
              projectFolder: await fs.readFile(folderFile, "utf8").catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return undefined;
                throw error;
              }) };
          }, DATA_FILES.projectFolder);
          startupEvidence = { startup, profile, expected: otherProject.docs };
          console.log("Project-switch startup evidence", JSON.stringify(startupEvidence));
          const writer = page.getByRole("textbox", { name: "Note", exact: true });
          await expect(writer).toBeFocused();
          await capture("project-before-writing");
          await expect.poll(async () => (await deletionVm(page)).notePath?.toLowerCase().startsWith(otherProject.docs.toLowerCase() + "\\")).toBe(true);
          expect(grantedRequests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
          expect(readFileSync(note)).toEqual(before);
          expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
          expect(readFileSync(oldDraft)).toEqual(oldDraftBytes);
          expect(readFileSync(join(otherProject.docs, "Welcome.md"))).toEqual(otherBytes);
          expect(git(otherProject.docs, "rev-parse", "HEAD").toString()).toBe(otherHead);
          await writer.press("Control+End");
          await writer.press("Enter");
          await writer.pressSequentially("Writing in the replacement project.");
          await expect.poll(() => readdirSync(join(otherProject.docs, "notes")).some(file => file.endsWith(".md") && readFileSync(join(otherProject.docs, "notes", file), "utf8").includes("Writing in the replacement project."))).toBe(true);
          expect(readFileSync(note)).toEqual(before);
          expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
          expect(readFileSync(oldDraft)).toEqual(oldDraftBytes);
          expect(readFileSync(join(otherProject.docs, "Welcome.md"))).toEqual(otherBytes);
          git(otherProject.docs, "merge-base", "--is-ancestor", otherHead!.trim(), "HEAD");
          await capture("project-switched");
          await persistence();
          return;
        }
        allowGrant?.();
      }
      if (["declined", "deviceExpired", "deviceAccountMismatch", "deviceSourceReplacement", "mismatch", "loginMismatch", "replacement", "policy", "unavailable", "transportFailure"].includes(mode)) {
        await expect(dialog).toContainText(["declined", "deviceExpired"].includes(mode) ? "Deletion permission not granted" : mode === "policy" ? "GitHub refused deletion" : mode === "unavailable" || mode === "transportFailure" ? "Repository could not be deleted" : "The project or GitHub account changed");
        if (["mismatch", "loginMismatch", "replacement", "deviceAccountMismatch", "deviceSourceReplacement"].includes(mode)) {
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
    if (mode === "deviceSourceReplacement") {
      expect(readFileSync(join(originalProject, "Welcome.md"))).toEqual(before);
      expect(git(originalProject, "rev-parse", "HEAD").toString()).toBe(head);
    }
    if (mode === "refused") {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    } else await dialog.getByRole("button", { name: "Keep project", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(readFileSync(note)).toEqual(before);
    await persistence();
  } catch (error) {
    await attachDeleteFailure(l, projectWrites(dirs.docs, note, before));
    throw error;
  } finally {
    allowGrant?.();
    release?.();
    if (!closed) await quit(l);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("D-394: actual in-app DELETE refusal keeps disposable bytes and offers GitHub fallback", () => actualDeletion("refused"));
for (const mode of ["partial", "oauth", "declined", "devicePending", "deviceExpired", "deviceAbort", "deviceAccountMismatch", "deviceSourceReplacement", "deviceProjectSwitch", "transportFailure", "memory", "ghblocked", "mismatch", "loginMismatch", "replacement", "policy", "unavailable", "fallback", "current", "locked"] as const) {
  test(`D-400: actual ${mode} authorization and verification preserve disposable bytes`, () => actualDeletion(mode));
}

for (const mode of ["current", "declined", "partial", "refused"] as const) {
  test(`D-400: actual dark narrow ${mode} keeps Delete body focus and footer within 320px`, () => actualDeletion(mode, true));
}
test("D-400: actual dark short device flow scrolls its body without moving the footer or Section grouping", () => actualDeletion("devicePending", true, 480));

for (const mode of ["allSelected", "privateStepup", "keepPrivate", "keepPrivateRetry", "keepPrivateForeign", "keepPrivateShared", "keepPrivateLinked", "exportFailure", "exportReadFailure", "exportChanged"] as const) {
  test(`D-400: actual ${mode} preserves public private and unpushed copies`, async () => {
    const unsafePrivate = ["keepPrivateForeign", "keepPrivateShared", "keepPrivateLinked"].includes(mode);
    const dirs = newProject();
    const fakes = makeFakes({ gcm: true, token: "ghp_DELETE0123456789abcdefTOKEN" });
    fakes.store("ghp_DELETE0123456789abcdefTOKEN");
    const credentials = fakes.stored();
    const config = readFileSync(fakes.gitconfig);
    const remotes = join(dirs.userData, "remotes");
    const privateOrigin = join(dirs.userData, "private-origin");
    mkdirSync(join(privateOrigin, "notes"), { recursive: true });
    git(privateOrigin, "init", "-qb", "main");
    writeFileSync(join(privateOrigin, "notes", "Private.md"), "# Private fixture\n\nOnly synthetic private bytes.\n");
    git(privateOrigin, "add", "-A");
    git(privateOrigin, "commit", "-qm", "Private fixture");
    mkdirSync(join(remotes, "ada"), { recursive: true });
    for (const name of ["notes", "notes-private"]) execFileSync("git", ["init", "-q", "--bare", join(remotes, "ada", `${name}.git`)]);
    git(privateOrigin, "remote", "add", "origin", join(remotes, "ada", "notes-private.git"));
    git(privateOrigin, "push", "-qu", "origin", "main");
    git(dirs.docs, "-c", "protocol.file.allow=always", "submodule", "add", "-b", "main", join(remotes, "ada", "notes-private.git"), "private");
    git(dirs.docs, "add", "-A");
    git(dirs.docs, "commit", "-qm", "Track disposable private fixture");
    git(dirs.docs, "remote", "add", "origin", join(remotes, "ada", "notes.git"));
    git(dirs.docs, "push", "-qu", "origin", "main");
    writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nPublic unpushed fixture.\n");
    writeFileSync(join(dirs.docs, "private", "notes", "Private.md"), "# Private fixture\n\nPrivate unpushed fixture.\n");
    for (const folder of [dirs.docs, join(dirs.docs, "private")]) {
      git(folder, "add", "-A");
      git(folder, "commit", "-qm", "Keep disposable unpushed bytes");
      git(folder, "config", "remote.origin.pushurl", join(dirs.userData, "unavailable-push.git"));
    }
    let privateMetadata = join(dirs.docs, ".git", "modules", "private");
    if (mode === "keepPrivateForeign") {
      const foreign = join(dirs.userData, "foreign-private-metadata");
      renameSync(privateMetadata, foreign);
      privateMetadata = foreign;
      git(dirs.docs, "config", "--file", join(foreign, "config"), "core.worktree", join(dirs.docs, "private"));
      renameSync(join(dirs.docs, "private", ".git"), join(dirs.userData, "original-private-pointer"));
      writeFileSync(join(dirs.docs, "private", ".git"), `gitdir: ${foreign}\n`);
    } else if (mode === "keepPrivateShared") {
      const objects = join(dirs.userData, "shared-private-objects");
      mkdirSync(objects);
      writeFileSync(join(privateMetadata, "objects", "info", "alternates"), objects);
    } else if (mode === "keepPrivateLinked") {
      git(dirs.docs, "config", "--file", join(privateMetadata, "config"), "core.worktree", join(dirs.docs, "private"));
      renameSync(join(dirs.docs, "private", ".git"), join(dirs.userData, "original-private-pointer"));
      symlinkSync(privateMetadata, join(dirs.docs, "private", ".git"), process.platform === "win32" ? "junction" : "dir");
    }
    const privateConfig = readFileSync(join(privateMetadata, "config"));
    const pointerBytes = () => mode === "keepPrivateLinked" ? Buffer.from(readlinkSync(join(dirs.docs, "private", ".git"))) : readFileSync(join(dirs.docs, "private", ".git"));
    const privatePointer = pointerBytes();
    const publicBytes = readFileSync(join(dirs.docs, "Welcome.md"));
    const privateBytes = readFileSync(join(dirs.docs, "private", "notes", "Private.md"));
    const draft = mode.startsWith("keepPrivate") ? Buffer.from("# Private draft fixture\n\nUncommitted synthetic bytes.\n") : undefined;
    if (draft) writeFileSync(join(dirs.docs, "private", "notes", "Draft.md"), draft);
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    let gitEvidence: { cwd: string; expectedHead: string; expectedPrivateSha256: string; expectedDraftSha256?: string; actualDraftSha256?: string; actualDraft?: string; commands: { args: string[]; stdout?: string; stdoutSha256?: string }[] } | undefined;
    const head = git(dirs.docs, "rev-parse", "HEAD").toString();
    const privateHead = git(join(dirs.docs, "private"), "rev-parse", "HEAD").toString();
    const requests: string[] = [];
    const originalEvidence = () => ({
      publicHead: git(dirs.docs, "rev-parse", "HEAD").toString(),
      privateHead: git(join(dirs.docs, "private"), "rev-parse", "HEAD").toString(),
      pointer: pointerBytes().toString("utf8"),
      pointerSha256: hash(pointerBytes()),
      expectedPointerSha256: hash(privatePointer),
      config: readFileSync(join(privateMetadata, "config")).toString("utf8"),
      configSha256: hash(readFileSync(join(privateMetadata, "config"))),
      expectedConfigSha256: hash(privateConfig),
      privateNoteSha256: hash(readFileSync(join(dirs.docs, "private", "notes", "Private.md"))),
      draft: draft ? readFileSync(join(dirs.docs, "private", "notes", "Draft.md")).toString("utf8") : undefined,
      draftSha256: draft ? hash(readFileSync(join(dirs.docs, "private", "notes", "Draft.md"))) : undefined,
      ownedStaging: readdirSync(join(dirs.docs, ".git")).filter(name => name.startsWith("focus-notes-private-retention-")),
      publicDeletes: requests.filter(r => r === "DELETE /repos/ada/notes").length,
      privateDeletes: requests.filter(r => r === "DELETE /repos/ada/notes-private").length,
    });
    let sourcePreservationEvidence: ReturnType<typeof originalEvidence> | undefined;
    const deleted = new Set<string>();
    const server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      const send = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json", "X-OAuth-Scopes": mode === "privateStepup" && !req.headers.authorization?.includes("EPHEMERAL") ? "repo" : "repo, delete_repo" }); res.end(JSON.stringify(body)); };
      if (req.url === "/user") return send(200, { id: 1, login: "ada", name: "Ada" });
      if (req.url === "/user/repos?affiliation=owner&sort=pushed&per_page=100") return send(200, []);
      if (req.url === "/repos/ada/notes" || req.url === "/repos/ada/notes-private") {
        if (req.method === "DELETE" && req.url.endsWith("-private") && mode === "privateStepup" && !req.headers.authorization?.includes("EPHEMERAL")) return send(403, { message: "Forbidden" });
        if (req.method === "DELETE") { deleted.add(req.url); res.writeHead(204); res.end(); return; }
        return deleted.has(req.url) ? send(404, { message: "Not found" }) : send(200, { id: req.url.endsWith("-private") ? 84 : 42, name: req.url.endsWith("-private") ? "notes-private" : "notes", owner: { login: "ada", type: "User" }, default_branch: "main", permissions: { admin: true, push: true } });
      }
      send(404, { message: "Not found" });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Preservation server did not bind");
    const copyParent = join(dirs.userData, "exports");
    const recycle = join(dirs.userData, "recycled-project");
    if (mode === "exportFailure") writeFileSync(copyParent, "Fixture is a file, not a copy destination");
    else mkdirSync(copyParent);
    const l = await launch(dirs, { ...fakes.env, FOCUS_NOTES_GITHUB_API: `http://127.0.0.1:${address.port}`, FOCUS_NOTES_GIT_REMOTES: remotes });
    let closed = false;
    let unlock: (() => Promise<void>) | undefined;
    try {
      await installDeleteFakes(l, { copyParent, folder: dirs.docs, recycle, locked: mode === "keepPrivateRetry" });
      await reachesFirstConfirmation(l.page, "linked");
      const dialog = l.page.getByRole("dialog", { name: /^Delete .+\?$/ });
      const name = (await dialog.getByRole("heading", { name: /^Delete .+\?$/ }).innerText()).replace(/^Delete /, "").replace(/\?$/, "");
      const selected = mode === "allSelected" || mode === "privateStepup";
      const privateSwitch = dialog.getByRole("switch", { name: "Delete private notes too", exact: true });
      await expect(privateSwitch).toBeVisible();
      if (selected) {
        await privateSwitch.focus();
        await privateSwitch.press("Space");
        await expect(privateSwitch).toBeChecked();
      }
      await dialog.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Save a copy…", exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
      expect(requests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
      if (mode === "exportReadFailure") unlock = await lockFixtureFile(join(dirs.docs, "private", "notes", "Private.md"));
      await dialog.getByRole("button", { name: "Save a copy…", exact: true }).click();
      const exported = join(copyParent, `${name} (not on GitHub)`);
      if (mode === "exportFailure" || mode === "exportReadFailure") {
        await expect(l.page.getByText("Couldn't save the copy. Your notes haven't changed.", { exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
        expect(requests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
        if (unlock) { await unlock(); unlock = undefined; }
      } else {
        await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
        expect(readFileSync(join(exported, "Welcome.md"))).toEqual(publicBytes);
        expect(readFileSync(join(exported, "private", "notes", "Private.md"))).toEqual(privateBytes);
        if (draft) expect(readFileSync(join(exported, "private", "notes", "Draft.md"))).toEqual(draft);
        await dialog.getByRole("button", { name: "Continue", exact: true }).click();
        if (mode === "exportChanged") writeFileSync(join(exported, "Welcome.md"), "# Changed exported fixture\n");
        await dialog.getByRole("textbox", { name: /^Type .+ to confirm$/ }).fill(name);
        await deletionVm(l.page, true, "project.deleteConfirm");
        await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
        await expect.poll(() => deletionVm(l.page), { timeout: 15_000 }).toMatchObject({ operationSettled: true, tokenCleared: true, codeCleared: true, busy: false });
        if (unsafePrivate) {
          expect(requests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
          await expect(dialog).toContainText("Private Git history could not be kept safely. Nothing was deleted.");
          await expect(dialog).toContainText("Deletion stopped");
          await expect(dialog).not.toContainText("open in another app");
          expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(0);
          expect(requests.filter(r => r === "DELETE /repos/ada/notes-private")).toHaveLength(0);
          expect(pointerBytes()).toEqual(privatePointer);
          expect(readFileSync(join(privateMetadata, "config"))).toEqual(privateConfig);
          if (draft) expect(readFileSync(join(dirs.docs, "private", "notes", "Draft.md"))).toEqual(draft);
          sourcePreservationEvidence = originalEvidence();
          expect(sourcePreservationEvidence.ownedStaging).toEqual([]);
          expect(sourcePreservationEvidence.publicDeletes).toBe(0);
          expect(sourcePreservationEvidence.privateDeletes).toBe(0);
        } else if (mode === "exportChanged") {
          await expect(dialog).toContainText("The saved copy no longer matches your project");
          await expect(dialog).toContainText("Deletion stopped");
          await expect(dialog).not.toContainText(/GitHub refused|Ask a repository admin/);
          expect(requests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
        } else {
          if (mode === "privateStepup") {
            await expect(dialog).toContainText("Allow deletion once", { timeout: 15_000 });
            await expect(dialog).toContainText("ada/notes-private");
            expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
            expect(requests.filter(r => r === "DELETE /repos/ada/notes-private")).toHaveLength(1);
            expect(readFileSync(join(dirs.docs, "Welcome.md"))).toEqual(publicBytes);
            expect(readFileSync(join(dirs.docs, "private", "notes", "Private.md"))).toEqual(privateBytes);
            await dialog.getByRole("textbox", { name: "One-time token", exact: true }).fill("github_pat_EPHEMERAL0123456789abcdef");
            await deletionVm(l.page, true);
            await dialog.getByRole("button", { name: "Authorize once", exact: true }).click();
          }
          if (mode === "keepPrivateRetry") {
            await expect(dialog).toContainText("still on this computer", { timeout: 15_000 });
            expect(readFileSync(join(dirs.docs, "Welcome.md"))).toEqual(publicBytes);
            expect(readFileSync(join(dirs.docs, "private", "notes", "Private.md"))).toEqual(privateBytes);
            expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
            expect(git(join(dirs.docs, "private"), "rev-parse", "HEAD").toString()).toBe(privateHead);
            expect(readFileSync(join(dirs.docs, "private", ".git"))).toEqual(privatePointer);
            expect(readFileSync(join(privateMetadata, "config"))).toEqual(privateConfig);
            if (draft) expect(readFileSync(join(dirs.docs, "private", "notes", "Draft.md"))).toEqual(draft);
            sourcePreservationEvidence = originalEvidence();
            expect(sourcePreservationEvidence.ownedStaging).toEqual([]);
            expect(sourcePreservationEvidence.publicDeletes).toBe(1);
            expect(sourcePreservationEvidence.privateDeletes).toBe(0);
            await deletionVm(l.page, true, "project.deleteRetry");
            await dialog.getByRole("button", { name: "Retry", exact: true }).click();
            await expect.poll(() => deletionVm(l.page), { timeout: 15_000 }).toMatchObject({ operationSettled: true });
          }
          await expect(dialog).toContainText("Repository deleted", { timeout: 15_000 });
          if (mode === "privateStepup") await expect.poll(() => deletionVm(l.page)).toMatchObject({ operationSettled: true });
          expect(existsSync(dirs.docs)).toBe(false);
          expect(readFileSync(join(recycle, "Welcome.md"))).toEqual(publicBytes);
          expect(git(recycle, "rev-parse", "HEAD").toString()).toBe(head);
          const kept = selected ? join(recycle, "private") : `${dirs.docs} (private notes)`;
          expect(readFileSync(join(kept, "notes", "Private.md"))).toEqual(privateBytes);
          const actualHead = git(kept, "rev-parse", "HEAD").toString();
          const shownNote = git(kept, "show", "HEAD:notes/Private.md");
          const status = git(kept, "status", "--porcelain").toString();
          const top = git(kept, "rev-parse", "--show-toplevel").toString();
          const bare = git(kept, "config", "--local", "--get", "core.bare").toString();
          expect(actualHead).toBe(privateHead);
          expect(shownNote).toEqual(privateBytes);
          expect(status).toBe(draft ? "?? notes/Draft.md\n" : "");
          expect(realpathSync.native(top.trim()).toLowerCase()).toBe(realpathSync.native(kept).toLowerCase());
          expect(bare.trim()).toBe("false");
          const keptDraft = draft ? readFileSync(join(kept, "notes", "Draft.md")) : undefined;
          if (draft) expect(keptDraft).toEqual(draft);
          gitEvidence = { cwd: kept, expectedHead: privateHead.trim(), expectedPrivateSha256: hash(privateBytes), ...(draft && keptDraft ? { expectedDraftSha256: hash(draft), actualDraftSha256: hash(keptDraft), actualDraft: keptDraft.toString("utf8") } : {}), commands: [
            { args: ["rev-parse", "HEAD"], stdout: actualHead },
            { args: ["show", "HEAD:notes/Private.md"], stdout: shownNote.toString("utf8"), stdoutSha256: hash(shownNote) },
            { args: ["status", "--porcelain"], stdout: status },
            { args: ["rev-parse", "--show-toplevel"], stdout: top },
            { args: ["config", "--local", "--get", "core.bare"], stdout: bare },
          ] };
          expect(readFileSync(join(recycle, ".git", "modules", "private", "config"))).toEqual(privateConfig);
          expect(requests.filter(r => r === "DELETE /repos/ada/notes")).toHaveLength(1);
          expect(requests.filter(r => r === "DELETE /repos/ada/notes-private")).toHaveLength(mode === "privateStepup" ? 2 : selected ? 1 : 0);
          expect(readFileSync(join(exported, "Welcome.md"))).toEqual(publicBytes);
          expect(readFileSync(join(exported, "private", "notes", "Private.md"))).toEqual(privateBytes);
          await expect.poll(() => deletionVm(l.page)).toMatchObject({ tokenCleared: true, codeCleared: true, busy: false });
        }
      }
      if (mode === "exportFailure" || mode === "exportReadFailure" || mode === "exportChanged" || unsafePrivate) {
        expect(readFileSync(join(dirs.docs, "Welcome.md"))).toEqual(publicBytes);
        expect(readFileSync(join(dirs.docs, "private", "notes", "Private.md"))).toEqual(privateBytes);
        expect(git(dirs.docs, "rev-parse", "HEAD").toString()).toBe(head);
        expect(git(join(dirs.docs, "private"), "rev-parse", "HEAD").toString()).toBe(privateHead);
        if (draft) expect(readFileSync(join(dirs.docs, "private", "notes", "Draft.md"))).toEqual(draft);
        expect(requests.filter(r => r.startsWith("DELETE "))).toHaveLength(0);
        if (unsafePrivate) {
          sourcePreservationEvidence = originalEvidence();
          expect(sourcePreservationEvidence.ownedStaging).toEqual([]);
        }
      }
      const at = process.env.FOCUS_NOTES_DELETE_REVIEW;
      if (at) {
        mkdirSync(at, { recursive: true });
        const image = await l.app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))!.webContents.capturePage()).toPNG().toString("base64"));
        writeFileSync(join(at, `${mode}.png`), Buffer.from(image, "base64"));
      }
      await quit(l); closed = true;
      expect(fakes.stored()).toBe(credentials);
      expect(readFileSync(fakes.gitconfig)).toEqual(config);
      if (mode === "privateStepup") {
        expect(l.log.join("\n")).not.toContain("EPHEMERAL0123456789abcdef");
        for (const entry of readdirSync(dirs.userData, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())) expect(readFileSync(join(entry.parentPath, entry.name)).includes(Buffer.from("EPHEMERAL0123456789abcdef"))).toBe(false);
      }
      if (at) writeFileSync(join(at, `${mode}-provenance.json`), JSON.stringify({ scenario: mode, source: "built-invisible-renderer", pid: l.pid, requestChain: requests, sourceHead: head, privateHead, gitEvidence, sourcePreservationEvidence, sixStateComplete: false, checks: { exactPublicPrivateUnpushedBytes: true, ...(!["exportFailure", "exportReadFailure", "exportChanged"].includes(mode) ? { exactPublicPrivateExportBytes: true } : {}), preservedHistory: true, privateSelectionRespected: true, noDeleteBeforePreservation: true, ...(unsafePrivate ? { zeroRemoteDeleteOnPreflightRefusal: true } : {}), ...(mode === "keepPrivateRetry" ? { noRepeatedDeleteOnLocalRetry: true } : {}), ...(mode === "privateStepup" ? { noGrantTokenInDiskOrLogs: true, onlyPrivateTargetAuthorized: true } : {}), fakeCredentialsUnchanged: true, fakeGitConfigUnchanged: true }, nativeReadLock: mode === "exportReadFailure", nativeRecycleBin: false, privateHistoryLocation: unsafePrivate ? "original unsupported metadata, refused without migration" : selected ? ".git/modules/private in synthetic recycled parent" : "self-contained .git in the kept private folder", compiled: deletionBuild() }, null, 2));
    } catch (error) {
      await attachDeleteFailure(l, projectWrites(dirs.docs, join(dirs.docs, "Welcome.md"), publicBytes));
      throw error;
    } finally {
      if (unlock) await unlock();
      if (!closed) await quit(l);
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}