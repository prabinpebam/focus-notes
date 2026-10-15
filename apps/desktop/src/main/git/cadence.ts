/**
 * When saving commits and pushes (EDT-11, D-133), and when the notes repository's pointer to the
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

/**
 * When to back up (commit and push) on its own, by how much changed (D-133, superseding D-23's
 * 60 s idle commit). One object, so Settings can offer it later; the journeys override it.
 */
export interface BackupPolicy {
  /** A pause this long backs up once `minChars` changed or the first change is `staleMs` old. */
  idleMs: number;
  /** A pause this long backs up once `bigChars` changed or a change has waited `ceilingMs`. */
  shortIdleMs: number;
  minChars: number;
  bigChars: number;
  staleMs: number;
  ceilingMs: number;
}
export const BACKUP_POLICY: BackupPolicy = { idleMs: 60_000, shortIdleMs: 10_000, minChars: 200, bigChars: 2_000, staleMs: 10 * 60_000, ceilingMs: 30 * 60_000 };

/** What's waiting to be backed up: characters changed across notes, when the first and the last change were made. */
export interface Unbacked {
  chars: number;
  since: number | undefined;
  lastEditAt: number | undefined;
}
export const NOTHING_UNBACKED: Unbacked = { chars: 0, since: undefined, lastEditAt: undefined };

/** Characters changed from one text to the next: inserted plus deleted, between their common start and end. */
export function changedChars(before: string, after: string): number {
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  return before.length - start - end + (after.length - start - end);
}

/** The earliest moment a backup is due if nothing else is typed, or undefined when nothing waits. */
export function backupDueAt(u: Unbacked, p: BackupPolicy): number | undefined {
  if (u.chars <= 0 || u.since === undefined || u.lastEditAt === undefined) return undefined;
  const short = u.lastEditAt + p.shortIdleMs;
  const idle = u.lastEditAt + p.idleMs;
  const at = [Math.max(short, u.since + p.ceilingMs), Math.max(idle, u.since + p.staleMs)];
  if (u.chars >= p.bigChars) at.push(short);
  if (u.chars >= p.minChars) at.push(idle);
  return Math.min(...at);
}

/** Whether enough changed to back up whatever the pause: what switching or closing a note asks. */
export function backupMeets(u: Unbacked, now: number, p: BackupPolicy): boolean {
  return u.chars > 0 && u.since !== undefined && (u.chars >= p.minChars || now - u.since >= p.staleMs);
}

/** Whether a backup is due now: quitting and Save to cloud always; switching by the thresholds; a pause by its time. */
export function backupDue(event: "idle" | "switch" | "quit" | "save", u: Unbacked, now: number, p: BackupPolicy): boolean {
  if (event === "quit" || event === "save") return true;
  if (event === "switch") return backupMeets(u, now, p);
  const at = backupDueAt(u, p);
  return at !== undefined && now >= at;
}

/** A writing session makes at most one pointer commit in the notes repository this often (D-07). */
export const POINTER_GAP_MS = 5 * 60_000;
/** Fetching runs this often, and when the window becomes active (Desktop and Git → Save and sync). */
export const FETCH_EVERY_MS = 5 * 60_000;

/** Why a sync runs: the person (save), the policy (switch, idle, quit), or the app itself. */
export type SyncReason = "save" | "switch" | "idle" | "quit" | "batch" | "pointer" | "retry" | "fetch";

/**
 * The backup timer: each write adds what it changed and waits for the earliest moment the policy
 * says (D-133). Backing up now (Save to cloud, quitting, a switch that meets a threshold) cancels it
 * and starts counting again.
 */
export class Cadence {
  readonly #clock: Clock;
  readonly #policy: BackupPolicy;
  readonly #sync: (reason: SyncReason) => void;
  #timer: unknown;
  #u: Unbacked = NOTHING_UNBACKED;

  constructor(options: { clock?: Clock; policy?: Partial<BackupPolicy>; sync: (reason: SyncReason) => void }) {
    this.#clock = options.clock ?? systemClock;
    this.#policy = { ...BACKUP_POLICY, ...options.policy };
    this.#sync = options.sync;
  }

  /** A note was written, changing this many characters (unknown counts as a meaningful change). */
  edited(chars = this.#policy.minChars): void {
    if (chars <= 0) return;
    const now = this.#clock.now();
    this.#u = { chars: this.#u.chars + chars, since: this.#u.since ?? now, lastEditAt: now };
    this.cancel();
    const at = backupDueAt(this.#u, this.#policy);
    if (at === undefined) return;
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = undefined;
      this.#u = NOTHING_UNBACKED;
      this.#sync("idle");
    }, Math.max(0, at - now));
  }

  /** Back up now, whatever changed. */
  now(reason: SyncReason): void {
    this.taken();
    this.#sync(reason);
  }

  /** Switching or closing a note: backs up only when a threshold is met. Returns whether it did. */
  switching(): boolean {
    if (!this.meets()) return false;
    this.now("switch");
    return true;
  }

  /** Whether enough changed for switching or closing a note to back up. */
  meets(): boolean {
    return backupDue("switch", this.#u, this.#clock.now(), this.#policy);
  }

  /** A backup is starting another way: nothing is waiting any more. */
  taken(): void {
    this.cancel();
    this.#u = NOTHING_UNBACKED;
  }

  get unbacked(): Unbacked {
    return this.#u;
  }

  /** Whether a backup is waiting on the timer. */
  get waiting(): boolean {
    return this.#timer !== undefined;
  }

  dispose(): void {
    this.cancel();
  }

  /** Drops the timer: a sync that runs now covers it. */
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
