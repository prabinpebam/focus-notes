/**
 * Backup by repository (FIL-14, D-191): each Files section (Private, Public) is its own repository,
 * with a backup icon that says what's waiting there, folders included (empty ones too), and a card
 * whose Back up to GitHub commits and pushes everything waiting in that repository's notes.
 */
import { describe, expect, it, vi } from "vitest";
import { MessageCatalog } from "../src/messages.ts";
import { Store } from "../src/store.ts";
import { TaskTracker, type TaskView } from "../src/tasks.ts";
import { NO_SYNC, type SyncState } from "../src/sync-app.ts";
import { registerRepoBackup, repoBackupView, repoStateOf, SETTLE_MS, waitingOf, waitingText, type RepoBackupState } from "../src/repo-backup.ts";
import type { PlatformBridge, RepoBackupReport, SyncReport } from "../src/bridge.ts";

const catalog = new MessageCatalog("en", {
  "repoBackup.name.private": "Private notes", "repoBackup.name.public": "Public notes",
  "repoBackup.label": "{name} backup: {state}",
  "repoBackup.what.folders": "{count, plural, one {# folder} other {# folders}}",
  "repoBackup.what.notes": "{count, plural, one {# note} other {# notes}}",
  "repoBackup.what.files": "{count, plural, one {# file} other {# files}}",
  "repoBackup.what.commits": "{count, plural, one {# saved change} other {# saved changes}}",
  "repoBackup.waiting": "{what} waiting for backup",
  "repoBackup.task": "Backing up…", "repoBackup.done": "{name} backed up",
  "save.state.savedLocal": "Saved on this computer", "save.state.pending": "Saved here · not backed up yet", "save.state.syncing": "Backing up…",
  "save.state.synced": "Backed up at {time}", "save.state.syncedNow": "Backed up", "save.state.offline": "Offline · will back up when you're back", "save.state.error": "Couldn't back up · Try again",
  "save.backup.unknown": "No backup recorded in this session", "save.backup.last": "Last backup: {time}",
  "save.backup.progress": "Backing up your changes to GitHub", "save.backup.current": "No changes waiting for backup", "save.backup.local": "Connect a GitHub workspace to back up your notes",
  "sync.problem.offline": "Couldn't back up: you're offline.", "sync.problem.failed": "Couldn't back up.",
});

const report = (repo: "private" | "public", p: Partial<RepoBackupReport> = {}): RepoBackupReport => ({ repo, folders: 0, notes: 0, other: 0, commits: 0, ...p });
const GIT: SyncState = { git: true };

describe("what's waiting in a repository", () => {
  it("counts folders (empty ones too), notes and other files; commits alone count once each", () => {
    expect(waitingOf(undefined)).toBe(0);
    expect(waitingOf(report("public", { folders: 2, notes: 1 }))).toBe(3);
    expect(waitingOf(report("public", { folders: 1, commits: 1 }))).toBe(1);
    expect(waitingOf(report("public", { commits: 2 }))).toBe(2);
  });
  it("says it in counts, folders first", () => {
    expect(waitingText(report("public", { folders: 2, notes: 1 }), catalog)).toBe("2 folders, 1 note waiting for backup");
    expect(waitingText(report("private", { folders: 1 }), catalog)).toBe("1 folder waiting for backup");
    expect(waitingText(report("private", { other: 3 }), catalog)).toBe("3 files waiting for backup");
    expect(waitingText(report("private", { commits: 2 }), catalog)).toBe("2 saved changes waiting for backup");
    expect(waitingText(report("private"), catalog)).toBe("No changes waiting for backup");
  });
});

describe("a repository's backup state", () => {
  it("follows the per-note icon's looks: waiting, backing up, backed up, offline, problem", () => {
    expect(repoStateOf(undefined, NO_SYNC)).toBe("savedLocal");
    expect(repoStateOf({ report: report("public", { folders: 1 }) }, GIT)).toBe("pending");
    expect(repoStateOf({ report: report("public", { folders: 1 }), backingUp: true }, GIT)).toBe("syncing");
    // The app's own backup running, with this repository's changes in it.
    expect(repoStateOf({ report: report("public", { folders: 1 }) }, { git: true, syncing: true })).toBe("syncing");
    expect(repoStateOf({ report: report("public") }, { git: true, syncing: true })).toBe("synced");
    expect(repoStateOf({ report: report("public") }, GIT)).toBe("synced");
    expect(repoStateOf({ report: report("public", { commits: 1 }) }, { git: true, problem: "offline" })).toBe("offline");
    expect(repoStateOf({ report: report("public"), problem: "failed" }, GIT)).toBe("error");
  });
  it("names the button with its section and state", () => {
    const at = new Date(2026, 9, 18, 10, 36).getTime();
    const v = repoBackupView("private", { report: report("private"), backedUpAt: at }, GIT, catalog);
    expect(v.visible).toBe(true);
    expect(v.label).toMatch(/^Private notes backup: Backed up at 10:36/);
    expect(v.backupTime).toMatch(/^Last backup: /);
    expect(v.icon).toBe("cloudCheck");
    const w = repoBackupView("public", { report: report("public", { folders: 1, notes: 1 }) }, GIT, catalog);
    expect(w.label).toBe("Public notes backup: Saved here · not backed up yet");
    expect(w.waitingText).toBe("1 folder, 1 note waiting for backup");
    expect(w.canBackUp).toBe(true);
    expect(repoBackupView("public", undefined, GIT, catalog).visible).toBe(false);
    expect(repoBackupView("public", { report: report("public") }, NO_SYNC, catalog).visible).toBe(false);
  });
});

function harness(reports: RepoBackupReport[][], result: SyncReport = { git: true, state: "idle", waiting: 0 }) {
  const store = new Store<{ sync: SyncState; repoBackup: RepoBackupState; tasks: TaskView[] }>({ sync: { git: true }, repoBackup: {}, tasks: [] });
  const calls: string[] = [];
  const announced: string[] = [];
  const toasts: string[] = [];
  let i = 0;
  let finish: (() => void) | undefined;
  const bridge = {
    sync: {
      now: async () => result, status: async () => result, onStatus: () => () => {},
      repos: async () => reports[Math.min(i, reports.length - 1)]!,
      backupRepo: (repo: "private" | "public") => {
        calls.push(`backup ${repo}`);
        return new Promise<SyncReport>((resolve) => {
          finish = () => {
            i++;
            resolve(result);
          };
        });
      },
    },
  } as unknown as PlatformBridge;
  const tracker = new TaskTracker({ signDelay: 0, signMinimum: 0, announceDelay: 10_000, elapsedDelay: 10_000, doneDuration: 0 }, { change: (t) => store.update((s) => ({ ...s, tasks: t })), announce: () => {} });
  const rb = registerRepoBackup({ store, bridge, catalog, tracker, toast: (m) => void toasts.push(m), announce: (t) => void announced.push(t), now: () => 1_000 });
  return { store, rb, calls, announced, toasts, finish: () => finish?.() };
}

describe("backing up one repository", () => {
  it("shows waiting after an empty folder, backing up while it runs, then backed up, and says so", async () => {
    const h = harness([[report("private"), report("public", { folders: 1 })], [report("private"), report("public")]]);
    await h.rb.refresh();
    expect(repoStateOf(h.store.state.repoBackup.public, h.store.state.sync)).toBe("pending");
    expect(repoStateOf(h.store.state.repoBackup.private, h.store.state.sync)).toBe("synced");
    const running = h.rb.backUp("public");
    expect(h.calls).toEqual(["backup public"]);
    expect(repoStateOf(h.store.state.repoBackup.public, h.store.state.sync)).toBe("syncing");
    expect(h.store.state.tasks.some((t) => t.target === "repoBackup.public")).toBe(true);
    h.finish();
    await running;
    expect(repoStateOf(h.store.state.repoBackup.public, h.store.state.sync)).toBe("synced");
    expect(h.store.state.repoBackup.public?.backedUpAt).toBe(1_000);
    expect(h.announced).toContain("Public notes backed up");
    expect(h.toasts).toEqual([]);
  });
  it("a backup that fails keeps what's waiting, shows the problem, and toasts once", async () => {
    const h = harness([[report("public", { folders: 1 })]], { git: true, state: "problem", problem: "offline", waiting: 1 });
    await h.rb.refresh();
    const running = h.rb.backUp("public");
    h.finish();
    await running;
    expect(repoStateOf(h.store.state.repoBackup.public, h.store.state.sync)).toBe("offline");
    expect(h.store.state.repoBackup.public?.report?.folders).toBe(1);
    expect(h.toasts).toEqual(["Couldn't back up: you're offline."]);
  });
  it("asks only while Files shows the icons, once for changes close together, and again as Files opens", async () => {
    vi.useFakeTimers();
    try {
      let asked = 0;
      let status: (() => void) | undefined;
      const store = new Store<{ sync: SyncState; repoBackup: RepoBackupState; ui: { files: { open: boolean } }; workspace: { tree: object } }>({ sync: { git: true }, repoBackup: {}, ui: { files: { open: false } }, workspace: { tree: {} } });
      const bridge = { sync: { onStatus: (l: () => void) => ((status = l), () => {}), repos: async () => (asked++, [report("public")]) } } as unknown as PlatformBridge;
      const tracker = new TaskTracker({ signDelay: 0, signMinimum: 0, announceDelay: 0, elapsedDelay: 0, doneDuration: 0 }, { change: () => {}, announce: () => {} });
      registerRepoBackup({ store, bridge, catalog, tracker, toast: () => {} }).start();
      await vi.advanceTimersByTimeAsync(0);
      expect(asked).toBe(1);
      status!();
      store.update((s) => ({ ...s, workspace: { tree: {} } }));
      await vi.advanceTimersByTimeAsync(SETTLE_MS * 2);
      expect(asked).toBe(1);
      store.update((s) => ({ ...s, ui: { files: { open: true } } }));
      await vi.advanceTimersByTimeAsync(0);
      expect(asked).toBe(2);
      status!();
      status!();
      store.update((s) => ({ ...s, workspace: { tree: {} } }));
      await vi.advanceTimersByTimeAsync(SETTLE_MS * 2);
      expect(asked).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a repository the shell no longer reports goes away; refreshes never overlap", async () => {
    const h = harness([[report("private"), report("public")], [report("public")]]);
    await Promise.all([h.rb.refresh(), h.rb.refresh()]);
    expect(Object.keys(h.store.state.repoBackup).sort()).toEqual(["private", "public"]);
  });
});
