import { opendir, readFile, lstat, stat } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { ProjectStats } from "@focus-notes/core";

/** The images the app recognises (image:read), counted as a project's media (D-346). */
const MEDIA = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** owner/repo from a GitHub remote URL (https, scp-like or ssh), or undefined for anything else. */
export function parseGitHubRemote(url: string): string | undefined {
  const value = url.trim();
  const match = /^https:\/\/(?:[^@/\s]+@)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(value)
    ?? /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(value)
    ?? /^ssh:\/\/git@github\.com(?::22)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(value);
  if (!match) return;
  const [, owner, repo] = match as unknown as [string, string, string];
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === "." || repo === "..") return;
  return `${owner}/${repo}`;
}

/** The remotes in a Git config file, in order: name → url. */
export function gitRemotes(config: string): Map<string, string> {
  const remotes = new Map<string, string>();
  let remote: string | undefined;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    const section = /^\[\s*([^\s\]"]+)(?:\s+"([^"]*)")?\s*\]$/.exec(line);
    if (section) { remote = section[1]!.toLowerCase() === "remote" ? section[2] : undefined; continue; }
    if (remote === undefined) continue;
    const entry = /^url\s*=\s*(.*)$/i.exec(line);
    if (entry && !remotes.has(remote)) remotes.set(remote, entry[1]!.replace(/^"(.*)"$/, "$1"));
  }
  return remotes;
}

/** The Git config of a folder's repository: `.git/config`, following a `.git` file to a worktree's common dir. */
async function gitConfigPath(folder: string): Promise<string> {
  const dotGit = join(folder, ".git");
  if ((await lstat(dotGit)).isDirectory()) return join(dotGit, "config");
  const pointer = /^gitdir:\s*(.+)$/m.exec(await readFile(dotGit, "utf8"))?.[1]?.trim();
  if (!pointer) throw new Error("Not a Git folder");
  const gitDir = isAbsolute(pointer) ? pointer : resolve(folder, pointer);
  const common = await readFile(join(gitDir, "commondir"), "utf8").then((d) => d.trim(), () => "");
  return join(common ? resolve(gitDir, common) : gitDir, "config");
}

/** The folder's GitHub repository, read only from its own Git config: origin first, then any GitHub remote. */
export async function githubRepo(folder: string): Promise<string | undefined> {
  let config: string;
  try { config = await readFile(await gitConfigPath(folder), "utf8"); }
  catch { return; }
  const remotes = gitRemotes(config);
  const origin = remotes.get("origin");
  const fromOrigin = origin ? parseGitHubRemote(origin) : undefined;
  if (fromOrigin) return fromOrigin;
  for (const url of remotes.values()) {
    const repo = parseGitHubRemote(url);
    if (repo) return repo;
  }
  return;
}

/**
 * A project's size line (D-346): every file's bytes, files, recognised images and folders under it.
 * Hidden files and folders (a leading dot, such as .git) are left out, and links aren't followed.
 * The walk is asynchronous, so the main process keeps answering while a large folder is counted.
 */
export async function countProject(folder: string): Promise<ProjectStats> {
  const totals: ProjectStats = { bytes: 0, files: 0, media: 0, folders: 0 };
  if (!(await stat(folder)).isDirectory()) throw new Error("Not a folder");
  const walk = async (dir: string, root: boolean): Promise<void> => {
    let entries;
    try { entries = await opendir(dir); }
    catch (error) { if (root) throw error; return; }
    for await (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { totals.folders++; await walk(path, false); }
      else if (entry.isFile()) {
        totals.files++;
        if (MEDIA.has(extname(entry.name).toLowerCase())) totals.media++;
        try { totals.bytes += (await lstat(path)).size; } catch { /* removed while counting */ }
      }
    }
  };
  await walk(folder, true);
  return totals;
}
