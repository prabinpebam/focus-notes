/**
 * Deleting a project (PRJ-23, DD-PROJ-09 to 17; Settings → Project → Delete project…). GitHub's side is
 * the person's, on GitHub's own page (DD-PROJ-12): this only reads whether a repository is still
 * there. This computer's side moves the project's folder to the Recycle Bin, never deletes it outright,
 * and only the open project's own folder: never a drive's root, the home folder or the app's data.
 */
import { existsSync, realpathSync } from "node:fs";
import { readdir, rename } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import type { DeletionCheck, DeletionResult, RepoStatus } from "@focus-notes/core";
import { GitHubError } from "@focus-notes/github";
import type { GitRunner } from "../git/run.ts";

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
 * Files in a repository its remote doesn't have yet, relative to the project: changed, new or in a
 * commit not pushed. Deleted files are left out, since there's nothing to keep a copy of.
 */
async function notOnRemote(git: GitRunner, dir: string, prefix: string): Promise<string[]> {
  const out = new Set<string>();
  const status = await git({ cwd: dir, args: ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all"], read: true });
  if (status.code === 0) {
    const parts = status.stdout.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i]!;
      if (e.length < 4) continue;
      const code = e.slice(0, 2);
      if (code[0] === "R" || code[0] === "C") i++;
      if (code.includes("D")) continue;
      out.add(e.slice(3));
    }
  }
  const log = await git({ cwd: dir, args: ["log", "--branches", "--not", "--remotes", "--name-only", "--format=", "-z"], read: true });
  if (log.code === 0) for (const p of log.stdout.split(/[\0\r\n]+/)) if (p) out.add(p);
  return [...out]
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !p.startsWith(".") && !p.includes("/.") && p !== "private" && existsSync(join(dir, p)))
    .map((p) => `${prefix}${p}`)
    .sort();
}

/**
 * What deleting the project would delete. `repo` and `privateRepo` are its repositories on GitHub
 * (owner/name), read by the caller from their remotes; without `repo` the project is offline and
 * nothing on GitHub is involved.
 */
export async function deletionCheck(git: GitRunner, folder: string, repos: { repo?: string; privateRepo?: string }): Promise<DeletionCheck> {
  const top = await git({ cwd: folder, args: ["rev-parse", "--show-toplevel"], read: true });
  const base = { name: basename(folder), folder, repo: "", privateRepo: "", privateCount: 0, siteNotes: 0, unsynced: [] as string[] };
  if (top.code !== 0 || real(top.stdout.trim()) !== real(folder)) return { kind: "offline", problem: "notProject", ...base };
  const repo = isRepoSlug(repos.repo) ? repos.repo : "";
  const privateRepo = repo && isRepoSlug(repos.privateRepo) ? repos.privateRepo : "";
  const priv = join(folder, "private");
  const privateCount = existsSync(join(priv, "notes")) ? await countNotes(join(priv, "notes")) : 0;
  const siteNotes = repo ? await countNotes(join(folder, "notes")) : 0;
  // Offline, nothing is on GitHub: the whole folder goes, so there's no list of what isn't there yet.
  const unsynced = repo
    ? [...(await notOnRemote(git, folder, "")), ...(existsSync(join(priv, ".git")) ? await notOnRemote(git, priv, "private/") : [])]
    : [];
  return { ...base, kind: repo ? "linked" : "offline", repo, privateRepo, privateCount, siteNotes, unsynced };
}

interface ReadsGitHub {
  request<T>(method: string, path: string): Promise<T>;
  user(): Promise<unknown>;
}

/**
 * Whether a repository is still on GitHub, for the person deleting it there (DD-PROJ-13). A 404 is
 * `gone` only when the account itself still answers: otherwise it's sign-in, never "deleted".
 */
export async function repoStatus(api: ReadsGitHub | undefined, repo: string, now = Date.now): Promise<RepoStatus> {
  if (!api) return { state: "signin" };
  if (!isRepoSlug(repo)) return { state: "gone" };
  const problem = (e: unknown): RepoStatus | undefined => {
    if (!(e instanceof GitHubError)) return { state: "offline" };
    if (e.status === 0) return { state: "offline" };
    if (e.rateLimited) return { state: "rateLimit", retryAt: now() + 60_000 };
    if (e.unauthorized) return { state: "signin" };
    return undefined;
  };
  try {
    const r = await api.request<{ owner?: { login?: string; type?: string }; permissions?: { admin?: boolean } }>("GET", `/repos/${repo}`);
    return { state: "exists", admin: r.permissions?.admin === true, owner: r.owner?.login ?? repo.split("/")[0]!, organization: r.owner?.type === "Organization" };
  } catch (e) {
    const p = problem(e);
    if (p) return p;
    if (!(e instanceof GitHubError) || e.status !== 404) return { state: "offline" };
  }
  try {
    await api.user();
    return { state: "gone" };
  } catch (e) {
    return problem(e) ?? { state: "signin" };
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

/**
 * Moves the project's folder to the Recycle Bin. With `keepPrivate`, `private/` is moved beside it first
 * and put back if the folder can't go, so a failure never splits the project. `trash` is the
 * platform's (Electron's `shell.trashItem`); `holder` names the file another app holds, when it can.
 */
export async function recycleProject(folder: string, opts: { keepPrivate: boolean; trash: (p: string) => Promise<void>; holder?: (folder: string) => Promise<string | undefined> }): Promise<DeletionResult> {
  const priv = join(folder, "private");
  let kept: string | undefined;
  if (opts.keepPrivate && existsSync(priv)) {
    kept = keptPrivateFolder(folder);
    try {
      await rename(priv, kept);
    } catch {
      // A folder another app holds can't move; copying would leave two, so nothing changes.
      return { state: existsSync(priv) ? "locked" : "failed", ...(opts.holder ? { file: await opts.holder(priv).catch(() => undefined) } : {}) };
    }
  }
  try {
    await opts.trash(folder);
  } catch {
    // Put back where it was; if even that fails, the private notes are still whole beside the folder.
    if (kept && !existsSync(priv)) await rename(kept, priv).catch(() => {});
    return { state: existsSync(folder) ? "locked" : "failed", ...(opts.holder ? { file: await opts.holder(folder).catch(() => undefined) } : {}) };
  }
  if (existsSync(folder)) return { state: "failed" };
  return { state: "deleted", ...(kept ? { privateKept: kept } : {}) };
}
