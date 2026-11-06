import type { ToastState } from "./app.ts";
import type { Clock } from "./tasks.ts";

export const MUST_READ_REASONS = ["data-at-risk", "recovery-decision", "operation-control", "profile-carry-over"] as const;
export interface NotificationOptions {
  tone?: ToastState["tone"];
  action?: ToastState["action"];
  subject?: string;
  sticky?: boolean;
  mustReadReason?: typeof MUST_READ_REASONS[number];
}

export class NotificationQueue {
  #items: ToastState[] = [];
  #next = 1;
  #active = true;
  #timers = new Map<number, { remaining: number; duration: number; started?: number; handle?: unknown }>();

  readonly clock: Clock;
  readonly duration: number;
  readonly longDuration: number;
  readonly change: (items: ToastState[]) => void;

  constructor(clock: Clock, duration: number, change: (items: ToastState[]) => void, longDuration = duration) {
    this.clock = clock;
    this.duration = duration;
    this.longDuration = longDuration;
    this.change = change;
  }

  show(message: string, opts: NotificationOptions = {}): number {
    if (opts.sticky && (!opts.mustReadReason || !MUST_READ_REASONS.includes(opts.mustReadReason))) {
      throw new Error("A must-read notification needs an allowed inventory reason");
    }
    const same = this.#items.find((t) => opts.subject
      ? t.subject === opts.subject
      : !t.subject && t.message === message && t.tone === (opts.tone ?? "info") && t.action?.command === opts.action?.command && t.action?.args === opts.action?.args);
    const id = same?.id ?? this.#next++;
    const item: ToastState = {
      id, message, tone: opts.tone ?? "info", paused: same?.paused ?? false,
      count: same?.tone === (opts.tone ?? "info") ? (same.count ?? 1) + 1 : 1,
      sticky: Boolean(opts.sticky),
      ...(opts.action ? { action: opts.action } : {}), ...(opts.subject ? { subject: opts.subject } : {}),
    };
    if (same) this.#items = this.#items.map((t) => t.id === id ? item : t);
    else this.#items.push(item);
    this.#stop(id);
    this.#timers.delete(id);
    if (!item.sticky) this.#timers.set(id, { remaining: this.duration, duration: this.duration });
    this.#refresh();
    return id;
  }

  dismiss(id: number): void {
    this.#stop(id);
    this.#timers.delete(id);
    this.#items = this.#items.filter((t) => t.id !== id);
    this.#refresh();
  }

  pause(id: number, paused: boolean): void {
    this.#items = this.#items.map((t) => t.id === id ? { ...t, paused } : t);
    this.#refresh();
  }

  pending(id: number, pending: boolean): void {
    this.#items = this.#items.map((item) => item.id === id ? { ...item, pending } : item);
    this.#refresh();
  }

  wrapped(id: number): void {
    const timer = this.#timers.get(id);
    if (!timer || timer.duration >= this.longDuration) return;
    this.#stop(id);
    timer.remaining += this.longDuration - timer.duration;
    timer.duration = this.longDuration;
    this.#refresh();
  }

  setActive(active: boolean): void {
    if (active === this.#active) return;
    this.#active = active;
    this.#refresh();
  }

  #stop(id: number): void {
    const t = this.#timers.get(id);
    if (!t || t.started === undefined) return;
    this.clock.clearTimeout(t.handle);
    t.remaining = Math.max(0, t.remaining - (this.clock.now() - t.started));
    delete t.started;
    delete t.handle;
  }

  #refresh(): void {
    this.#items.sort((a, b) => Number(b.tone === "error") - Number(a.tone === "error") || a.id - b.id);
    const visible = new Set(this.#items.slice(0, 3).map((t) => t.id));
    for (const item of this.#items) {
      const timer = this.#timers.get(item.id);
      if (!timer) continue;
      if (!visible.has(item.id) || !this.#active || item.paused || item.pending) this.#stop(item.id);
      else if (timer.started === undefined) {
        timer.started = this.clock.now();
        timer.handle = this.clock.setTimeout(() => this.dismiss(item.id), timer.remaining);
      }
    }
    this.change([...this.#items]);
  }
}
