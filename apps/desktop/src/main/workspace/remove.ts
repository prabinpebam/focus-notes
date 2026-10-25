/**
 * Removing the workspace from this computer (FRE-07, PRV-02; Settings → Workspace). Nothing on
 * GitHub is ever touched: only the local clone goes, and only when both repositories (the notes
 * repository and `private/`) have nothing that isn't on their remote: no uncommitted or untracked
 * file, no commit on any branch that no remote has, and no stash. Then the data folder's files the
 * inventory lists for the event are deleted, and nothing else.
 */
import { existsSync, realpathSync } from "node:fs";
import { rm, rmdir } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { DATA_FOLDERS, filesRemovedBy, type Removal } from "@focus-notes/core/inventory";
import type { RemovalCheck } from "@focus-notes/core";
import type { GitRunner } from "../git/run.ts";

const real = (p: string) => {
  try {
    const r = realpathSync.native(resolve(p));
    return process.platform === "win32" || process.platform === "darwin" ? r.toLowerCase() : r;
  } catch {
    return undefined;
  }
};

/** owner/name from a remote's address: `https://github.com/ada/notes.git`, `git@github.com:ada/notes`, or a path. */
export function repositoryName(url: string): string {
  const parts = url.trim().replace(/\/$/, "").replace(/\.git$/, "").replace(/\\/g, "/").split(/[/:]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

/** What a repository has that its remote doesn't, or undefined when the folder isn't its own repository. */
async function unpushed(git: GitRunner, dir: string): Promise<{ waiting: number; name: string } | undefined> {
  const top = await git({ cwd: dir, args: ["rev-parse", "--show-toplevel"], read: true });
  if (top.code !== 0 || real(top.stdout.trim()) !== real(dir)) return undefined;
  const lines = (s: string) => s.split(/\r?\n/).filter(Boolean).length;
  // Untracked files count: a note never committed exists only here. A submodule's own changes are
  // counted in it, so here it counts only when its commit isn't the one recorded (the pointer).
  const status = await git({ cwd: dir, args: ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=dirty"], read: true });
  const commits = await git({ cwd: dir, args: ["log", "--branches", "--not", "--remotes", "--format=%H"], read: true });
  const stash = await git({ cwd: dir, args: ["stash", "list"], read: true });
  const origin = await git({ cwd: dir, args: ["remote", "get-url", "origin"], read: true });
  if (status.code !== 0 || commits.code !== 0) return { waiting: 1, name: "" };
  return { waiting: lines(status.stdout) + lines(commits.stdout) + (stash.code === 0 ? lines(stash.stdout) : 0), name: origin.code === 0 ? repositoryName(origin.stdout) : "" };
}

/** Whether the workspace can be removed from this computer: only a Git workspace with everything on its remote. */
export async function removalCheck(git: GitRunner, folder: string): Promise<RemovalCheck> {
  const notes = await unpushed(git, folder);
  if (!notes) return { state: "notGit", waiting: 0, folder, repositories: [] };
  const hasPrivate = existsSync(join(folder, "private"));
  const priv = hasPrivate ? await unpushed(git, join(folder, "private")) : undefined;
  // `private/` that isn't a repository of its own holds notes that are nowhere else (D-99).
  const privateOnlyHere = hasPrivate && !priv && (await git({ cwd: folder, args: ["ls-files", "--others", "--", "private"], read: true })).stdout.trim() !== "";
  const waiting = notes.waiting + (priv?.waiting ?? 0) + (privateOnlyHere ? 1 : 0);
  // A repository with no remote has nothing on GitHub.
  const remoteless = !notes.name || (priv !== undefined && !priv.name);
  const repositories = [notes.name, ...(priv ? [priv.name] : [])].filter(Boolean);
  return { state: waiting || remoteless ? "unpushed" : "ready", waiting: Math.max(waiting, remoteless ? 1 : 0), folder, repositories };
}

/**
 * Removes the local clone after checking again (the renderer's word isn't enough), never the root
 * of a drive or a folder that isn't its own repository. The caller stops the watcher and Git first.
 */
export async function removeWorkspace(git: GitRunner, folder: string): Promise<RemovalCheck> {
  const check = await removalCheck(git, folder);
  if (check.state !== "ready" || parse(resolve(folder)).root === resolve(folder)) return check;
  try {
    await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    return { ...check, state: "failed" };
  }
  return existsSync(folder) ? { ...check, state: "failed" } : { ...check, state: "removed" };
}

/**
 * Deletes the data folder's files the inventory lists for an event (PRV-02), and nothing else. Its
 * own folders (crash recovery's drafts) go only when empty: the caller has deleted the open
 * workspace's part, and another workspace's drafts stay.
 */
export async function forgetLocalData(userData: string, event: Removal): Promise<void> {
  const folders = Object.values(DATA_FOLDERS) as string[];
  for (const f of filesRemovedBy(event)) {
    if (folders.includes(f)) await rmdir(join(userData, f)).catch(() => {});
    else await rm(join(userData, f), { force: true });
  }
}
