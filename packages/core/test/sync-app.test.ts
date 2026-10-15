/**
 * Save and sync in the app (EDT-11, D-23): Mod+S and switching notes ask the shell to commit and
 * push at once, and only problems are shown, as the trigger's dot and one toast.
 */
import { describe, expect, it } from "vitest";
import { createApp, type PlatformBridge, type SyncReport, type AppStateFile } from "../src/index.ts";

const messages = {
  "command.note.save": "Save", "command.note.open": "Open", "command.note.setContent": "Set",
  "task.saving": "Saving…", "task.saved": "Saved", "task.synced": "Saved and synced",
  "toast.retry": "Retry", "toast.saveFailed": "Couldn't save.", "trigger.saveProblem": "Couldn't save", "trigger.syncProblem": "Couldn't sync",
  "sync.problem.offline": "Couldn't sync: you're offline.", "sync.problem.conflict": "Couldn't sync: changes don't fit.", "sync.problem.failed": "Couldn't sync.",
  "conflict.resolve": "Resolve",
  "save.state.savedLocal": "Saved on this computer", "save.state.pending": "Saved here · not backed up yet", "save.state.syncing": "Backing up…",
  "save.state.synced": "Backed up · {when}", "save.state.syncedNow": "Backed up", "save.state.offline": "Offline", "save.state.error": "Couldn't back up",
  "save.when.now": "just now", "save.when.minutes": "{n} min ago", "save.when.hours": "{n} h ago", "save.label.syncing": "Backing up…", "save.label.done": "Backed up",
};

function setup(withSync = true) {
  const files: Record<string, string> = { "/n/a.md": "# A\n", "/n/b.md": "# B\n" };
  const calls: string[] = [];
  let listener: ((r: SyncReport) => void) | undefined;
  let next: SyncReport = { git: true, state: "idle", waiting: 0 };
  let state: AppStateFile = { version: 1, lastNotePath: "/n/a.md" };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => files[p]!,
    writeNote: async (p, c) => {
      files[p] = c;
      calls.push(`write ${p}`);
    },
    chooseNote: async () => "/n/b.md",
    newNotePath: async () => "/n/new.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => state,
    saveAppState: async (s) => void (state = s),
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    ...(withSync ? {
      sync: {
        now: async (reason) => {
          calls.push(`sync ${reason}`);
          return next;
        },
        status: async () => ({ git: true, state: "idle", waiting: 0 }),
        onStatus: (l) => {
          listener = l;
          return () => {};
        },
      },
    } : {}),
  };
  const app = createApp(bridge, messages);
  return {
    app, calls,
    report: (r: SyncReport) => listener!(r),
    willReturn: (r: SyncReport) => void (next = r),
    canvas: () => app.viewModels.select("vm.canvas", app.store.state) as { problem: boolean; problemLabel: string },
    toasts: () => app.store.state.ui.toasts.map((t) => t.message),
    save: () => app.viewModels.select("vm.saveState", app.store.state) as { visible: boolean; state: string; label: string; text: string },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("EDT-11: save and sync", () => {
  it("Mod+S writes the note, then commits and pushes at once, and shows nothing when it worked", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    await t.app.commands.run("note.setContent", { value: "# A\n\nMore.\n" });
    await t.app.commands.run("note.save");
    expect(t.calls).toEqual(["write /n/a.md", "sync save"]);
    expect(t.toasts()).toEqual([]);
    expect(t.canvas().problem).toBe(false);
  });

  it("Mod+S says why it couldn't sync, offers Retry, and the trigger shows the problem", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    t.willReturn({ git: true, state: "problem", problem: "offline", waiting: 1 });
    await t.app.commands.run("note.save");
    expect(t.toasts()).toEqual(["Couldn't sync: you're offline."]);
    expect(t.app.store.state.ui.toasts[0]!.action).toEqual({ command: "note.save", label: "Retry" });
    expect(t.canvas()).toMatchObject({ problem: true, problemLabel: "Couldn't sync" });
  });

  it("shows a background problem once, as a toast and the trigger's dot, and clears it when a sync works", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    t.report({ git: true, state: "syncing", waiting: 1 });
    expect(t.toasts()).toEqual([]);
    t.report({ git: true, state: "problem", problem: "conflict", waiting: 1 });
    t.report({ git: true, state: "syncing", waiting: 1 });
    t.report({ git: true, state: "problem", problem: "conflict", waiting: 1 });
    expect(t.toasts()).toEqual(["Couldn't sync: changes don't fit."]);
    // A conflict's toast offers the resolver (FIL-12) rather than Retry.
    expect(t.app.store.state.ui.toasts[0]!.action).toEqual({ command: "conflict.open", label: "Resolve" });
    expect(t.canvas().problem).toBe(true);
    t.report({ git: true, state: "idle", waiting: 0 });
    expect(t.canvas().problem).toBe(false);
  });

  it("switching notes commits and pushes the one being left, after writing it", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    expect(t.calls, "opening the first note isn't a switch").toEqual([]);
    await t.app.commands.run("note.setContent", { value: "# A\n\nLeaving.\n" });
    await t.app.commands.run("note.open");
    await settle();
    expect(t.calls).toEqual(["write /n/a.md", "sync switch"]);
    expect(t.app.store.state.note.path).toBe("/n/b.md");
  });

  it("shows the save state: saved here at once, then not backed up yet, backing up, and backed up (D-132)", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    expect(t.save()).toMatchObject({ visible: true, state: "synced", label: "Backed up", text: "" });
    await t.app.commands.run("note.setContent", { value: "# A\n\nTyping.\n" });
    expect(t.save()).toMatchObject({ state: "savedLocal", label: "Saved on this computer" });
    await t.app.flush();
    t.report({ git: true, state: "idle", waiting: 1 });
    expect(t.save()).toMatchObject({ state: "pending", label: "Saved here · not backed up yet" });
    // A background sync with something to send shows; a fetch with nothing waiting doesn't.
    t.report({ git: true, state: "syncing", waiting: 1 });
    expect(t.save().state).toBe("syncing");
    t.report({ git: true, state: "idle", waiting: 0 });
    expect(t.save()).toMatchObject({ state: "synced", label: "Backed up · just now" });
    t.report({ git: true, state: "syncing", waiting: 0 });
    expect(t.save().state).toBe("synced");
  });

  it("Save to cloud opens the label, says it's done once, and offline shows as offline (D-132)", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    await t.app.commands.run("note.setContent", { value: "# A\n\nAsked.\n" });
    const n = t.app.store.state.announcement.n;
    await t.app.commands.run("sync.now");
    expect(t.calls).toEqual(["write /n/a.md", "sync save"]);
    expect(t.save()).toMatchObject({ text: "Backed up" });
    expect(t.app.store.state.announcement).toMatchObject({ text: "Backed up", n: n + 1 });
    t.report({ git: true, state: "problem", problem: "offline", waiting: 1 });
    expect(t.save()).toMatchObject({ state: "offline", label: "Offline" });
    t.report({ git: true, state: "problem", problem: "failed", waiting: 1 });
    expect(t.save().state).toBe("error");
  });

  it("without Git, saving stays local and shows no Git UI", async () => {
    const t = setup(false);
    await t.app.start();
    await t.app.commands.run("note.setContent", { value: "# A\n\nLocal.\n" });
    await t.app.commands.run("note.save");
    expect(t.calls).toEqual(["write /n/a.md"]);
    expect(t.app.store.state.sync).toEqual({ git: false });
    expect(t.toasts()).toEqual([]);
  });
});
