/**
 * The first run's Workspace step on the desktop (FRE-06, D-98, D-101): opening a workspace the
 * person already has. Clone it from GitHub with its private notes when this account can reach them,
 * or check a folder that's already a clone. Either way `private/` is checked out on `main` and
 * pushes check the submodule (D-47), as the setup engine leaves a new workspace.
 */
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { WorkspaceResult } from "@focus-notes/core/first-run";
import { networkProblem, type GitRunner } from "../git/run.ts";

const NETWORK_MS = 10 * 60_000;
const FORMAT = join(".focus-notes", "workspace.json");

/** A folder a clone can go in: missing, or empty. */
export async function folderFree(folder: string): Promise<boolean> {
  if (!existsSync(folder)) return true;
  return (await readdir(folder).catch(() => ["?"])).length === 0;
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
const same = (a: string, b: string) => real(a) === real(b);

/**
 * Fetches `private/` if the workspace lists it and it's missing, then checks it out on `main`.
 * Resolves to whether the private notes are here: false when this account can't reach them.
 */
async function privateNotes(git: GitRunner, folder: string): Promise<boolean | undefined> {
  const listed = await git({ cwd: folder, args: ["config", "--file", ".gitmodules", "--get", "submodule.private.url"], read: true });
  if (listed.code !== 0) return undefined;
  if (!existsSync(join(folder, "private", ".git"))) {
    const r = await git({ cwd: folder, args: ["submodule", "update", "--init", "--", "private"], timeoutMs: NETWORK_MS });
    if (r.code !== 0) return false;
  }
  // On main, not a detached HEAD, so saving private notes commits to the branch that's pushed.
  const head = await git({ cwd: join(folder, "private"), args: ["symbolic-ref", "--quiet", "HEAD"], read: true });
  if (head.code !== 0) await git({ cwd: join(folder, "private"), args: ["checkout", "--quiet", "main"] });
  await git({ cwd: folder, args: ["config", "push.recurseSubmodules", "check"] });
  return true;
}

/** Checks that a folder is the top of a Git clone with a workspace's layout, and fetches a missing `private/`. */
export async function checkWorkspace(git: GitRunner, folder: string): Promise<WorkspaceResult> {
  const top = await git({ cwd: folder, args: ["rev-parse", "--path-format=absolute", "--show-toplevel"], read: true });
  if (top.code !== 0 || !same(top.stdout.trim(), folder)) return { ok: false, problem: "notGit" };
  if (!existsSync(join(folder, FORMAT))) return { ok: false, problem: "notWorkspace" };
  const priv = await privateNotes(git, folder);
  return { ok: true, folder, ...(priv !== undefined ? { privateNotes: priv } : {}) };
}

/**
 * Clones a workspace into a folder that's missing or empty. A repository that isn't a workspace is
 * removed again, since the folder was empty before.
 */
export async function cloneWorkspace(git: GitRunner, url: string, folder: string): Promise<WorkspaceResult> {
  if (!(await folderFree(folder))) return { ok: false, problem: "folderTaken" };
  await mkdir(dirname(folder), { recursive: true });
  const r = await git({ cwd: dirname(folder), args: ["clone", "--quiet", "--", url, folder], timeoutMs: NETWORK_MS });
  if (r.code !== 0) {
    await rm(folder, { recursive: true, force: true }).catch(() => {});
    const p = networkProblem(r.stderr);
    return { ok: false, problem: p === "auth" ? "auth" : p === "offline" ? "offline" : "failed" };
  }
  if (!existsSync(join(folder, FORMAT))) {
    await rm(folder, { recursive: true, force: true }).catch(() => {});
    return { ok: false, problem: "notWorkspace" };
  }
  const priv = await privateNotes(git, folder);
  return { ok: true, folder, ...(priv !== undefined ? { privateNotes: priv } : {}) };
}

/** The identity for only this workspace (FRE-05): in the workspace's and `private/`'s own settings. */
export async function applyLocalIdentity(git: GitRunner, folder: string, i: { name: string; email: string }): Promise<void> {
  for (const dir of [folder, join(folder, "private")]) {
    if (!existsSync(join(dir, ".git"))) continue;
    await git({ cwd: dir, args: ["config", "user.name", i.name] });
    await git({ cwd: dir, args: ["config", "user.email", i.email] });
  }
}
