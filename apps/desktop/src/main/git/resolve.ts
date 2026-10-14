/**
 * Notes changed here and elsewhere (FIL-12) and notes from history (FIL-10), for one repository.
 * Reading never names a note in a process argument (SEC-03): revisions and paths go through
 * standard input. Settling a conflict builds the result in a temporary index and moves the branch
 * to it in one step (`reset --keep`), so the repository is never left half-resolved, and the
 * history stays a line on top of the other version, like the rebase it replaces (D-97).
 */
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitResult } from "./run.ts";

/** Runs Git in one repository. */
export type Exec = (args: string[], o?: { input?: string; env?: Record<string, string>; read?: boolean }) => Promise<GitResult>;

export class GitFailed extends Error {}
const out = async (p: Promise<GitResult>): Promise<string> => {
  const r = await p;
  if (r.code !== 0) throw new GitFailed(r.stderr.trim().split("\n")[0] ?? "git failed");
  return r.stdout;
};

/** One side's change to a path since the two sides parted, from `git diff --raw`. */
export interface RawChange {
  status: string;
  mode: string;
  /** The blob after the change: all zeros when it was deleted. */
  oid: string;
}
const ZERO = /^0+$/;
export const isDeletion = (c: RawChange) => c.status === "D" || ZERO.test(c.oid);

/** Parses `git diff --raw -z --no-renames --no-abbrev`. */
export function parseRaw(text: string): Map<string, RawChange> {
  const changes = new Map<string, RawChange>();
  const parts = text.split("\0");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const m = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])/.exec(parts[i]!.replace(/^\n+/, ""));
    if (m) changes.set(parts[i + 1]!, { status: m[5]!, mode: m[2]!, oid: m[4]! });
  }
  return changes;
}

/** Where this branch and its upstream parted, and what each changed since. */
export interface Divergence {
  base: string;
  head: string;
  upstream: string;
  mine: Map<string, RawChange>;
  theirs: Map<string, RawChange>;
}

export async function divergence(exec: Exec): Promise<Divergence | undefined> {
  const revs = await exec(["rev-parse", "HEAD", "@{upstream}"], { read: true });
  if (revs.code !== 0) return undefined;
  const [head, upstream] = revs.stdout.trim().split(/\r?\n/);
  if (!head || !upstream || head === upstream) return undefined;
  const base = (await out(exec(["merge-base", head, upstream], { read: true }))).trim();
  const raw = async (to: string) => (base === to ? new Map<string, RawChange>() : parseRaw(await out(exec(["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, to], { read: true }))));
  const [mine, theirs] = await Promise.all([raw(head), raw(upstream)]);
  return { base, head, upstream, mine, theirs };
}

/** Paths both sides changed, to different results: the notes in conflict. */
export function bothChanged(d: Divergence): string[] {
  return [...d.mine].filter(([p, c]) => {
    const t = d.theirs.get(p);
    return t !== undefined && (t.oid !== c.oid || t.mode !== c.mode);
  }).map(([p]) => p);
}

/**
 * Reads files at revisions (`<rev>:<path>`) through `cat-file --batch`, so no path is an argument.
 * Undefined where there's nothing at that path.
 */
export async function readBlobs(exec: Exec, specs: readonly string[]): Promise<(string | undefined)[]> {
  if (!specs.length) return [];
  if (specs.some((s) => /[\r\n]/.test(s))) throw new GitFailed("invalid path");
  const raw = Buffer.from(await out(exec(["cat-file", "--batch"], { input: `${specs.join("\n")}\n`, read: true })), "utf8");
  const result: (string | undefined)[] = [];
  let at = 0;
  for (let i = 0; i < specs.length; i++) {
    const nl = raw.indexOf(0x0a, at);
    if (nl < 0) throw new GitFailed("short cat-file output");
    const head = raw.subarray(at, nl).toString("utf8");
    at = nl + 1;
    const m = / (\w+) (\d+)$/.exec(head);
    if (!m) {
      result.push(undefined); // missing
      continue;
    }
    const size = Number(m[2]);
    result.push(m[1] === "blob" ? raw.subarray(at, at + size).toString("utf8") : undefined);
    at += size + 1;
  }
  return result;
}

/** When the other side last changed each path, from its log since the two sides parted. */
export async function changedAt(exec: Exec, base: string, upstream: string): Promise<Map<string, number>> {
  const text = await out(exec(["log", "-z", "--no-renames", "--name-only", "--format=%x01%ct", `${base}..${upstream}`], { read: true }));
  const at = new Map<string, number>();
  for (const record of text.split("\x01")) {
    const [time = "", ...names] = record.split("\0");
    const t = Number(time.trim()) * 1000;
    for (const n of names) {
      const p = n.replace(/^\n+/, "");
      if (p && !at.has(p)) at.set(p, t);
    }
  }
  return at;
}

/** Every file name in a revision's tree, for numbering a copy's name (no path is an argument). */
export async function treeNames(exec: Exec, rev: string): Promise<string[]> {
  return (await out(exec(["ls-tree", "-r", "-z", "--name-only", rev], { read: true }))).split("\0").filter(Boolean);
}

/** How one conflicting path is settled; `copy` is the copy of this computer's version, if one is kept. */
export interface Settle {
  choice: "mine" | "theirs" | "both";
  copy?: { path: string; text: string };
}

/**
 * Builds the result on top of the other version and moves the branch there (FIL-12, DD-FB-04):
 * everything only this computer changed, and each conflicting path as chosen. Copies of "your
 * version" are added in that commit and deleted in the next, so they're in Recently deleted; a
 * "keep both" copy stays. Resolves to the new head. Nothing changes if any step fails.
 */
export async function settle(exec: Exec, o: { gitDir: string; d: Divergence; choices: Map<string, Settle>; message: string; deleteMessage: string }): Promise<string> {
  const index = join(o.gitDir, "FOCUS_NOTES_RESOLVE_INDEX");
  const msg = join(o.gitDir, "FOCUS_NOTES_RESOLVE_MSG");
  const env = { GIT_INDEX_FILE: index };
  const sign = (await exec(["config", "--bool", "commit.gpgsign"], { read: true })).stdout.trim() === "true" ? ["-S"] : [];
  const conflicting = new Set(bothChanged(o.d));
  try {
    await out(exec(["read-tree", o.d.upstream], { env }));
    const entries: string[] = [];
    const entry = (path: string, c: RawChange) => (isDeletion(c) ? `0 ${"0".repeat(c.oid.length)}\t${path}` : `${c.mode} ${c.oid}\t${path}`);
    for (const [path, c] of o.d.mine) {
      if (!conflicting.has(path)) entries.push(entry(path, c));
      else if (o.choices.get(path)?.choice === "mine") entries.push(entry(path, c));
      else if (!o.choices.has(path)) throw new GitFailed("undecided");
    }
    const hash = async (text: string) => (await out(exec(["hash-object", "-w", "--stdin"], { input: text }))).trim();
    const yours: string[] = [];
    for (const s of o.choices.values()) {
      if (!s.copy) continue;
      entries.push(`100644 ${await hash(s.copy.text)}\t${s.copy.path}`);
      if (s.choice === "theirs") yours.push(s.copy.path);
    }
    const commit = async (parent: string, message: string) => {
      const tree = (await out(exec(["write-tree"], { env }))).trim();
      await writeFile(msg, `${message}\n`, "utf8");
      return (await out(exec(["commit-tree", ...sign, tree, "-p", parent, "-F", msg]))).trim();
    };
    const info = (lines: string[]) => out(exec(["update-index", "-z", "--index-info"], { input: lines.map((l) => `${l}\0`).join(""), env }));
    if (entries.length) await info(entries);
    let head = await commit(o.d.upstream, o.message);
    if (yours.length) {
      await info(yours.map((p) => `0 ${"0".repeat(head.length)}\t${p}`));
      head = await commit(head, o.deleteMessage);
    }
    // One step: the branch, the index, and the files that differ. Files with other changes are kept.
    await out(exec(["reset", "--quiet", "--keep", head]));
    return head;
  } finally {
    await rm(index, { force: true }).catch(() => {});
    await rm(msg, { force: true }).catch(() => {});
  }
}
