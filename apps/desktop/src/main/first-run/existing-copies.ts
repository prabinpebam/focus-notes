/**
 * Copies of a repository already on this computer (D-415): before setup or Open downloads a project
 * again, the folders that already hold it are offered, so a second download isn't the only way.
 * Finding them only reads (`git config`, `git log`); a folder is the same project only when its
 * `origin` is the same repository, never by its name. Using one fetches and fast-forwards only:
 * work that isn't pushed, changes not committed, or a history that has diverged stay exactly as they
 * are, and the app's own sync and backup status take it from there.
 */
import { existsSync, realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ExistingCopy } from "@focus-notes/core/first-run";
import type { GitRunner } from "../git/run.ts";

const NETWORK_MS = 2 * 60_000;

/**
 * A remote's address in one spelling (D-415): `https://github.com/Owner/Repo.git`,
 * `git@github.com:owner/repo`, and `ssh://git@github.com/owner/repo/` are the same repository.
 * Hosts and paths compare without case (GitHub's names don't have one), without a trailing `.git`
 * or slash, and without any user or password. A local path (a review build's remotes) is resolved.
 * Undefined for an empty address.
 */
export function normaliseRemote(url: string): string | undefined {
  let u = url.trim();
  if (!u) return undefined;
  let hostPath: string | undefined;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(u);
  const net = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(u);
  if (net) hostPath = `${net[1]}/${net[2]}`;
  else if (scp && !/^[A-Za-z]$/.test(scp[1]!)) hostPath = `${scp[1]}/${scp[2]}`;
  if (hostPath) {
    const h = hostPath.replace(/\\/g, "/").replace(/\/+$/, "").replace(/\.git$/i, "").replace(/^www\./i, "");
    return h.toLowerCase();
  }
  if (/^file:\/\//i.test(u)) u = decodeURIComponent(u.replace(/^file:\/\/(localhost)?/i, "")).replace(/^\/([A-Za-z]:)/, "$1");
  const path = resolve(u).replace(/\\/g, "/").replace(/\/+$/, "").replace(/\.git$/i, "");
  return `file:${process.platform === "win32" ? path.toLowerCase() : path}`;
}

/** The same folder, whatever the spelling (Windows' short names, case, slashes). */
const real = (p: string) => {
  let r: string;
  try {
    r = realpathSync.native(resolve(p));
  } catch {
    r = resolve(p);
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
};

/**
 * The folders among `candidates` that are a clone of `url` (D-415), most recently updated first.
 * Read-only. A folder with no Git, or with another `origin`, isn't one; a folder that can't be read
 * is left out and `unreadable` is told (with no path), never guessed.
 */
export async function findCopies(git: GitRunner, url: string, candidates: readonly string[], unreadable?: () => void): Promise<ExistingCopy[]> {
  const want = normaliseRemote(url);
  if (!want) return [];
  const seen = new Set<string>();
  const found: ExistingCopy[] = [];
  for (const c of candidates) {
    const folder = resolve(c);
    const key = real(folder);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (!existsSync(join(folder, ".git"))) continue;
      const origin = await git({ cwd: folder, args: ["config", "--get", "remote.origin.url"], read: true });
      // 1: no origin, so it's a folder of its own; anything else is an error reading it.
      if (origin.code === 1) continue;
      if (origin.code !== 0) { unreadable?.(); continue; }
      if (normaliseRemote(origin.stdout) !== want) continue;
      const last = await git({ cwd: folder, args: ["log", "-1", "--format=%ct"], read: true });
      const seconds = last.code === 0 ? Number(last.stdout.trim()) : NaN;
      const updated = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : (await stat(join(folder, ".git"))).mtimeMs;
      found.push({ folder, name: basename(folder), updated });
    } catch {
      unreadable?.();
    }
  }
  return found.sort((a, b) => b.updated - a.updated || a.folder.localeCompare(b.folder));
}

/** What using a copy did: brought up to date, already up to date, or left as it is and why. */
export type ReuseOutcome = "updated" | "current" | "dirty" | "ahead" | "diverged" | "noUpstream" | "offline";

/**
 * Brings one repository up to date without changing anything that's only here (D-415): fetch, then
 * fast-forward when there's nothing uncommitted and nothing unpushed. Never a reset, a force, a
 * rebase or a delete; submodules aren't recursed into (`private/` is its own call).
 */
async function fastForward(git: GitRunner, dir: string): Promise<ReuseOutcome> {
  const fetched = await git({ cwd: dir, args: ["fetch", "--no-recurse-submodules", "--quiet", "origin"], timeoutMs: NETWORK_MS });
  if (fetched.code !== 0) return "offline";
  const status = await git({ cwd: dir, args: ["status", "--porcelain", "--untracked-files=normal"], read: true });
  if (status.code !== 0 || status.stdout.trim()) return "dirty";
  const upstream = await git({ cwd: dir, args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], read: true });
  if (upstream.code !== 0) return "noUpstream";
  const counts = await git({ cwd: dir, args: ["rev-list", "--left-right", "--count", "HEAD...@{u}"], read: true });
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number) as [number, number];
  if (counts.code !== 0 || !Number.isFinite(ahead) || !Number.isFinite(behind)) return "dirty";
  if (ahead > 0 && behind > 0) return "diverged";
  if (ahead > 0) return "ahead";
  if (behind === 0) return "current";
  const merged = await git({ cwd: dir, args: ["-c", "submodule.recurse=false", "merge", "--ff-only", "--quiet", "@{u}"] });
  return merged.code === 0 ? "updated" : "dirty";
}

/**
 * Uses a copy that's already here (D-415): the project, then `private/` on its own when it's there
 * (pulled alone, never recursively). Each is fast-forwarded only when that changes nothing that's
 * only on this computer; otherwise it's opened as it is.
 */
export async function reuseCopy(git: GitRunner, folder: string): Promise<{ project: ReuseOutcome; private?: ReuseOutcome }> {
  const project = await fastForward(git, folder);
  const priv = join(folder, "private");
  if (!existsSync(join(priv, ".git"))) return { project };
  return { project, private: await fastForward(git, priv) };
}
