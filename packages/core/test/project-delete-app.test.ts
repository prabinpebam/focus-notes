/**
 * Deleting a project (PRJ-23, SC-PROJ-08 → UC-PROJ-13, DD-PROJ-09 to 17) against a fake shell: nothing is
 * ever deleted. The consequences, the notes not on GitHub, the name typed exactly, GitHub's own page for
 * a linked project with the person confirming once GitHub no longer shows it, then the Recycle Bin; an
 * offline project goes straight to the Recycle Bin; a locked file says exactly what's left.
 */
import { describe, expect, it } from "vitest";
import {
  createApp, type AccountStatus, type DeletionCheck, type DeletionRecord, type DeletionResult, type FirstRunBridge, type PlatformBridge, type RepoStatus,
} from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const settle = () => new Promise((r) => setTimeout(r, 0));
const LINKED: DeletionCheck = {
  kind: "linked", name: "Field notes", folder: "/home/ada/Documents/Field notes", repo: "ada/field-notes", privateRepo: "ada/field-notes-private",
  privateCount: 3, siteNotes: 12, unsynced: [],
};

function shell(opts: { check?: DeletionCheck; status?: RepoStatus[]; result?: DeletionResult[]; account?: AccountStatus; record?: DeletionRecord | null } = {}) {
  const calls: string[] = [];
  /** The resumable record, when the shell has the port: what was last saved, or null once cleared. */
  const saved: { current: DeletionRecord | null | undefined; history: DeletionRecord[] } = { current: opts.record, history: [] };
  const statuses = [...(opts.status ?? [{ state: "exists", owner: "ada", admin: true, organization: false }])];
  const results = [...(opts.result ?? [{ state: "deleted" }])];
  const fr = {
    account: async () => opts.account ?? { account: { login: "ada", id: 1, name: "Ada" }, gcm: true, gh: false, via: "gcm" },
    onSignIn: () => () => {},
  } as unknown as FirstRunBridge;
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# A\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/n/a.md" }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    firstRun: fr,
    sync: { now: async () => ({ git: true, state: "idle", waiting: 0 }), status: async () => ({ git: true, state: "idle", waiting: 0 }), onStatus: () => () => {} },
    workspace: {
      info: async () => ({ folder: LINKED.folder, repo: LINKED.repo }),
      scan: async () => ({ folder: LINKED.folder, roots: [{ id: "local", path: "/n", readOnly: false }], entries: [] }),
      writeFormat: async () => {},
      renameNote: async () => {},
      deletion: async () => (calls.push("deletion"), opts.check ?? LINKED),
      repoStatus: async (repo) => (calls.push(`status:${repo}`), statuses.length > 1 ? statuses.shift()! : statuses[0]!),
      openRepoSettings: async (repo) => void calls.push(`open:${repo}`),
      exportUnsynced: async () => (calls.push("export"), "/home/ada/Documents/Field notes (not on GitHub)"),
      deleteLocal: async (o) => (calls.push(`deleteLocal:keepPrivate=${o.keepPrivate}`), results.length > 1 ? results.shift()! : results[0]!),
      reveal: async () => void calls.push("reveal"),
      ...(opts.record !== undefined ? {
        deletionRecord: {
          load: async () => saved.current ?? undefined,
          save: async (r: DeletionRecord) => { saved.current = r; saved.history.push(r); },
          clear: async () => { saved.current = null; },
        },
      } : {}),
    },
  };
  const app = createApp(bridge, en);
  const vm = () => app.viewModels.select("vm.projectDelete", app.store.state) as Record<string, any>;
  const runVm = () => app.viewModels.select("vm.projectDeleteRun", app.store.state) as Record<string, any>;
  const run = async (id: string, args?: Record<string, unknown>) => { await app.commands.run(id, args); await settle(); };
  const toast = () => app.store.state.ui.toasts.at(-1)?.message;
  return { app, vm, runVm, run, calls, toast, saved };
}

async function started(opts?: Parameters<typeof shell>[0]) {
  const t = shell(opts);
  await t.app.start();
  await settle();
  await t.run("project.delete");
  return t;
}

describe("PRJ-23: deleting a linked project", () => {
  it("shows the consequences, asks for the name exactly, then GitHub's own page, and only then the Recycle Bin", async () => {
    const t = await started();
    expect(t.vm()).toMatchObject({ open: true, step: "consequences", kind: "linked", problem: "", repo: "ada/field-notes", siteNotes: 12, privateCount: 3 });
    expect(t.calls).not.toContain("open:ada/field-notes");
    await t.run("project.deleteContinue");
    expect(t.vm().step).toBe("confirm");
    await t.run("project.deleteType", { value: "field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm().step).toBe("confirm");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm()).toMatchObject({ step: "github", repos: [{ id: "ada/field-notes", canOpen: true, ask: false }] });
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes" });
    expect(t.calls).toContain("open:ada/field-notes");
    expect(t.vm().repos[0]).toMatchObject({ waiting: true });
    // Confirming before GitHub no longer shows it does nothing (DD-PROJ-13).
    await t.run("project.deleteConfirmGitHub", { id: "ada/field-notes" });
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    t.calls.length = 0;
    await t.run("project.deletePoll");
    expect(t.calls).toEqual(["status:ada/field-notes"]);
    expect(t.vm().repos[0]).toMatchObject({ waiting: true });
    // Gone on GitHub: the person confirms, then the folder goes to the Recycle Bin, keeping the private notes.
    const t2 = await started({ status: [{ state: "exists", owner: "ada", admin: true, organization: false }, { state: "gone" }] });
    await t2.run("project.deleteContinue");
    await t2.run("project.deleteType", { value: "Field notes" });
    await t2.run("project.deleteConfirm");
    await t2.run("project.deleteOpenGitHub", { id: "ada/field-notes" });
    await t2.run("project.deletePoll");
    expect(t2.vm().repos[0]).toMatchObject({ ask: true });
    expect(t2.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    await t2.run("project.deleteConfirmGitHub", { id: "ada/field-notes" });
    expect(t2.calls).toContain("deleteLocal:keepPrivate=true");
    expect(t2.vm().open).toBe(false);
    expect(t2.toast()).toContain("Field notes");
  });
  it("deletes the private repository too only when the switch is on", async () => {
    const t = await started({ status: [{ state: "exists", owner: "ada", admin: true, organization: false }, { state: "gone" }] });
    await t.run("project.deletePrivate", { value: true });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm().repos.map((r: { id: string }) => r.id)).toEqual(["ada/field-notes", "ada/field-notes-private"]);
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes" });
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes-private" });
    await t.run("project.deletePoll");
    await t.run("project.deleteConfirmGitHub", { id: "ada/field-notes" });
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    await t.run("project.deleteConfirmGitHub", { id: "ada/field-notes-private" });
    expect(t.calls).toContain("deleteLocal:keepPrivate=false");
  });
  it("offers to copy the notes not on GitHub first, and keeps the step open if the copy fails", async () => {
    const t = await started({ check: { ...LINKED, unsynced: ["Trips/Iceland.md", "Ideas.md"] } });
    await t.run("project.deleteContinue");
    expect(t.vm()).toMatchObject({ step: "unsynced", unsyncedCount: 2, unsynced: [{ label: "Iceland", description: "Trips" }, { label: "Ideas", description: "" }] });
    await t.run("project.deleteExport");
    expect(t.vm()).toMatchObject({ exported: true, exportPath: "/home/ada/Documents/Field notes (not on GitHub)" });
    await t.run("project.deleteContinue");
    expect(t.vm().step).toBe("confirm");
    await t.run("project.deleteBack");
    expect(t.vm().step).toBe("unsynced");
  });
  it("closing while waiting on GitHub stops, and changes nothing on this computer", async () => {
    const t = await started();
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    await t.run("project.deleteCancel");
    expect(t.vm()).toMatchObject({ open: true, step: "stopped" });
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
  });
});

describe("PRJ-23: what stops a deletion, and its recovery (DD-PROJ-17)", () => {
  it("not an admin: names the owner and offers Remove from this computer instead", async () => {
    const t = await started({ status: [{ state: "exists", owner: "grace", admin: false, organization: false }] });
    expect(t.vm()).toMatchObject({ problem: "notAdmin", otherOwner: "@grace" });
    await t.run("project.deleteContinue");
    expect(t.vm().step).toBe("consequences");
  });
  it("an organization's repository says its policy may block it", async () => {
    const t = await started({ status: [{ state: "exists", owner: "lab", admin: true, organization: true }] });
    expect(t.vm()).toMatchObject({ problem: "", org: "lab" });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm()).toMatchObject({ step: "github", problem: "policy" });
  });
  it("offline, signed out, already gone and a rate limit are each named", async () => {
    expect((await started({ status: [{ state: "offline" }] })).vm().problem).toBe("offline");
    // Already unavailable: never deleted by itself; the person goes on and confirms it, then the folder goes.
    const gone = await started({ status: [{ state: "gone" }] });
    expect(gone.vm().problem).toBe("gone");
    await gone.run("project.deleteContinue");
    await gone.run("project.deleteType", { value: "Field notes" });
    await gone.run("project.deleteConfirm");
    expect(gone.vm()).toMatchObject({ step: "github", problem: "", repos: [{ id: "ada/field-notes", ask: true }] });
    expect(gone.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    await gone.run("project.deleteConfirmGitHub", { id: "ada/field-notes" });
    expect(gone.calls).toContain("deleteLocal:keepPrivate=true");
    expect((await started({ account: { gcm: true, gh: false } })).vm().problem).toBe("signin");
    const t = await started({ status: [{ state: "exists", owner: "ada", admin: true, organization: false }, { state: "rateLimit", retryAt: Date.now() + 60_000 }] });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes" });
    await t.run("project.deletePoll");
    expect(t.vm()).toMatchObject({ problem: "rateLimit" });
    expect(t.vm().retryAt).not.toBe("");
    await t.run("project.deleteStop");
  });
  it("a locked file: deleted on GitHub, still on this computer, with Retry", async () => {
    const t = await started({ check: { ...LINKED, kind: "offline", repo: "", privateRepo: "" }, result: [{ state: "locked", file: "Trips/Iceland.md" }, { state: "deleted" }] });
    expect(t.vm()).toMatchObject({ kind: "offline", problem: "" });
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm()).toMatchObject({ open: true, step: "progress", problem: "partialLocal", lockedFile: "Trips/Iceland.md", busy: false });
    await t.run("project.deleteShowFolder");
    expect(t.calls).toContain("reveal");
    await t.run("project.deleteRetry");
    expect(t.vm().open).toBe(false);
    expect(t.calls.filter((c) => c === "deleteLocal:keepPrivate=false")).toHaveLength(2);
  });
  it("the folder that isn't a project is refused before anything shows", async () => {
    const t = await started({ check: { ...LINKED, problem: "notProject" } });
    expect(t.vm().open).toBe(false);
    expect(t.toast()).toBeTruthy();
  });
});

const states = (steps: { id: string; state: string }[]) => Object.fromEntries(steps.map((s) => [s.id, s.state]));
const GONE_AFTER_OPEN: RepoStatus[] = [{ state: "exists", owner: "ada", admin: true, organization: false }, { state: "gone" }];

describe("PRJ-23: the run's steps and a delete left unfinished (DD-PROJ-14, state only)", () => {
  it("lists each step with its state as the delete goes on", async () => {
    const t = await started({ status: GONE_AFTER_OPEN, record: null });
    expect(states(t.runVm().steps)).toEqual({ check: "done", "repo:ada/field-notes": "waiting", "repo:ada/field-notes-private": "skipped", local: "waiting", recent: "waiting" });
    await t.run("project.deletePrivate", { value: true });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes" });
    expect(states(t.runVm().steps)).toMatchObject({ "repo:ada/field-notes": "working", "repo:ada/field-notes-private": "waiting" });
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes-private" });
    await t.run("project.deletePoll");
    await t.run("project.deleteConfirmGitHub", { id: "ada/field-notes" });
    expect(states(t.runVm().steps)).toMatchObject({ "repo:ada/field-notes": "done", "repo:ada/field-notes-private": "working" });
    await t.run("project.deleteStop");
    expect(states(t.runVm().steps)).toMatchObject({ "repo:ada/field-notes": "done", "repo:ada/field-notes-private": "paused" });
  });
  it("shows a step that fails, and an offline project skips GitHub", async () => {
    expect(states((await started({ status: [{ state: "offline" }] })).runVm().steps)).toMatchObject({ check: "failed" });
    const off = await started({ check: { ...LINKED, kind: "offline", repo: "", privateRepo: "" }, result: [{ state: "locked", file: "Trips/Iceland.md" }] });
    expect(states(off.runVm().steps)).toMatchObject({ check: "skipped", repo: "skipped", local: "waiting" });
    await off.run("project.deleteType", { value: "Field notes" });
    await off.run("project.deleteConfirm");
    expect(states(off.runVm().steps)).toMatchObject({ local: "failed", recent: "waiting" });
  });
  it("records nothing until something is gone, then each deletion, and clears it when finished", async () => {
    const t = await started({ status: GONE_AFTER_OPEN, record: null });
    await t.run("project.deletePrivate", { value: true });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes" });
    await t.run("project.deleteOpenGitHub", { id: "ada/field-notes-private" });
    await t.run("project.deletePoll");
    expect(t.saved.history).toHaveLength(0);
    await t.run("project.deleteConfirmGitHub", { id: "ada/field-notes" });
    expect(t.saved.current).toEqual({
      version: 1, name: "Field notes", folder: LINKED.folder, kind: "linked",
      repos: [{ id: "ada/field-notes", deleted: true }, { id: "ada/field-notes-private", deleted: false }], keepPrivate: false, local: false,
    });
    await t.run("project.deleteConfirmGitHub", { id: "ada/field-notes-private" });
    expect(t.saved.history.at(-1)).toMatchObject({ local: true, repos: [{ deleted: true }, { deleted: true }] });
    expect(t.saved.current).toBeNull();
    expect(t.runVm()).toMatchObject({ resume: false, done: true, doneName: "Field notes", doneRepos: [{ id: "ada/field-notes" }, { id: "ada/field-notes-private" }] });
    expect(states(t.runVm().steps)).toEqual({});
  });
  it("a locked folder keeps the record; Close leaves it to finish later", async () => {
    const t = await started({ check: { ...LINKED, kind: "offline", repo: "", privateRepo: "" }, result: [{ state: "locked", file: "Trips/Iceland.md" }], record: null });
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.saved.current).toMatchObject({ kind: "offline", local: true, repos: [] });
  });
  it("on the next start, offers to finish, and never opens or asks about a repository already deleted", async () => {
    const record: DeletionRecord = {
      version: 1, name: "Field notes", folder: LINKED.folder, kind: "linked",
      repos: [{ id: "ada/field-notes", deleted: true }, { id: "ada/field-notes-private", deleted: false }], keepPrivate: false, local: false,
    };
    const t = shell({ record, status: [{ state: "gone" }, { state: "exists", owner: "ada", admin: true, organization: false }] });
    await t.app.start();
    await settle();
    expect(t.runVm()).toMatchObject({ resume: true, resumeName: "Field notes" });
    expect(states(t.runVm().resumeSteps)).toEqual({ check: "done", "repo:ada/field-notes": "done", "repo:ada/field-notes-private": "waiting", local: "waiting", recent: "waiting" });
    expect(t.calls.some((c) => c.startsWith("open:") || c.startsWith("deleteLocal"))).toBe(false);
    await t.run("project.deleteResume");
    expect(t.vm()).toMatchObject({ open: true, step: "github", private: true, typed: "Field notes" });
    expect(t.vm().repos).toMatchObject([{ id: "ada/field-notes", canOpen: false, ask: false }, { id: "ada/field-notes-private", canOpen: true }]);
    await t.run("project.deleteOpenGitHub");
    expect(t.calls).toContain("open:ada/field-notes-private");
    expect(t.calls).not.toContain("open:ada/field-notes");
  });
  it("finishes straight away when every repository is already deleted, and Keep the folder only forgets", async () => {
    const record: DeletionRecord = { version: 1, name: "Field notes", folder: LINKED.folder, kind: "linked", repos: [{ id: "ada/field-notes", deleted: true }], keepPrivate: true, local: true };
    const t = shell({ record, status: [{ state: "gone" }] });
    await t.app.start();
    await settle();
    await t.run("project.deleteResume");
    expect(t.calls).toContain("deleteLocal:keepPrivate=true");
    expect(t.calls.some((c) => c.startsWith("open:"))).toBe(false);
    expect(t.saved.current).toBeNull();
    expect(t.vm().open).toBe(false);
    const k = shell({ record });
    await k.app.start();
    await settle();
    await k.run("project.deleteForget");
    expect(k.saved.current).toBeNull();
    expect(k.runVm().resume).toBe(false);
    expect(k.calls.some((c) => c.startsWith("deleteLocal") || c.startsWith("open:"))).toBe(false);
  });
  it("a record for another folder is left alone", async () => {
    const record: DeletionRecord = { version: 1, name: "Trips", folder: "/home/ada/Documents/Trips", kind: "offline", repos: [], keepPrivate: false, local: true };
    const t = shell({ record });
    await t.app.start();
    await settle();
    await t.run("project.deleteResume");
    expect(t.vm().open).toBe(false);
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    expect(t.saved.current).toEqual(record);
  });
});
