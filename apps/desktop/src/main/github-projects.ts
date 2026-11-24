/**
 * Open from GitHub lists only Focus Notes projects (D-416): a repository qualifies when its default
 * branch has `.focus-notes/workspace.json`, asked of GitHub's contents API (no download). Answers are
 * kept per repository and push, a few are asked at once, and a repository that couldn't be checked is
 * left out and reported, never guessed. A project's private-notes companion (`<name>-private`) is
 * never listed on its own.
 */
import type { GitHubApi, Repo } from "@focus-notes/github";
import { mapLimit } from "./first-run/workspace.ts";

export const PROJECT_MARKER = ".focus-notes/workspace.json";
const CHECKS_AT_ONCE = 4;

export type ProjectChecks = Map<string, boolean>;

export async function projectRepos(api: Pick<GitHubApi, "hasFile">, repos: readonly Repo[], cache: ProjectChecks, unreadable: () => void): Promise<Repo[]> {
  const candidates = repos.filter((r) => !r.template);
  const answers = await mapLimit(candidates, CHECKS_AT_ONCE, async (r) => {
    const key = `${r.owner}/${r.name}@${r.pushedAt ?? ""}`.toLowerCase();
    const known = cache.get(key);
    if (known !== undefined) return known;
    try {
      const is = await api.hasFile(r.owner, r.name, PROJECT_MARKER);
      cache.set(key, is);
      return is;
    } catch {
      unreadable();
      return false;
    }
  });
  const projects = candidates.filter((_, i) => answers[i]);
  const names = new Set(projects.map((r) => `${r.owner}/${r.name}`.toLowerCase()));
  return projects.filter((r) => {
    const base = /^(.+)-private$/i.exec(r.name)?.[1];
    return !base || !names.has(`${r.owner}/${base}`.toLowerCase());
  });
}
