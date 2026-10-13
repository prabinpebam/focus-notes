/**
 * When saving commits and pushes (EDT-11, D-23), and when the notes repository's pointer to the
 * private repository moves (D-07 as amended by D-90). Every delay is injectable, so tests use a
 * fake clock and the desktop journeys a short idle time.
 */

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** No typing for this long commits and pushes (D-23: 60 s, configurable). */
export const IDLE_COMMIT_MS = 60_000;
/** A writing session makes at most one pointer commit in the notes repository this often (D-07). */
export const POINTER_GAP_MS = 5 * 60_000;
/** Fetching runs this often, and when the window becomes active (Desktop and Git → Save and sync). */
export const FETCH_EVERY_MS = 5 * 60_000;

/** Why a sync runs: the person (save), the cadence (switch, idle, quit), or the app itself. */
export type SyncReason = "save" | "switch" | "idle" | "quit" | "batch" | "pointer" | "retry" | "fetch";

/**
 * The idle timer: each write restarts it, and when it runs out the notes are committed and pushed.
 * Asking for a sync now (Mod+S, switching notes, quitting) cancels it.
 */
export class Cadence {
  readonly #clock: Clock;
  readonly #idleMs: number;
  readonly #sync: (reason: SyncReason) => void;
  #timer: unknown;

  constructor(options: { clock?: Clock; idleMs?: number; sync: (reason: SyncReason) => void }) {
    this.#clock = options.clock ?? systemClock;
    this.#idleMs = options.idleMs ?? IDLE_COMMIT_MS;
    this.#sync = options.sync;
  }

  /** A note was written: commit once there's been no typing for the idle time. */
  edited(): void {
    this.cancel();
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = undefined;
      this.#sync("idle");
    }, this.#idleMs);
  }

  /** Commit and push now. */
  now(reason: SyncReason): void {
    this.cancel();
    this.#sync(reason);
  }

  /** Whether an idle commit is waiting. */
  get waiting(): boolean {
    return this.#timer !== undefined;
  }

  dispose(): void {
    this.cancel();
  }

  /** Drops the idle commit: a sync that runs now covers it. */
  cancel(): void {
    if (this.#timer !== undefined) this.#clock.clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}

/** How long until the pointer may move: 0 if the last pointer commit was at least the gap ago. */
export function pointerDelay(lastAt: number | undefined, now: number, gapMs = POINTER_GAP_MS): number {
  if (lastAt === undefined) return 0;
  return Math.max(0, lastAt + gapMs - now);
}

/** Backoff for retrying a sync that failed (offline): 30 s, doubling, at most 5 minutes. */
export function retryDelay(attempt: number): number {
  return Math.min(5 * 60_000, 30_000 * 2 ** Math.max(0, attempt));
}
