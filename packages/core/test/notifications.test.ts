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
  }, 6000, (next) => { items = next; });
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
  expect(items().map((t) => t.message)).toEqual(["failed", "third", "waiting"]);
  await vi.advanceTimersByTimeAsync(5999);
  expect(items().find((t) => t.id === waiting)).toBeDefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(items().map((t) => t.id)).toEqual([error]);
  queue.dismiss(error);
  expect(items()).toEqual([]);
});

it("hard-dismisses errors and unique recovery actions instead of expiring them", async () => {
  const { queue, items } = setup();
  queue.show("failed", { tone: "error" });
  queue.show("recover", { action: { command: "retry", label: "Retry" } });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(items()).toHaveLength(2);
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
