/**
 * The task tracker (PRF-08, D-69): every wait a person starts goes through here. It decides when a
 * wait shows a sign at its place, when screen readers hear it, and when its words add the elapsed
 * time, using the `wait.*` timing tokens, so waits look and sound the same everywhere.
 */
export interface WaitTimings {
  signDelay: number;
  signMinimum: number;
  announceDelay: number;
  elapsedDelay: number;
  doneDuration: number;
}

export type TaskPhase = "ack" | "on" | "done";

export interface TaskView {
  id: number;
  /** What the wait affects: a command ID or a node ID. Its component shows the sign. */
  target: string;
  /** Message key for what's happening ("Saving…"), and for when it's done ("Saved"). */
  message: string;
  doneMessage?: string;
  phase: TaskPhase;
  /** Whole seconds since it started, once past wait.elapsedDelay; otherwise 0. */
  elapsed: number;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CommitView {
  id: number;
  target: string;
  command: string;
  value: unknown;
  phase: "pending" | "confirmed" | "failed";
}

/** Separate from delayed wait indicators: commits show immediately and keep both visible beats. */
export class CommitTracker {
  #items = new Map<string, CommitView>();
  #next = 1;
  readonly #minimum: number;
  readonly #change: (items: CommitView[]) => void;
  readonly #clock: Clock;

  constructor(minimum: number, change: (items: CommitView[]) => void, clock: Clock = realClock) {
    this.#minimum = minimum;
    this.#change = change;
    this.#clock = clock;
  }

  async run(target: string, command: string, value: unknown, work: () => Promise<void>): Promise<void> {
    if (this.#items.get(target)?.phase === "pending") throw new Error(`Commit already pending: ${target}`);
    const item: CommitView = { id: this.#next++, target, command, value, phase: "pending" };
    this.#items.set(target, item);
    this.#emit();
    const started = this.#clock.now();
    const hold = () => new Promise<void>((resolve) => this.#clock.setTimeout(resolve, Math.max(0, this.#minimum - (this.#clock.now() - started))));
    try {
      await work();
      await hold();
      item.phase = "confirmed";
      this.#emit();
      this.#clock.setTimeout(() => {
        if (this.#items.get(target) !== item) return;
        this.#items.delete(target);
        this.#emit();
      }, this.#minimum);
    } catch (error) {
      await hold();
      item.phase = "failed";
      this.#emit();
      throw error;
    }
  }

  clear(target: string): void {
    if (this.#items.get(target)?.phase === "pending") throw new Error(`Commit still pending: ${target}`);
    this.#items.delete(target);
    this.#emit();
  }

  #emit(): void { this.#change([...this.#items.values()].map((item) => ({ ...item }))); }
}
const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

interface Running extends TaskView {
  started: number;
  shownAt?: number;
  announced: boolean;
  timers: unknown[];
}
type OutcomeAnnouncements = "all" | "success" | "none";

export interface TrackerEvents {
  /** The set of visible tasks changed. */
  change(tasks: TaskView[]): void;
  /** Something to say to screen readers (a wait past wait.announceDelay, and its end). */
  announce(messageKey: string, args?: Record<string, unknown>): void;
}

export class TaskTracker {
  #tasks = new Map<number, Running>();
  #next = 1;
  #idle: (() => void)[] = [];
  readonly #t: WaitTimings;
  readonly #events: TrackerEvents;
  readonly #clock: Clock;

  constructor(timings: WaitTimings, events: TrackerEvents, clock: Clock = realClock) {
    this.#t = timings;
    this.#events = events;
    this.#clock = clock;
  }

  /** Reannounce an unchanged, retained live outcome after another attempt finishes. */
  announceOutcome(message: string): void {
    this.#events.announce(message);
  }

  /** Local live outcomes own their announcement; waits and visible task phases remain tracked. */
  run<T>(target: string, message: string, work: () => Promise<T>, doneMessage?: string, measure?: string, outcomes: OutcomeAnnouncements = "all"): Promise<T> {
    return this.#run(target, message, work, doneMessage, false, measure, outcomes);
  }

  /** A section replaces its shape only after the visible minimum, on success or failure. */
  section<T>(target: string, message: string, work: () => Promise<T>, measure?: string, outcomes: OutcomeAnnouncements = "all"): Promise<T> {
    return this.#run(target, message, work, undefined, true, measure, outcomes);
  }

  async #run<T>(target: string, message: string, work: () => Promise<T>, doneMessage: string | undefined, section: boolean, measure: string | undefined, outcomes: OutcomeAnnouncements): Promise<T> {
    const c = this.#clock;
    const task: Running = { id: this.#next++, target, message, ...(doneMessage ? { doneMessage } : {}), phase: "ack", elapsed: 0, started: c.now(), announced: false, timers: [] };
    this.#tasks.set(task.id, task);
    task.timers.push(c.setTimeout(() => this.#update(task, { phase: "on", shownAt: c.now() }), this.#t.signDelay));
    task.timers.push(c.setTimeout(() => {
      task.announced = true;
      this.#events.announce(message);
    }, this.#t.announceDelay));
    const tick = () => {
      this.#update(task, { elapsed: Math.floor((c.now() - task.started) / 1000) });
      task.timers.push(c.setTimeout(tick, 1000));
    };
    task.timers.push(c.setTimeout(tick, this.#t.elapsedDelay));
    this.#emit();
    const mark = measure ?? `focus-notes:${target}`;
    const hold = async () => {
      if (!section || task.shownAt === undefined) return;
      const remaining = this.#t.signMinimum - (c.now() - task.shownAt);
      if (remaining > 0) await new Promise<void>(resolve => c.setTimeout(resolve, remaining));
    };
    try {
      const result = await work();
      await hold();
      this.#finish(task, true, undefined, outcomes !== "none");
      return result;
    } catch (error) {
      await hold();
      this.#finish(task, false, error instanceof DOMException && error.name === "AbortError" ? "task.cancelled" : undefined, outcomes === "all");
      throw error;
    } finally {
      try {
        performance.measure(mark, { start: task.started, end: c.now() });
      } catch {
        // Measuring is best effort (not every host has the User Timing API).
      }
    }
  }

  #finish(task: Running, ok: boolean, endMessage: string | undefined, announce: boolean): void {
    const c = this.#clock;
    for (const h of task.timers) c.clearTimeout(h);
    task.timers = [];
    if (task.announced && announce) this.#events.announce(endMessage ?? (ok ? (task.doneMessage ?? "task.done") : "task.failed"));
    // A wait that ended before its sign showed leaves no trace; a failure ends the sign at once.
    if (task.phase === "ack" || !ok) return this.#remove(task);
    const remaining = Math.max(0, this.#t.signMinimum - (c.now() - (task.shownAt ?? c.now())));
    task.timers.push(c.setTimeout(() => {
      this.#update(task, { phase: "done" });
      task.timers.push(c.setTimeout(() => this.#remove(task), this.#t.doneDuration));
    }, remaining));
  }

  #update(task: Running, patch: Partial<Running>): void {
    if (!this.#tasks.has(task.id)) return;
    Object.assign(task, patch);
    this.#emit();
  }

  #remove(task: Running): void {
    for (const h of task.timers) this.#clock.clearTimeout(h);
    this.#tasks.delete(task.id);
    this.#emit();
    if (this.#tasks.size === 0) for (const r of this.#idle.splice(0)) r();
  }

  #emit(): void {
    this.#events.change(this.snapshot());
  }

  snapshot(): TaskView[] {
    return [...this.#tasks.values()].map(({ id, target, message, doneMessage, phase, elapsed }) => ({ id, target, message, ...(doneMessage ? { doneMessage } : {}), phase, elapsed }));
  }

  /** Resolves when no task is running or showing, for tests and shutdown. */
  idle(): Promise<void> {
    return this.#tasks.size === 0 ? Promise.resolve() : new Promise((r) => this.#idle.push(r));
  }
}

/**
 * A control's busy props for a target, from the tracker's tasks: the one busy policy (D-199).
 * Busy from `ack`, so a repeated press does nothing (the control shows its sign only after its
 * `wait.signDelay` style delay); words from `on` ("Saving…", then with the elapsed seconds); the done
 * words while `done`, no longer busy. A failure leaves nothing. The latest task for the target wins,
 * so pressing again while it says done starts over.
 */
export function busyProps(tasks: readonly TaskView[], target: string, format: (key: string, args?: Record<string, string | number>) => string): { busy?: boolean; busyLabel?: string } {
  const t = tasks.findLast((x) => x.target === target);
  if (!t) return {};
  if (t.phase === "ack") return { busy: true };
  const words = t.phase === "done" ? format(t.doneMessage ?? "task.done") : format(t.message);
  return { busy: t.phase === "on", busyLabel: t.elapsed ? format("task.elapsed", { words, seconds: t.elapsed }) : words };
}
