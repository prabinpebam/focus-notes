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

  /** Runs `work` as a tracked wait. Failures end the sign at once and are rethrown to the caller. */
  async run<T>(target: string, message: string, work: () => Promise<T>, doneMessage?: string): Promise<T> {
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
    const mark = `focus-notes:${target}`;
    try {
      const result = await work();
      this.#finish(task, true);
      return result;
    } catch (error) {
      this.#finish(task, false);
      throw error;
    } finally {
      try {
        performance.measure(mark, { start: task.started, end: c.now() });
      } catch {
        // Measuring is best effort (not every host has the User Timing API).
      }
    }
  }

  #finish(task: Running, ok: boolean): void {
    const c = this.#clock;
    for (const h of task.timers) c.clearTimeout(h);
    task.timers = [];
    if (task.announced) this.#events.announce(ok ? (task.doneMessage ?? "task.done") : "task.failed");
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
