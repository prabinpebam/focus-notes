/**
 * Deleting a project (PRJ-23, D-413, SC-PROJ-08 → UC-PROJ-13, DD-PROJ-09 to 17): one named project
 * at a time. The consequences come first, then any notes not on GitHub yet. An offline project asks for
 * its name typed exactly; a GitHub-linked one has no typed name here, since GitHub asks for it when the
 * person deletes the repository there. Focus Notes opens the repository's Settings page on
 * GitHub with short step-by-step instructions and checks on window focus and via lightweight
 * polling (using the existing signed-in GitHub session) until each repository is confirmed gone
 * (authenticated GET /repos/{owner}/{repo} 404 AND GET /user 200 in the same check). When all
 * relevant repositories are confirmed gone, local cleanup runs automatically and moves the folder
 * and its history to the Recycle Bin (`bridge.workspace.deleteLocal`).
 */
import type { App } from "./app.ts";
import type { DeletionCheck, DeletionRecord, PlatformBridge, RepoStatus } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";

export type DeleteStep = "consequences" | "unsynced" | "github" | "progress" | "done" | "stopped";
export type DeleteProblem = "" | "offline" | "signin" | "notAdmin" | "policy" | "rateLimit" | "window" | "gone" | "error" | "partialLocal";
/** One repository on GitHub's side: waiting for deletion on GitHub, or confirmed deleted. */
type RepoPhase = "waiting" | "deleted";
/** A step of the run, as the progress list shows it. */
export type RunState = "waiting" | "working" | "done" | "paused" | "failed" | "skipped";
export interface RunStep { id: string; kind: "check" | "repo" | "local" | "recent"; target: string; state: RunState }

/** Initial polling interval while waiting for deletion on GitHub (5 s, with backoff up to 30 s). */
export const DELETE_POLL_MS = 5000;
export const DELETE_POLL_MAX_MS = 30_000;

interface Ctx {
  store: App["store"];
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: App["commands"];
  viewModels: App["viewModels"];
  tracker?: TaskTracker;
  /** Writes pending edits. False if the note couldn't be saved. */
  flush: () => Promise<boolean>;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => unknown;
  /** The project is gone: the window drops the note and shows Open (DD-PROJ-15). */
  deleted: (openProjects?: boolean) => Promise<void>;
  /** The name Settings → Project shows, which the person types to confirm (DD-PROJ-10). */
  projectName?: () => string | undefined;
  /** Timers, replaceable in tests. */
  timers?: { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void; now: () => number };
}

export function registerProjectDelete({ store, bridge, catalog, commands, viewModels, tracker, flush, toast, deleted, projectName, timers }: Ctx) {
  const ws = bridge.workspace;
  const t = timers ?? { set: (run: () => void, ms: number) => setTimeout(run, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now() };
  const blank = () => ({
    open: false, step: "consequences" as DeleteStep, problem: "" as DeleteProblem, typed: "", private: false, exported: false, exportPath: "",
    busy: false, checking: false, owner: "", org: "", retryAt: 0, lockedFile: "", privateHistoryFailed: false, localRefused: false, site: "", links: 0,
  });
  let state = blank();
  let check: DeletionCheck | undefined;
  const repos = new Map<string, RepoPhase>();
  let poll: unknown;
  let pollDelay = DELETE_POLL_MS;
  let run = 0;
  /** A resumed delete still blocked before GitHub: Retry resumes again rather than starting over. */
  let resuming = false;
  /** The record of a delete that has started to remove something; `pending` is one left by an earlier session. */
  let pending: DeletionRecord | undefined;
  /** What the last finished delete removed, for the final screen. */
  let finished: { name: string; folder: string; repos: string[]; privateKept: string; steps: RunStep[] } | undefined;
  const changed = () => store.update((s) => ({ ...s }));
  const set = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; changed(); };
  const name = () => check?.name ?? "";
  const linked = () => check?.kind === "linked";
  /** The repositories deleted on GitHub: the notes repository, any paired public site repository, and the private one if chosen. */
  const targets = () => (linked()
    ? [check!.repo, ...(check!.siteRepo ? [check!.siteRepo] : []), ...(state.private && check!.privateRepo ? [check!.privateRepo] : [])]
    : []);
  const stopPolling = () => { if (poll !== undefined) t.clear(poll); poll = undefined; };
  const resetBackoff = () => { pollDelay = DELETE_POLL_MS; };
  const nextBackoff = () => {
    const current = pollDelay;
    pollDelay = Math.min(DELETE_POLL_MAX_MS, Math.round(pollDelay * 1.5));
    return current;
  };
  const schedule = (ms = DELETE_POLL_MS) => { stopPolling(); if (state.open && state.step === "github") poll = t.set(() => void commands.run("project.deletePoll"), ms); };
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, title: string, go: (a: A) => unknown, enabled?: () => boolean) =>
    commands.register<A>({ id, title, ...(enabled ? { enabled } : {}), run: async (a) => { await go(a); } });

  /** Only once something is being removed: the targets and what's done, never credentials or notes. Each write replaces the last. */
  const persist = async (local = false) => {
    const rec = ws?.deletionRecord;
    if (!rec || !check) return;
    const record: DeletionRecord = {
      version: 1, name: name(), folder: check.folder, kind: check.kind,
      repos: targets().map((id) => ({ id, deleted: repos.get(id) === "deleted" })),
      keepPrivate: Boolean(check.privateRepo) && !state.private, local,
    };
    pending = undefined;
    await rec.save(record);
  };
  const forget = async () => { await ws?.deletionRecord?.clear(); pending = undefined; };

  /** Every step of the run, in order, with its state (DD-PROJ-14). A repository already confirmed deleted stays done. */
  const steps = (): RunStep[] => {
    const c = check;
    if (!c) return [];
    const before = state.step === "consequences" || state.step === "unsynced";
    const out: RunStep[] = [];
    if (c.kind === "offline") {
      out.push({ id: "check", kind: "check", target: "", state: "skipped" }, { id: "repo", kind: "repo", target: "", state: "skipped" });
    } else {
      const failed = before && (state.problem === "offline" || state.problem === "signin" || state.problem === "notAdmin");
      out.push({ id: "check", kind: "check", target: c.repo, state: state.checking && before ? "working" : failed ? "failed" : "done" });
      for (const id of [c.repo, ...(c.siteRepo ? [c.siteRepo] : []), ...(c.privateRepo ? [c.privateRepo] : [])]) {
        const phase = repos.get(id);
        let s: RunState = "waiting";
        if (id === c.privateRepo && !state.private) s = "skipped";
        else if (phase === "deleted") s = "done";
        else if (phase && state.step === "stopped") s = "paused";
        else if (phase && state.step === "github") {
          s = state.problem === "rateLimit" ? "paused" : state.problem === "offline" || state.problem === "signin" || state.problem === "error" ? "failed" : "working";
        }
        out.push({ id: `repo:${id}`, kind: "repo", target: id, state: s });
      }
    }
    const local: RunState = state.step === "done" ? "done" : state.step !== "progress" ? "waiting" : state.problem === "partialLocal" ? "failed" : "working";
    out.push({ id: "local", kind: "local", target: c.folder, state: local }, { id: "recent", kind: "recent", target: "", state: state.step === "done" ? "done" : "waiting" });
    return out;
  };
  /** Steps of a delete an earlier session left: what's done stays done; the rest waits (DD-PROJ-14). */
  const resumeSteps = (r: DeletionRecord): RunStep[] => [
    ...(r.kind === "offline"
      ? [{ id: "check", kind: "check", target: "", state: "skipped" }, { id: "repo", kind: "repo", target: "", state: "skipped" }] as RunStep[]
      : [{ id: "check", kind: "check", target: r.repos[0]?.id ?? "", state: "done" } as RunStep,
        ...r.repos.map((x): RunStep => ({ id: `repo:${x.id}`, kind: "repo", target: x.id, state: x.deleted ? "done" : "waiting" }))]),
    { id: "local", kind: "local", target: r.folder, state: "waiting" },
    { id: "recent", kind: "recent", target: "", state: "waiting" },
  ];

  /** What GitHub says before anything happens: offline, signed out, not an admin, error, or already unavailable (DD-PROJ-17). */
  const problemOf = (s: RepoStatus | undefined): { problem: DeleteProblem; owner?: string; org?: string; retryAt?: number } => {
    if (!s) return { problem: "" };
    switch (s.state) {
      case "offline": return { problem: "offline" };
      case "signin": return { problem: "signin" };
      case "error": return { problem: "error" };
      case "gone": return { problem: "gone" };
      case "rateLimit": return { problem: "", retryAt: s.retryAt };
      case "exists": return s.admin ? { problem: "", ...(s.organization ? { org: s.owner } : {}) } : { problem: "notAdmin", owner: s.owner };
    }
  };
  const preflight = async () => {
    const mine = ++run;
    set({ checking: true });
    const c = await ws!.deletion!().catch((): DeletionCheck | undefined => undefined);
    if (mine !== run) return;
    check = c && !c.problem ? { ...c, name: projectName?.() || c.name } : c;
    if (!c || c.problem) { set({ checking: false, open: false }); toast(catalog.format("project.delete.unavailable"), { tone: "error" }); return; }
    const listing = await bridge.access?.load().catch(() => undefined);
    // The window's own account check may not have answered yet: ask, rather than call a signed-in person signed out.
    const login = c.kind !== "linked" || store.state.account.login ? store.state.account.login
      : await bridge.firstRun?.account().then((a) => (a.account && !a.signedOut ? a.account.login : ""), () => "");
    if (mine !== run) return;
    const status = c.kind === "linked"
      ? (!login ? ({ state: "signin" } as RepoStatus) : await ws!.repoStatus?.(c.repo).catch((): RepoStatus => ({ state: "offline" })))
      : undefined;
    if (mine !== run) return;
    const p = problemOf(status);
    set({
      checking: false, problem: p.problem, owner: p.owner ?? "", org: p.org ?? "", retryAt: p.retryAt ?? 0,
      site: c.kind === "linked" ? (listing?.site ?? "").replace(/^https:\/\//, "").replace(/\/$/, "") : "",
      links: c.kind === "linked" ? (listing?.grants.length ?? 0) : 0,
    });
  };

  reg("project.delete", "project.delete.entry", async () => {
    if (!ws?.deletion || !ws.deleteLocal) return;
    // What's typed is written first, so it counts among the notes not on GitHub yet (DD-PROJ-11).
    if (!(await flush())) { toast(catalog.format("project.delete.unsaved"), { tone: "error" }); return; }
    stopPolling();
    resetBackoff();
    repos.clear();
    check = undefined;
    finished = undefined;
    resuming = false;
    state = { ...blank(), open: true, checking: true };
    store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: false } } }));
    await preflight();
  }, () => Boolean(ws?.deletion && ws.deleteLocal));

  /** Back, Close and Escape change nothing; only waiting on GitHub with partial deletions stops (DD-PROJ-14). Never while the folder is moving. */
  const close = async () => {
    if (state.step === "done") {
      if (finished) return commands.run("project.deleteFinish");
      set({ open: false });
      return;
    }
    if (state.busy || state.step === "progress") return;
    if (state.step === "github") {
      stopPolling();
      run++;
      if (targets().some((r) => repos.get(r) === "deleted")) { set({ step: "stopped", checking: false }); return; }
      resuming = false;
      await ws?.cancelDelete?.();
      set({ open: false, checking: false });
      return;
    }
    run++;
    resuming = false;
    stopPolling();
    await ws?.cancelDelete?.();
    set({ open: false, checking: false });
  };
  reg<{ open: boolean }>("project.deleteSetOpen", "remove.cancel", ({ open }) => { if (!open) return close(); });
  reg("project.deleteCancel", "remove.cancel", close);
  reg("project.deleteStop", "project.delete.github.stop", () => {
    if (state.step === "github") { stopPolling(); run++; set({ step: "stopped", checking: false }); }
    else return close();
  });
  reg("project.deleteRetry", "project.delete.github.checkAgain", async () => {
    if (state.step === "progress") return commands.run("project.deleteConfirm");
    if (state.step === "github") {
      resetBackoff();
      return commands.run("project.deletePoll");
    }
    if (resuming) return commands.run("project.deleteResume");
    await preflight();
  });
  reg("project.deleteFocus", "project.delete.github.checkAgain", async () => {
    if (!state.open || state.step !== "github" || polling) return;
    if (state.problem === "rateLimit" && t.now() < state.retryAt) return;
    resetBackoff();
    await commands.run("project.deletePoll");
  });
  reg("project.deleteSignIn", "project.delete.problem.signinAction", async () => {
    stopPolling();
    run++;
    set({ open: false, checking: false });
    await commands.run("account.signIn").catch(() => {});
  });
  /** Not an admin, or the organization doesn't allow it: the separate, safer Remove from this computer. */
  reg("project.deleteRemoveInstead", "project.home.remove", async () => {
    run++;
    stopPolling();
    set({ open: false, checking: false });
    await commands.run("workspace.remove");
  });
  reg<{ value?: unknown }>("project.deleteType", "project.delete.confirm.button", ({ value }) => set({ typed: typeof value === "string" ? value : "" }));
  reg<{ value?: unknown }>("project.deletePrivate", "project.delete.private.switch", ({ value }) => set({ private: value === true }));
  reg("project.deleteBack", "project.back", () => {
    if (state.step === "github" && !targets().some((r) => repos.get(r) === "deleted")) {
      stopPolling();
      run++;
      set({ step: check?.unsynced.length ? "unsynced" : "consequences", problem: "", retryAt: 0, checking: false });
      return;
    }
    if (state.step === "unsynced") set({ step: "consequences" });
  });
  /** The person deletes on GitHub, which asks for the repository's name; no second typed name here (D-413, the owner 24 Nov). */
  const toGitHub = () => {
    for (const r of targets()) if (!repos.has(r)) repos.set(r, "waiting");
    resetBackoff();
    set({ step: "github", problem: state.org ? "policy" : "", retryAt: 0 });
    schedule(DELETE_POLL_MS);
  };
  reg("project.deleteContinue", "project.delete.continue", () => {
    // Already unavailable on GitHub goes on: the web-delete step verifies it with a fresh check before local cleanup.
    if (!linked() || (state.problem && state.problem !== "gone" && state.problem !== "policy")) return;
    if (state.step === "consequences" && check?.unsynced.length) set({ step: "unsynced" });
    else toGitHub();
  });
  reg("project.deleteExport", "project.delete.unsynced.export", async () => {
    if (!ws?.exportUnsynced || state.busy) return;
    set({ busy: true });
    // A failed or cancelled copy keeps the step open and the notes where they are (DD-PROJ-11).
    const go = () => ws.exportUnsynced!();
    const path = await (tracker ? tracker.run("project.deleteExport", "task.copying", go, undefined, "fn:project.deletePreserve") : go())
      .catch(() => { toast(catalog.format("project.delete.exportFailed"), { tone: "error" }); return undefined; });
    set({ busy: false, ...(path ? { exported: true, exportPath: path } : {}) });
  });

  /** An offline project: the name typed exactly, then this computer. A linked one retries local cleanup only. */
  reg("project.deleteConfirm", "project.delete.confirm.button", async () => {
    if (!check || state.busy) return;
    if (linked()) { if (state.step === "progress") await finish(); return; }
    if (state.typed !== name()) return;
    await finish();
  });
  reg("project.deleteFinish", "project.delete.done.action", async () => {
    if (!finished) return;
    const done = finished;
    finished = undefined;
    state = blank();
    check = undefined;
    repos.clear();
    changed();
    await commands.run("projects.open");
    toast(catalog.format(done.privateKept ? "project.delete.donePrivate" : "project.delete.done", { name: done.name, path: done.privateKept }));
  });
  reg<{ id?: unknown }>("project.deleteOpenGitHub", "project.delete.github.open", async ({ id }) => {
    const repo = typeof id === "string" ? id : targets().find((r) => repos.get(r) !== "deleted");
    if (!repo || !targets().includes(repo) || !ws?.openRepoSettings) return;
    await ws.openRepoSettings(repo);
    resetBackoff();
    schedule(DELETE_POLL_MS);
  });

  /**
   * One check per remaining repository, never overlapping (D-413). Only an authenticated 404 paired
   * with GET /user 200 (`state: "gone"`) marks a repository deleted; 401/403/429/5xx/offline keep
   * waiting with an honest status. When all targets are confirmed gone, local cleanup runs automatically.
   */
  let polling = false;
  reg("project.deletePoll", "project.delete.github.checkAgain", async () => {
    if (polling || !state.open || state.step !== "github" || !ws?.repoStatus) return;
    const mine = run;
    polling = true;
    stopPolling();
    set({ checking: true });
    let next: number | undefined;
    let anyDeleted = false;
    const checkAll = async () => {
      for (const repo of targets()) {
        if (repos.get(repo) === "deleted") continue;
        const s = await ws.repoStatus!(repo).catch((): RepoStatus => ({ state: "offline" }));
        if (mine !== run || !state.open || state.step !== "github") return;
        if (s.state === "gone") {
          repos.set(repo, "deleted");
          await persist();
          anyDeleted = true;
        } else if (s.state === "rateLimit") {
          next = Math.max(DELETE_POLL_MS, s.retryAt - t.now());
          set({ problem: "rateLimit", retryAt: s.retryAt });
          break;
        } else if (s.state === "offline" || s.state === "signin" || s.state === "error") {
          set({ problem: s.state, retryAt: 0 });
          break;
        } else if (state.problem === "rateLimit" || state.problem === "offline" || state.problem === "signin" || state.problem === "error") {
          set({ problem: state.org ? "policy" : "", retryAt: 0 });
        }
      }
    };
    try {
      await (tracker ? tracker.run("project.deleteCheck", "task.checking", checkAll, undefined, "fn:project.deleteCheck") : checkAll());
    } finally {
      polling = false;
      if (mine === run) set({ checking: false });
    }
    if (mine !== run || !state.open || state.step !== "github") return;
    if (targets().every((r) => repos.get(r) === "deleted")) {
      stopPolling();
      await finish();
      return;
    }
    if (anyDeleted) {
      resetBackoff();
      next = DELETE_POLL_MS;
    } else if (next === undefined) {
      next = nextBackoff();
    }
    schedule(next);
  });

  async function finish() {
    if (!ws?.deleteLocal || !check) return;
    const mine = run;
    if (linked() && !targets().every((repo) => repos.get(repo) === "deleted")) return;
    if (!(await flush())) { toast(catalog.format("project.delete.unsaved"), { tone: "error" }); return; }
    if (mine !== run || !state.open) return;
    stopPolling();
    set({ step: "progress", busy: true, problem: "", lockedFile: "", privateHistoryFailed: false, localRefused: false });
    const keepPrivate = Boolean(check.privateRepo) && !state.private;
    await persist(true);
    const go = () => ws.deleteLocal!({ keepPrivate });
    const r = await (tracker ? tracker.run("project.delete", "task.deleting", go, undefined, "fn:project.deleteLocal") : go()).catch(() => ({ state: "failed" as const, reason: undefined, file: undefined, privateKept: undefined }));
    if (mine !== run || !state.open) return;
    if (r.state === "deleted") {
      const n = name();
      const off = !linked();
      const all = steps().map((s): RunStep => (s.state === "skipped" ? s : { ...s, state: "done" }));
      finished = { name: n, folder: check.folder, repos: targets(), privateKept: r.privateKept ?? "", steps: all };
      await forget();
      if (!off) {
        set({ step: "done", busy: false });
        await deleted(false);
        return;
      }
      state = blank();
      check = undefined;
      repos.clear();
      changed();
      await deleted(true);
      toast(catalog.format("project.delete.doneOffline", { name: n, path: r.privateKept ?? "" }));
      return;
    }
    // Deleted on GitHub, still on this computer: say exactly that, and keep Retry and Show folder (DD-PROJ-17).
    set({ busy: false, problem: "partialLocal", privateHistoryFailed: r.reason === "privateHistory", localRefused: r.state === "refused", lockedFile: r.file ?? catalog.format("project.delete.someFile") });
  }
  reg("project.deleteShowFolder", "project.open.showFolder", async () => {
    await ws?.reveal?.().catch(() => {});
  });

  /** A delete an earlier session started and didn't finish (quit or crash): read once at start (DD-PROJ-14). */
  const resumeCheck = async () => {
    if (!ws?.deletionRecord) return;
    const r = await ws.deletionRecord.load().catch(() => { toast(catalog.format("project.delete.unavailable"), { tone: "error" }); return undefined; });
    const next = r && r.version === 1 && r.folder ? r : undefined;
    if (!next && !pending) return;
    pending = next;
    changed();
  };
  reg("project.deleteResumeCheck", "project.delete.entry", resumeCheck);
  /**
   * Finish it: check access again, then only what's left. Repositories are verified again via
   * authenticated GET 404 + GET /user 200 before local cleanup runs (D-413).
   */
  reg("project.deleteResume", "project.delete.entry", async () => {
    const r = pending;
    if (!r || !ws?.deletion || !ws.deleteLocal) return;
    stopPolling();
    resetBackoff();
    repos.clear();
    check = undefined;
    finished = undefined;
    resuming = true;
    state = { ...blank(), open: true, checking: true };
    await preflight();
    const c = check as DeletionCheck | undefined;
    if (!c || c.problem) return;
    if (c.folder !== r.folder) {
      // Another project is open: leave the record for when that one is.
      resuming = false;
      set({ open: false });
      toast(catalog.format("project.delete.unavailable"), { tone: "error" });
      return;
    }
    set({ typed: name(), private: !r.keepPrivate && Boolean(c.privateRepo) });
    if (c.kind === "offline") { resuming = false; await finish(); return; }
    // Offline, signed out or not an admin: the problem shows with Retry, which resumes again.
    if (state.problem && state.problem !== "gone" && state.problem !== "policy") return;
    const gone = new Set(r.repos.filter((x) => x.deleted).map((x) => x.id));
    for (const id of targets()) repos.set(id, gone.has(id) ? "deleted" : "waiting");
    resuming = false;
    if (targets().every((id) => repos.get(id) === "deleted")) { await finish(); return; }
    set({ step: "github", problem: state.org ? "policy" : "" });
    schedule(DELETE_POLL_MS);
  });
  /** Keep the folder: the record goes and nothing else changes. */
  reg("project.deleteForget", "remove.cancel", async () => { await forget(); changed(); });
  void resumeCheck();

  const text = { type: "string" as const };
  const num = { type: "number" as const };
  const bool = { type: "boolean" as const };
  viewModels.register({
    id: "vm.projectDelete",
    reads: "*",
    setters: { typed: "project.deleteType", private: "project.deletePrivate" },
    schema: {
      type: "object",
      properties: {
        open: bool, step: { type: "string", enum: ["consequences", "unsynced", "github", "progress", "done", "stopped"] }, kind: { type: "string", enum: ["linked", "offline"] },
        problem: text, typed: text, private: bool, exported: bool, exportPath: text, unsyncedProceedLabel: text, busy: bool, checking: bool, canBackFromGithub: bool,
        name: text, repo: text, siteRepo: text, privateRepo: text, otherRepo: text, otherOwner: text, org: text, orgRepo: text,
        site: text, siteNotes: num, links: num, peopleCount: num, peopleNames: text, privateCount: num,
        unsyncedCount: num, unsynced: { type: "array", items: { type: "object", properties: { id: text, label: text, description: text } } },
        lockedFile: text, localError: text, retryAt: text,
        repos: { type: "array", items: { type: "object", properties: { id: text, label: text, detail: text, icon: text, waiting: bool, deleted: bool, canOpen: bool } } },
      },
    },
    select: () => {
      const c = check;
      const detail: Record<RepoPhase, string> = { waiting: "project.delete.github.waiting", deleted: "project.delete.github.deleted" };
      const targetList = targets();
      return {
        open: state.open, step: state.step, kind: c?.kind ?? "linked", problem: state.problem, typed: state.typed, private: state.private,
        exported: state.exported, exportPath: state.exportPath,
        unsyncedProceedLabel: catalog.format(state.exported ? "project.delete.continue" : "project.delete.unsynced.skipSave"),
        busy: state.busy || (state.checking && state.step !== "github"), checking: state.checking,
        canBackFromGithub: !targetList.some((r) => repos.get(r) === "deleted"),
        localError: catalog.format(state.privateHistoryFailed ? "project.delete.problem.privateHistory" : state.localRefused ? "project.delete.problem.localRefused" : "project.delete.problem.partialLocal", { file: state.lockedFile }),
        name: c?.name ?? "", repo: c?.repo ?? "", siteRepo: c?.siteRepo ?? "", privateRepo: c?.privateRepo ?? "",
        otherRepo: c?.repo ?? "", otherOwner: state.owner ? `@${state.owner}` : "", org: state.org, orgRepo: c?.repo ?? "",
        site: state.site, siteNotes: c?.siteNotes ?? 0, links: state.links,
        // Who else can open the repository isn't read before GitHub's own page shows it.
        peopleCount: 0, peopleNames: "", privateCount: c?.privateCount ?? 0,
        unsyncedCount: c?.unsynced.length ?? 0,
        unsynced: (c?.unsynced ?? []).map((path) => {
          const parts = path.split(/[\\/]/).filter(Boolean);
          const label = (parts.pop() ?? path).replace(/\.(md|markdown)$/i, "");
          return { id: path, label, description: parts.join(" / ") };
        }),
        lockedFile: state.lockedFile,
        retryAt: state.retryAt ? new Date(state.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        repos: targetList.map((id) => {
          const phase = repos.get(id) ?? "waiting";
          return { id, label: id, detail: catalog.format(detail[phase]), icon: phase === "deleted" ? "check" : "github", waiting: phase === "waiting", deleted: phase === "deleted", canOpen: phase === "waiting" && targetList.length > 1 };
        }),
      };
    },
  });

  /**
   * The run as a list of steps, the delete an earlier session left, and what the last one removed
   * (DD-PROJ-14).
   */
  const step = { type: "object" as const, properties: { id: text, kind: text, target: text, state: { type: "string" as const, enum: ["waiting", "working", "done", "paused", "failed", "skipped"] } } };
  const repoList = { type: "array" as const, items: { type: "object" as const, properties: { id: text } } };
  viewModels.register({
    id: "vm.projectDeleteRun",
    reads: "*",
    schema: {
      type: "object",
      properties: {
        steps: { type: "array", items: step },
        resume: bool, resumeName: text, resumeSteps: { type: "array", items: step },
        done: bool, doneName: text, doneFolder: text, doneRepos: repoList, privateKept: text,
      },
    },
    select: () => ({
      steps: steps(),
      resume: Boolean(pending), resumeName: pending?.name ?? "", resumeSteps: pending ? resumeSteps(pending) : [],
      done: Boolean(finished), doneName: finished?.name ?? "", doneFolder: finished?.folder ?? "",
      doneRepos: (finished?.repos ?? []).map((id) => ({ id })), privateKept: finished?.privateKept ?? "",
    }),
  });
}
