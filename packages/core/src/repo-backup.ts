/**
 * Backup by repository (FIL-14, D-191). Each Files section is its own repository: Private is the
 * `private/` submodule and Public the notes repository. A section's heading carries a backup icon
 * with the per-note icon's looks (D-132), and its card says what waits there (folders, empty ones
 * too, notes and other files, or commits not pushed) and backs it up on request, as a tracked wait
 * (PRF-08, `fn:repoBackup`).
 */
import type { PlatformBridge, RepoBackupReport, RepoId, SyncProblem, SyncReport } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import { SyncFailed, type SaveStateKind, type SyncState } from "./sync-app.ts";

export interface RepoBackupEntry {
  /** What the shell last said waits there. */
  report?: RepoBackupReport;
  /** This repository's own backup is running. */
  backingUp?: boolean;
  /** When this repository was last seen with nothing waiting after something was, in this session. */
  backedUpAt?: number;
  /** Why its last backup didn't finish, until one does. */
  problem?: SyncProblem;
}
export type RepoBackupState = Partial<Record<RepoId, RepoBackupEntry>>;
export const REPO_IDS: readonly RepoId[] = ["private", "public"];

/** How many things wait: folders, notes and files, or else the commits not pushed. */
export function waitingOf(r: RepoBackupReport | undefined): number {
  if (!r) return 0;
  const files = r.folders + r.notes + r.other;
  return files || r.commits;
}

/** What waits, in counts, folders first: "2 folders, 1 note waiting for backup". */
export function waitingText(r: RepoBackupReport | undefined, catalog: MessageCatalog): string {
  if (!r || !waitingOf(r)) return catalog.format("save.backup.current");
  const parts = r.folders + r.notes + r.other
    ? ([["folders", r.folders], ["notes", r.notes], ["files", r.other]] as const).filter(([, n]) => n > 0).map(([k, n]) => catalog.format(`repoBackup.what.${k}`, { count: n }))
    : [catalog.format("repoBackup.what.commits", { count: r.commits })];
  return catalog.format("repoBackup.waiting", { what: parts.join(", ") });
}

/** The section's icon, with the per-note icon's looks (D-132). */
export function repoStateOf(entry: RepoBackupEntry | undefined, sync: SyncState): SaveStateKind {
  if (!sync.git || !entry?.report) return "savedLocal";
  const waiting = waitingOf(entry.report);
  if (entry.backingUp || (sync.syncing && waiting > 0)) return "syncing";
  const problem = entry.problem ?? (waiting > 0 ? sync.problem : undefined);
  if (problem === "offline") return "offline";
  if (problem) return "error";
  return waiting > 0 ? "pending" : "synced";
}

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const backupDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** One section's icon and card (vm.repoBackup.private and .public). */
export function repoBackupView(repo: RepoId, entry: RepoBackupEntry | undefined, sync: SyncState, catalog: MessageCatalog) {
  const state = repoStateOf(entry, sync);
  const name = catalog.format(`repoBackup.name.${repo}`);
  const at = entry?.backedUpAt ?? sync.backedUpAt;
  const stateText = state === "synced" ? (at !== undefined ? catalog.format("save.state.synced", { time: timeOfDay.format(at) }) : catalog.format("save.state.syncedNow"))
    : catalog.format(`save.state.${state}`);
  const backingUp = state === "syncing";
  return {
    visible: sync.git && Boolean(entry?.report),
    state, name, stateText,
    label: catalog.format("repoBackup.label", { name, state: stateText }),
    repository: entry?.report?.name ?? "",
    hasRepository: Boolean(entry?.report?.name),
    backingUp,
    canBackUp: sync.git && !backingUp && Boolean(entry?.report),
    backupTime: at === undefined ? catalog.format("save.backup.unknown") : catalog.format("save.backup.last", { time: backupDate.format(at) }),
    waitingText: backingUp ? catalog.format("save.backup.progress") : waitingText(entry?.report, catalog),
    backupReason: catalog.format(backingUp ? "save.backup.progress" : "save.backup.local"),
    icon: state === "error" ? "warning" : state === "offline" ? "cloudOff" : backingUp ? "cloudUp" : state === "synced" ? "cloudCheck" : "cloud",
    tone: state === "error" || state === "offline" ? "danger" : backingUp ? "accent" : state === "synced" ? "success" : "neutral",
  };
}

interface Ctx<S extends { sync: SyncState; repoBackup: RepoBackupState }> {
  store: Store<S>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  tracker: TaskTracker;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => unknown;
  announce?: (text: string) => void;
  now?: () => number;
}

export function registerRepoBackup<S extends { sync: SyncState; repoBackup: RepoBackupState }>({ store, bridge, catalog, tracker, toast, announce, now = Date.now }: Ctx<S>) {
  const set = (repo: RepoId, patch: Partial<RepoBackupEntry> | undefined) => store.update((s) => {
    const next: RepoBackupState = { ...s.repoBackup };
    if (patch === undefined) delete next[repo];
    else {
      const e: RepoBackupEntry = { ...next[repo], ...patch };
      for (const k of Object.keys(patch) as (keyof RepoBackupEntry)[]) if (patch[k] === undefined) delete e[k];
      next[repo] = e;
    }
    return { ...s, repoBackup: next };
  });
  let running: Promise<void> | undefined;
  let again = false;
  const read = async () => {
    const reports = await bridge.sync!.repos!().catch(() => undefined);
    if (!reports) return;
    for (const repo of REPO_IDS) {
      const r = reports.find((x) => x.repo === repo);
      const was = store.state.repoBackup[repo];
      if (!r) {
        if (was) set(repo, undefined);
        continue;
      }
      const same = was?.report && JSON.stringify(was.report) === JSON.stringify(r);
      if (same) continue;
      // Something waited and now nothing does: it's backed up.
      const done = waitingOf(was?.report) > 0 && waitingOf(r) === 0;
      set(repo, { report: r, ...(done ? { backedUpAt: now(), problem: undefined } : {}) });
    }
  };
  /** Asks the shell again; calls made while one runs share the next. */
  const refresh = (): Promise<void> => {
    if (!bridge.sync?.repos) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await read();
      } while (again);
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    refresh,
    start() {
      if (!bridge.sync?.repos) return;
      // Whatever the app's own backup did, and whatever changed in Files, each repository says again.
      bridge.sync.onStatus(() => void refresh());
      let tree: unknown;
      store.subscribe(() => {
        const t = (store.state as { workspace?: { tree?: unknown } }).workspace?.tree;
        if (t === tree) return;
        tree = t;
        void refresh();
      });
      void refresh();
    },
    /** Back up to GitHub, for one repository: commit everything waiting in its notes, then push (FIL-14). */
    async backUp(repo: RepoId): Promise<void> {
      if (!bridge.sync?.backupRepo || store.state.repoBackup[repo]?.backingUp) return;
      set(repo, { backingUp: true, problem: undefined });
      const name = catalog.format(`repoBackup.name.${repo}`);
      try {
        const priv = repo === "private";
        await tracker.run(priv ? "repoBackup.private" : "repoBackup.public", "repoBackup.task", async () => {
          const r: SyncReport = await bridge.sync!.backupRepo!(repo);
          if (r.state === "problem") throw new SyncFailed(catalog.format(`sync.problem.${r.problem ?? "failed"}`), r.problem ?? "failed");
        }, "save.label.done");
        set(repo, { backingUp: undefined });
        await refresh();
        if (!waitingOf(store.state.repoBackup[repo]?.report)) set(repo, { backedUpAt: now() });
        announce?.(catalog.format("repoBackup.done", { name }));
      } catch (e) {
        const problem = e instanceof SyncFailed ? e.problem : "failed";
        set(repo, { backingUp: undefined, problem });
        await refresh();
        toast(e instanceof SyncFailed ? e.message : catalog.format("sync.problem.failed"), { tone: "error" });
      }
    },
  };
}
