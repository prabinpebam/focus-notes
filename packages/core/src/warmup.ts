/**
 * The warm-up after start (PRF-10, Performance and quality → Less reading): once the canvas has a
 * caret, work people will soon wait for (the code of the first views, and later Spotlight's index)
 * runs at idle priority, one task at a time. It pauses while someone types, so it never pushes a
 * keystroke past the typing budget (PRF-01), and it's off in end-to-end tests so their timing and
 * focus stay the same each run. Tasks report progress, so a view opened before the warm-up reaches
 * it can say what it's waiting for.
 */

export interface WarmUpTask {
  id: string;
  /** Does the work. `report` says how far it got ("4,000 of 10,000"). */
  run(report: (done: number, total: number) => void): Promise<void> | void;
}

export interface WarmUpStatus {
  state: "off" | "waiting" | "running" | "done";
  task?: string;
  done?: number;
  total?: number;
}

export interface WarmUpOptions {
  enabled: boolean;
  /** How long after the last keystroke a task may start. */
  quietMs?: number;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  /** Runs `fn` when the main thread is idle (requestIdleCallback in a browser). */
  idle?: (fn: () => void) => void;
}

/** No task starts within this long of a keystroke. */
export const WARM_UP_QUIET_MS = 500;

export class WarmUp {
  readonly #tasks: WarmUpTask[] = [];
  #status: WarmUpStatus;
  #started = false;
  #running = false;
  #typedAt = -Infinity;
  #done: Promise<void>;
  #resolveDone!: () => void;
  readonly #now: () => number;
  readonly #later: (fn: () => void, ms: number) => unknown;
  readonly #idle: (fn: () => void) => void;
  readonly #quietMs: number;

  readonly #enabled: boolean;

  constructor(opts: WarmUpOptions) {
    this.#enabled = opts.enabled;
    this.#status = { state: opts.enabled ? "waiting" : "off" };
    this.#now = opts.now ?? (() => Date.now());
    this.#later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => unknown }).requestIdleCallback;
    this.#idle = opts.idle ?? (ric ? (fn) => void ric(fn, { timeout: 1000 }) : (fn) => void this.#later(fn, 0));
    this.#quietMs = opts.quietMs ?? WARM_UP_QUIET_MS;
    this.#done = new Promise((r) => (this.#resolveDone = r));
    if (!opts.enabled) this.#resolveDone();
  }

  /** Adds a task. One added after the warm-up finished runs at the next quiet moment. */
  add(task: WarmUpTask): void {
    this.#tasks.push(task);
    if (this.#status.state === "done") {
      this.#status = { state: "waiting" };
      this.#done = new Promise((r) => (this.#resolveDone = r));
    }
    if (this.#started) this.#next();
  }

  /** Starts once the caret is ready. Again does nothing. */
  start(): void {
    if (this.#started || !this.#enabled) return;
    this.#started = true;
    this.#next();
  }

  /** Someone typed: tasks wait until the keys have been quiet for a moment. */
  typed(): void {
    this.#typedAt = this.#now();
  }

  status(): WarmUpStatus {
    return { ...this.#status };
  }

  /** Resolves once every task added so far has run (at once when the warm-up is off). */
  whenDone(): Promise<void> {
    return this.#done;
  }

  #next(): void {
    if (this.#running || !this.#enabled) return;
    const task = this.#tasks.shift();
    if (!task) {
      this.#status = { state: "done" };
      this.#resolveDone();
      return;
    }
    this.#running = true;
    this.#status = { state: "waiting", task: task.id };
    const attempt = () => {
      const quiet = this.#now() - this.#typedAt;
      if (quiet < this.#quietMs) return void this.#later(attempt, this.#quietMs - quiet);
      this.#idle(() => {
        // A key may have come while waiting for the idle moment.
        if (this.#now() - this.#typedAt < this.#quietMs) return attempt();
        this.#status = { state: "running", task: task.id };
        const report = (done: number, total: number) => (this.#status = { state: "running", task: task.id, done, total });
        void Promise.resolve()
          .then(() => task.run(report))
          .catch(() => {}) // A task that fails is done at the first wait for it, as if there were no warm-up.
          .then(() => {
            this.#running = false;
            this.#next();
          });
      });
    };
    attempt();
  }
}
