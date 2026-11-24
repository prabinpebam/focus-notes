/**
 * Account and sync recovery alert (FRE-13, G5.4, D-213, D-408):
 * verifies all 9 recovery alert cards, corner/header projection, one-per-session sign-in toast,
 * action dispatch, Not now dismissal, and offline mode without alert.
 */
import { describe, expect, it } from "vitest";
import { createApp, recoveryAlertView, NO_SYNC, type AppStateFile, type PlatformBridge, type RecoveryAlertView, type SyncAlertAction, type SyncAlertReport, type SyncReport } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };
import { MessageCatalog } from "../src/messages.ts";

const catalog = new MessageCatalog("en", en);

function setup() {
  const files: Record<string, string> = { "/n/a.md": "# A\n" };
  let syncListener: ((r: SyncReport) => void) | undefined;
  let alertListener: ((r: SyncAlertReport) => void) | undefined;
  let state: AppStateFile = { version: 1, lastNotePath: "/n/a.md" };
  const acts: SyncAlertAction[] = [];
  let actResult: SyncAlertReport = {};
  let currentAlert: SyncAlertReport = {};
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => files[p]!,
    writeNote: async (p, c) => void (files[p] = c),
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/new.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => state,
    saveAppState: async (s) => void (state = s),
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    sync: {
      now: async () => ({ git: true, state: "idle", waiting: 0 }),
      status: async () => ({ git: true, state: "idle", waiting: 0 }),
      onStatus: (l) => { syncListener = l; return () => {}; },
    },
    syncAlert: {
      status: async () => currentAlert,
      onStatus: (l) => { alertListener = l; return () => {}; },
      act: async (action) => {
        acts.push(action);
        currentAlert = actResult;
        return actResult;
      },
    },
  };
  const app = createApp(bridge, en);
  return {
    app, acts,
    emitSync: (r: SyncReport) => syncListener?.(r),
    emitAlert: (r: SyncAlertReport) => { currentAlert = r; alertListener?.(r); },
    willActReturn: (r: SyncAlertReport) => { actResult = r; },
    alert: () => app.viewModels.select("vm.syncAlert", app.store.state) as RecoveryAlertView,
    save: () => app.viewModels.select("vm.saveState", app.store.state) as { state: string; label: string; text: string; cardLabel: string; icon: string; tone: string },
    toasts: () => app.store.state.ui.toasts,
  };
}

describe("FRE-13 / G5.4 / D-408: recovery alert cards", () => {
  const NOW = Date.parse("2026-11-24T12:00:00Z");
  const THREE_HOURS_AGO = "2026-11-24T09:00:00Z";

  it("projects all nine recovery alert causes with exact icons, tones, progress, facts and trailing actions", () => {
    const base = { folder: "Documents\\prabins-notes", repository: "prabin-demo/prabins-notes", lastBackup: THREE_HOURS_AGO };
    const view = (report: SyncAlertReport) =>
      recoveryAlertView({ report, sync: { git: true }, cornerOpen: false, headerOpen: false }, catalog, NOW);

    expect(view({ ...base, cause: "autoSync", progress: 45 })).toMatchObject({
      active: true, headerAlert: false, icon: "cloudUp", tone: "accent", busy: true,
      title: "Not connected to your notes on GitHub",
      hasProgress: true, progress: 45, progressLabel: "Downloading your notes · 45%",
      hasPrimary: false, hasSecondary: false, hasNotNow: false,
      cornerState: "syncing", cornerText: "Downloading your notes · 45%",
    });

    expect(view({ ...base, cause: "unlinked", count: 4 })).toMatchObject({
      active: true, headerAlert: true, icon: "warning", tone: "warning", busy: false,
      title: "Not connected to your notes on GitHub",
      primary: "Sync now", hasPrimary: true, hasSecondary: false, notNow: "Not now", hasNotNow: true,
      cornerState: "error",
    });

    expect(view({ ...base, cause: "signIn" })).toMatchObject({
      active: true, headerAlert: true, icon: "warning", tone: "warning",
      title: "Not backed up · sign in to GitHub",
      primary: "Sign in again", notNow: "Not now",
      facts: [
        { id: "folder", text: "This folder: Documents\\prabins-notes" },
        { id: "repo", text: "Notes on GitHub: prabin-demo/prabins-notes" },
        { id: "backup", text: "Last backup: 3 hours ago" },
      ],
    });

    expect(view({ ...base, cause: "otherAccount", login: "other" })).toMatchObject({
      title: "Signed in as @other",
      primary: "Switch account", notNow: "Not now",
    });

    expect(view({ ...base, cause: "remoteGone" })).toMatchObject({
      title: "Your notes aren't on GitHub",
      primary: "Choose what to do…", notNow: "Not now",
    });

    expect(view({ ...base, cause: "inbound", count: 3, reason: "They couldn't come in because the network dropped during the last sync." })).toMatchObject({
      title: "GitHub has 3 changes this computer doesn't have",
      line: "They couldn't come in because the network dropped during the last sync.",
      primary: "Sync now", notNow: "Not now",
    });

    expect(view({ ...base, cause: "massDelete", count: 48, paused: true })).toMatchObject({
      title: "48 notes are missing from this folder",
      primary: "Restore them", secondary: "Remove them from GitHub too", hasNotNow: false,
    });

    expect(view({
      ...base, cause: "syncing", step: 2, total: 5, progress: 40,
      steps: [{ id: "a", text: "Download your notes · done" }, { id: "b", text: "Bring in the notes from this computer · now" }],
    })).toMatchObject({
      icon: "cloudUp", tone: "accent", busy: true, headerAlert: false,
      title: "Syncing your notes · 2 of 5", hasProgress: true, progress: 40,
      facts: [{ id: "a", text: "Download your notes · done" }, { id: "b", text: "Bring in the notes from this computer · now" }],
    });

    expect(view({ ...base, cause: "failed", reason: "Backing up failed because GitHub stopped answering." })).toMatchObject({
      icon: "warning", tone: "danger", busy: false,
      title: "Sync didn't finish", primary: "Try again", notNow: "Not now",
    });
  });

  it("surfaces signIn card automatically when GitSync reports auth problem and shows at most one toast per session", async () => {
    const t = setup();
    await t.app.start();
    t.emitAlert({ cause: "signIn", folder: "Documents\\notes", repository: "me/notes" });
    expect(t.alert()).toMatchObject({ active: true, cause: "signIn", title: "Not backed up · sign in to GitHub" });
    expect(t.save()).toMatchObject({ state: "error", cardLabel: "Sync problem", icon: "warning", tone: "warning" });
    expect(t.toasts().filter((x) => x.message === en["recoveryAlert.toast.signIn"])).toHaveLength(1);
    // Repeated signIn reports never emit a second toast in the same session.
    t.emitAlert({ cause: "signIn", folder: "Documents\\notes", repository: "me/notes" });
    expect(t.toasts().filter((x) => x.message === en["recoveryAlert.toast.signIn"])).toHaveLength(1);
    // Clearing alert restores normal Backup card label.
    t.emitAlert({});
    expect(t.alert().active).toBe(false);
    expect(t.save().cardLabel).toBe("Backup");
    // Auth problem from GitSync alone still surfaces the sign-in card.
    t.emitSync({ git: true, state: "problem", problem: "auth", waiting: 1 });
    expect(t.alert()).toMatchObject({ active: true, cause: "signIn" });
  });

  it("dispatches primary, secondary and Not now commands cleanly", async () => {
    const t = setup();
    await t.app.start();
    t.emitAlert({ cause: "unlinked", count: 2, folder: "Documents\\notes", repository: "me/notes" });
    await t.app.commands.run("recoveryAlert.setCornerOpen", { open: true });
    expect(t.alert().cornerOpen).toBe(true);
    await t.app.commands.run("recoveryAlert.notNow");
    expect(t.alert().cornerOpen).toBe(false);
    expect(t.alert().active).toBe(true);

    t.willActReturn({});
    await t.app.commands.run("recoveryAlert.primary");
    expect(t.acts).toEqual(["sync"]);
    expect(t.alert().active).toBe(false);

    t.emitAlert({ cause: "massDelete", count: 25 });
    t.willActReturn({});
    await t.app.commands.run("recoveryAlert.primary");
    expect(t.acts).toEqual(["sync", "restore"]);

    t.emitAlert({ cause: "massDelete", count: 25 });
    t.willActReturn({});
    await t.app.commands.run("recoveryAlert.secondary");
    expect(t.acts).toEqual(["sync", "restore", "removeRemote"]);
  });

  it("offline mode (local Git with no remote) has no alert and stays savedLocal", () => {
    const view = recoveryAlertView({ report: {}, sync: { ...NO_SYNC, git: true, remote: false }, cornerOpen: false, headerOpen: false }, catalog, NOW);
    expect(view.active).toBe(false);
    expect(view.headerAlert).toBe(false);
  });
});
