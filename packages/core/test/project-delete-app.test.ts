/**
 * Deleting a project (PRJ-23, D-413, SC-PROJ-08 → UC-PROJ-13, DD-PROJ-09 to 17) against a fake shell:
 * nothing is ever deleted. Consequences, unsynced copy, exact name typed, then GitHub web-delete
 * instructions with automatic polling + focus detection (authenticated 404 + valid session -> gone;
 * 401/403/429/5xx/offline -> never deleted), automatic local cleanup when all repos are gone, and
 * the completion state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createApp, type AccountStatus, type DeletionCheck, type DeletionRecord, type DeletionResult, type FirstRunBridge, type PlatformBridge, type RepoStatus,
} from "../src/index.ts";
import { DELETE_POLL_MS } from "../src/project-delete-app.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const settle = () => new Promise((r) => setTimeout(r, 0));
const LINKED: DeletionCheck = {
  kind: "linked", name: "Field notes", folder: "/home/ada/Documents/Field notes", repo: "ada/field-notes", privateRepo: "ada/field-notes-private",
  privateCount: 3, siteNotes: 12, unsynced: [],
};

function spyTimers() {
  let nextId = 1;
  const scheduled = new Map<number, { fn: () => void; ms: number }>();
  const delays: number[] = [];
  const origSet = globalThis.setTimeout;
  const origClear = globalThis.clearTimeout;
  const setSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: (...a: unknown[]) => void, ms?: number) => {
    if (!ms || ms < 1000) return origSet(fn, ms);
    const id = nextId++;
    scheduled.set(id, { fn: () => fn(), ms });
    delays.push(ms);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((h?: ReturnType<typeof setTimeout>) => {
    if (typeof h === "number" && scheduled.has(h)) { scheduled.delete(h); return; }
    origClear(h);
  }) as typeof clearTimeout);
  return {
    delays,
    pendingCount: () => scheduled.size,
    fireNext: async () => {
      const first = scheduled.entries().next().value as [number, { fn: () => void; ms: number }] | undefined;
      if (!first) return false;
      scheduled.delete(first[0]);
      first[1].fn();
      await settle();
      return true;
    },
    restore: () => { setSpy.mockRestore(); clearSpy.mockRestore(); },
  };
}

let activeClock: ReturnType<typeof spyTimers> | undefined;
afterEach(() => { activeClock?.restore(); activeClock = undefined; });

function shell(opts: {
  check?: DeletionCheck;
  status?: RepoStatus[] | ((repo: string) => RepoStatus | Promise<RepoStatus>);
  result?: DeletionResult[];
  account?: AccountStatus;
  accountReady?: Promise<void>;
  record?: DeletionRecord | null;
  useFakeTimers?: boolean;
} = {}) {
  const calls: string[] = [];
  const saved: { current: DeletionRecord | null | undefined; history: DeletionRecord[] } = { current: opts.record, history: [] };
  const statusList = Array.isArray(opts.status) ? [...opts.status] : [{ state: "exists" as const, owner: "ada", admin: true, organization: false }];
  const statusFn = typeof opts.status === "function" ? opts.status : () => (statusList.length > 1 ? statusList.shift()! : statusList[0]!);
  const results = [...(opts.result ?? [{ state: "deleted" }])];
  const clock = opts.useFakeTimers ? (activeClock?.restore(), activeClock = spyTimers()) : undefined;
  const fr = {
    account: async () => (await opts.accountReady, opts.account ?? { account: { login: "ada", id: 1, name: "Ada" }, gcm: true, gh: false, via: "gcm" }),
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
      repoStatus: async (repo) => (calls.push(`status:${repo}`), await statusFn(repo)),
      openRepoSettings: async (repo) => void calls.push(`open:${repo}`),
      cancelDelete: async () => void calls.push("cancel"),
      exportUnsynced: async () => (calls.push("export"), "/home/ada/Documents/Field notes (not on GitHub)"),
      deleteLocal: async (o) => {
        calls.push(`deleteLocal:keepPrivate=${o.keepPrivate}`);
        return results.length > 1 ? results.shift()! : results[0]!;
      },
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
  return { app, bridge, vm, runVm, run, calls, toast, saved, clock };
}

async function started(opts?: Parameters<typeof shell>[0]) {
  const t = shell(opts);
  await t.app.start();
  await settle();
  await t.run("project.delete");
  return t;
}

describe("PRJ-23, D-413: deleting a linked project on GitHub web with automatic detection", () => {
  it("opens GitHub settings, polls until 404+valid session (gone), auto-advances to local cleanup and completion state", async () => {
    const t = await started({
      useFakeTimers: true,
      status: [
        { state: "exists", owner: "ada", admin: true, organization: false },
        { state: "exists", owner: "ada", admin: true, organization: false },
        { state: "gone" },
      ],
    });
    expect(t.vm()).toMatchObject({ open: true, step: "consequences", kind: "linked", problem: "", repo: "ada/field-notes", siteNotes: 12, privateCount: 3 });
    expect(t.calls).not.toContain("open:ada/field-notes");
    await t.run("project.deleteContinue");
    expect(t.vm().step).toBe("confirm");
    await t.run("project.deleteType", { value: "field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm().step).toBe("confirm");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm()).toMatchObject({ step: "github", repos: [{ id: "ada/field-notes", canOpen: false, waiting: true, deleted: false }] });
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);

    await t.run("project.deleteOpenGitHub");
    expect(t.calls).toContain("open:ada/field-notes");
    // First poll: still exists, backs off and keeps waiting.
    await t.clock!.fireNext();
    expect(t.vm().step).toBe("github");
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    // Second poll: gone -> automatically runs deleteLocal (keeping private notes) and shows done step.
    await t.clock!.fireNext();
    expect(t.calls).toContain("deleteLocal:keepPrivate=true");
    expect(t.vm()).toMatchObject({ open: true, step: "done", busy: false });
    expect(t.clock!.pendingCount()).toBe(0);

    await t.run("project.deleteFinish");
    expect(t.vm().open).toBe(false);
    expect(t.toast()).toContain("Field notes");
  });

  it("401 (signin), 403/5xx (error), 429 (rateLimit) and offline are never treated as deleted and keep waiting honestly", async () => {
    for (const [status, expectedProblem] of [
      [{ state: "signin" } as RepoStatus, "signin"],
      [{ state: "error" } as RepoStatus, "error"],
      [{ state: "offline" } as RepoStatus, "offline"],
      [{ state: "rateLimit", retryAt: Date.now() + 45_000 } as RepoStatus, "rateLimit"],
    ] as const) {
      const t = await started({
        useFakeTimers: true,
        status: [{ state: "exists", owner: "ada", admin: true, organization: false }, status],
      });
      await t.run("project.deleteContinue");
      await t.run("project.deleteType", { value: "Field notes" });
      await t.run("project.deleteConfirm");
      await t.run("project.deleteRetry");
      expect(t.vm()).toMatchObject({ open: true, step: "github", problem: expectedProblem });
      expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
      if (status.state === "rateLimit") {
        expect(t.clock!.delays.at(-1)).toBeGreaterThanOrEqual(40_000);
      }
      await t.run("project.deleteCancel");
    }
  });

  it("backs off on unchanged polls, resets on window focus and manual Check again, and stops immediately on close", async () => {
    const t = await started({
      useFakeTimers: true,
      status: [{ state: "exists", owner: "ada", admin: true, organization: false }],
    });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.clock!.delays.at(-1)).toBe(DELETE_POLL_MS);
    await t.clock!.fireNext();
    const afterFirst = t.clock!.delays.at(-1)!;
    await t.clock!.fireNext();
    const afterSecond = t.clock!.delays.at(-1)!;
    expect(afterSecond).toBeGreaterThan(afterFirst);

    // Window focus triggers an immediate check and resets backoff.
    const beforeFocus = t.calls.filter((c) => c === "status:ada/field-notes").length;
    await t.run("project.deleteFocus");
    expect(t.calls.filter((c) => c === "status:ada/field-notes").length).toBe(beforeFocus + 1);
    expect(t.clock!.delays.at(-1)).toBe(DELETE_POLL_MS);

    // Closing stops polling cleanly.
    await t.run("project.deleteCancel");
    expect(t.vm().open).toBe(false);
    expect(t.clock!.pendingCount()).toBe(0);
    expect(t.calls).toContain("cancel");
  });

  it("requires both the notes repo and paired public site repo to be confirmed gone before local cleanup", async () => {
    const gone = new Set<string>();
    const t = await started({
      useFakeTimers: true,
      check: { ...LINKED, siteRepo: "ada/field-notes-site", privateRepo: "" },
      status: (repo) => (gone.has(repo) ? { state: "gone" } : { state: "exists", owner: "ada", admin: true, organization: false }),
    });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm().siteRepo).toBe("ada/field-notes-site");
    expect(t.vm().repos.map((r: { id: string }) => r.id)).toEqual(["ada/field-notes", "ada/field-notes-site"]);

    // Only main repo deleted so far -> stays on github step, no deleteLocal.
    gone.add("ada/field-notes");
    await t.run("project.deleteRetry");
    expect(t.vm().step).toBe("github");
    expect(t.vm().repos).toMatchObject([
      { id: "ada/field-notes", deleted: true, canOpen: false },
      { id: "ada/field-notes-site", deleted: false, canOpen: true },
    ]);
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);

    // Primary Open GitHub settings now targets the remaining paired site repo.
    await t.run("project.deleteOpenGitHub");
    expect(t.calls).toContain("open:ada/field-notes-site");

    // Once paired site repo is also gone -> auto-advances and finishes locally.
    gone.add("ada/field-notes-site");
    await t.run("project.deleteFocus");
    expect(t.calls).toContain("deleteLocal:keepPrivate=false");
    expect(t.vm()).toMatchObject({ open: true, step: "done" });
  });

  it("deletes the private repository too only when the switch is on", async () => {
    const gone = new Set<string>();
    const t = await started({
      useFakeTimers: true,
      status: (repo) => (gone.has(repo) ? { state: "gone" } : { state: "exists", owner: "ada", admin: true, organization: false }),
    });
    await t.run("project.deletePrivate", { value: true });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm().repos.map((r: { id: string }) => r.id)).toEqual(["ada/field-notes", "ada/field-notes-private"]);
    gone.add("ada/field-notes");
    await t.run("project.deleteRetry");
    expect(t.calls.some((c) => c.startsWith("deleteLocal"))).toBe(false);
    gone.add("ada/field-notes-private");
    await t.run("project.deleteRetry");
    expect(t.calls).toContain("deleteLocal:keepPrivate=false");
  });

  it("warns about notes not on GitHub with optional Save a copy, and lets you proceed without saving", async () => {
    const t = await started({ check: { ...LINKED, unsynced: ["Trips/Iceland.md", "Ideas.md"] } });
    await t.run("project.deleteContinue");
    expect(t.vm()).toMatchObject({ step: "unsynced", exported: false, unsyncedCount: 2, unsynced: [{ label: "Iceland", description: "Trips" }, { label: "Ideas", description: "" }] });
    // Proceeding without saving is enabled immediately (D-413).
    await t.run("project.deleteContinue");
    expect(t.vm().step).toBe("confirm");
    await t.run("project.deleteBack");
    expect(t.vm().step).toBe("unsynced");
    // Optional Save a copy still works too.
    await t.run("project.deleteExport");
    expect(t.vm()).toMatchObject({ exported: true, exportPath: "/home/ada/Documents/Field notes (not on GitHub)" });
    await t.run("project.deleteContinue");
    expect(t.vm().step).toBe("confirm");
  });

  it("Back from the GitHub step stops polling and returns to confirm when nothing is deleted yet", async () => {
    const t = await started({ useFakeTimers: true });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm().step).toBe("github");
    expect(t.clock!.pendingCount()).toBe(1);
    await t.run("project.deleteBack");
    expect(t.vm().step).toBe("confirm");
    expect(t.clock!.pendingCount()).toBe(0);
  });

  it("closing while waiting on GitHub after a partial deletion stops and changes nothing on this computer", async () => {
    const gone = new Set<string>();
    const t = await started({
      useFakeTimers: true,
      check: { ...LINKED, siteRepo: "ada/field-notes-site", privateRepo: "" },
      status: (repo) => (gone.has(repo) ? { state: "gone" } : { state: "exists", owner: "ada", admin: true, organization: false }),
    });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    gone.add("ada/field-notes");
    await t.run("project.deleteRetry");
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
    const t = await started({ useFakeTimers: true, status: [{ state: "exists", owner: "lab", admin: true, organization: true }] });
    expect(t.vm()).toMatchObject({ problem: "", org: "lab" });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm()).toMatchObject({ step: "github", problem: "policy" });
  });
  it("offline, signed out and already gone are handled cleanly", async () => {
    expect((await started({ status: [{ state: "offline" }] })).vm().problem).toBe("offline");
    const gone = await started({ useFakeTimers: true, status: [{ state: "gone" }] });
    expect(gone.vm().problem).toBe("gone");
    await gone.run("project.deleteContinue");
    await gone.run("project.deleteType", { value: "Field notes" });
    await gone.run("project.deleteConfirm");
    expect(gone.vm()).toMatchObject({ step: "github", problem: "" });
    // Fresh check confirms gone and finishes locally.
    await gone.run("project.deleteRetry");
    expect(gone.calls).toContain("deleteLocal:keepPrivate=true");
    expect((await started({ account: { gcm: true, gh: false } })).vm().problem).toBe("signin");
  });
  it("a local refusal says so, never that a file is open in another app", async () => {
    const t = await started({ check: { ...LINKED, kind: "offline", repo: "", privateRepo: "" }, result: [{ state: "refused" }] });
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.vm()).toMatchObject({ step: "progress", problem: "partialLocal", busy: false });
    expect(t.vm().localError).toBe(en["project.delete.problem.localRefused"]);
    expect(t.vm().localError).not.toContain("open in another app");
  });
  it("opened before the account check answers, a signed-in person is never told to sign in", async () => {
    let ready!: () => void;
    const t = shell({ accountReady: new Promise<void>((r) => { ready = r; }) });
    await t.app.start();
    await settle();
    expect(t.app.store.state.account.login ?? "").toBe("");
    const opening = t.run("project.delete");
    await settle();
    ready();
    await opening;
    await settle();
    expect(t.vm()).toMatchObject({ open: true, step: "consequences", problem: "" });
    expect(t.calls).toContain("status:ada/field-notes");
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
  it("names unsafe private history without claiming a file lock", async () => {
    const t = await started({ useFakeTimers: true, status: [{ state: "exists", owner: "ada", admin: true, organization: false }, { state: "gone" }], result: [{ state: "failed", reason: "privateHistory" }, { state: "deleted" }] });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    await t.run("project.deleteRetry");
    expect(t.vm()).toMatchObject({ open: true, step: "progress", problem: "partialLocal", busy: false });
    expect(t.vm().localError).toContain("private Git history could not be kept safely");
    expect(t.vm().localError).not.toContain("open in another app");
    await t.run("project.deleteRetry");
    expect(t.vm()).toMatchObject({ step: "done" });
  });
});

const states = (steps: { id: string; state: string }[]) => Object.fromEntries(steps.map((s) => [s.id, s.state]));

describe("PRJ-23: the run's steps and a delete left unfinished (DD-PROJ-14)", () => {
  it("records nothing until a repository is confirmed gone, then each deletion, and clears it when finished", async () => {
    const gone = new Set<string>();
    const t = await started({
      useFakeTimers: true,
      record: null,
      status: (repo) => (gone.has(repo) ? { state: "gone" } : { state: "exists", owner: "ada", admin: true, organization: false }),
    });
    await t.run("project.deletePrivate", { value: true });
    await t.run("project.deleteContinue");
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.saved.history).toHaveLength(0);

    gone.add("ada/field-notes");
    await t.run("project.deleteRetry");
    expect(t.saved.current).toEqual({
      version: 1, name: "Field notes", folder: LINKED.folder, kind: "linked",
      repos: [{ id: "ada/field-notes", deleted: true }, { id: "ada/field-notes-private", deleted: false }], keepPrivate: false, local: false,
    });
    gone.add("ada/field-notes-private");
    await t.run("project.deleteRetry");
    expect(t.saved.history.at(-1)).toMatchObject({ local: true, repos: [{ deleted: true }, { deleted: true }] });
    expect(t.saved.current).toBeNull();
    expect(t.runVm()).toMatchObject({ resume: false, done: true, doneName: "Field notes", doneRepos: [{ id: "ada/field-notes" }, { id: "ada/field-notes-private" }] });
  });
  it("a locked folder keeps the record; Close leaves it to finish later", async () => {
    const t = await started({ check: { ...LINKED, kind: "offline", repo: "", privateRepo: "" }, result: [{ state: "locked", file: "Trips/Iceland.md" }], record: null });
    await t.run("project.deleteType", { value: "Field notes" });
    await t.run("project.deleteConfirm");
    expect(t.saved.current).toMatchObject({ kind: "offline", local: true, repos: [] });
  });
  it("on the next start, offers to finish, and never opens a repository already deleted", async () => {
    const record: DeletionRecord = {
      version: 1, name: "Field notes", folder: LINKED.folder, kind: "linked",
      repos: [{ id: "ada/field-notes", deleted: true }, { id: "ada/field-notes-private", deleted: false }], keepPrivate: false, local: false,
    };
    const t = shell({ useFakeTimers: true, record, status: [{ state: "gone" }, { state: "exists", owner: "ada", admin: true, organization: false }] });
    await t.app.start();
    await settle();
    expect(t.runVm()).toMatchObject({ resume: true, resumeName: "Field notes" });
    expect(states(t.runVm().resumeSteps)).toEqual({ check: "done", "repo:ada/field-notes": "done", "repo:ada/field-notes-private": "waiting", local: "waiting", recent: "waiting" });
    expect(t.calls.some((c) => c.startsWith("open:") || c.startsWith("deleteLocal"))).toBe(false);
    await t.run("project.deleteResume");
    expect(t.vm()).toMatchObject({ open: true, step: "github", private: true, typed: "Field notes" });
    expect(t.vm().repos).toMatchObject([{ id: "ada/field-notes", canOpen: false, deleted: true }, { id: "ada/field-notes-private", canOpen: true, deleted: false }]);
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
    expect(t.vm()).toMatchObject({ open: true, step: "done" });
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
