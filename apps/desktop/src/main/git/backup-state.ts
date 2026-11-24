/**
 * What waits for backup to GitHub, one rule for every place that says so (owner, 24 November):
 * the backup card (FIL-14) and Delete project's "not on GitHub yet" (PRJ-23). A file waits when Git
 * sees it changed or new, unless it's ignored or a blank new note (the empty Untitled a project
 * opens on, D-397: nothing to lose); and a commit waits when the branch's upstream doesn't have it.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { GitResult } from "./run.ts";
import type { RepoStatus, StatusEntry } from "./status.ts";

/** A new note with nothing in it, or only spaces and line breaks. */
export async function blankNote(path: string): Promise<boolean> {
  if (!/\.(md|markdown)$/i.test(path)) return false;
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size > 4096) return false;
  return (await readFile(path, "utf8").catch(() => "x")).trim() === "";
}

/** Whether a status entry waits for backup. */
export async function waitsForBackup(dir: string, e: StatusEntry): Promise<boolean> {
  if (e.kind === "ignored") return false;
  if (e.kind === "untracked" && (await blankNote(join(dir, e.path)))) return false;
  return true;
}

/**
 * The files commits not on GitHub yet changed: ahead of the upstream, or, without one (a detached
 * private submodule), what no fetched remote branch has. Undefined when Git can't say: no commit to
 * compare is fine (an empty list), but no remote branch known or a failing Git is unknown.
 */
export async function unpushedPaths(run: (args: string[]) => Promise<GitResult>, st: RepoStatus): Promise<string[] | undefined> {
  if (!st.oid) return [];
  if (st.upstream && st.ahead === 0) return [];
  if (!st.upstream) {
    const remotes = await run(["for-each-ref", "--count=1", "--format=%(refname)", "refs/remotes"]);
    if (remotes.code !== 0 || !remotes.stdout.trim()) return undefined;
  }
  const r = await run(st.upstream
    ? ["diff", "--name-only", "--no-renames", "-z", `${st.upstream}...HEAD`]
    : ["log", "HEAD", "--not", "--remotes", "--name-only", "--format=", "-z"]);
  return r.code === 0 ? r.stdout.split(/[\0\r\n]+/).filter(Boolean) : undefined;
}
