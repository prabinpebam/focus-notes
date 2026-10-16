/**
 * The Electron main process (PKG-03, SEC-01, PKG-06, PRV-01): a hardened shell that owns the
 * window, the file system, and the user's own `git`. It allows no network requests from the
 * renderer; Git talks to the workspace's remotes (WP-3.3), and its own only requests are setup's
 * calls to api.github.com, made when the person sets up their instance (FRE-08, WP-3.1).
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, session, shell, View, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, writeFile, stat } from "node:fs/promises";
import { parseDeepLink, type DeepLink } from "@focus-notes/core/deep-link";
import { rootOf as agentRootOf, rootDir as agentRootDir } from "@focus-notes/core/agents";
import type { ResolvedDeepLink } from "@focus-notes/core";
import { runCli } from "../cli/run.ts";
import { SWITCHES, connectionSnippets, type AgentsPage, type SwitchId } from "@focus-notes/core/agents-app";
import { readAgentPermissions, writeAgentPermissions } from "@focus-notes/core/agents-fs";
import type { AgentPermissions } from "@focus-notes/core/agents";
import { cliInstallState, installCli, type InstallHost } from "./agents/install-cli.ts";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { release as osRelease } from "node:os";
import { readWorkspaceFormat } from "@focus-notes/core/workspace-format";
import { titleOfMarkdown } from "@focus-notes/core/workspace";
import { BUNDLE_MAX_BYTES, parseBundle, planImport, safeWorkspacePath, type Bundle } from "@focus-notes/core/notes";
import { parseSettings } from "@focus-notes/core/settings";
import { restorePlace, titleOrName } from "@focus-notes/core/history";
import { GitSync, NO_GIT } from "./git/sync.ts";
import { TemplateGuard } from "./git/template-guard.ts";
import { HeldFile, excludeFileOf } from "./git/held.ts";
import { changedChars, type BackupPolicy } from "./git/cadence.ts";
import { createRunner, type GitRunner } from "./git/run.ts";
import { passphraseStrength } from "@focus-notes/seal";
import { accessStore, siteFromGitConfig } from "./share/access.ts";
import { memoryClipboard, secretClipboard, type TextClipboard } from "./share/clipboard.ts";
import { ProblemLog, REPORT_PROBLEM_URL, type RedactOptions } from "@focus-notes/core/diagnostics";
import { diagnostics, knownStrings, reportFileName, reportPathAllowed } from "./diagnostics.ts";
import { DEFAULT_SETUP, isRepoName, SETUP_STEPS, type SetupStepId } from "@focus-notes/core/setup";
import { FIRST_RUN_PAGES, identityProblem, type FirstRunPage, type FirstRunProgress, type RepoChoice, type WorkspaceResult } from "@focus-notes/core/first-run";
import { checkOptions, notesRepos, SetupEngine } from "./setup/engine.ts";
import { githubFetch } from "./setup/credential.ts";
import { avatarLoader } from "./first-run/avatar.ts";
import type { BatchOp } from "./git/message.ts";
import { Account } from "./first-run/account.ts";
import { createToolRunner } from "./first-run/tools.ts";
import { applyLocalIdentity, checkWorkspace, cloneWorkspace, folderFree, homesFor, mapLimit, savedToGitHub, setupTarget } from "./first-run/workspace.ts";
import type { ConflictChoice, RemovalCheck } from "@focus-notes/core";
import { CHROMIUM_FOLDERS, DATA_FILES, type DataFile } from "@focus-notes/core/inventory";
import { forgetLocalData, removalCheck, removeWorkspace } from "./workspace/remove.ts";
import { AppWindowFrame, frameKindFor } from "./window/frame.ts";
import { CrashRecovery, coverBounds } from "./window/crash-cover.ts";
import { themeCanvas, WINDOW_METRICS } from "@focus-notes/core/window-geometry";
import { AppMenuBar } from "./window/menu-bar.ts";
import { SnapshotCache } from "@focus-notes/core/snapshot";
import { textHash } from "@focus-notes/core/journal";
import type { RestoredNote } from "@focus-notes/core";
import { RecoveryJournal, restoreJournal } from "./journal.ts";
import { watchTree, type TreeWatcher } from "./watch-tree.ts";
import { JOURNEY_WINDOW_OPTIONS, keepOutOfTheWay } from "./window/journey-window.ts";
import { watchCompositing } from "./window/compositing.ts";
import { allowedRequest, HARDENED_WEB_PREFERENCES, isWebLink } from "./hardening.ts";

const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
/** Windows and Linux: the transparent window with app-built window management; macOS: the system's (D-14). */
const frameKind = frameKindFor(platform, process.argv, process.env);
let windowFrame: AppWindowFrame | undefined;

if (process.env.FOCUS_NOTES_USER_DATA) app.setPath("userData", resolve(process.env.FOCUS_NOTES_USER_DATA));
/** A file in the app's data folder: only those the data inventory names (PRV-02). */
const dataFile = (f: DataFile) => join(app.getPath("userData"), f);
// Chromium's working files go in one folder of the data folder, which the inventory lists as one item.
app.setPath("sessionData", join(app.getPath("userData"), CHROMIUM_FOLDERS.session));
// Chromium's crash database too (`Crashpad`, made on macOS and Linux): nothing in it is ever sent.
app.setPath("crashDumps", join(app.getPath("sessionData"), "Crashpad"));

// ---- the command-line tool (WP-7.3, D-165) ----
// Released builds can't run Electron as Node, so the app's own executable runs the commands:
// `focus-notes --cli <command> …` (the launcher in the app's resources adds `--cli`). Only as the very
// first argument, and never alongside a deep link, so a link can't turn into a command. No window,
// no single-instance lock, no watcher: the command runs, and the process exits with its code.
{
  const at = process.argv.indexOf("--cli");
  if (at === (app.isPackaged ? 1 : 2) && !process.argv.some((a) => /^focus-notes:/i.test(a))) {
    const code = await runCli(process.argv.slice(at + 1), {
      dataDir: app.getPath("userData"),
      defaultWorkspace: resolve(process.env.FOCUS_NOTES_DOCS ?? join(app.getPath("documents"), "Focus Notes")),
      stdin: process.stdin, stdout: process.stdout, stderr: process.stderr,
      // `open`: the link goes to the app through the system, as any deep link does.
      openUrl: (url) => shell.openExternal(url),
    }).catch(() => 1);
    await new Promise((r) => process.stdout.write("", r));
    app.exit(code);
    // Nothing below runs for a command.
    await new Promise(() => {});
  }
}
/** Where a new workspace goes unless another folder is chosen: Documents/Focus Notes. */
const defaultHome = () => resolve(process.env.FOCUS_NOTES_DOCS ?? join(app.getPath("documents"), "Focus Notes"));
/** The workspace the first run opened (D-98), kept by the main process only: the renderer can't name a folder. */
const workspaceFile = () => dataFile(DATA_FILES.workspace);
let chosenHome: string | undefined;
function readChosenHome(): string | undefined {
  try {
    const w = JSON.parse(readFileSync(workspaceFile(), "utf8")) as { version?: number; folder?: unknown };
    return w.version === 1 && typeof w.folder === "string" && isAbsolute(w.folder) ? resolve(w.folder) : undefined;
  } catch {
    return undefined;
  }
}
const notesHome = () => chosenHome ?? defaultHome();
const stateFile = () => dataFile(DATA_FILES.state);

// Test seams, never in a packaged app: a local fake of GitHub's API and local bare remotes, so the
// journeys make no network request; and a log of every program started, to check no token is in one.
const devEnv = (name: string) => (app.isPackaged ? undefined : process.env[name]);
const fakeApi = devEnv("FOCUS_NOTES_GITHUB_API");
const localRemotes = devEnv("FOCUS_NOTES_GIT_REMOTES");
const logSpawns = devEnv("FOCUS_NOTES_LOG_SPAWNS") === "1";
/** Journeys and the bench: windows never take the computer's focus (D-104 (7)). */
const journey = devEnv("FOCUS_NOTES_E2E") === "1";
// Software rendering, as on a CI runner with no GPU, to reproduce it on any computer (D-121).
if (devEnv("FOCUS_NOTES_DISABLE_GPU") === "1") app.disableHardwareAcceleration();
// Chromium switches for journeys on CI, to reach a compositing path the runner has no hardware for:
// the GPU's (DirectComposition) through Direct3D 11 on WARP (D-153). Never in a packaged app.
for (const s of (devEnv("FOCUS_NOTES_CHROMIUM_SWITCHES") ?? "").split(",").filter(Boolean)) {
  const [name, value] = s.split("=");
  if (name && /^[a-z0-9-]+$/.test(name)) {
    if (value) app.commandLine.appendSwitch(name, value);
    else app.commandLine.appendSwitch(name);
  }
}
/**
 * The window's compositing, followed from the first window on (D-121). The override is read in a
 * packaged app too, to diagnose; journeys print the status once, so CI's log shows which path ran.
 */
let compositingWatch: ReturnType<typeof watchCompositing> | undefined;
const compositing = () => (compositingWatch ??= watchCompositing(app, process.env.FOCUS_NOTES_GPU_COMPOSITING, journey ? (line) => process.stdout.write(`[focus-notes] ${line}\n`) : undefined));
/**
 * The app's own log (QLT-04, D-140): counts, states, and problem codes, written to standard output
 * and kept in memory for the diagnostic report, redacted as each line arrives. Never a file.
 */
const redaction = (): RedactOptions => ({ home: app.getPath("home"), workspace: notesHome(), known: knownCache });
/** The login, names, emails, and repository names the report must never hold (D-140), refreshed before each report. */
let knownCache: string[] = [];
const problemLog = new ProblemLog(200, redaction);
const logLine = (line: string) => {
  process.stdout.write(`[focus-notes] ${line}\n`);
  problemLog.add(line);
};
/** The clipboard: in memory for journeys (`FOCUS_NOTES_MEMORY_CLIPBOARD`, never packaged), so they never touch the computer's. */
let memClipboard: TextClipboard | undefined;
const appClipboard = (): TextClipboard => (devEnv("FOCUS_NOTES_MEMORY_CLIPBOARD") === "1" ? (memClipboard ??= memoryClipboard()) : clipboard);
const devVersion = () => {
  try {
    return String((JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8")) as { version?: unknown }).version ?? "unknown");
  } catch {
    return "unknown";
  }
};
const onSpawn = logSpawns ? (program: string, args: string[]) => process.stdout.write(`[focus-notes] spawn ${JSON.stringify([program, ...args])}\n`) : undefined;
const apiFetch = githubFetch(fakeApi && /^http:\/\/127\.0\.0\.1:\d+$/.test(fakeApi)
  ? (i, init) => fetch(fakeApi + i.slice("https://api.github.com".length), init)
  : undefined);
const remoteUrl = (owner: string, repo: string) => (localRemotes ? `${localRemotes.replace(/\\/g, "/")}/${owner}/${repo}.git` : `https://github.com/${owner}/${repo}.git`);

const WELCOME = `# Welcome to Focus Notes

Everything you write here is saved as plain Markdown on your computer.
`;

/** Only the first instance: a second start hands over to it and quits (its journal is the first one's). */
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

// ---- save and sync with Git (WP-3.3, D-133) ----
// The workspace folder's own repository, if it is one; otherwise saving stays local, with no Git UI.
// The delays are configurable (D-23), which also lets the journeys use short ones.
const envMs = (name: string) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};
let gitSync: GitSync | undefined;
/** Each note's text as this app last wrote it, so a write knows how many characters it changed (D-133). */
const lastWritten = new Map<string, string>();
let gitOpened = false;
let gitWaiting: ((g: GitSync) => void)[] = [];
/** Runs now if Git is open, or once it opens (a note written before then is still committed). */
const withGit = (fn: (g: GitSync) => void) => {
  if (gitSync) fn(gitSync);
  else if (!gitOpened) gitWaiting.push(fn);
};
let startGit: () => void = () => {};
let gitOpening: Promise<GitSync | undefined>;
/** Opened once the caret is ready, so Git never competes with the first frame (PRF-02, PRF-07). Again after the workspace changes. */
const armGit = () => (gitSync = undefined, gitOpened = false, gitWaiting = [], gitOpening = new Promise<GitSync | undefined>((resolve) => {
  startGit = () => {
    startGit = () => {};
    // The backup policy's thresholds (D-133); FOCUS_NOTES_IDLE_COMMIT_MS stays the 60 s pause.
    const policy: Partial<BackupPolicy> = {};
    for (const [key, name] of [["idleMs", "IDLE_COMMIT_MS"], ["shortIdleMs", "BACKUP_SHORT_MS"], ["minChars", "BACKUP_MIN_CHARS"], ["bigChars", "BACKUP_BIG_CHARS"], ["staleMs", "BACKUP_STALE_MS"], ["ceilingMs", "BACKUP_CEILING_MS"]] as const) {
      const v = envMs(`FOCUS_NOTES_${name}`);
      if (v !== undefined) policy[key] = v;
    }
    const pointerGapMs = envMs("FOCUS_NOTES_POINTER_GAP_MS");
    resolve(GitSync.open({
      folder: notesHome(),
      ...(onSpawn ? { run: createRunner({ onSpawn: (args) => onSpawn("git", args) }) } : {}),
      policy,
      ...(pointerGapMs !== undefined ? { pointerGapMs } : {}),
      // Never pushed to a template repository (D-157).
      checkRemote: (url) => templateGuard.checkRemote(url),
      // After the window closes, the final sync on quit still runs; there's just no one to tell.
      onReport: (r) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sync:status", r);
      },
      // Counts and problems only: note names are private.
      log: logLine,
    }).then((g) => {
      gitSync = g;
      // The log's lines are redacted as they arrive: with the names known from here on.
      void refreshKnown().catch(() => {});
      gitOpened = true;
      for (const fn of gitWaiting.splice(0)) if (g) fn(g);
      return g;
    }, () => {
      gitOpened = true;
      gitWaiting.length = 0;
      return undefined;
    }));
  };
}));
armGit();

// ---- set up my instance (WP-3.1, FRE-08) ----
// Opened when first asked. The token is read from Git's credential helper when a step needs it and
// kept only in the engine; progress (names and step states, nothing secret) is in setup.json.
let setupEngine: Promise<SetupEngine> | undefined;
const setupRunner = createRunner(onSpawn ? { onSpawn: (args) => onSpawn("git", args) } : {});
/** Setup's commits carry the identity chosen for only this workspace (FRE-05) until it's in the workspace's own settings. */
const setupGit: GitRunner = (call) => {
  const id = workspaceIdentity;
  return setupRunner(id ? { ...call, args: ["-c", `user.name=${id.name}`, "-c", `user.email=${id.email}`, ...call.args] } : call);
};
const setup = () => (setupEngine ??= SetupEngine.open({
  ...(journey ? { beforeStep: (id: SetupStepId) => slowSeam(`setup:${id}`) } : {}),
  git: setupGit,
  progressFile: dataFile(DATA_FILES.setup),
  token: () => account.token(),
  fetch: apiFetch,
  remoteUrl,
  isTemplate: (owner, name) => templateGuard.isTemplateRepo(owner, name),
  onReport: (r) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("setup:report", r);
  },
  // Step names, states, and problem codes only.
  log: logLine,
  // A folder the app chose that's taken when Download runs: the next free one beside the default (D-154).
  folders: (instance) => homesFor(documentsDir(), instance),
}));
/** A vault passphrase from the renderer: text, or none (Skip for now). Never logged or stored. */
const passphraseArg = (p: unknown) => (typeof p === "string" && p.length > 0 && p.length <= 1024 ? p : undefined);

// ---- the first run (WP-3.2, FRE-01 to FRE-06) ----
// Signing in goes through Git's own helpers; the token is read from them when needed and kept only
// in memory (SEC-03). The folder a workspace goes in is chosen here, with the system's dialog (D-98).
const account = new Account({
  git: createRunner(onSpawn ? { onSpawn: (args) => onSpawn("git", args) } : {}),
  tools: createToolRunner(onSpawn ? { onSpawn } : {}),
  fetch: apiFetch,
  home: app.getPath("home"),
  env: process.env,
  onProgress: (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("firstRun:signIn", p);
  },
  log: logLine,
  signedOutFile: dataFile(DATA_FILES.account),
  // The picture comes only from GitHub's avatar host, never in journeys (their fake GitHub has none).
  avatar: avatarLoader({ fetch: fakeApi ? () => Promise.reject(new Error("No pictures in journeys")) : (i, init) => fetch(i, init), file: dataFile(DATA_FILES.avatar) }),
});
/**
 * A template repository is never someone's notes (D-157): asked before cloning or opening a
 * workspace, by setup's steps, and before every push. GitHub's answer is kept for the session; when
 * it can't answer, a repository not known as a template isn't blocked. Journeys without the fake
 * GitHub never ask the real one.
 */
const templateGuard = new TemplateGuard({
  lookup: async (owner, name) => {
    if (journey && !fakeApi) return undefined;
    const s = await account.api();
    const r = s ? await s.api.findRepo(owner, name) : undefined;
    return r ? r.template === true : undefined;
  },
  ...(localRemotes ? { localBase: localRemotes } : {}),
});
function isTemplateRemote(url: string): Promise<boolean> {
  return templateGuard.isTemplateRemote(url);
}
const firstRunFile = () => dataFile(DATA_FILES.firstRun);
/** A name and email for only the notes workspace, kept until the workspace has them (not secret). */
let workspaceIdentity: { name: string; email: string } | undefined;
/** Where a new or cloned workspace goes: Documents/Focus Notes unless another folder was chosen. */
let targetFolder: string | undefined;
/** A workspace cloned or chosen, waiting to be opened. */
let pendingWorkspace: string | undefined;
const saveFirstRun = () => atomicWrite(firstRunFile(), JSON.stringify({ version: 1, ...(workspaceIdentity ? { identity: workspaceIdentity } : {}) }, null, 2));
function readFirstRun(): void {
  try {
    const f = JSON.parse(readFileSync(firstRunFile(), "utf8")) as { version?: number; identity?: { name?: unknown; email?: unknown } };
    const i = f.identity;
    if (f.version === 1 && i && typeof i.name === "string" && typeof i.email === "string" && !identityProblem({ name: i.name, email: i.email })) workspaceIdentity = { name: i.name, email: i.email };
  } catch {
    // Nothing chosen yet.
  }
}
/** The folder the notes folders go in: Documents (beside Documents/Focus Notes, D-155). */
const documentsDir = () => dirname(defaultHome());
/**
 * A folder a new or cloned workspace can go in (D-155): Documents/<repository name>, or, when that
 * already holds files (a folder used on this computer only, or another workspace), the first free
 * one beside it: "<name> 2", "<name> 3" (D-124). Nothing existing is renamed or moved.
 */
async function freeFor(repo: string): Promise<string> {
  const all = homesFor(documentsDir(), repo);
  for (const folder of all) if (await folderFree(folder)) return folder;
  return all[0]!;
}
/** Where setup makes the workspace (D-124, D-154): never a folder used on this computer only. */
async function setupWhere(instance?: string): Promise<{ folder: string; chosen: boolean }> {
  const engine = await setup();
  const local = isWorkspace() && !(await savedToGitHub(setupRunner, notesHome()));
  // A setup started (by an earlier version) with the folder used on this computer only moves off it (D-154).
  const r0 = engine.report();
  if (local && r0.options && resolve(r0.options.folder) === resolve(notesHome()) && r0.steps.find((s) => s.id === "clone")?.state !== "done") await engine.useFolder(await freeFor(r0.options.instance), false);
  const o = engine.report().options;
  const t = setupTarget({
    ...(o ? { started: o } : {}),
    ...(targetFolder ? { picked: targetFolder } : {}),
    ...(isWorkspace() ? { open: { folder: notesHome(), savedToGitHub: !local } } : {}),
  });
  return { folder: t.folder ?? (await freeFor(instance && isRepoName(instance) ? instance : DEFAULT_SETUP.instance)), chosen: t.chosen };
}
/**
 * Deletes what the data inventory lists for signing out or removing the workspace (PRV-02): setup's
 * progress (through the engine, so it forgets too), the first run's workspace identity, and, for
 * removing, the workspace folder's name; Chromium's caches and web storage are emptied too. The
 * renderer forgets the recent note in state.json itself, since it owns that file.
 */
async function forgetLocal(event: "signOut" | "removeWorkspace"): Promise<void> {
  if (setupEngine) await (await setupEngine).reset().catch(() => {});
  workspaceIdentity = undefined;
  targetFolder = undefined;
  pendingWorkspace = undefined;
  await journal?.clear();
  await forgetLocalData(app.getPath("userData"), event);
  await session.defaultSession.clearCache().catch(() => {});
  await session.defaultSession.clearStorageData().catch(() => {});
}
/**
 * Removes the workspace's local clone (FRE-07): checked again here, with the watcher and Git
 * stopped first so nothing writes into it, and only when everything is on the remote. Afterwards
 * the window starts again with no workspace, at the first run's Your notes step.
 */
/** Only a Focus Notes workspace (its format file is there) is ever removed: never just any repository. */
const removal = async (): Promise<RemovalCheck> => (isWorkspace() ? removalCheck(setupRunner, notesHome()) : { state: "notWorkspace", waiting: 0, folder: notesHome(), repositories: [] });
async function removeLocalWorkspace(): Promise<RemovalCheck> {
  const folder = notesHome();
  const first = await removal();
  if (first.state !== "ready") return first;
  await Promise.allSettled([...writeQueues.values()]);
  watcher?.close();
  watcher = undefined;
  const old = gitSync;
  armGit();
  await old?.dispose();
  const r = await removeWorkspace(setupRunner, folder);
  if (r.state !== "removed") {
    watcher = watchWorkspace(() => mainWindow);
    startGit();
    return r;
  }
  chosenHome = undefined;
  await forgetLocal("removeWorkspace");
  process.stdout.write("[focus-notes] workspace-removed\n");
  restartInPlace();
  return r;
}
/**
 * The renderer starts again in place, never by reloading the page (DSK-09, D-148): a reload shows the
 * unpainted page, white or see-through in the transparent window. It builds its stores and views off
 * screen and swaps them in one frame (apps/desktop/src/renderer/main.ts).
 */
function restartInPlace(): void {
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("workspace:switched");
  }, 0);
}
async function chooseFolder(title: string): Promise<string | undefined> {
  const w = mainWindow;
  const opts = { title, defaultPath: dirname(defaultHome()), properties: ["openDirectory" as const, "createDirectory" as const, "promptToCreate" as const] };
  const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
  return r.canceled || !r.filePaths[0] ? undefined : resolve(r.filePaths[0]);
}
/** The first run's long calls say how they're going (PRF-13, D-149): repositories checked, a download's part and percentage. */
const firstRunProgress = (p: FirstRunProgress) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("firstRun:progress", p);
};
/** How many of the most recent repositories are checked for a workspace, and how many at once. */
const CHECK_RECENT = 30, CHECK_AT_ONCE = 6;
/** Repositories in the signed-in account, Focus Notes workspaces first (checked for the most recent, a few at a time, counted). */
async function repositories(): Promise<RepoChoice[]> {
  const s = await account.api();
  if (!s) throw new Error("Signed out");
  const repos = notesRepos(await s.api.ownRepos());
  const recent = repos.slice(0, CHECK_RECENT);
  firstRunProgress({ op: "findNotes", done: 0, total: recent.length });
  const found = await mapLimit(recent, CHECK_AT_ONCE, (r) => s.api.hasFile(r.owner, r.name, ".focus-notes/workspace.json").catch(() => false),
    (done, total) => firstRunProgress({ op: "findNotes", done, total }));
  const checked = repos.map((_, i) => found[i] ?? false);
  const list = repos.map((r, i) => ({ owner: r.owner, name: r.name, private: r.private, instance: checked[i]!, ...(r.pushedAt ? { pushedAt: r.pushedAt } : {}) }));
  return [...list.filter((r) => r.instance), ...list.filter((r) => !r.instance)];
}
/**
 * Opens a workspace in this window (D-98): the main process keeps the folder, the watcher and Git
 * move to it, and the renderer starts again in it, in place (D-148).
 */
async function switchWorkspace(folder: string): Promise<void> {
  if (workspaceIdentity) {
    await applyLocalIdentity(setupRunner, folder, workspaceIdentity);
    workspaceIdentity = undefined;
    await saveFirstRun();
  }
  await atomicWrite(workspaceFile(), JSON.stringify({ version: 1, folder }, null, 2));
  chosenHome = folder;
  pendingWorkspace = undefined;
  watcher?.close();
  const old = gitSync;
  armGit();
  await old?.dispose();
  watcher = watchWorkspace(() => mainWindow);
  setTimeout(() => startGit(), 3000);
  restartInPlace();
}

// ---- the workspace (WP-2.3) ----
// The notes folder is the workspace. With .focus-notes/workspace.json it has the repository's
// layout: public notes in notes/, private ones in private/notes/ (D-84). Before that, it's one
// root of its own (D-92), as it was through M2.
const formatFile = () => join(notesHome(), ".focus-notes", "workspace.json");
const isWorkspace = () => existsSync(formatFile());
// A clone whose account can't reach the private repository has no private root (FRE-06).
const hasPrivate = () => existsSync(join(notesHome(), "private", "notes")) || existsSync(join(notesHome(), "private", ".git"));
// New notes without a private repository (D-158): held out of Git, in the notes repository's
// info/exclude, until the writer answers Make it public or Keep it on this computer only.
let heldCache: { home: string; file: HeldFile } | undefined;
async function heldNotes(): Promise<HeldFile | undefined> {
  const home = notesHome();
  if (!isWorkspace()) return undefined;
  if (heldCache?.home === home) return heldCache.file;
  const file = await excludeFileOf(home);
  heldCache = file ? { home, file: new HeldFile(home, file) } : undefined;
  return heldCache?.file;
}
const roots = () => isWorkspace()
  ? [...(hasPrivate() ? [{ id: "private", path: join(notesHome(), "private", "notes"), readOnly: false }] : []), { id: "public", path: join(notesHome(), "notes"), readOnly: false }]
  : [{ id: "local", path: notesHome(), readOnly: false }];
/** Where new notes go when there's no note to put them next to. */
const notesRoot = () => roots()[0]!.path;
const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p);
const inside = (base: string, p: string) => {
  const r = relative(base, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};
const readFormat = () => readFile(formatFile(), "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? undefined : "unreadable"));
/** This app never writes into a workspace whose format it mustn't write (DST-05). */
async function assertWritable(p: string): Promise<void> {
  // The format file itself is written only by workspace:writeFormat, which checks what it writes.
  if (!inside(notesHome(), p) || p === formatFile()) return;
  if (readWorkspaceFormat(await readFormat()).access !== "write") throw new Error("This workspace is read-only for this version of Focus Notes");
}
/**
 * A note's title from its first 16 KB, so the Files panel shows titles without reading whole notes.
 * Kept in the snapshot, so a note that hasn't changed isn't opened again (PRF-10).
 */
async function readTitle(p: string, seen?: (changed: number) => void): Promise<string | undefined> {
  const st = await stat(p).catch(() => undefined);
  if (!st) return undefined;
  // When it last changed, for sorting the tree by last change (D-175): from the stat this read makes anyway.
  seen?.(Math.round(st.mtimeMs));
  const key = { path: p, size: st.size, mtimeMs: st.mtimeMs };
  const known = titles.get(key) ?? parsed.get(key);
  if (known) return known.title;
  const h = await open(p, "r").catch(() => undefined);
  if (!h) return undefined;
  try {
    const buf = Buffer.alloc(16 * 1024);
    const { bytesRead } = await h.read(buf, 0, buf.length, 0);
    const title = titleOfMarkdown(buf.subarray(0, bytesRead).toString("utf8"));
    titles.set(key, title ? { title } : {});
    return title;
  } catch {
    return undefined;
  } finally {
    await h.close();
  }
}
type Entry = { path: string; kind: "note" | "folder"; title?: string; changed?: number };
/** Every note (with its title) and folder under a root; folders and files starting with a dot are skipped. */
async function listTree(dir: string, out: Entry[] = []): Promise<Entry[]> {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const notes: Promise<Entry>[] = [];
  for (const d of items) {
    if (d.name.startsWith(".") || d.name === "node_modules") continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) {
      out.push({ path: p, kind: "folder" });
      await listTree(p, out);
    } else if (d.isFile() && isMarkdown(d.name)) {
      let changed: number | undefined;
      notes.push(readTitle(p, (t) => (changed = t)).then((title) => ({ path: p, kind: "note" as const, ...(title ? { title } : {}), ...(changed !== undefined ? { changed } : {}) })));
    }
  }
  out.push(...(await Promise.all(notes)));
  return out;
}

// ---- the parsed-note snapshot (PRF-10, Performance and quality → Less reading) ----
// Each note read or written, keyed by path, size, and modification time: reopening one that hasn't
// changed reads nothing. Titles from the Files panel's scan are kept the same way, on their own.
type ParsedNote = { text: string; hash: string; title?: string };
const parsed = new SnapshotCache<ParsedNote>({ maxBytes: 32 * 1024 * 1024, sizeOf: (n) => 2 * n.text.length + 96 });
const titles = new SnapshotCache<{ title?: string }>({ maxBytes: 4 * 1024 * 1024, sizeOf: (t) => 2 * (t.title?.length ?? 0) + 96 });
const parseNote = (text: string): ParsedNote => {
  const title = titleOfMarkdown(text);
  return { text, hash: textHash(text), ...(title ? { title } : {}) };
};
/** A note as it is on disk now: from the snapshot when its size and time haven't changed. */
async function readParsed(path: string): Promise<ParsedNote> {
  const h = await open(path, "r");
  try {
    const st = await h.stat();
    const key = { path, size: st.size, mtimeMs: st.mtimeMs };
    return parsed.get(key) ?? parsed.set(key, parseNote(await h.readFile("utf8")));
  } finally {
    await h.close();
  }
}

// ---- the recovery journal (QLT-03) ----
let journal: RecoveryJournal | undefined;
/** What this launch restored from the journal, told to the renderer once. */
let restored: RestoredNote[] = [];
/** Puts the journal's unsaved text back into its notes (QLT-03): at launch, and after a renderer crash. */
const restoreUnsaved = (j: RecoveryJournal) => restoreJournal(j, {
  read: (p) => readFile(p, "utf8").catch(() => undefined),
  write: async (p, text) => {
    await atomicWrite(p, text);
    withGit((g) => g.written(p));
  },
});

/** The most notes the search index reads in one call (`notes:read`). */
const NOTES_PER_READ = 64;
/** Files it reads at once (Node has four file threads by default). */
const FILES_AT_ONCE = 2;

/** Only Markdown files, given as absolute paths, may be read or written. */
function notePath(p: unknown): string {
  if (typeof p !== "string" || !p) throw new Error("A note path is required");
  const abs = resolve(p);
  if (![".md", ".markdown"].includes(extname(abs).toLowerCase())) throw new Error("Only Markdown files can be opened");
  return abs;
}

/** Writes to one path run one after another, so an older write can never land after a newer one. */
const writeQueues = new Map<string, Promise<void>>();
let tmpCounter = 0;

/** Atomic write: a temporary file next to the note, then rename (Performance and quality → Reliability). */
function atomicWrite(path: string, content: string): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => writeNow(path, content));
  writeQueues.set(path, next);
  void next.finally(() => { if (writeQueues.get(path) === next) writeQueues.delete(path); }).catch(() => {});
  return next;
}

/** Renames, retrying while Windows sync clients and antivirus briefly lock a file they just saw. */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
    }
  }
}

async function writeNow(path: string, content: string): Promise<void> {
  await assertWritable(path);
  // A pull rewriting files finishes first, so a save never lands in the middle of it.
  await gitSync?.writable();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
  await writeFile(tmp, content, "utf8");
  // On Windows, sync clients and antivirus briefly lock files; retry before reporting a failure.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path);
      // A write hands its result straight to the snapshot: the next read doesn't touch the disk (PRF-10).
      if (isMarkdown(path)) {
        const st = await stat(path).catch(() => undefined);
        if (st) parsed.set({ path, size: st.size, mtimeMs: st.mtimeMs }, parseNote(content));
      }
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt < 4 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        continue;
      }
      await rm(tmp, { force: true });
      throw error;
    }
  }
}

// ---- file operations from the Files panel (WP-2.4, D-94) ----

/** A refusal the renderer explains: the message is the reason's code (OpErrorCode in core). */
class Refused extends Error {}
const refuse = (code: "notFound" | "taken" | "readOnly" | "invalid" | "intoItself" | "trash" | "failed") => new Refused(code);
/** A path the Files panel may change: absolute, inside a writable root (not the root itself), no dot folders. */
function opPath(p: unknown): { path: string; root: string } {
  if (typeof p !== "string" || !p || !isAbsolute(p) || resolve(p) !== p) throw refuse("invalid");
  const root = roots().find((r) => p !== r.path && inside(r.path, p));
  if (!root || relative(root.path, p).split(sep).some((part) => part.startsWith("."))) throw refuse("invalid");
  return { path: p, root: root.path };
}
const isDir = (p: string) => stat(p).then((s) => s.isDirectory(), () => false);
/** Writes already under way to anything inside a path finish first, so none lands in the old place. */
const writesDone = (p: string) => Promise.allSettled([...writeQueues].filter(([k]) => inside(p, k)).map(([, v]) => v));

/**
 * A batch from the Files panel, all or nothing (Desktop and Git → Changes shown before they're
 * saved): every operation is checked, folders are created and items moved in order, and if any step
 * fails the earlier ones are undone. A write replaces a moved or linking note's text (links that
 * follow the move, FIL-09), and is undone by writing the old text back. Deletes go last, to the
 * system trash, until Git keeps them (FIL-10).
 * A move between the Private and Public roots changes who can see it (FIL-06): the folders it needs
 * in the other root are made, and taken away again if the batch is undone.
 */
async function applyOps(raw: unknown): Promise<BatchOp[]> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5000) throw refuse("invalid");
  type Op = { op: "createFolder" | "delete"; path: string; root: string } | { op: "move"; path: string; to: string; root: string }
    | { op: "write" | "create"; path: string; text: string; root: string };
  const ops = raw.map((op: unknown): Op => {
    const o = op as Record<string, unknown>;
    if (o?.op === "createFolder" || o?.op === "delete") return { op: o.op, ...opPath(o.path) };
    if (o?.op === "move") {
      const from = opPath(o.from);
      const to = opPath(o.to);
      // Only a workspace's two roots can be crossed (D-84); anything else stays in its root.
      if (from.root !== to.root && !isWorkspace()) throw refuse("invalid");
      return { op: "move" as const, path: from.path, to: to.path, root: from.root };
    }
    if (o?.op === "write" || o?.op === "create") {
      const at = opPath(o.path);
      if (typeof o.text !== "string" || !isMarkdown(at.path)) throw refuse("invalid");
      return { op: o.op, ...at, text: o.text };
    }
    throw refuse("invalid");
  });
  for (const op of ops) await assertWritable(op.path).catch(() => { throw refuse("readOnly"); });
  // Deletes are checked before anything changes, because the trash can't be undone from here.
  for (const op of ops) if (op.op === "delete" && !existsSync(op.path)) throw refuse("notFound");
  const undo: (() => Promise<unknown>)[] = [];
  const held = await heldNotes();
  try {
    for (const op of ops) {
      if (op.op === "createFolder") {
        if (existsSync(op.path)) throw refuse("taken");
        if (!(await isDir(dirname(op.path)))) throw refuse("notFound");
        await mkdir(op.path);
        undo.push(() => rm(op.path, { recursive: true, force: true }));
        // Git tracks folders only through files (Files and sharing → Operations).
        await writeFile(join(op.path, ".gitkeep"), "");
      } else if (op.op === "move") {
        const { path: from, to } = op;
        const st = await stat(from).catch(() => undefined);
        if (!st) throw refuse("notFound");
        if (st.isFile() && (!isMarkdown(from) || !isMarkdown(to))) throw refuse("invalid");
        if (st.isDirectory() && inside(from, to)) throw refuse("intoItself");
        const caseOnly = from.toLowerCase() === to.toLowerCase();
        if (!caseOnly && existsSync(to)) throw refuse("taken");
        if (!inside(op.root, to)) {
          // Into the other root: the same folder path there is made if it's missing (Files and sharing → Changing visibility).
          const made = await mkdir(dirname(to), { recursive: true });
          if (made) undo.push(() => rm(made, { recursive: true, force: true }));
        }
        if (!(await isDir(dirname(to)))) throw refuse("notFound");
        await writesDone(from);
        // A held note's line moves first, so its new path is never committed (D-158).
        if (held) {
          await held.moved(from, to);
          undo.push(() => held.moved(to, from));
        }
        if (caseOnly && from !== to) {
          const tmp = `${from}.${process.pid}.move.tmp`;
          await renameRetrying(from, tmp);
          await renameRetrying(tmp, to);
        } else await renameRetrying(from, to);
        undo.push(() => renameRetrying(to, from));
      } else if (op.op === "write") {
        // Only a note that's there (after the batch's moves) is written: never a new file.
        const old = (await isDir(op.path)) ? undefined : await readFile(op.path, "utf8").catch(() => undefined);
        if (old === undefined) throw refuse("notFound");
        await atomicWrite(op.path, op.text);
        undo.push(() => atomicWrite(op.path, old));
      } else if (op.op === "create") {
        // A new note, never over another (the conflict resolver's copies, FIL-12).
        if (existsSync(op.path)) throw refuse("taken");
        if (!(await isDir(dirname(op.path)))) throw refuse("notFound");
        await writeFile(op.path, op.text, { encoding: "utf8", flag: "wx" });
        undo.push(() => rm(op.path, { force: true }));
      }
    }
    for (const op of ops) {
      if (op.op !== "delete") continue;
      await writesDone(op.path);
      await shell.trashItem(op.path).catch(() => { throw refuse("trash"); });
      await held?.removed(op.path).catch(() => {});
    }
  } catch (error) {
    for (const u of undo.reverse()) await u().catch(() => {});
    throw error instanceof Refused ? error : refuse("failed");
  }
  for (const op of ops) {
    if (op.op === "move") {
      parsed.move(op.path, op.to);
      titles.move(op.path, op.to);
      void journal?.moved(op.path, op.to);
    } else if (op.op === "write") void journal?.saved(op.path, op.text);
    else if (op.op === "delete") {
      parsed.delete(op.path);
      titles.delete(op.path);
      void journal?.gone(op.path);
    }
  }
  // What was done, for the batch's one commit.
  return ops.map((op): BatchOp => (op.op === "move" ? { op: "move", from: op.path, to: op.to } : { op: op.op, path: op.path }));
}

// ---- Recently deleted and conflicts (FIL-10, FIL-12) ----

/** A folder deleted notes may be restored into: a root, or a folder in one, that's there. */
async function restoreFolder(p: unknown): Promise<string> {
  if (typeof p !== "string" || !p || !isAbsolute(p) || resolve(p) !== p) throw refuse("invalid");
  const root = roots().find((r) => inside(r.path, p));
  if (!root || relative(root.path, p).split(sep).some((part) => part.startsWith(".")) || !(await isDir(p))) throw refuse("notFound");
  return p;
}
/**
 * Puts deleted notes back from Git history (FIL-10), all or nothing and never over a file (`wx`):
 * where each was, in its root when its folder is gone, or in the chosen folder of the same root
 * (Restore to… doesn't change who can see a note). One commit, like any batch.
 */
async function restoreNotes(rawIds: unknown, rawFolder: unknown): Promise<{ path: string; title: string }[]> {
  const g = await gitOpening;
  if (!g || !isWorkspace()) throw refuse("notFound");
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 1000 || rawIds.some((i) => typeof i !== "string")) throw refuse("invalid");
  const folder = rawFolder === undefined || rawFolder === null ? undefined : await restoreFolder(rawFolder);
  const planned: { path: string; text: string; title: string }[] = [];
  const names = new Map<string, string[]>();
  for (const id of rawIds as string[]) {
    const d = await g.readDeleted(id);
    if (!d) throw refuse("notFound");
    const root = roots().find((r) => r.id === d.root);
    if (!root || !inside(root.path, d.path) || d.path === root.path || (folder && !inside(root.path, folder))) throw refuse("invalid");
    await assertWritable(d.path).catch(() => { throw refuse("readOnly"); });
    const dir = folder ?? ((await isDir(dirname(d.path))) ? dirname(d.path) : root.path);
    const taken = names.get(dir) ?? (await readdir(dir).catch(() => [] as string[]));
    names.set(dir, taken);
    const path = restorePlace({ original: d.path, root: root.path, folder: dir, folderExists: true, taken });
    taken.push(basename(path));
    planned.push({ path, text: d.text, title: titleOrName(d.text, path) });
  }
  const written: string[] = [];
  try {
    for (const p of planned) {
      await writeFile(p.path, p.text, { encoding: "utf8", flag: "wx" });
      written.push(p.path);
    }
  } catch (error) {
    for (const w of written.reverse()) await rm(w, { force: true }).catch(() => {});
    throw refuse((error as NodeJS.ErrnoException).code === "EEXIST" ? "taken" : "failed");
  }
  await g.commitBatch(planned.map((p) => ({ op: "restore", path: p.path })));
  return planned.map(({ path, title }) => ({ path, title }));
}
/** The resolver's choices, checked: notes in the workspace, one of three outcomes, a short copy title. */
function conflictChoices(raw: unknown): ConflictChoice[] {
  if (!Array.isArray(raw) || raw.length > 1000) throw new Error("invalid");
  return raw.map((c: unknown) => {
    const o = c as Record<string, unknown>;
    if (typeof o?.path !== "string" || !isAbsolute(o.path) || !inside(notesHome(), o.path) || !["mine", "theirs", "both"].includes(String(o.choice))) throw new Error("invalid");
    if (o.copyTitle !== undefined && (typeof o.copyTitle !== "string" || o.copyTitle.length > 300)) throw new Error("invalid");
    return { path: resolve(o.path), choice: o.choice as ConflictChoice["choice"], ...(typeof o.copyTitle === "string" ? { copyTitle: o.copyTitle } : {}) };
  });
}

// ---- importing browser notes (FRE-10, D-90) ----
// Only this process reads the bundle: the renderer gets a handle and a count, never the file.
let chosenBundle: { id: string; bundle: Bundle } | undefined;
const fold = (p: string) => p.normalize("NFC").toLowerCase();
/** Every note's path in a root, relative with forward slashes; dot folders skipped as in the scan. */
async function notesIn(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (d.name.startsWith(".")) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) await notesIn(p, base, out);
    else if (d.isFile() && isMarkdown(d.name)) out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}
async function chooseBundle(w: BrowserWindow | undefined): Promise<{ id: string; name: string; notes: number } | undefined> {
  const opts = { properties: ["openFile" as const], filters: [{ name: "Focus Notes export", extensions: ["json"] }] };
  const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
  const file = res.canceled ? undefined : res.filePaths[0];
  if (!file) return undefined;
  // A file that's too large is refused unread (web-app.md → Moving notes).
  const st = await stat(file).catch(() => undefined);
  if (!st?.isFile()) throw new Error("invalid");
  if (st.size > BUNDLE_MAX_BYTES) throw new Error("tooLarge");
  let bundle: Bundle;
  try {
    bundle = parseBundle(await readFile(file, "utf8"));
  } catch {
    throw new Error("invalid");
  }
  chosenBundle = { id: randomUUID(), bundle };
  return { id: chosenBundle.id, name: basename(file), notes: bundle.notes.length };
}
/**
 * Adds the chosen bundle's notes to a root, all or nothing, never replacing a file (`wx`), then
 * commits them as one batch in that root's repository.
 */
async function importBundle(id: unknown, to: unknown): Promise<{ added: number; renamed: number }> {
  if (!chosenBundle || chosenBundle.id !== id) throw refuse("notFound");
  const root = isWorkspace() ? roots().find((r) => r.id === to) : undefined;
  if (!root) throw refuse("invalid");
  await assertWritable(root.path).catch(() => { throw refuse("readOnly"); });
  const { bundle } = chosenBundle;
  const existing = new Map<string, string | undefined>((await notesIn(root.path)).map((p) => [p, undefined]));
  // Only the notes a bundle note could be the same as are read, to skip identical copies.
  const named = new Set(bundle.notes.map((n) => fold(safeWorkspacePath(n.path))));
  for (const p of existing.keys()) if (named.has(fold(p))) existing.set(p, await readFile(join(root.path, ...p.split("/")), "utf8").catch(() => undefined));
  const plan = planImport(bundle, existing, { foldCase: true });
  const written: string[] = [];
  const made: string[] = [];
  try {
    for (const n of plan) {
      const abs = resolve(root.path, ...n.path.split("/"));
      if (!inside(root.path, abs) || abs === root.path) throw refuse("invalid");
      const dir = await mkdir(dirname(abs), { recursive: true });
      if (dir) made.push(dir);
      await writeFile(abs, n.text, { encoding: "utf8", flag: "wx" });
      written.push(abs);
    }
  } catch (error) {
    for (const p of written.reverse()) await rm(p, { force: true }).catch(() => {});
    for (const d of made.reverse()) await rm(d, { recursive: true, force: true }).catch(() => {});
    throw error instanceof Refused ? error : refuse("failed");
  }
  chosenBundle = undefined;
  // Ordinary commits: one for the import, in the chosen root's repository (FRE-10, D-97).
  if (written.length) await (await gitOpening)?.commitBatch(written.map((path) => ({ op: "import", path })));
  return { added: plan.length, renamed: plan.filter((n) => n.renamed).length };
}

// ---- synced settings (PRV-03, D-46) ----
// Only where there's a private repository to sync through; while the file exists, syncing is on.
const privateDir = () => join(notesHome(), "private");
const settingsFile = () => join(privateDir(), ".focus-notes", "settings.json");
const settingsAvailable = () => isWorkspace() && existsSync(privateDir());

/** The renderer page every IPC request must come from (review issue 4). */
const appPageUrl = () => pathToFileURL(join(import.meta.dirname, "..", "renderer", "index.html")).href;
function fromApp(e: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return url.split("?")[0]!.split("#")[0] === appPageUrl();
}
/**
 * The strings no diagnostic report may hold (D-140): Git's user.name and user.email and each
 * repository's remote owner and name (local `git config`, no network), the signed-in login and name,
 * setup's login and repository names, and a workspace-only identity.
 */
async function refreshKnown(): Promise<void> {
  const values: (string | undefined)[] = [];
  const remotes: string[] = [];
  const cfg = async (dir: string, key: string) => {
    const r = await setupRunner({ cwd: dir, args: ["config", "--get", key], read: true }).catch(() => undefined);
    return r?.code === 0 ? r.stdout.trim() : undefined;
  };
  for (const dir of [notesHome(), join(notesHome(), "private")]) {
    if (!existsSync(dir)) continue;
    values.push(await cfg(dir, "user.name"), await cfg(dir, "user.email"));
    const url = await cfg(dir, "remote.origin.url");
    if (url) remotes.push(url);
  }
  values.push(account.account?.login, account.account?.name, workspaceIdentity?.name, workspaceIdentity?.email);
  const s = setupEngine ? (await setupEngine.catch(() => undefined))?.report() : undefined;
  values.push(s?.login, s?.options?.instance, s?.options?.private);
  knownCache = knownStrings(values, remotes);
}

function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!fromApp(e)) throw new Error("Refused: request didn't come from the app");
    await slowSeam(channel);
    return fn(...args);
  });
}
/**
 * The "no silent wait" journey's slow-down (PRF-13, D-149): journeys only, never a packaged app.
 * The journey sets `globalThis.focusNotesSlow = { "<channel>": ms }` in this process, and that call
 * waits that long first, so each wait's sign and words can be checked at their times.
 */
async function slowSeam(channel: string): Promise<void> {
  if (!journey) return;
  const ms = (globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow?.[channel];
  if (typeof ms === "number" && ms > 0) await new Promise((r) => setTimeout(r, Math.min(ms, 60_000)));
}

function registerIpc(win: () => BrowserWindow | undefined): void {
  handle("note:read", async (p) => (await readParsed(notePath(p))).text);
  // ---- Settings → Agents (WP-7.4, AGT-02, D-166) ----
  // The main process reads and writes agents.json and builds every command line; the window only
  // sees the page and asks for a switch by name.
  const agentsData = () => app.getPath("userData");
  const cliBin = () => join(process.resourcesPath, "bin");
  /** Install command-line tool only in an installed app: never development builds or journeys. */
  const cliAvailable = () => app.isPackaged && !journey && existsSync(cliBin());
  const installHost = (): InstallHost => ({
    platform: process.platform, binDir: cliBin(), home: app.getPath("home"), envPath: process.env.PATH ?? "",
    // One of the two fixed scripts, from a temporary file of its own, by Windows PowerShell's absolute
    // path (never a program found on the PATH), with its values in the environment (D-166 (5)).
    powershell: async (script, env) => {
      const exe = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const file = join(tmpdir(), `focus-notes-${randomBytes(8).toString("hex")}.ps1`);
      await writeFile(file, script, { encoding: "utf8", flag: "wx" });
      try {
        return await new Promise<{ code: number; stdout: string }>((resolve) => {
          const p = spawn(exe, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
          let stdout = "";
          p.stdout.on("data", (d: Buffer) => void (stdout += d.toString("utf8")));
          p.on("error", () => resolve({ code: -1, stdout: "" }));
          p.on("exit", (code) => resolve({ code: code ?? -1, stdout }));
        });
      } finally {
        await rm(file, { force: true });
      }
    },
  });
  async function agentsPage(): Promise<AgentsPage> {
    const { permissions, changedOutside } = await readAgentPermissions(agentsData());
    const g = await gitOpening;
    const recent = g ? await g.agentChanges(50).catch(() => []) : [];
    // The app's own executable runs the server (D-165): with the built main script in development.
    const args = [...(app.isPackaged ? [] : [join(import.meta.dirname, "main.mjs")]), "--cli", "mcp", "--data", agentsData()];
    const cli = cliAvailable() ? await cliInstallState(installHost()).catch(() => ({ installed: false, onPath: false })) : { installed: false, onPath: false };
    return { permissions, changedOutside, snippets: connectionSnippets(process.execPath, args, process.platform === "win32" ? "windows" : "posix"), recent, cli: { available: cliAvailable(), ...cli } };
  }
  handle("agents:load", () => agentsPage());
  handle("agents:set", async (raw) => {
    // Exactly the five switches, each true or false; the folder limit is kept as the file has it.
    const o = raw as Record<string, unknown>;
    if (typeof o !== "object" || o === null || Object.keys(o).length !== SWITCHES.length || !SWITCHES.every((k) => typeof o[k] === "boolean")) throw new Error("Not agent switches");
    const { permissions } = await readAgentPermissions(agentsData());
    await writeAgentPermissions(agentsData(), { ...permissions, ...(Object.fromEntries(SWITCHES.map((k) => [k, o[k] === true])) as Pick<AgentPermissions, SwitchId>) });
    return agentsPage();
  });
  handle("agents:undo", async (repo, commit) => {
    if ((repo !== "notes" && repo !== "private") || typeof commit !== "string" || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) return { problem: "notAgent" };
    const g = await gitOpening;
    return g ? g.undoAgentChange(repo, commit) : { problem: "failed" };
  });
  handle("agents:installCli", async () => {
    if (!cliAvailable()) return { installed: false, onPath: false, problem: "unavailable" };
    return installCli(installHost()).catch(() => ({ installed: false, onPath: false, problem: "failed" }));
  });
  // The link the app was opened with (or the latest one), taken once (D-165).
  handle("deeplink:take", async () => {
    const l = pendingLink;
    pendingLink = undefined;
    return l ? resolveDeepLink(l) : undefined;
  });
  // The search index's reads (D-107): a batch per call, past the snapshot, which is for opened notes.
  handle("notes:read", async (ps) => {
    if (!Array.isArray(ps) || ps.length > NOTES_PER_READ) throw new Error(`Up to ${NOTES_PER_READ} note paths are required`);
    const paths = ps.map((p) => { try { return notePath(p); } catch { return undefined; } });
    // A few files at a time, so the app's own reads and writes (opening a note, saving) never wait
    // behind a whole batch for Node's file threads.
    const out: (string | null)[] = [];
    for (let i = 0; i < paths.length; i += FILES_AT_ONCE) {
      out.push(...(await Promise.all(paths.slice(i, i + FILES_AT_ONCE).map((p) => (p ? readFile(p, "utf8").catch(() => null) : null)))));
    }
    return out;
  });
  handle("note:write", async (p, content) => {
    if (typeof content !== "string") throw new Error("Content must be text");
    const path = notePath(p);
    // The app saves its latest text: this supersedes every text the journal was sent before it (QLT-03).
    const upTo = journal?.mark();
    // How much changed decides when it's backed up (D-133): against the text last written here, or on disk.
    const before = lastWritten.get(path) ?? (await readFile(path, "utf8").catch(() => ""));
    await atomicWrite(path, content);
    lastWritten.set(path, content);
    void journal?.saved(path, content, upTo);
    withGit((g) => g.written(path, changedChars(before, content)));
  });
  handle("note:choose", async () => {
    const w = win();
    const opts = { properties: ["openFile" as const], defaultPath: notesHome(), filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? undefined : res.filePaths[0];
  });
  handle("note:default", async () => {
    const p = isWorkspace() ? join(notesRoot(), "welcome.md") : join(notesHome(), "Welcome.md");
    // Made here in a workspace without a private repository: held like any new public note (D-158).
    if (!existsSync(p) && isWorkspace() && !hasPrivate()) await (await heldNotes())?.hold(p).catch(() => {});
    // Not written into a workspace this app mustn't write (DST-05): the app then shows it can't open it.
    if (!existsSync(p)) await atomicWrite(p, WELCOME).catch(() => {});
    return p;
  });
  handle("note:newPath", async (near) => {
    const dir = typeof near === "string" && near ? dirname(notePath(near)) : notesRoot();
    for (let i = 1; ; i++) {
      const p = join(dir, i === 1 ? "Untitled.md" : `Untitled ${i}.md`);
      if (existsSync(p)) continue;
      // Without a private repository, a new public note is held before its file is first written (D-158).
      if (isWorkspace() && !hasPrivate() && inside(join(notesHome(), "notes"), p)) await (await heldNotes())?.hold(p);
      return p;
    }
  });
  // The Pages site the public root publishes to (SHR-03, D-139): setup's, or the notes repository's origin on github.com.
  const pagesSite = async () => (await setup()).report().site ?? siteFromGitConfig(await readFile(join(notesHome(), ".git", "config"), "utf8"));
  handle("workspace:info", async () => {
    const format = await readFormat();
    const site = await pagesSite().catch(() => undefined);
    return { folder: notesHome(), ...(format !== undefined ? { format } : {}), ...(site ? { site } : {}) };
  });
  handle("workspace:scan", async () => {
    const rs = roots();
    const entries = [];
    for (const r of rs) entries.push(...(await listTree(r.path)));
    return { folder: notesHome(), roots: rs, entries };
  });
  handle("workspace:writeFormat", async (text) => {
    // Only a format file this app writes itself: the current version (a migration the person agreed to).
    if (typeof text !== "string" || readWorkspaceFormat(text).access !== "write" || text.length > 64 * 1024) throw new Error("Not a workspace format file");
    await atomicWrite(formatFile(), text);
  });
  handle("workspace:rename", async (from, to) => {
    const a = notePath(from);
    const b = notePath(to);
    // A file name that follows its title (FIL-07): same folder, inside the workspace, never over another note.
    if (dirname(a) !== dirname(b) || !inside(notesHome(), a) || basename(b).startsWith(".")) throw new Error("Can't rename there");
    await assertWritable(a);
    await (writeQueues.get(a) ?? Promise.resolve()).catch(() => {});
    const caseOnly = a.toLowerCase() === b.toLowerCase();
    if (!caseOnly && existsSync(b)) throw new Error("That name is taken");
    // A held note's line follows it before the file moves, so its new name is never committed (D-158).
    const held = await heldNotes();
    await held?.moved(a, b);
    try {
      if (caseOnly && a !== b) {
        // Case-insensitive file systems need two steps for a change of case.
        const tmp = `${a}.${process.pid}.rename.tmp`;
        await renameRetrying(a, tmp);
        await renameRetrying(tmp, b);
      } else await renameRetrying(a, b);
    } catch (error) {
      await held?.moved(b, a).catch(() => {});
      throw error;
    }
    parsed.move(a, b);
    void journal?.moved(a, b);
    withGit((g) => g.renamed(a, b));
  });
  // Each batch is one commit (FIL-05, D-94): resolved after the commit, so "saved" means saved (PRF-09).
  // A commit that fails leaves the files as the batch made them and is reported as a sync problem.
  handle("workspace:apply", async (ops) => {
    const done = await applyOps(ops);
    await (await gitOpening)?.commitBatch(done);
  });
  handle("bundle:choose", () => chooseBundle(win()));
  handle("bundle:import", (id, to) => importBundle(id, to));
  handle("settings:load", async () => {
    if (!settingsAvailable()) return { available: false };
    const text = await readFile(settingsFile(), "utf8").catch(() => undefined);
    return { available: true, ...(text !== undefined && text.length <= 64 * 1024 ? { text } : {}) };
  });
  handle("settings:save", async (text) => {
    // Only a settings file, and only what's valid in it, is ever written (schemas/settings.schema.json).
    const parsed = typeof text === "string" && text.length <= 64 * 1024 ? parseSettings(text) : undefined;
    if (!settingsAvailable() || !parsed) throw new Error("Not a settings file");
    await atomicWrite(settingsFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    withGit((g) => g.written(settingsFile()));
  });
  handle("settings:remove", async () => {
    if (!settingsAvailable()) return;
    await assertWritable(settingsFile());
    await rm(settingsFile(), { force: true });
    withGit((g) => g.written(settingsFile()));
  });
  // Share audiences (WP-5.3, D-134): only this process writes access.json and makes its secrets.
  const access = accessStore({
    dir: privateDir,
    site: pagesSite,
    write: atomicWrite,
    written: (file) => withGit((g) => g.written(file)),
  });
  handle("access:load", async () => (settingsAvailable() ? access.load() : { available: false, vault: false, grants: [] }));
  handle("access:apply", async (change) => {
    if (!settingsAvailable()) throw new Error("access:failed");
    return access.apply(change);
  });
  // A secret goes to the window only for an open invite, and to the clipboard only from here, cleared after 90 s (review L1, L2).
  // Journeys copy into memory, so they never overwrite (or depend on) the computer's clipboard.
  const secretCopy = secretClipboard(appClipboard());
  handle("access:reveal", async (id) => access.reveal(id));
  handle("access:template", async (template) => {
    if (!settingsAvailable()) throw new Error("access:failed");
    return access.setTemplate(template);
  });
  handle("access:copy", async (id, what, invite) => secretCopy.write(await access.secret(id, what, invite)));
  // Local diagnostics (QLT-04, D-140): built and redacted here; copied or saved only when the person asks.
  const diag = diagnostics({
    // Started from its built script (journeys, `pnpm dev`), Electron would report its own version: read the app's.
    app: { version: app.isPackaged ? app.getVersion() : devVersion(), packaged: app.isPackaged },
    os: { platform: process.platform, release: osRelease(), arch: process.arch },
    runtime: { electron: process.versions.electron ?? "", chrome: process.versions.chrome ?? "", node: process.versions.node },
    git: () => account.gitCheck(),
    sync: async () => {
      const g = await gitOpening;
      if (!g) return undefined;
      const report = await g.status();
      // Conflicts are counted only when the report says there are some: never waits behind a sync otherwise.
      const conflicts = report.problem === "conflict" ? await Promise.race([g.conflicts().then((c) => c.length), new Promise<number>((r) => setTimeout(() => r(-1), 5000))]) : 0;
      return { report, repositories: await g.health(), conflicts };
    },
    journal: () => journal?.entries() ?? [],
    compositing: () => compositing().current(),
    state: async () => JSON.parse(await readFile(stateFile(), "utf8")) as Record<string, unknown>,
    log: problemLog,
    redaction,
    refresh: refreshKnown,
  });
  handle("diagnostics:preview", () => diag.preview());
  handle("diagnostics:copy", async (timings) => appClipboard().writeText(await diag.report(timings)));
  handle("diagnostics:save", async (timings) => {
    const w = win();
    // Never into the workspace (it would be committed, maybe published) or the app's data folder: ask again.
    const forbidden = [notesHome(), app.getPath("userData")];
    const real = (p: string) => {
      try {
        return realpathSync.native(p);
      } catch {
        return undefined;
      }
    };
    let title = "Save diagnostic report";
    for (let ask = 0; ask < 3; ask++) {
      const opts: Electron.SaveDialogOptions = { title, defaultPath: join(app.getPath("documents"), reportFileName(Date.now())), filters: [{ name: "Markdown", extensions: ["md"] }], properties: ["showOverwriteConfirmation", "createDirectory"] };
      const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return false;
      if (!reportPathAllowed(r.filePath, forbidden, { real })) {
        title = "Choose a folder outside your notes";
        continue;
      }
      await writeFile(r.filePath, await diag.report(timings), "utf8");
      return true;
    }
    return false;
  });
  // Report a problem: the report on the clipboard, then a fixed address (never one from the window, never with the report in it).
  handle("diagnostics:reportProblem", async (timings) => {
    appClipboard().writeText(await diag.report(timings));
    await shell.openExternal(REPORT_PROBLEM_URL);
  });
  handle("sync:now", async (reason) => {
    const g = await gitOpening;
    return g ? g.request(reason === "switch" ? "switch" : "save") : NO_GIT;
  });
  // New notes without a private repository (D-158): the held lists, and the writer's answer for one.
  handle("held:list", async () => (await (await heldNotes())?.list()) ?? { waiting: [], local: [] });
  handle("held:answer", async (p, choice) => {
    const path = notePath(p);
    if (choice !== "public" && choice !== "local") throw new Error("Answer public or local");
    const held = await heldNotes();
    if (!held) return { waiting: [], local: [] };
    await held.answer(path, choice);
    // Made public: it's backed up like any change, with the next save.
    if (choice === "public" && existsSync(path)) withGit((g) => g.written(path));
    return held.list();
  });
  handle("sync:status", async () => {
    const g = await gitOpening;
    return g ? g.status() : NO_GIT;
  });
  handle("setup:status", async () => (await setup()).report());
  // The folder is the main process's own: the one setup started with, or the one chosen with the dialog (D-98).
  handle("setup:start", async (options, passphrase) => (await setup()).start(checkOptions({ ...(options as object), ...(await setupWhere((options as { instance?: unknown } | undefined)?.instance as string | undefined)) }), passphraseArg(passphrase)));
  // Download somewhere else (D-154): the system's dialog, or the next free folder beside the default. Undefined: cancelled.
  handle("setup:useFolder", async (how) => {
    const folder = how === "choose" ? await chooseFolder("Choose a folder for your notes") : how === "new" ? await freeFor((await setup()).report().options?.instance ?? DEFAULT_SETUP.instance) : undefined;
    if (!folder) return undefined;
    if (how === "choose") targetFolder = folder;
    return (await setup()).useFolder(folder, how === "choose");
  });
  handle("setup:retry", async (id, passphrase) => {
    if (!(SETUP_STEPS as readonly unknown[]).includes(id)) throw new Error("Unknown setup step");
    await setupWhere();
    return (await setup()).retry(id as SetupStepId, passphraseArg(passphrase));
  });
  handle("setup:reset", async () => (await setup()).reset());
  handle("setup:strength", async (p) => passphraseStrength(passphraseArg(p) ?? ""));
  handle("firstRun:git", () => account.gitCheck());
  handle("firstRun:account", () => account.status());
  handle("firstRun:useExisting", () => account.useExisting());
  handle("firstRun:signIn", (device) => account.signIn(device === true));
  handle("firstRun:cancelSignIn", async () => account.cancel());
  handle("firstRun:useToken", async (token) => {
    if (typeof token !== "string" || token.length > 255) throw new Error("Not a token");
    return account.useToken(token);
  });
  handle("firstRun:signOut", async (options) => {
    const s = await account.signOut({ git: (options as { git?: unknown } | undefined)?.git !== false });
    if (!s.account || s.signedOut) await forgetLocal("signOut");
    return s;
  });
  handle("firstRun:beginSwitch", () => account.beginSwitch());
  handle("firstRun:endSwitch", () => account.endSwitch());
  handle("workspace:removal", () => removal());
  handle("workspace:remove", () => removeLocalWorkspace());
  handle("firstRun:identity", () => account.identity());
  handle("firstRun:setIdentity", async (i, scope) => {
    const id = { name: String(i?.name ?? "").trim(), email: String(i?.email ?? "").trim() };
    if (identityProblem(id)) return false;
    if (scope === "global") return account.setGlobalIdentity(id);
    if (scope !== "workspace") return false;
    workspaceIdentity = id;
    await saveFirstRun();
    return true;
  });
  handle("firstRun:repositories", () => repositories());
  // Where Create my notes will put them, for the name typed (D-155).
  handle("firstRun:folder", async (instance) => (await setupWhere(typeof instance === "string" ? instance : undefined)).folder);
  handle("firstRun:chooseFolder", async () => {
    const folder = await chooseFolder("Choose a folder for your workspace");
    if (folder) targetFolder = folder;
    return folder;
  });
  handle("firstRun:clone", async (owner, name, where): Promise<WorkspaceResult> => {
    if (typeof owner !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(owner) || typeof name !== "string" || !isRepoName(name)) throw new Error("Not a repository");
    // Use a new folder (D-154): the next free one beside the default, not the chosen one.
    if (where === "new") targetFolder = undefined;
    const r = await cloneWorkspace(setupRunner, remoteUrl(owner, name), targetFolder ?? (await freeFor(name)), isTemplateRemote, (p) => firstRunProgress({ op: "clone", ...p }));
    if (r.ok) pendingWorkspace = r.folder;
    return r;
  });
  handle("firstRun:openFolder", async (): Promise<WorkspaceResult | undefined> => {
    const folder = await chooseFolder("Open a workspace folder");
    if (!folder) return undefined;
    const r = await checkWorkspace(setupRunner, folder, isTemplateRemote);
    if (r.ok) pendingWorkspace = folder;
    return r;
  });
  handle("firstRun:openWorkspace", async (): Promise<WorkspaceResult> => {
    const report = (await setup()).report();
    const made = ["clone", "link"].every((id) => report.steps.find((x) => x.id === id)?.state === "done");
    const folder = pendingWorkspace ?? (made ? report.options?.folder : undefined);
    if (!folder) return { ok: false, problem: "failed" };
    const r = await checkWorkspace(setupRunner, folder, isTemplateRemote);
    if (r.ok) await switchWorkspace(folder);
    return r;
  });
  ipcMain.on("firstRun:openPage", (e, page: unknown) => {
    if (!fromApp(e) || typeof page !== "string" || !Object.hasOwn(FIRST_RUN_PAGES, page)) return;
    void shell.openExternal(FIRST_RUN_PAGES[page as FirstRunPage]);
  });
  handle("sync:conflicts", async () => (await gitOpening)?.conflicts() ?? []);
  handle("sync:resolve", async (choices) => {
    const checked = conflictChoices(choices);
    const g = await gitOpening;
    return g ? g.resolve(checked) : NO_GIT;
  });
  handle("history:deleted", async () => (isWorkspace() ? (await gitOpening)?.deleted() ?? [] : []));
  handle("history:restore", (ids, folder) => restoreNotes(ids, folder));
  windowFrame?.registerIpc(fromApp, win);
  // macOS's menu bar (DSK-05): the renderer builds it from its commands; choosing an item runs the command there.
  if (platform === "macos") {
    const menuBar = new AppMenuBar<Electron.Menu>(Menu, (id, byKey) => win()?.webContents.send("menu:run", id, byKey));
    ipcMain.on("menu:set", (e, model: unknown) => {
      if (fromApp(e)) menuBar.set(model);
    });
  }
  handle("window:fullScreen", async () => {
    if (windowFrame?.toggleFullScreen()) return;
    const w = win();
    if (w) w.setFullScreen(!w.isFullScreen());
  });
  // The recovery journal (QLT-03): unsaved text, appended off the typing path; and what this launch restored.
  handle("journal:write", async (p, text) => {
    if (typeof text !== "string") throw new Error("Content must be text");
    await journal?.text(notePath(p), text);
  });
  handle("journal:restored", async () => restored.splice(0));
  handle("state:load", async () => {
    try {
      const s = JSON.parse(await readFile(stateFile(), "utf8"));
      return s && s.version === 1 ? s : { version: 1 };
    } catch {
      return { version: 1 };
    }
  });
  handle("state:save", async (s) => {
    if (!s || s.version !== 1) throw new Error("Unknown state version");
    await atomicWrite(stateFile(), JSON.stringify(s, null, 2));
  });
  // Copying a link's address (EDT-13). Text only, and never read back: the renderer can't read the clipboard.
  handle("clipboard:write", async (text) => {
    if (typeof text !== "string" || text.length > 10_000) throw new Error("Only text can be copied");
    // Journeys copy into memory, never the computer's clipboard.
    appClipboard().writeText(text);
  });
  // A link from a note (EDT-13): only http, https, and mailto, and only in the user's browser.
  ipcMain.on("link:open", (e, url: unknown) => {
    if (!fromApp(e) || typeof url !== "string" || !isWebLink(url)) return;
    void shell.openExternal(url);
  });
  ipcMain.on("app:ready", (e) => {
    if (!fromApp(e)) return;
    // From process start (PRF-02: "desktop start to an editable caret"), including Electron's own startup.
    const ms = Math.round(process.uptime() * 1000);
    process.stdout.write(`[focus-notes] ready-ms=${ms}\n`);
    startGit();
    windowFrame?.ready();
  });
}

function hardenSession(): void {
  // No network: only the app's own files and DevTools may load (PRV-01, PKG-06).
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = allowedRequest(details.url);
    if (!ok) process.stdout.write(`[focus-notes] blocked request to ${new URL(details.url).origin}\n`);
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** Paper's and Ink's canvas (`color.canvas`): the native window's background for a theme it doesn't know. */
const CANVAS = { light: themeCanvas("paper", "light"), dark: themeCanvas("ink", "dark") } as const;
/**
 * The theme the page's first frame is drawn in (DSK-09, D-148), resolved before the page loads from
 * this device's appearance (state.json) and the system's scheme, and passed in the page's address so
 * the boot styles paint its canvas from the first frame.
 */
function bootTheme(): { scheme: "light" | "dark"; theme: string } {
  let s: { appearance?: unknown; lightTheme?: unknown; darkTheme?: unknown } = {};
  try {
    s = JSON.parse(readFileSync(stateFile(), "utf8")) as typeof s;
  } catch {
    // A new install: the system's scheme, the default themes.
  }
  const scheme = s.appearance === "light" || s.appearance === "dark" ? s.appearance : nativeTheme.shouldUseDarkColors ? "dark" : "light";
  const chosen = scheme === "dark" ? s.darkTheme : s.lightTheme;
  return { scheme, theme: typeof chosen === "string" && /^[a-z][a-z0-9-]{0,40}$/.test(chosen) ? chosen : scheme === "dark" ? "ink" : "paper" };
}
/** How long the window waits for the page's first themed frame before it shows anyway. */
const FIRST_FRAME_TIMEOUT_MS = 4000;

function createWindow(frame: AppWindowFrame): BrowserWindow {
  const boot = bootTheme();
  const win = new BrowserWindow({
    minWidth: 360,
    minHeight: 320,
    show: false,
    title: "Focus Notes",
    backgroundColor: themeCanvas(boot.theme, boot.scheme),
    // The app icon (build/icon.svg) for the window and the taskbar; macOS takes the bundle's.
    ...(platform === "macos" ? {} : { icon: join(import.meta.dirname, "icon.png") }),
    // Where it was last time, and how it's drawn on this platform.
    ...frame.options(),
    ...(journey ? JOURNEY_WINDOW_OPTIONS : {}),
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      ...HARDENED_WEB_PREFERENCES,
      spellcheck: true,
      devTools: !app.isPackaged || process.env.FOCUS_NOTES_DEVTOOLS === "1",
    },
  });
  if (journey) keepOutOfTheWay(win);
  // Shown once the page has drawn its first themed frame with the app's layout (`fn:window.firstFrame`),
  // never on DOM ready alone: a transparent window shows an unpainted page as white or see-through.
  let shown = false;
  const show = (on: "first-frame" | "timeout") => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    clearTimeout(fallback);
    ipcMain.removeListener("window:firstFrame", onFirstFrame);
    process.stdout.write(`[focus-notes] window-shown on=${on}\n`);
    if (journey) win.showInactive();
    else win.show();
  };
  const onFirstFrame = (e: IpcMainEvent) => {
    if (e.sender === win.webContents && fromApp(e)) show("first-frame");
  };
  ipcMain.on("window:firstFrame", onFirstFrame);
  let fallback: ReturnType<typeof setTimeout> | undefined;
  win.once("ready-to-show", () => (fallback = setTimeout(() => show("timeout"), FIRST_FRAME_TIMEOUT_MS)));
  win.on("closed", () => {
    clearTimeout(fallback);
    ipcMain.removeListener("window:firstFrame", onFirstFrame);
  });
  frame.attach(win);
  // ⇧⌘V pastes plain text on macOS too (Keyboard shortcuts → Everyday editing), where Chromium binds
  // only ⌥⇧⌘V. The renderer still sees Shift held, so the editor pastes the text as it is (EDT-09).
  if (platform === "macos") {
    win.webContents.on("before-input-event", (_e, input) => {
      if (input.type === "keyDown" && input.meta && input.shift && !input.alt && !input.control && input.key.toLowerCase() === "v") win.webContents.pasteAndMatchStyle();
    });
  }
  // End-to-end tests turn the warm-up after start off, so their timing stays the same (PRF-10).
  // GPU or software compositing (D-121): in software the note's edges fade without the blur.
  const gpu = compositing();
  // The theme is read again each time, so a page loaded after a crash paints the theme showing now.
  const load = () => {
    const b = bootTheme();
    return win.loadFile(join(import.meta.dirname, "..", "renderer", "index.html"), { query: { platform, compositing: gpu.current(), theme: b.theme, scheme: b.scheme, ...frame.query(), ...(devEnv("FOCUS_NOTES_WARMUP") === "0" ? { warmup: "0" } : {}) } });
  };
  void load();
  // The theme's canvas now: the window's cover after a renderer crash is painted in it.
  let canvasNow = themeCanvas(boot.theme, boot.scheme);
  // After a renderer crash, the page is loaded again behind a cover in that canvas (DSK-09, D-148):
  // the window never shows white or see-through while it paints. allow-reload: renderer crash.
  let cover: View | undefined;
  const recovery = new CrashRecovery({
    canvas: () => canvasNow,
    cover: {
      show: (color) => {
        if (win.isDestroyed()) return;
        const v = new View();
        v.setBackgroundColor(color);
        const [width, height] = win.getContentSize();
        const margin = frame.margin();
        v.setBounds(coverBounds({ width: width!, height: height! }, margin));
        if (margin) v.setBorderRadius(WINDOW_METRICS.radius);
        win.contentView.addChildView(v);
        cover = v;
      },
      hide: () => {
        if (cover && !win.isDestroyed()) win.contentView.removeChildView(cover);
        cover = undefined;
      },
    },
    restore: async () => {
      if (journal) restored = [...restored, ...(await restoreUnsaved(journal))];
    },
    load: () => void load().catch(() => {}),
    onFirstFrame: (f) => {
      const on = (e: IpcMainEvent) => {
        if (e.sender === win.webContents && fromApp(e)) f();
      };
      ipcMain.on("window:firstFrame", on);
      return () => ipcMain.removeListener("window:firstFrame", on);
    },
    log: logLine,
  });
  win.webContents.on("render-process-gone", (_e, d) => void recovery.gone(d.reason));
  const offCompositing = gpu.onChange((c) => win.webContents.send("compositing:changed", c));
  // Again once loaded: a change while the page loaded would be missed (the app ignores the same value).
  win.webContents.on("did-finish-load", () => win.webContents.send("compositing:changed", gpu.current()));
  win.on("closed", offCompositing);

  // Ask the renderer to save pending changes before the window closes (QLT-03). If saving fails,
  // the person decides; text is never discarded silently.
  let closing = false;
  let allowClose = false;
  win.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    if (closing) return;
    closing = true;
    const decide = async (ok: boolean) => {
      if (ok) {
        allowClose = true;
        win.close();
        return;
      }
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        message: "Couldn't save your latest changes",
        detail: "Your text is still in the window. If you close now, the changes since the last save will be lost.",
        buttons: ["Keep the window open", "Close without saving"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      closing = false;
      if (response === 1) {
        // The person chose to lose those changes: they aren't brought back at the next launch.
        await journal?.clear();
        allowClose = true;
        win.close();
      }
    };
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners("app:flushed");
      void decide(false);
    }, 5000);
    ipcMain.once("app:flushed", (_e, ok: unknown) => {
      clearTimeout(timer);
      void decide(ok === true);
    });
    win.webContents.send("app:flush");
  });

  nativeTheme.on("updated", () => {
    const d = nativeTheme.shouldUseDarkColors;
    win.webContents.send("scheme:changed", d ? "dark" : "light");
  });
  ipcMain.on("window:scheme", (e, scheme: unknown, canvas: unknown, accent: unknown) => {
    if (!fromApp(e) || (scheme !== "light" && scheme !== "dark")) return;
    const color = typeof canvas === "string" && /^#[0-9a-f]{6}$/i.test(canvas) ? canvas : CANVAS[scheme];
    canvasNow = color;
    // The transparent window stays transparent: the page draws the window's canvas inside its shadow margin.
    win.setBackgroundColor(frame.kind === "custom" ? "#00000000" : color);
    frame.setAccent(accent);
  });
  return win;
}

app.on("web-contents-created", (_e, contents) => {
  // The app never navigates: dropped files, links, and redirects can't replace it (review issue 4).
  contents.on("will-navigate", (e) => e.preventDefault());
  contents.on("will-redirect", (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    // Links open in the user's browser, only for https and mailto (Views as data → Security).
    if (/^(https|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

/**
 * Watches the workspace for changes made outside the app (Desktop and Git → External changes).
 * Events are batched for 30 ms, checked against the disk, and sent as one report (PRF-11).
 * Git's own files, dot folders, and the app's temporary files aren't reported.
 */
function watchWorkspace(win: () => BrowserWindow | undefined): TreeWatcher | undefined {
  const home = notesHome();
  const formatRel = join(".focus-notes", "workspace.json");
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const report = async () => {
    timer = undefined;
    // A pull or a conflict being settled rewrites files: they're read once it's over, so the app
    // never sees a half-applied state (a rebase's conflict markers) as a change made outside.
    await gitSync?.writable().catch(() => {});
    if (timer) return; // More changes came meanwhile: they're reported together.
    const rels = [...pending];
    pending.clear();
    const changes: { path: string; kind: "note" | "folder" | "format"; exists: boolean; title?: string }[] = [];
    for (const rel of rels) {
      const p = join(home, rel);
      if (rel === formatRel) {
        changes.push({ path: p, kind: "format", exists: existsSync(p) });
        continue;
      }
      const st = await stat(p).catch(() => undefined);
      if (!st) changes.push({ path: p, kind: isMarkdown(p) ? "note" : "folder", exists: false });
      else if (st.isDirectory()) {
        changes.push({ path: p, kind: "folder", exists: true });
        for (const e of await listTree(p)) changes.push({ ...e, exists: true });
      } else if (isMarkdown(p)) {
        const title = await readTitle(p);
        changes.push({ path: p, kind: "note", exists: true, ...(title ? { title } : {}) });
      }
    }
    if (!changes.length) return;
    // Anything that changed on disk changes the Git status cache's key (PRF-07).
    gitSync?.changed();
    win()?.webContents.send("workspace:changed", changes);
    // Counts and times only: note names are private.
    process.stdout.write(`[focus-notes] workspace-changed n=${changes.length} at=${Date.now()}\n`);
  };
  try {
    // The real path: on Windows, a short (8.3) folder name makes the watcher report wrong names.
    return watchTree(realpathSync.native(home), (rel) => {
      const hidden = rel.split(sep).some((part) => part.startsWith(".") || part === "node_modules");
      if ((hidden && rel !== formatRel) || rel.endsWith(".tmp")) return;
      pending.add(rel);
      clearTimeout(timer);
      timer = setTimeout(() => void report(), 30);
    }, { hidden: [".focus-notes"] });
  } catch {
    return undefined; // No watcher (an unsupported file system): the app still works, without live updates.
  }
}

let mainWindow: BrowserWindow | undefined;
let watcher: TreeWatcher | undefined;

// ---- deep links (WP-7.3, AGT-06, D-165) ----
// Read-only, and accepted only in their exact shape (`parseDeepLink`). Windows and Linux pass them
// as arguments (at start, or a second instance's); macOS sends open-url. Only a packaged app
// registers the scheme: never development builds or journeys, which mustn't change the computer.
let pendingLink: DeepLink | undefined = process.argv.map(parseDeepLink).find((l): l is DeepLink => l !== undefined);
const linkArrived = (l: DeepLink | undefined) => {
  if (!l) return;
  pendingLink = l;
  mainWindow?.webContents.send("deeplink:arrived");
};
if (app.isPackaged && !journey && primary) app.setAsDefaultProtocolClient("focus-notes");
app.on("open-url", (e, url) => {
  e.preventDefault();
  linkArrived(parseDeepLink(url));
});
/**
 * A link's note, only if it's there in the open workspace's roots, under the agents' rules
 * (resolveAgentPath, D-145): every part of the path spelled exactly as on disk, none a symbolic
 * link, a junction, or a short name (its real path is itself), and the note with no second hard
 * link. The path it returns is the root's own path and those same checked names, so the note opened
 * is the one checked; reading it goes through the app's own checks as any note does.
 */
async function resolveDeepLink(l: DeepLink): Promise<ResolvedDeepLink | undefined> {
  if (l.kind === "search") return l;
  const id = agentRootOf(l.path);
  const root = isWorkspace() ? roots().find((r) => r.id === id) : undefined;
  if (!id || !root) return undefined;
  const fold = (p: string) => (process.platform === "win32" || process.platform === "darwin" ? p.toLowerCase() : p);
  const segments = l.path.slice(agentRootDir(id).length + 1).split("/");
  const rootReal = await realpath(root.path).catch(() => undefined);
  if (!rootReal) return undefined;
  let cur = rootReal;
  for (const seg of segments) {
    const next = join(cur, seg);
    const st = await lstat(next).catch(() => undefined);
    if (!st || st.isSymbolicLink()) return undefined;
    if (!(await readdir(cur).catch(() => [] as string[])).includes(seg)) return undefined;
    const real = await realpath(next).catch(() => undefined);
    if (!real || fold(real) !== fold(next)) return undefined;
    cur = next;
  }
  const st = await stat(cur).catch(() => undefined);
  if (!st?.isFile() || st.nlink > 1) return undefined;
  return { kind: "open", path: join(root.path, ...segments), ...(l.heading ? { heading: l.heading } : {}) };
}
app.whenReady().then(async () => {
  chosenHome = readChosenHome();
  readFirstRun();
  hardenSession();
  windowFrame = new AppWindowFrame(frameKind, join(app.getPath("userData"), DATA_FILES.window), journey);
  registerIpc(() => mainWindow);
  await stat(notesHome()).catch(() => mkdir(notesHome(), { recursive: true }));
  // What a crash left unsaved goes back into its notes before the window reads any (QLT-03).
  // Only the first instance has a journal: it's the one writing it.
  if (primary) journal = await RecoveryJournal.open(dataFile(DATA_FILES.journal), {
    baseOf: async (p) => {
      await (writeQueues.get(p) ?? Promise.resolve()).catch(() => {});
      return readParsed(p).then((n) => n.hash, () => undefined);
    },
    log: logLine,
  });
  if (journal) restored = await restoreUnsaved(journal);
  if (restored.length) process.stdout.write(`[focus-notes] journal: restored ${restored.length}\n`);
  mainWindow = createWindow(windowFrame);
  watcher = watchWorkspace(() => mainWindow);
  // Never on the path of the first frame: Git answers when it answers (PRF-07).
  // Git opens once the caret is ready, or after 3 s if the note never becomes ready.
  setTimeout(() => (startGit(), windowFrame?.ready()), 3000);
  // Fetching when the window becomes active (Desktop and Git → Save and sync, step 5).
  mainWindow.on("focus", () => gitSync?.focused());
  app.on("second-instance", (_e, argv) => {
    linkArrived(argv.map(parseDeepLink).find((l): l is DeepLink => l !== undefined));
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
});
app.on("window-all-closed", () => {
  watcher?.close();
  app.quit();
});
// Quitting waits for writes already under way, so a preference saved just before closing is kept,
// then commits and pushes (D-23) and releases the workspace's lock.
let gitQuit = false;
let journalClosed = false;
const QUIT_GIT_LIMIT_MS = 8_000;
app.on("will-quit", (e) => {
  if (writeQueues.size === 0 && (gitQuit || !gitSync) && (journalClosed || !journal)) return;
  e.preventDefault();
  void Promise.allSettled([...writeQueues.values()])
    .then(async () => {
      if (gitQuit) return;
      gitQuit = true;
      // Quitting never hangs on the network: the commit is local, and a push that doesn't finish
      // in time is retried at the next start.
      await Promise.race([gitSync?.quit().catch(() => {}), new Promise((r) => setTimeout(r, QUIT_GIT_LIMIT_MS))]);
    })
    // Everything is saved: the journal goes (it stays if something isn't).
    .then(async () => {
      if (!journalClosed) await journal?.close();
      journalClosed = true;
    })
    .then(() => app.quit());
});
