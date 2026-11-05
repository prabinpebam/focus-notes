import { afterEach, expect, it, vi } from "vitest";
import { NotificationQueue } from "../src/notifications.ts";
import type { ToastState } from "../src/app.ts";

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  let items: ToastState[] = [];
  const queue = new NotificationQueue({
    now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }, 6000, (next) => { items = next; }, 8000);
  return { queue, items: () => items };
}

it("keeps every queued outcome, prioritizes errors and starts clocks only for the three visible pills", async () => {
  const { queue, items } = setup();
  queue.show("first");
  queue.show("second");
  queue.show("third");
  const waiting = queue.show("waiting");
  const error = queue.show("failed", { tone: "error" });
  expect(items()).toHaveLength(5);
  expect(items()[0]?.id).toBe(error);
  await vi.advanceTimersByTimeAsync(6000);
  expect(items().map((t) => t.message)).toEqual(["third", "waiting"]);
  await vi.advanceTimersByTimeAsync(5999);
  expect(items().find((t) => t.id === waiting)).toBeDefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(items()).toEqual([]);
});

it("OFB.11: auto-dismisses errors and optional actions, including Deleted with Undo", async () => {
  const { queue, items } = setup();
  queue.show("failed", { tone: "error" });
  queue.show("Deleted", { action: { command: "undo", label: "Undo" } });
  await vi.advanceTimersByTimeAsync(5999);
  expect(items()).toHaveLength(2);
  expect(items().every(item => item.sticky === false)).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(items()).toEqual([]);
});

it("OFB.11: only explicit, reasoned decisions and operation controls stay until resolved", async () => {
  const { queue, items } = setup();
  queue.show("decide", { tone: "warning", action: { command: "review", label: "Review" }, sticky: true, mustReadReason: "recovery-decision" });
  queue.show("working", { tone: "progress", subject: "publish", sticky: true, mustReadReason: "operation-control" });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(items().map((item) => item.message)).toEqual(["decide", "working"]);
  const id = queue.show("published", { tone: "success", subject: "publish" });
  expect(items().find((item) => item.id === id)).toMatchObject({ tone: "success", sticky: false, count: 1 });
  await vi.advanceTimersByTimeAsync(6000);
  expect(items()).toMatchObject([{ message: "decide", sticky: true }]);
});

it("OFB.11: refuses an unreasoned must-read rather than silently making it sticky", () => {
  const { queue } = setup();
  expect(() => queue.show("failed", { sticky: true })).toThrow(/allowed inventory reason/);
});

it("pauses an automatic notice while its action is pending, then resumes its retained time", async () => {
  const { queue, items } = setup();
  const id = queue.show("Deleted", { action: { command: "undo", label: "Undo" } });
  await vi.advanceTimersByTimeAsync(1000);
  queue.pending(id, true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(items()).toHaveLength(1);
  queue.pending(id, false);
  await vi.advanceTimersByTimeAsync(4999);
  expect(items()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(items()).toEqual([]);
});

it("extends an actually wrapped notice to eight visible seconds without restarting its clock", async () => {
  const { queue, items } = setup();
  const id = queue.show("wrapped");
  await vi.advanceTimersByTimeAsync(1000);
  queue.wrapped(id);
  queue.wrapped(id);
  await vi.advanceTimersByTimeAsync(6999);
  expect(items()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(items()).toEqual([]);
});

it("coalesces repeated subjects in place and retries the newest attempted value", () => {
  const { queue, items } = setup();
  const first = queue.show("failed", { tone: "error", subject: "scale", action: { command: "scale", label: "Retry", args: { value: 1.1 } } });
  const repeat = queue.show("failed again", { tone: "error", subject: "scale", action: { command: "scale", label: "Retry", args: { value: 1.25 } } });
  expect(repeat).toBe(first);
  expect(items()).toMatchObject([{ count: 2, message: "failed again", action: { args: { value: 1.25 } } }]);
});

it("pauses on hover/focus and window blur without consuming time twice or resetting the remaining time", async () => {
  const { queue, items } = setup();
  const id = queue.show("finished");
  await vi.advanceTimersByTimeAsync(1000);
  queue.pause(id, true);
  await vi.advanceTimersByTimeAsync(1000);
  queue.pause(id, true);
  queue.setActive(false);
  queue.pause(id, false);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(items()).toHaveLength(1);
  queue.setActive(true);
  await vi.advanceTimersByTimeAsync(4999);
  expect(items()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(items()).toEqual([]);
});
