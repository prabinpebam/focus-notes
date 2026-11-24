/**
 * Account and sync recovery alert runtime (FRE-13, G5.4, D-213, UC-SAFE-10).
 * Checks for unlinked folders, account/remote problems, inbound sync failures and mass external
 * deletions while writing carries on. Import/reconciliation verifies every copied file byte-for-byte
 * before swapping or recycling the old folder, and mass external deletion pauses backup instead of
 * pushing a destructive empty tree.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import type { SyncAlertAction, SyncAlertReport, SyncReport } from "@focus-notes/core";
import type { GitRunner } from "../git/run.ts";
import { parseStatus, STATUS_ARGS, type StatusEntry } from "../git/status.ts";
import { shortPath, type WorkspaceRecord } from "./record.ts";

export interface MassDeletionResult {
  paused: boolean;
  missingCount: number;
  paths: string[];
}

const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p);

/**
 * Detects mass external deletion (FRE-13, notes-folder.md): more than 20 tracked Markdown notes,
 * or more than half of tracked Markdown notes (when > 1), removed in the worktree outside Focus Notes.
 */
export function detectMassDeletion(entries: readonly StatusEntry[], trackedMarkdownCount: number): MassDeletionResult {
  const paths = entries
    .filter((e) => e.kind === "changed" && e.xy[1] === "D" && isMarkdown(e.path))
    .map((e) => e.path);
  const paused = paths.length > 20 || (trackedMarkdownCount > 1 && paths.length > trackedMarkdownCount / 2);
  return { paused, missingCount: paths.length, paths };
}

/** Counts user Markdown notes under a folder, ignoring `.git`, `.focus-notes`, and `node_modules`. */
export async function countLocalUserNotes(folder: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === ".git" || e.name === ".focus-notes" || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && isMarkdown(e.name)) out.push(full);
    }
  }
  await walk(folder);
  return out;
}

/** Verifies that every copied file exists at its target and matches its source byte-for-byte. */
export async function verifyCopiedFiles(pairs: readonly { source: string; target: string }[]): Promise<{ ok: boolean; mismatch?: string }> {
  for (const pair of pairs) {
    try {
      const [src, dst] = await Promise.all([readFile(pair.source), readFile(pair.target)]);
      if (Buffer.compare(src, dst) !== 0) return { ok: false, mismatch: pair.source };
    } catch {
      return { ok: false, mismatch: pair.source };
    }
  }
  return { ok: true };
}

export type UnlinkedCause = "autoSync" | "unlinked" | "signIn" | "otherAccount" | "remoteGone";

/** Classifies an unlinked GitHub folder based on local notes, account state and remote reachability. */
export function classifyUnlinked(
  localNotes: readonly string[],
  accountState: "signedIn" | "signedOut" | "noAccess" | "offline",
  remoteExists: boolean,
): UnlinkedCause {
  if (accountState === "signedOut") return "signIn";
  if (accountState === "noAccess") return "otherAccount";
  if (!remoteExists) return "remoteGone";
  if (localNotes.length === 0 && accountState === "signedIn") return "autoSync";
  return "unlinked";
}

/** Picks a non-colliding destination path, adding " (this computer)" if a different file exists at target. */
export async function collisionSafeTarget(source: string, target: string): Promise<{ dest: string; skip: boolean }> {
  if (!existsSync(target)) return { dest: target, skip: false };
  try {
    const [a, b] = await Promise.all([readFile(source), readFile(target)]);
    if (Buffer.compare(a, b) === 0) return { dest: target, skip: true };
  } catch { /* treat as different */ }
  const ext = extname(target);
  const stem = basename(target, ext);
  const dir = dirname(target);
  for (let i = 1; i < 100; i++) {
    const suffix = i === 1 ? " (this computer)" : ` (this computer ${i})`;
    const candidate = join(dir, `${stem}${suffix}${ext}`);
    if (!existsSync(candidate)) return { dest: candidate, skip: false };
  }
  return { dest: join(dir, `${stem} (this computer ${Date.now()})${ext}`), skip: false };
}

export interface ReconcileOptions {
  folder: string;
  cloneInto: (hiddenDir: string) => Promise<{ ok: boolean; reason?: string }>;
  commitAndPush: (hiddenDir: string) => Promise<{ ok: boolean; reason?: string }>;
  trashFolder: (oldFolder: string) => Promise<void>;
  onStep?: (step: number, total: number, progress: number, reason: string) => void;
}

/**
 * Safely reconciles an unlinked folder against its GitHub notes (FRE-13, notes-folder.md):
 * 1. Clone into a hidden sibling folder
 * 2. Copy local notes into private/notes (keeping both on collision)
 * 3. Commit and push
 * 4. Verify every copied file byte-for-byte before touching the original folder
 * 5. Swap folders and send the old folder to the Recycle Bin (or keep as "<name> (before sync)").
 * On any failure, removes the hidden copy and leaves the original folder completely untouched.
 */
export async function reconcileUnlinkedFolder(opts: ReconcileOptions): Promise<{ ok: boolean; reason?: string }> {
  const parent = dirname(opts.folder);
  const name = basename(opts.folder);
  const hidden = join(parent, `.focus-notes-sync-${Date.now()}`);
  const cleanup = async () => { await rm(hidden, { recursive: true, force: true }).catch(() => {}); };

  try {
    opts.onStep?.(1, 5, 20, "Downloading your notes from GitHub. You can keep writing.");
    const cloned = await opts.cloneInto(hidden);
    if (!cloned.ok) {
      await cleanup();
      return { ok: false, reason: cloned.reason ?? "Downloading your notes failed." };
    }

    opts.onStep?.(2, 5, 40, "Bringing in the notes from this computer. You can keep writing.");
    const localNotes = await countLocalUserNotes(opts.folder);
    const privateNotesDir = existsSync(join(hidden, "private", "notes"))
      ? join(hidden, "private", "notes")
      : join(hidden, "notes");
    const pairs: { source: string; target: string }[] = [];
    for (const src of localNotes) {
      const rel = relative(opts.folder, src);
      const rawTarget = rel.startsWith(`notes${join("", "")}`) || rel.startsWith("notes/") || rel.startsWith("notes\\")
        ? join(hidden, rel)
        : join(privateNotesDir, rel);
      const { dest, skip } = await collisionSafeTarget(src, rawTarget);
      if (skip) continue;
      await mkdir(dirname(dest), { recursive: true });
      await cp(src, dest);
      pairs.push({ source: src, target: dest });
    }

    opts.onStep?.(3, 5, 65, "Backing up your notes to GitHub. You can keep writing.");
    const pushed = await opts.commitAndPush(hidden);
    if (!pushed.ok) {
      await cleanup();
      return { ok: false, reason: pushed.reason ?? "Backing up failed." };
    }

    opts.onStep?.(4, 5, 85, "Checking every file before switching the folder.");
    const verified = await verifyCopiedFiles(pairs);
    if (!verified.ok) {
      await cleanup();
      return { ok: false, reason: "Verification failed before switching folders. Your original folder was kept untouched." };
    }

    opts.onStep?.(5, 5, 95, "Switching to your synced folder.");
    const backupOld = join(parent, `${name} (before sync)`);
    const oldAside = existsSync(backupOld) ? join(parent, `${name} (before sync ${Date.now()})`) : backupOld;
    await rename(opts.folder, oldAside);
    try {
      await rename(hidden, opts.folder);
    } catch (err) {
      await rename(oldAside, opts.folder).catch(() => {});
      await cleanup();
      return { ok: false, reason: err instanceof Error ? err.message : "Could not switch folders." };
    }
    await opts.trashFolder(oldAside).catch(() => {});
    return { ok: true };
  } catch (err) {
    await cleanup();
    return { ok: false, reason: err instanceof Error ? err.message : "Sync didn't finish." };
  }
}

export interface SyncAlertControllerOptions {
  folder: () => string;
  home: string;
  record: () => WorkspaceRecord | undefined;
  runGit: GitRunner;
  syncNow: () => Promise<SyncReport>;
  onReport: (report: SyncAlertReport) => void;
  reconcile?: (folder: string, onStep: NonNullable<ReconcileOptions["onStep"]>) => Promise<{ ok: boolean; reason?: string }>;
}

export interface SyncAlertController {
  status(): SyncAlertReport;
  setReport(report: SyncAlertReport): void;
  onGitReport(report: SyncReport): void;
  checkBeforeSync(): Promise<boolean>;
  act(action: SyncAlertAction): Promise<SyncAlertReport>;
}

export function createSyncAlertController(opts: SyncAlertControllerOptions): SyncAlertController {
  let current: SyncAlertReport = {};
  let pausedPaths: { repoDir: string; paths: string[] }[] = [];
  let allowDeletionOnce = false;

  const baseFacts = (): Pick<SyncAlertReport, "folder" | "repository" | "lastBackup"> => {
    const rec = opts.record();
    const folder = opts.folder();
    return {
      ...(folder ? { folder: shortPath(folder, opts.home) } : {}),
      ...(rec?.repository ? { repository: rec.repository } : {}),
      ...(rec?.lastBackup ? { lastBackup: rec.lastBackup } : {}),
    };
  };

  const emit = (next: SyncAlertReport) => {
    current = next;
    opts.onReport(next);
  };

  const checkRepoMassDeletion = async (repoDir: string): Promise<{ repoDir: string; paths: string[] } | undefined> => {
    const [trackedRes, statusRes] = await Promise.all([
      opts.runGit({ cwd: repoDir, args: ["ls-files"], read: true }),
      opts.runGit({ cwd: repoDir, args: [...STATUS_ARGS], read: true }),
    ]);
    if (trackedRes.code !== 0 || statusRes.code !== 0) return undefined;
    const trackedMd = trackedRes.stdout.split(/\r?\n/).filter((p) => p && isMarkdown(p)).length;
    const st = parseStatus(statusRes.stdout);
    const detected = detectMassDeletion(st.entries, trackedMd);
    return detected.paused ? { repoDir, paths: detected.paths } : undefined;
  };

  return {
    status: () => current,
    setReport: (report) => emit(report),
    onGitReport(report) {
      if (report.problem === "auth") {
        emit({ ...baseFacts(), cause: "signIn" });
      } else if (report.state === "idle" && !report.problem && (current.cause === "signIn" || current.cause === "inbound")) {
        emit({});
      }
    },
    async checkBeforeSync(): Promise<boolean> {
      if (allowDeletionOnce) {
        allowDeletionOnce = false;
        return true;
      }
      const folder = opts.folder();
      if (!folder || !existsSync(join(folder, ".git"))) return true;
      const dirs = [folder];
      const priv = join(folder, "private");
      if (existsSync(join(priv, ".git"))) dirs.push(priv);
      const found: { repoDir: string; paths: string[] }[] = [];
      for (const dir of dirs) {
        const hit = await checkRepoMassDeletion(dir).catch(() => undefined);
        if (hit) found.push(hit);
      }
      if (found.length > 0) {
        pausedPaths = found;
        const totalMissing = found.reduce((sum, x) => sum + x.paths.length, 0);
        emit({ ...baseFacts(), cause: "massDelete", count: totalMissing, paused: true });
        return false;
      }
      if (current.cause === "massDelete") {
        pausedPaths = [];
        emit({});
      }
      return true;
    },
    async act(action) {
      if (action === "restore") {
        const targets = pausedPaths.length > 0 ? pausedPaths : [];
        for (const item of targets) {
          const r = await opts.runGit({ cwd: item.repoDir, args: ["checkout", "HEAD", "--", ...item.paths] });
          if (r.code !== 0) {
            emit({ ...baseFacts(), cause: "failed", reason: "Couldn't restore the missing notes from Git." });
            return current;
          }
          for (const rel of item.paths) {
            const st = await stat(join(item.repoDir, ...rel.split("/"))).catch(() => undefined);
            if (!st?.isFile()) {
              emit({ ...baseFacts(), cause: "failed", reason: "Some restored notes couldn't be verified on disk." });
              return current;
            }
          }
        }
        pausedPaths = [];
        emit({});
        return current;
      }

      if (action === "removeRemote") {
        allowDeletionOnce = true;
        for (const item of pausedPaths) {
          await opts.runGit({ cwd: item.repoDir, args: ["add", "-u", "--", ...item.paths] });
          await opts.runGit({ cwd: item.repoDir, args: ["commit", "-m", `Remove ${item.paths.length} deleted notes`] });
        }
        pausedPaths = [];
        const res = await opts.syncNow();
        if (res.state === "problem") {
          emit({ ...baseFacts(), cause: res.problem === "auth" ? "signIn" : "failed" });
        } else {
          emit({});
        }
        return current;
      }

      if ((action === "sync" || action === "retry") && current.cause === "unlinked" && opts.reconcile) {
        const facts = baseFacts();
        const res = await opts.reconcile(opts.folder(), (step, total, progress, reason) => {
          emit({ ...facts, cause: "syncing", step, total, progress, reason });
        });
        if (res.ok) emit({});
        else emit({ ...facts, cause: "failed", reason: res.reason });
        return current;
      }

      const res = await opts.syncNow();
      if (res.state === "problem") {
        emit({ ...baseFacts(), cause: res.problem === "auth" ? "signIn" : "failed" });
      } else {
        emit({});
      }
      return current;
    },
  };
}
