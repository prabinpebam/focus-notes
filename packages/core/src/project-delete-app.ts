/**
 * Deleting a project (PRJ-23, SC-PROJ-08 → UC-PROJ-13, DD-PROJ-09 to 17; approved 5 November): one
 * named project at a time. The consequences come first, then the notes not on GitHub yet, then the
 * project's name typed exactly. A linked project is deleted on GitHub's own page (DD-PROJ-12): the app
 * opens it, watches for the repository to go, and asks the person to confirm before it touches this
 * computer, since a 404 alone may be lost access (DD-PROJ-13). Then the folder and its history go to
 * the Recycle Bin (`bridge.workspace.deleteLocal`) and the window shows Open.
 */
import type { App } from "./app.ts";
import type { DeletionCheck, PlatformBridge, RepoStatus } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";

export type DeleteStep = "consequences" | "unsynced" | "confirm" | "github" | "progress" | "stopped";
export type DeleteProblem = "" | "offline" | "signin" | "notAdmin" | "policy" | "rateLimit" | "window" | "gone" | "partialLocal";
/** One repository on GitHub's side: not opened yet, waiting for the person, gone (asking them), or confirmed deleted. */
type RepoPhase = "open" | "waiting" | "ask" | "deleted";

/** How often the repository is read while the person deletes it on GitHub (about every 5 s, DD-PROJ-13). */
export const DELETE_POLL_MS = 5000;

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
  deleted: () => Promise<void>;
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
    busy: false, checking: false, owner: "", org: "", retryAt: 0, lockedFile: "", site: "", links: 0,
  });
  let state = blank();
  let check: DeletionCheck | undefined;
  const repos = new Map<string, RepoPhase>();
  let poll: unknown;
  let run = 0;
  const changed = () => store.update((s) => ({ ...s }));
  const set = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; changed(); };
  const name = () => check?.name ?? "";
  const linked = () => check?.kind === "linked";
  /** The repositories deleted on GitHub: the notes repository, and the private one only if the person chose to. */
  const targets = () => (linked() ? [check!.repo, ...(state.private && check!.privateRepo ? [check!.privateRepo] : [])] : []);
  const stopPolling = () => { if (poll !== undefined) t.clear(poll); poll = undefined; };
  const schedule = (ms = DELETE_POLL_MS) => { stopPolling(); if (state.open && state.step === "github") poll = t.set(() => void commands.run("project.deletePoll"), ms); };
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, title: string, go: (a: A) => unknown, enabled?: () => boolean) =>
    commands.register<A>({ id, title, ...(enabled ? { enabled } : {}), run: async (a) => { await go(a); } });

  /** What GitHub says before anything happens: offline, signed out, not an admin, or already unavailable (DD-PROJ-17). */
  const problemOf = (s: RepoStatus | undefined): { problem: DeleteProblem; owner?: string; org?: string; retryAt?: number } => {
    if (!s) return { problem: "" };
    switch (s.state) {
      case "offline": return { problem: "offline" };
      case "signin": return { problem: "signin" };
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
    const status = c.kind === "linked"
      ? (!store.state.account.login ? ({ state: "signin" } as RepoStatus) : await ws!.repoStatus?.(c.repo).catch((): RepoStatus => ({ state: "offline" })))
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
    repos.clear();
    check = undefined;
    state = { ...blank(), open: true, checking: true };
    store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: false } } }));
    await preflight();
  }, () => Boolean(ws?.deletion && ws.deleteLocal));

  /** Back, Close and Escape change nothing; only waiting on GitHub stops (DD-PROJ-14). Never while the folder is moving. */
  const close = () => {
    if (state.busy || state.step === "progress") return;
    if (state.step === "github") { stopPolling(); set({ step: "stopped" }); return; }
    run++;
    stopPolling();
    set({ open: false });
  };
  reg<{ open: boolean }>("project.deleteSetOpen", "remove.cancel", ({ open }) => { if (!open) close(); });
  reg("project.deleteCancel", "remove.cancel", close);
  reg("project.deleteStop", "project.delete.github.stop", () => { if (state.step === "github") { stopPolling(); set({ step: "stopped" }); } else close(); });
  reg("project.deleteRetry", "commit.retry", async () => {
    if (state.step === "progress") return commands.run("project.deleteConfirm");
    if (state.step === "github") return commands.run("project.deletePoll");
    await preflight();
  });
  reg("project.deleteSignIn", "project.delete.problem.signinAction", async () => {
    stopPolling();
    set({ open: false });
    await commands.run("account.signIn").catch(() => {});
  });
  /** Not an admin, or the organization doesn't allow it: the separate, safer Remove from this computer. */
  reg("project.deleteRemoveInstead", "project.home.remove", async () => {
    run++;
    stopPolling();
    set({ open: false });
    await commands.run("workspace.remove");
  });
  reg<{ value?: unknown }>("project.deleteType", "project.delete.confirm.button", ({ value }) => set({ typed: typeof value === "string" ? value : "" }));
  reg<{ value?: unknown }>("project.deletePrivate", "project.delete.private.switch", ({ value }) => set({ private: value === true }));
  reg("project.deleteBack", "project.back", () => {
    if (state.step === "confirm") set({ step: check?.unsynced.length ? "unsynced" : "consequences" });
    else if (state.step === "unsynced") set({ step: "consequences" });
  });
  reg("project.deleteContinue", "project.delete.continue", () => {
    // Already unavailable on GitHub goes on: the person confirms it's deleted, repository by repository (DD-PROJ-13).
    if (!linked() || (state.problem && state.problem !== "gone")) return;
    if (state.step === "consequences" && check?.unsynced.length) set({ step: "unsynced" });
    else set({ step: "confirm" });
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

  /** The name typed exactly; then GitHub for a linked project, or this computer for an offline one. */
  reg("project.deleteConfirm", "project.delete.confirm.button", async () => {
    if (!check || state.busy || state.typed !== name()) return;
    if (linked() && state.step !== "progress") {
      if (state.problem && state.problem !== "policy" && state.problem !== "gone") return;
      for (const r of targets()) if (!repos.has(r)) repos.set(r, state.problem === "gone" && r === check.repo ? "ask" : "open");
      set({ step: "github", problem: state.org ? "policy" : "" });
      return;
    }
    await finish();
  });
  reg<{ id?: unknown }>("project.deleteOpenGitHub", "project.delete.github.open", async ({ id }) => {
    const repo = typeof id === "string" ? id : targets().find((r) => repos.get(r) !== "deleted");
    if (!repo || !repos.has(repo) || !ws?.openRepoSettings) return;
    await ws.openRepoSettings(repo);
    if (repos.get(repo) === "open") repos.set(repo, "waiting");
    changed();
    schedule();
  });
  /** One read per waiting repository, never overlapping; a rate limit waits until GitHub says (DD-PROJ-13). */
  let polling = false;
  reg("project.deletePoll", "commit.retry", async () => {
    if (polling || state.step !== "github" || !ws?.repoStatus) return;
    polling = true;
    let next = DELETE_POLL_MS;
    try {
      for (const repo of targets()) {
        if (repos.get(repo) !== "waiting") continue;
        const s = await ws.repoStatus(repo).catch((): RepoStatus => ({ state: "offline" }));
        if (state.step !== "github") return;
        if (s.state === "gone") repos.set(repo, "ask");
        else if (s.state === "rateLimit") { next = Math.max(DELETE_POLL_MS, s.retryAt - t.now()); set({ problem: "rateLimit", retryAt: s.retryAt }); break; }
        else if (s.state === "offline" || s.state === "signin") { set({ problem: s.state }); break; }
        else if (state.problem === "rateLimit" || state.problem === "offline" || state.problem === "signin") set({ problem: state.org ? "policy" : "" });
      }
    } finally {
      polling = false;
      changed();
    }
    if (targets().some((r) => repos.get(r) === "waiting")) schedule(next);
  });
  /** The person says it's deleted: only for a repository GitHub no longer shows (DD-PROJ-13). */
  reg<{ id?: unknown }>("project.deleteConfirmGitHub", "project.delete.github.confirmDeleted", async ({ id }) => {
    if (typeof id !== "string" || repos.get(id) !== "ask") return;
    repos.set(id, "deleted");
    changed();
    if (targets().every((r) => repos.get(r) === "deleted")) { stopPolling(); await finish(); }
  });

  async function finish() {
    if (!ws?.deleteLocal || !check) return;
    stopPolling();
    set({ step: "progress", busy: true, problem: "", lockedFile: "" });
    const keepPrivate = Boolean(check.privateRepo) && !state.private;
    const go = () => ws.deleteLocal!({ keepPrivate });
    const r = await (tracker ? tracker.run("project.delete", "task.deleting", go, undefined, "fn:project.deleteLocal") : go()).catch(() => ({ state: "failed" as const, file: undefined, privateKept: undefined }));
    if (r.state === "deleted") {
      const n = name();
      const off = !linked();
      state = blank();
      changed();
      await deleted();
      toast(catalog.format(off ? "project.delete.doneOffline" : r.privateKept ? "project.delete.donePrivate" : "project.delete.done", { name: n, path: r.privateKept ?? "" }));
      return;
    }
    // Deleted on GitHub, still on this computer: say exactly that, and keep Retry and Show folder (DD-PROJ-17).
    set({ busy: false, problem: "partialLocal", lockedFile: r.file ?? catalog.format("project.delete.someFile") });
  }
  reg("project.deleteShowFolder", "project.open.showFolder", async () => {
    await ws?.reveal?.().catch(() => {});
  });

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
        open: bool, step: { type: "string", enum: ["consequences", "unsynced", "confirm", "github", "progress", "stopped"] }, kind: { type: "string", enum: ["linked", "offline"] },
        problem: text, typed: text, private: bool, exported: bool, exportPath: text, busy: bool,
        name: text, repo: text, privateRepo: text, otherRepo: text, otherOwner: text, org: text, orgRepo: text,
        site: text, siteNotes: num, links: num, peopleCount: num, peopleNames: text, privateCount: num,
        unsyncedCount: num, unsynced: { type: "array", items: { type: "object", properties: { id: text, label: text, description: text } } },
        lockedFile: text, retryAt: text,
        repos: { type: "array", items: { type: "object", properties: { id: text, label: text, detail: text, icon: text, waiting: bool, canOpen: bool, ask: bool } } },
      },
    },
    select: () => {
      const c = check;
      const detail: Record<RepoPhase, string> = { open: "project.delete.github.toOpen", waiting: "project.delete.github.waiting", ask: "project.delete.github.gone", deleted: "project.delete.github.deleted" };
      return {
        open: state.open, step: state.step, kind: c?.kind ?? "linked", problem: state.problem, typed: state.typed, private: state.private,
        exported: state.exported, exportPath: state.exportPath, busy: state.busy || state.checking,
        name: c?.name ?? "", repo: c?.repo ?? "", privateRepo: c?.privateRepo ?? "",
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
        repos: targets().map((id) => {
          const phase = repos.get(id) ?? "open";
          return { id, label: id, detail: catalog.format(detail[phase]), icon: phase === "deleted" ? "check" : "github", waiting: phase === "waiting", canOpen: phase === "open" || phase === "waiting", ask: phase === "ask" };
        }),
      };
    },
  });
}
