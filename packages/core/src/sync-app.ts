/**
 * Save and sync in the app (EDT-11, D-23): the shell commits and pushes with the user's own Git;
 * the app asks at once on Mod+S and when switching notes, and shows only problems, as the
 * trigger's problem dot and one toast when a problem first appears (Feedback → Save and sync status).
 */
import type { PlatformBridge, SyncProblem, SyncReport } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";

export interface SyncState {
  /** Whether the workspace is a Git repository. Without one there's no Git UI at all. */
  git: boolean;
  problem?: SyncProblem;
}
export const NO_SYNC: SyncState = { git: false };

export const SYNC_PROBLEMS: readonly SyncProblem[] = ["offline", "auth", "conflict", "locked", "identity", "signing", "hook", "failed"];

interface Ctx<S extends { sync: SyncState }> {
  store: Store<S>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }) => unknown;
}

export function registerSync<S extends { sync: SyncState }>({ store, bridge, catalog, toast }: Ctx<S>) {
  /** Mod+S is waiting on a sync: its own result says what happened, so the background toast stays quiet. */
  let asked = 0;
  const describe = (p: SyncProblem) => catalog.format(`sync.problem.${p}`);
  const retry = () => ({ command: "note.save", label: catalog.format("toast.retry") });
  const resolve = () => ({ command: "conflict.open", label: catalog.format("conflict.resolve") });
  const apply = (r: SyncReport, quiet = false) => {
    const before = store.state.sync.problem;
    const problem = r.state === "problem" ? r.problem ?? "failed" : undefined;
    if (r.state === "syncing" && before) return; // A problem stays shown until a sync ends without one.
    if (store.state.sync.git === r.git && before === problem) return;
    store.update((s) => ({ ...s, sync: { git: r.git, ...(problem ? { problem } : {}) } }));
    // Only problems are shown, and only when they first appear (EDT-11).
    // A conflict offers the resolver instead of Retry (Feedback → Save and sync status).
    if (problem && problem !== before && !quiet && !asked) toast(describe(problem), { tone: "error", action: problem === "conflict" ? resolve() : retry() });
  };
  return {
    start() {
      if (!bridge.sync) return;
      bridge.sync.onStatus((r) => apply(r));
      void bridge.sync.status().then((r) => apply(r), () => {});
    },
    /** Mod+S: commit and push now. Throws a message that says why, if it couldn't. */
    async saveNow(): Promise<void> {
      if (!bridge.sync) return;
      asked++;
      let r: SyncReport;
      try {
        r = await bridge.sync.now("save");
      } finally {
        asked--;
      }
      apply(r, true);
      if (r.state === "problem") throw new SyncFailed(describe(r.problem ?? "failed"), r.problem ?? "failed");
    },
    /** Switching notes commits and pushes the one being left, in the background. */
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
