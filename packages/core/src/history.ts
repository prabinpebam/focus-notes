/**
 * Notes from history and notes in conflict (WP-3.5), as pure functions shared by the desktop's main
 * process and the app: Recently deleted found from Git's log (FIL-10), where a restored note goes,
 * the two versions of a conflicting note block by block, and the copies that keep every word
 * (FIL-12, DD-FB-04). No Git, no file system: the callers bring what they read.
 */
import { fileStemForTitle } from "./text.ts";
import { parseCommitHead } from "./scan.ts";
import { dirOf, joinPath, retitle, stemOf, titleOfMarkdown, uniqueName } from "./workspace.ts";

/** How long Recently deleted looks back (Files → Deleting and restoring). */
export const RECENTLY_DELETED_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Recently deleted (FIL-10) ----

/** One file deleted in one commit, from `git log --diff-filter=D`. Paths are repository-relative. */
export interface DeletedEntry {
  commit: string;
  /** When the commit was made, in ms. */
  at: number;
  subject: string;
  path: string;
}

/** The arguments of the log that finds deletions: renames aren't deletions, and nothing names a path (SEC-03). */
export const DELETED_LOG_ARGS = (sinceSeconds: number) =>
  ["log", "--diff-filter=D", "-M", "--no-merges", "-z", "--name-only", `--since=${sinceSeconds}`, "--format=%x01%H %ct %s"] as const;

/** Parses the output of {@link DELETED_LOG_ARGS}: one record per commit, its deleted paths after it. */
export function parseDeletedLog(out: string): DeletedEntry[] {
  const entries: DeletedEntry[] = [];
  for (const record of out.split("\x01")) {
    if (!record.trim()) continue;
    const [head = "", ...names] = record.split("\0");
    const m = parseCommitHead(head.trim());
    if (!m) continue;
    for (const raw of names) {
      const path = raw.replace(/^\n+/, "");
      if (path) entries.push({ commit: m[0], at: Number(m[1]) * 1000, subject: m[2], path });
    }
  }
  return entries;
}

/**
 * A move between Public and Private is a delete in one repository and an add in the other (D-99),
 * said as `Make public: …` or `Make 2 items private`: the note wasn't deleted.
 */
const VISIBILITY = /^Make (public|private)\b|^Make \d+ items? (public|private)$/;
const isNotePath = (p: string) => p.startsWith("notes/") && /\.(md|markdown)$/i.test(p);

/**
 * The notes Recently deleted lists: notes (under `notes/`) deleted in the last 30 days, newest first,
 * once per path, leaving out moves between the roots and notes that are back at their path.
 */
export function recentDeletions(entries: readonly DeletedEntry[], o: { now: number; exists: (path: string) => boolean; days?: number }): DeletedEntry[] {
  const since = o.now - (o.days ?? RECENTLY_DELETED_DAYS) * DAY_MS;
  const seen = new Set<string>();
  const out: DeletedEntry[] = [];
  for (const e of [...entries].sort((a, b) => b.at - a.at)) {
    if (e.at < since || !isNotePath(e.path) || VISIBILITY.test(e.subject) || seen.has(e.path)) continue;
    seen.add(e.path);
    if (!o.exists(e.path)) out.push(e);
  }
  return out;
}

/** A deleted note as the app lists it. `path` is where it was, in the shell's own spelling. */
export interface DeletedNote {
  /** Names the deletion: `<root>:<commit>:<repository path>`. */
  id: string;
  root: "private" | "public";
  path: string;
  title: string;
  /** The folder it was in, relative to its root, with forward slashes ("" for the root). */
  folder: string;
  deletedAt: number;
}

export const deletedId = (root: DeletedNote["root"], e: Pick<DeletedEntry, "commit" | "path">) => `${root}:${e.commit}:${e.path}`;
export function parseDeletedId(id: string): { root: DeletedNote["root"]; commit: string; path: string } | undefined {
  const m = /^(private|public):([0-9a-f]{7,64}):(notes\/.+)$/.exec(id);
  if (!m || m[3]!.split("/").some((part) => part === ".." || part === "." || part.startsWith("."))) return undefined;
  return { root: m[1] as DeletedNote["root"], commit: m[2]!, path: m[3]! };
}

/** A note's title from its text, or its file name. */
export const titleOrName = (text: string | undefined, path: string) => (text ? titleOfMarkdown(text) : undefined) ?? stemOf(path.split(/[\\/]/).at(-1) ?? path);

/** Recently deleted, grouped by the day it was deleted (local time), newest first. */
export function groupByDay<T extends { deletedAt: number }>(notes: readonly T[]): { day: string; at: number; notes: T[] }[] {
  const groups = new Map<string, { day: string; at: number; notes: T[] }>();
  for (const n of [...notes].sort((a, b) => b.deletedAt - a.deletedAt)) {
    const d = new Date(n.deletedAt);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const g = groups.get(day) ?? { day, at: n.deletedAt, notes: [] };
    g.notes.push(n);
    groups.set(day, g);
  }
  return [...groups.values()];
}

// ---- Note history (FIL-13, D-175) ----

/** One saved version of a note, from `git log --follow`. `path` is repository-relative, as the file was named in that commit. */
export interface VersionEntry {
  commit: string;
  /** When the commit was made, in ms. */
  at: number;
  author: string;
  /** The whole commit message, for the agent trailer. */
  message: string;
  path: string;
}

/** How many versions Note history reads at a time: the newest first, then a page more on Show older versions. */
export const NOTE_HISTORY_PAGE = 50;

/** The log of one note's versions, following renames; the path comes last, after `--`, so it's never read as an option (SEC-03). */
/**
 * The log of one note's versions, following renames: from HEAD, or from a commit already listed (the
 * next page starts there, with the note's path at that commit; `--skip` doesn't mix with `--follow`).
 * The path comes last, after `--`, so it's never read as an option (SEC-03).
 */
export const VERSION_LOG_ARGS = (rel: string, o: { from?: string; limit?: number } = {}) =>
  ["log", "--follow", "-M", "--no-merges", "-z", "--name-only", `-n${Math.max(1, Math.floor(o.limit ?? NOTE_HISTORY_PAGE))}`, "--format=%x01%H%x1f%ct%x1f%an%x1f%B%x02", ...(o.from ? [o.from] : []), "--", rel] as const;

/** Parses the output of {@link VERSION_LOG_ARGS}: one record per commit, newest first, with the note's path in that commit. */
export function parseVersionLog(out: string): VersionEntry[] {
  const entries: VersionEntry[] = [];
  for (const record of out.split("\x01")) {
    const end = record.indexOf("\x02");
    if (end < 0) continue;
    const [commit = "", ct = "", author = "", ...rest] = record.slice(0, end).split("\x1f");
    const path = record.slice(end + 1).split("\0").map((n) => n.replace(/^\n+/, "")).find(Boolean);
    if (!/^[0-9a-f]{7,64}$/.test(commit) || !/^\d+$/.test(ct) || !path) continue;
    entries.push({ commit, at: Number(ct) * 1000, author, message: rest.join("\x1f").trim(), path });
  }
  return entries;
}

/** A version of a note as the app lists it (Note history): who made it, and the agent when one did. */
export interface NoteVersion {
  commit: string;
  at: number;
  author: string;
  agent?: string;
  /** The note's path in its repository at that commit (it may have been renamed since). */
  file: string;
}

/** A note's version file as the shell may read it: a Markdown file's repository path, nothing that climbs out or reads as an option. */
export const isVersionFile = (file: unknown): file is string =>
  typeof file === "string" && file.length < 1024 && /\.(md|markdown)$/i.test(file) && !file.startsWith("-") && !file.startsWith("/") && !/(^|\/)\.\.(\/|$)/.test(file) && !/[\0\\:]/.test(file);

/** Note history grouped by the day each version was saved (local time), newest first. */
export function versionsByDay<T extends { at: number }>(versions: readonly T[]): { day: string; at: number; versions: T[] }[] {
  const groups = new Map<string, { day: string; at: number; versions: T[] }>();
  for (const v of [...versions].sort((a, b) => b.at - a.at)) {
    const d = new Date(v.at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const g = groups.get(day) ?? { day, at: v.at, versions: [] };
    g.versions.push(v);
    groups.set(day, g);
  }
  return [...groups.values()];
}

/**
 * Where a restored note goes (Files → Deleting and restoring): back in its folder, or in its
 * root when that folder is gone, or in the chosen folder; a name that's taken there is numbered.
 */
export function restorePlace(o: { original: string; root: string; folder?: string; folderExists: boolean; taken: Iterable<string> }): string {
  const dir = o.folder ?? (o.folderExists ? dirOf(o.original) : o.root);
  const name = o.original.split(/[\\/]/).at(-1)!;
  const ext = /\.markdown$/i.test(name) ? ".markdown" : ".md";
  return joinPath(dir, uniqueName(stemOf(name), o.taken, ext));
}

// ---- conflicts (FIL-12) ----

/** One block of a version in the resolver: a paragraph, heading, list, or fence, and whether it differs. */
export interface VersionBlock {
  id: string;
  text: string;
  changed: boolean;
}

/** Splits Markdown into blocks at blank lines, keeping fenced code whole. */
export function blocksOf(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence = "";
  const end = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of lines) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      current.push(line);
      if (f && f[0] === fence[0] && f.length >= fence.length) fence = "";
      continue;
    }
    if (f) fence = f;
    if (!line.trim() && !fence) end();
    else current.push(line);
  }
  end();
  return blocks;
}

/**
 * Both versions block by block (Feedback → Conflict resolver): blocks that aren't in the other
 * version, in order, are changed. Matching is a longest common subsequence of whole blocks.
 */
export function compareVersions(mine: string, theirs: string): { mine: VersionBlock[]; theirs: VersionBlock[] } {
  const a = blocksOf(mine);
  const b = blocksOf(theirs);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const keepA = new Set<number>();
  const keepB = new Set<number>();
  const n = endA - start;
  const m = endB - start;
  // Long middles are compared only by their common start and end, so a huge note stays quick.
  if (n * m <= 4_000_000) {
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[start + i] === b[start + j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[start + i] === b[start + j]) {
        keepA.add(start + i++);
        keepB.add(start + j++);
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
      else j++;
    }
  }
  const mark = (blocks: string[], end: number, keep: Set<number>, side: string): VersionBlock[] =>
    blocks.map((text, i) => ({ id: `${side}${i}`, text, changed: i >= start && i < end && !keep.has(i) }));
  return { mine: mark(a, endA, keepA, "m"), theirs: mark(b, endB, keepB, "t") };
}

/** How a conflict is settled (DD-FB-04): every choice keeps every word somewhere. */
export type ConflictChoiceKind = "mine" | "theirs" | "both";

/**
 * A copy that keeps a version (Feedback → Conflict resolver): "⟨title⟩ (conflict copy)" next to the
 * note, or "⟨title⟩ (your version, ⟨time⟩)", which goes to Recently deleted. Its title is its H1,
 * and its file name follows that title, numbered if taken.
 */
export function conflictCopy(o: { path: string; text: string; title: string; taken: Iterable<string> }): { path: string; text: string } {
  const name = uniqueName(fileStemForTitle(o.title), o.taken);
  return { path: joinPath(dirOf(o.path), name), text: retitle(o.text, o.title) };
}
