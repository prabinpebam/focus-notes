/**
 * Deleting a project (PRJ-23, D-413, DD-PROJ-09 to 17; Settings → Project → Delete project…).
 * GitHub's side is deleted on GitHub's own Settings page; Focus Notes verifies deletion by checking
 * authenticated GET /repos/{owner}/{repo} === 404 AND GET /user === 200 in the same check. This
 * computer's side moves the project's folder to the Recycle Bin, never deletes it outright,
 * and only the open project's own folder: never a drive's root, the home folder or the app's data.
 */
import { existsSync, realpathSync } from "node:fs";
import { cp, lstat, mkdtemp, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import type { DeletionCheck, DeletionResult, RepoStatus } from "@focus-notes/core";
import { GitHubError } from "@focus-notes/github";
import { createRunner, type GitRunner } from "../git/run.ts";
import { unpushedPaths, waitsForBackup } from "../git/backup-state.ts";
import { parseStatus, STATUS_ARGS } from "../git/status.ts";

const real = (p: string) => {
  try {
    const r = realpathSync.native(resolve(p));
    return process.platform === "win32" || process.platform === "darwin" ? r.toLowerCase() : r;
  } catch {
    return undefined;
  }
};
const within = (base: string, p: string) => {
  const r = relative(base, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

/** owner/name as GitHub allows them, never a path. */
export const isRepoSlug = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9-]{1,39}\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/.test(s);

export async function deletionFolderIdentity(folder: string) {
  const path = await realpath(folder);
  const info = await stat(path, { bigint: true });
  return { path, dev: info.dev, ino: info.ino };
}

export async function sameDeletionFolder(folder: string, expected: Awaited<ReturnType<typeof deletionFolderIdentity>>): Promise<boolean> {
  try {
    const current = await deletionFolderIdentity(folder);
    return current.path === expected.path && current.dev === expected.dev && current.ino === expected.ino;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/** How many notes a folder holds, its own dot-folders left out. */
export async function countNotes(dir: string): Promise<number> {
  let n = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) n += await countNotes(join(dir, e.name));
    else if (/\.(md|markdown)$/i.test(e.name)) n++;
  }
  return n;
}

/**
 * Files in a repository its remote doesn't have yet, relative to the project, by the backup card's
 * own rule (git/backup-state.ts): changed, new or in a commit not pushed. Deleted files are left
 * out, since there's nothing to keep a copy of. `unknown` when Git can't fully say: never "all saved".
 */
async function notOnRemote(git: GitRunner, dir: string, prefix: string): Promise<{ paths: string[]; unknown: boolean }> {
  const run = (args: string[]) => git({ cwd: dir, args, read: true });
  const status = await run([...STATUS_ARGS.filter((a) => !a.startsWith("--ignore-submodules")), "--ignore-submodules=all"]);
  let st: ReturnType<typeof parseStatus> | undefined;
  try {
    if (status.code === 0) st = parseStatus(status.stdout);
  } catch {
    st = undefined;
  }
  if (!st) return { paths: [], unknown: true };
  const out = new Set<string>();
  for (const e of st.entries) if (!e.xy.includes("D") && (await waitsForBackup(dir, e))) out.add(e.path);
  const commits = await unpushedPaths(run, st);
  for (const p of commits ?? []) out.add(p);
  const paths = [...out]
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !p.startsWith(".") && !p.includes("/.") && p !== "private" && existsSync(join(dir, p)))
    .map((p) => `${prefix}${p}`)
    .sort();
  return { paths, unknown: commits === undefined };
}

/**
 * What deleting the project would delete. `repo`, `siteRepo`, and `privateRepo` are its repositories
 * on GitHub (owner/name), read by the caller from their remotes and site pairing; without `repo` the
 * project is offline and nothing on GitHub is involved.
 */
export async function deletionCheck(git: GitRunner, folder: string, repos: { repo?: string; siteRepo?: string; privateRepo?: string }): Promise<DeletionCheck> {
  const top = await git({ cwd: folder, args: ["rev-parse", "--show-toplevel"], read: true });
  const base = { name: basename(folder), folder, repo: "", siteRepo: "", privateRepo: "", privateCount: 0, siteNotes: 0, unsynced: [] as string[] };
  if (top.code !== 0 || real(top.stdout.trim()) !== real(folder)) return { kind: "offline", problem: "notProject", ...base };
  const repo = isRepoSlug(repos.repo) ? repos.repo : "";
  const privateRepo = repo && isRepoSlug(repos.privateRepo) ? repos.privateRepo : "";
  const siteRepo = repo && isRepoSlug(repos.siteRepo) && repos.siteRepo !== repo && repos.siteRepo !== privateRepo ? repos.siteRepo : "";
  const priv = join(folder, "private");
  const privateCount = existsSync(join(priv, "notes")) ? await countNotes(join(priv, "notes")) : 0;
  const siteNotes = repo ? await countNotes(join(folder, "notes")) : 0;
  // Offline, nothing is on GitHub: the whole folder goes, so there's no list of what isn't there yet.
  const parts = repo ? [await notOnRemote(git, folder, ""), ...(existsSync(join(priv, ".git")) ? [await notOnRemote(git, priv, "private/")] : [])] : [];
  const unknown = parts.some((p) => p.unknown);
  const unsynced = parts.flatMap((p) => p.paths);
  return { ...base, kind: repo ? "linked" : "offline", repo, siteRepo, privateRepo, privateCount, siteNotes, unsynced, ...(unknown ? { backupUnknown: true } : {}) };
}

interface ReadsGitHub {
  request<T>(method: string, path: string): Promise<T>;
  user(): Promise<unknown>;
}

export type VerifiedRepoStatus =
  | RepoStatus
  | { state: "gone"; account: { id: number; login: string } };

/**
 * Receipts stay in this process (D-413): each repository is confirmed deleted only when an
 * authenticated GET /repos/{owner}/{repo} returns 404 AND GET /user returns 200 for the same
 * signed-in account in the same check. Local cleanup refuses to run until every required target
 * is confirmed here.
 */
export class RemoteProjectDeletion {
  readonly #targets = new Map<string, { account: number; login: string; confirmed: boolean }>();
  async prepare(api: ReadsGitHub, repo: string): Promise<void> {
    if (!isRepoSlug(repo)) throw new Error("Not a repository");
    const user = await api.user() as { id?: number; login?: string };
    if (!Number.isSafeInteger(user.id) || typeof user.login !== "string" || !user.login) throw new Error("Invalid deletion identity");
    if (this.#targets.has(repo)) return;
    this.#targets.set(repo, { account: user.id!, login: user.login, confirmed: false });
  }
  /** Confirm a repository is gone only when the verified session matches the preflighted account. */
  confirmGone(repo: string, verified: { id: number; login: string }): boolean {
    if (!isRepoSlug(repo) || !Number.isSafeInteger(verified.id) || !verified.login) return false;
    const receipt = this.#targets.get(repo);
    if (receipt) {
      if (receipt.account !== verified.id || receipt.login !== verified.login) return false;
      receipt.confirmed = true;
      return true;
    }
    this.#targets.set(repo, { account: verified.id, login: verified.login, confirmed: true });
    return true;
  }
  account(repo: string) {
    const receipt = this.#targets.get(repo);
    if (!receipt?.login) throw new Error("Deletion account was not preflighted");
    return { id: receipt.account, login: receipt.login };
  }
  confirmed(repo: string): boolean { return this.#targets.get(repo)?.confirmed === true; }
  clear(): void { this.#targets.clear(); }
}

/**
 * Whether a repository is still on GitHub, for the person deleting it on GitHub's web page (D-413).
 * Treated as `gone` ONLY when authenticated GET /repos/{owner}/{repo} returns 404 AND GET /user
 * returns 200 with a valid account in the same check. 401, 403, 429, 5xx, offline, and timeouts
 * are NEVER `gone`.
 */
export async function repoStatus(api: ReadsGitHub | undefined, repo: string, now = Date.now): Promise<VerifiedRepoStatus> {
  if (!api) return { state: "signin" };
  if (!isRepoSlug(repo)) return { state: "error" };
  const problem = (e: unknown): RepoStatus | undefined => {
    if (!(e instanceof GitHubError)) return { state: "offline" };
    if (e.status === 0) return { state: "offline" };
    if (e.rateLimited) return { state: "rateLimit", retryAt: now() + Math.max(5_000, e.retryAfterMs ?? 60_000) };
    if (e.unauthorized) return { state: "signin" };
    return undefined;
  };
  try {
    const r = await api.request<{ owner?: { login?: string; type?: string }; permissions?: { admin?: boolean } }>("GET", `/repos/${repo}`);
    return { state: "exists", admin: r.permissions?.admin === true, owner: r.owner?.login ?? repo.split("/")[0]!, organization: r.owner?.type === "Organization" };
  } catch (e) {
    const p = problem(e);
    if (p) return p;
    if (!(e instanceof GitHubError) || e.status !== 404) return { state: "error" };
  }
  try {
    const u = await api.user() as { id?: number; login?: string } | undefined;
    if (!u || !Number.isSafeInteger(u.id) || typeof u.login !== "string" || !u.login) return { state: "signin" };
    return { state: "gone", account: { id: u.id!, login: u.login } };
  } catch (e) {
    const p = problem(e);
    if (p) return p;
    return e instanceof GitHubError ? { state: "error" } : { state: "offline" };
  }
}

/**
 * Why Delete project mustn't even look at the open folder, or undefined when it may. A project made
 * with New project is its own Git repository without `.focus-notes/workspace.json`, and is as
 * deletable as a cloned workspace (owner's report, 7 November; D-pending). Local notes isn't a
 * project, and a deleted project is gone. `deletionCheck` then requires the folder to be its own
 * repository's top, and `recycleRefusal` still guards the place itself.
 */
export function deletionGate(o: { deleted: boolean; localNotes: boolean }): "notProject" | undefined {
  return o.deleted || o.localNotes ? "notProject" : undefined;
}

/**
 * A personal folder the platform may not be able to name: Electron's `app.getPath` throws "Failed to get
 * '<name>' path" when Windows can't resolve Documents or Desktop. Then undefined, so only that folder's
 * check is skipped; any other error still fails the step.
 */
export function optionalPlace(name: "documents" | "desktop", get: () => string): string | undefined {
  try {
    return get();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== `Failed to get '${name}' path`) throw error;
    console.error(`The ${name} folder could not be resolved; its check is skipped.`);
    return undefined;
  }
}

/**
 * Why a folder must never go to the Recycle Bin as a project, or undefined when it may: a drive's root,
 * the home folder, Documents, Desktop, or a folder holding the app's data.
 */
export function recycleRefusal(folder: string, places: { home: string; userData: string; documents?: string; desktop?: string }): string | undefined {
  const f = real(folder);
  if (!f) return "missing";
  if (parse(f).root === f || dirname(f) === f) return "root";
  for (const p of [places.home, places.documents, places.desktop]) if (p && real(p) === f) return "personal";
  const data = real(places.userData);
  if (data && within(f, data)) return "appData";
  return undefined;
}

/** A free name beside the folder for the private notes kept: "<name> (private notes)", then 2, 3… */
export function keptPrivateFolder(folder: string, label = "private notes"): string {
  const parent = dirname(resolve(folder));
  const name = basename(resolve(folder));
  for (let i = 1; ; i++) {
    const p = join(parent, `${name} (${label}${i > 1 ? ` ${i}` : ""})`);
    if (!existsSync(p)) return p;
  }
}

async function privateMetadataDependencies(git: GitRunner, metadata: string) {
  const visit = async (at: string): Promise<void> => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.endsWith(".promisor") || !entry.isDirectory() && !entry.isFile()) throw new Error("Private Git metadata is not self-contained");
      if (entry.isDirectory()) await visit(join(at, entry.name));
    }
  };
  await visit(metadata);
  for (const file of ["commondir", "worktrees", "modules", "config.worktree", "objects/info/alternates", "objects/info/http-alternates"]) {
    if (existsSync(join(metadata, file))) throw new Error("Private Git metadata has shared dependencies");
  }
  const includes = await git({ cwd: metadata, args: ["config", "--no-includes", "--file", join(metadata, "config"), "--get-regexp", "^(include\\.|includeif\\.|extensions\\.(worktreeconfig|partialclone)$|remote\\..*\\.(promisor|partialclonefilter)$|core\\.(hookspath|fsmonitor)$)"], read: true });
  if (includes.code !== 1) throw new Error("Private Git configuration has unsupported dependencies");
}

async function privateHistoryEligibility(folder: string, priv = join(folder, "private")) {
  const missing = (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  };
  const privateInfo = await lstat(priv).catch(missing);
  if (!privateInfo) return undefined;
  if (!privateInfo.isDirectory() || privateInfo.isSymbolicLink()) throw new Error("Private Git paths are not owned by this project");
  const dotGit = join(priv, ".git");
  const info = await lstat(dotGit).catch(missing);
  if (!info) return undefined;
  if (["GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_QUARANTINE_PATH", "GIT_CONFIG_PARAMETERS"].some(key => Boolean(process.env[key]))) throw new Error("Private Git environment has shared dependencies");
  const count = process.env.GIT_CONFIG_COUNT;
  if (count !== undefined) {
    if (!/^(0|[1-9]\d*)$/.test(count) || !Number.isSafeInteger(Number(count))) throw new Error("Private Git environment configuration is invalid");
    for (let i = 0; i < Number(count); i++) {
      const key = process.env[`GIT_CONFIG_KEY_${i}`]?.toLowerCase();
      if (!key || !["safe.barerepository", "credential.interactive", "core.fsmonitor"].includes(key)
        || process.env[`GIT_CONFIG_VALUE_${i}`] === undefined) throw new Error("Private Git environment has unsupported configuration");
    }
  }
  if (info.isSymbolicLink()) throw new Error("Private Git paths are not owned by this project");
  const git = createRunner();
  // Inspect every effective scope without following includes or running an enabled monitor.
  const dependencies = await git({ cwd: priv, args: ["config", "--no-includes", "--get-regexp", "^(include\\.|includeif\\.|extensions\\.(worktreeconfig|partialclone)$|remote\\..*\\.(promisor|partialclonefilter)$|core\\.hookspath$)"], read: true });
  if (dependencies.code !== 1) throw new Error("Private Git configuration has unsupported dependencies");
  const monitor = await git({ cwd: priv, args: ["config", "--no-includes", "--type=bool", "--get", "core.fsmonitor"], read: true });
  if (monitor.code !== 1 && (monitor.code !== 0 || monitor.stdout.trim() !== "false")) throw new Error("Private Git configuration has a monitor dependency");
  const worktreeScopes = await git({ cwd: priv, args: ["config", "--no-includes", "--show-scope", "--get-all", "core.worktree"], read: true });
  if (worktreeScopes.code !== 1 && (worktreeScopes.code !== 0 || worktreeScopes.stdout.split("\n").filter(Boolean).some(line => !line.startsWith("local\t")))) throw new Error("Private Git configuration has a foreign worktree dependency");
  if (info.isDirectory()) {
    await privateMetadataDependencies(git, dotGit);
    const worktree = await git({ cwd: priv, args: ["config", "--no-includes", "--file", join(dotGit, "config"), "--get", "core.worktree"], read: true });
    if (worktree.code !== 1) throw new Error("Standalone private Git metadata has a worktree dependency");
    return undefined;
  }
  if (!info.isFile()) throw new Error("Private Git pointer is not a file");
  const pointer = await readFile(dotGit);
  const target = /^gitdir:\s*([^\r\n]+)\r?\n?$/.exec(pointer.toString("utf8"))?.[1];
  if (!target) throw new Error("Private Git pointer is invalid");
  const parentGit = join(folder, ".git");
  const parentInfo = await lstat(parentGit);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error("Parent Git metadata is shared");
  const root = real(folder);
  const modules = real(join(parentGit, "modules"));
  const candidate = resolve(priv, target.trim());
  const metadata = real(candidate);
  if (!root || !modules || !metadata || !within(root, modules) || !within(modules, metadata) || modules === metadata) throw new Error("Private Git metadata is outside this project's modules");
  const spelling = (path: string) => process.platform === "win32" || process.platform === "darwin" ? path.toLowerCase() : path;
  if (!within(resolve(folder), candidate) || modules !== spelling(join(root, ".git", "modules"))
    || metadata !== spelling(resolve(root, relative(resolve(folder), candidate)))) throw new Error("Private Git metadata uses linked paths");
  if (real(parentGit) !== real(join(root, ".git")) || real(priv) !== real(join(root, "private"))) throw new Error("Private Git paths changed");
  await privateMetadataDependencies(git, metadata);
  const worktree = await git({ cwd: priv, args: ["config", "--no-includes", "--file", join(metadata, "config"), "--get", "core.worktree"], read: true });
  if (worktree.code !== 1 && (worktree.code !== 0 || real(resolve(metadata, worktree.stdout.trim())) !== real(priv))) throw new Error("Private Git metadata belongs to another worktree");
  const head = await git({ cwd: priv, args: ["rev-parse", "HEAD"], read: true });
  if (head.code !== 0 || !/^[0-9a-f]{40,64}$/.test(head.stdout.trim())) throw new Error("Private Git history could not be checked");
  const config = await readFile(join(metadata, "config"));
  return { git, metadata, head, pointer, config };
}

/** Copy submodule history before moving its worktree; its original metadata/config are never edited. */
async function stagePrivateHistory(folder: string, priv: string, current?: () => Promise<boolean>) {
  const eligible = await privateHistoryEligibility(folder, priv);
  if (!eligible) return undefined;
  const { git, metadata, head, pointer, config } = eligible;
  const dotGit = join(priv, ".git");
  if (!current || !await current()) throw new Error("Private retention intent changed");
  const identity = await deletionFolderIdentity(folder);
  const transaction = await mkdtemp(join(folder, ".git", "focus-notes-private-retention-"));
  const copy = join(transaction, "git");
  try {
    await cp(metadata, copy, { recursive: true, force: false, errorOnExist: true });
    await privateMetadataDependencies(git, copy);
    const configured = await git({ cwd: priv, args: ["config", "--file", join(copy, "config"), "--unset-all", "core.worktree"] });
    if (configured.code !== 0 && configured.code !== 5) throw new Error("Private Git copy could not be configured");
    const copiedHead = await git({ cwd: priv, args: ["--git-dir", copy, "--work-tree", priv, "rev-parse", "HEAD"], read: true });
    const currentHead = await git({ cwd: priv, args: ["rev-parse", "HEAD"], read: true });
    if (copiedHead.code !== 0 || copiedHead.stdout !== head.stdout || currentHead.code !== 0 || currentHead.stdout !== head.stdout
      || !(await readFile(dotGit)).equals(pointer) || !(await readFile(join(metadata, "config"))).equals(config)
      || !await sameDeletionFolder(folder, identity) || !await current()) throw new Error("Private Git history or intent changed during preservation");
    return { transaction, copy, pointer: join(transaction, "pointer") };
  } catch (error) {
    await rm(transaction, { recursive: true });
    throw error;
  }
}

/**
 * Moves the project's folder to the Recycle Bin. With `keepPrivate`, `private/` is moved beside it first
 * and put back if the folder can't go, so a failure never splits the project. `trash` is the
 * platform's (Electron's `shell.trashItem`); `holder` names the file another app holds, when it can.
 */
export async function recycleProject(folder: string, opts: { keepPrivate: boolean; trash: (p: string) => Promise<void>; holder?: (folder: string) => Promise<string | undefined>; current?: () => Promise<boolean> }): Promise<DeletionResult> {
  const priv = join(folder, "private");
  let kept: string | undefined;
  let stage: Awaited<ReturnType<typeof stagePrivateHistory>>;
  let pointerMoved = false;
  let installed = false;
  let recycling = false;
  let notMoved = false;
  /** Before recycling, what was going on when it stopped: copying private history, or moving the private folder. */
  let phase: "check" | "stage" | "move" = "check";
  try {
    if (opts.keepPrivate && existsSync(priv)) {
      phase = "stage";
      stage = await stagePrivateHistory(folder, priv, opts.current);
      phase = "check";
      if (opts.current && !await opts.current()) throw new Error("Private retention intent changed");
      phase = "move";
      kept = keptPrivateFolder(folder);
      await rename(priv, kept);
      if (stage) {
        await rename(join(kept, ".git"), stage.pointer);
        pointerMoved = true;
        await rename(stage.copy, join(kept, ".git"));
        installed = true;
      }
    }
    phase = "check";
    if (opts.current && !await opts.current()) throw new Error("Deletion intent changed before recycling");
    recycling = true;
    await opts.trash(folder);
    if (existsSync(folder)) { notMoved = true; throw new Error("Recycling did not move the project"); }
  } catch {
    if (kept && !existsSync(folder)) return { state: "failed", privateKept: kept };
    if (kept && !stage && existsSync(priv) && !existsSync(kept)) return { state: "locked", ...(opts.holder ? { file: await opts.holder(priv).catch(() => undefined) } : {}) };
    try {
      if (installed && kept && stage) await rename(join(kept, ".git"), stage.copy);
      if (pointerMoved && kept && stage) await rename(stage.pointer, join(kept, ".git"));
      if (kept && !existsSync(priv) && existsSync(kept)) await rename(kept, priv);
      if (stage) await rm(stage.transaction, { recursive: true });
    } catch {
      console.error("Private project retention could not be restored");
      return { state: "failed", reason: "privateHistory", ...(kept && existsSync(kept) ? { privateKept: kept } : {}) };
    }
    if (!recycling) {
      // Only a failed copy of the private history is a private-history problem; a changed project or account, or a held folder, says so.
      if (phase === "move") return { state: "locked", ...(opts.holder ? { file: await opts.holder(priv).catch(() => undefined) } : {}) };
      if (opts.current && !await opts.current().catch(() => false)) return { state: "refused" };
      if (phase === "check") return { state: "refused" };
      console.error("Private project history could not be preserved safely");
      return { state: "failed", reason: "privateHistory" };
    }
    return { state: notMoved ? "failed" : existsSync(folder) ? "locked" : "failed", ...(opts.holder ? { file: await opts.holder(folder).catch(() => undefined) } : {}) };
  }
  return { state: "deleted", ...(kept ? { privateKept: kept } : {}) };
}
