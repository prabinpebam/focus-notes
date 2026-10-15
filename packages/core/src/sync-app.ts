/**
 * Save and sync in the app (EDT-11, D-132): the shell commits and pushes with the user's own Git, by
 * how much changed; the app asks at once on Save to cloud (Mod+Shift+S, Mod+S) and when switching
 * notes. The save state shows as the bottom-left pill's icon; problems also show as the trigger's
 * dot and one toast when they first appear (Feedback → Save and sync status).
 */
import type { PlatformBridge, SyncProblem, SyncReport } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";

export interface SyncState {
  /** Whether the workspace is a Git repository. Without one there's no Git UI at all. */
  git: boolean;
  problem?: SyncProblem;
  /** Changes not backed up yet: notes not committed, and commits not pushed. */
  waiting?: number;
  /** A backup with something to send is running. */
  syncing?: boolean;
  /** When a backup last finished with nothing waiting, in this session. */
  backedUpAt?: number;
  /** Save to cloud's label beside the icon: while it runs, then for a moment after (D-132). */
  asked?: "syncing" | "done";
  /** The person changed a note since the last backup: written here, not backed up yet. */
  edited?: boolean;
}
export const NO_SYNC: SyncState = { git: false };

export const SYNC_PROBLEMS: readonly SyncProblem[] = ["offline", "auth", "conflict", "locked", "identity", "signing", "hook", "failed"];

/** The save state's six looks (D-132). */
export type SaveStateKind = "savedLocal" | "pending" | "syncing" | "synced" | "offline" | "error";

/** Where saving stands, from the note's own save and the shell's report. */
export function saveStateOf(sync: SyncState, noteSaving: boolean): SaveStateKind {
  if (!sync.git) return "savedLocal";
  if (sync.problem === "offline") return "offline";
  if (sync.problem) return "error";
  if (sync.syncing || sync.asked === "syncing") return "syncing";
  if (sync.waiting) return "pending";
  if (noteSaving) return "savedLocal";
  return sync.edited ? "pending" : "synced";
}

/** How long Save to cloud's label stays after it's done. */
export const ASKED_DONE_MS = 2_000;

interface Ctx<S extends { sync: SyncState }> {
  store: Store<S>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }) => unknown;
  announce?: (text: string) => void;
  now?: () => number;
}

export function registerSync<S extends { sync: SyncState }>({ store, bridge, catalog, toast, announce, now = Date.now }: Ctx<S>) {
  /** Save to cloud is waiting on a sync: its own result says what happened, so the background toast stays quiet. */
  let asked = 0;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  const describe = (p: SyncProblem) => catalog.format(`sync.problem.${p}`);
  const retry = () => ({ command: "note.save", label: catalog.format("toast.retry") });
  const resolve = () => ({ command: "conflict.open", label: catalog.format("conflict.resolve") });
  const set = (patch: Partial<SyncState>) => store.update((s) => {
    const next: SyncState = { ...s.sync, ...patch };
    for (const k of Object.keys(patch) as (keyof SyncState)[]) if (patch[k] === undefined) delete next[k];
    return { ...s, sync: next };
  });
  const apply = (r: SyncReport, quiet = false) => {
    const was = store.state.sync;
    const before = was.problem;
    const problem = r.state === "problem" ? r.problem ?? "failed" : undefined;
    const waiting = r.waiting ?? 0;
    // A problem stays shown until a sync ends without one.
    const keep = r.state === "syncing" && before;
    const syncing = !keep && r.state === "syncing" && waiting > 0;
    const backedUp = r.state === "idle" && waiting === 0 && r.git && (was.syncing || Boolean(was.waiting) || Boolean(before));
    const nextProblem = keep ? before : problem;
    if (was.git === r.git && before === nextProblem && (was.waiting ?? 0) === waiting && Boolean(was.syncing) === syncing && !backedUp) return;
    set({ git: r.git, problem: nextProblem, waiting, syncing: syncing || undefined, ...(backedUp ? { backedUpAt: now(), edited: undefined } : {}) });
    // Problems show when they first appear (EDT-11).
    // A conflict offers the resolver instead of Retry (Feedback → Save and sync status).
    if (problem && problem !== before && !quiet && !asked) toast(describe(problem), { tone: "error", action: problem === "conflict" ? resolve() : retry() });
  };
  return {
    start() {
      if (!bridge.sync) return;
      bridge.sync.onStatus((r) => apply(r));
      void bridge.sync.status().then((r) => apply(r), () => {});
    },
    /** Save to cloud: commit and push now. Throws a message that says why, if it couldn't. */
    async saveNow(): Promise<void> {
      if (!bridge.sync) return;
      asked++;
      clearTimeout(doneTimer);
      set({ asked: "syncing" });
      let r: SyncReport;
      try {
        r = await bridge.sync.now("save");
      } catch (e) {
        set({ asked: undefined });
        throw e;
      } finally {
        asked--;
      }
      apply(r, true);
      if (r.state === "problem") {
        set({ asked: undefined });
        throw new SyncFailed(describe(r.problem ?? "failed"), r.problem ?? "failed");
      }
      // The label says it's done for a moment, and screen readers hear it once (D-132).
      set({ asked: "done", edited: undefined, ...(store.state.sync.waiting ? {} : { backedUpAt: now() }) });
      if (catalog.has("save.label.done")) announce?.(catalog.format("save.label.done"));
      doneTimer = setTimeout(() => set({ asked: undefined }), ASKED_DONE_MS);
    },
    /** The person changed the note: once written it's saved here but not backed up, until the shell says otherwise. */
    edited(): void {
      if (store.state.sync.git && !store.state.sync.edited) set({ edited: true });
    },
    /** Switching notes backs up the one being left, in the background, when enough changed (the shell decides). */
    switched(): void {
      void bridge.sync?.now("switch").then((r) => apply(r), () => {});
    },
  };
}

/** A sync that failed when the person asked for it: the toast says why, and offers Retry. */
export class SyncFailed extends Error {
  readonly problem: SyncProblem;
  constructor(message: string, problem: SyncProblem) {
    super(message);
    this.problem = problem;
  }
}