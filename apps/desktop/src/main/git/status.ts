/**
 * Git's answer to "what changed" (PRF-07): one `git status --porcelain=v2 --branch -z` per
 * repository, parsed here. Pure, so it's unit-tested without Git.
 */

/** The one status call per repository (Desktop and Git → Asking Git what changed). */
export const STATUS_ARGS = ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=dirty"] as const;

export interface StatusEntry {
  /** 1: changed, 2: renamed or copied, u: unmerged, ?: untracked, !: ignored. */
  kind: "changed" | "renamed" | "unmerged" | "untracked" | "ignored";
  /** Index and worktree states, as Git prints them (`.M`, `A.`, `??`). */
  xy: string;
  /** Submodule state: `N...` for a plain file, or `S<c><m><u>` (c: its commit moved). */
  sub: string;
  /** Repository-relative, with forward slashes. */
  path: string;
  /** Where a renamed entry came from. */
  from?: string;
}

export interface RepoStatus {
  /** The head commit, or undefined before the first commit. */
  oid?: string;
  /** The branch, or undefined when detached. */
  branch?: string;
  /** The upstream, such as `origin/main`, if the branch has one. */
  upstream?: string;
  ahead: number;
  behind: number;
  entries: StatusEntry[];
}

/** Splits off the first n space-separated fields; the rest (a path, which may hold spaces) is kept whole. */
function fields(line: string, n: number): [string[], string] {
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const next = line.indexOf(" ", at);
    if (next < 0) throw new Error(`Unexpected status line: ${line.slice(0, 40)}`);
    out.push(line.slice(at, next));
    at = next + 1;
  }
  return [out, line.slice(at)];
}

/** Parses `git status --porcelain=v2 --branch -z` output. Throws on a record it doesn't know. */
export function parseStatus(out: string): RepoStatus {
  const status: RepoStatus = { ahead: 0, behind: 0, entries: [] };
  const records = out.split("\0");
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (!r) continue;
    if (r.startsWith("# ")) {
      const [key, ...rest] = r.slice(2).split(" ");
      const value = rest.join(" ");
      if (key === "branch.oid" && value !== "(initial)") status.oid = value;
      else if (key === "branch.head" && value !== "(detached)") status.branch = value;
      else if (key === "branch.upstream") status.upstream = value;
      else if (key === "branch.ab") {
        const m = /^\+(\d+) -(\d+)$/.exec(value);
        if (m) {
          status.ahead = Number(m[1]);
          status.behind = Number(m[2]);
        }
      }
      continue;
    }
    const type = r[0];
    if (type === "1") {
      const [f, path] = fields(r, 8);
      status.entries.push({ kind: "changed", xy: f[1]!, sub: f[2]!, path });
    } else if (type === "2") {
      const [f, path] = fields(r, 9);
      // With -z, a rename's original path is the next record.
      const from = records[++i] ?? "";
      status.entries.push({ kind: "renamed", xy: f[1]!, sub: f[2]!, path, from });
    } else if (type === "u") {
      const [f, path] = fields(r, 10);
      status.entries.push({ kind: "unmerged", xy: f[1]!, sub: f[2]!, path });
    } else if (type === "?" || type === "!") {
      status.entries.push({ kind: type === "?" ? "untracked" : "ignored", xy: type + type, sub: "N...", path: r.slice(2) });
    } else throw new Error(`Unexpected status record: ${r.slice(0, 40)}`);
  }
  return status;
}

/** Whether an entry is the given path, or inside it when the path is a folder. */
export const covers = (path: string, entry: string) => entry === path || entry.startsWith(path.endsWith("/") ? path : `${path}/`);

/** Whether the submodule at a path is at another commit than the one recorded (its pointer moved). */
export const pointerMoved = (s: RepoStatus, path: string) => s.entries.some((e) => e.path === path && e.sub.startsWith("S") && e.sub[1] === "C");

/** Tracked files with changes, not counting a submodule: a rebase needs none of these. */
export const trackedChanges = (s: RepoStatus) => s.entries.filter((e) => (e.kind === "changed" || e.kind === "renamed" || e.kind === "unmerged") && !e.sub.startsWith("S"));
