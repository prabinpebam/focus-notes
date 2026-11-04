import { afterEach, expect, it, vi } from "vitest";
import { CommitTracker, type CommitView } from "../src/tasks.ts";

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  let items: CommitView[] = [];
  const tracker = new CommitTracker(200, (next) => { items = next; }, {
    now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return { tracker, items: () => items };
}

it("shows pending immediately for at least 200 ms, then confirmed for at least 200 ms", async () => {
  const { tracker, items } = setup();
  const run = tracker.run("name", "project.name", "Draft", async () => {});
  expect(items()).toMatchObject([{ phase: "pending" }]);
  await vi.advanceTimersByTimeAsync(199);
  expect(items()[0]?.phase).toBe("pending");
  await vi.advanceTimersByTimeAsync(1);
  await run;
  expect(items()[0]?.phase).toBe("confirmed");
  await vi.advanceTimersByTimeAsync(199);
  expect(items()[0]?.phase).toBe("confirmed");
  await vi.advanceTimersByTimeAsync(1);
  expect(items()).toEqual([]);
});

it("keeps a failed draft until retry or revert, including a rejected instant write", async () => {
  const { tracker, items } = setup();
  const failed = tracker.run("name", "project.name", "Keep me", async () => { throw new Error("disk full"); });
  const assertion = expect(failed).rejects.toThrow("disk full");
  await vi.advanceTimersByTimeAsync(200);
  await assertion;
  expect(items()).toMatchObject([{ phase: "failed", value: "Keep me" }]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(items()[0]?.phase).toBe("failed");
  tracker.clear("name");
  expect(items()).toEqual([]);
});

it("locks only the pending target and an earlier confirmation timer cannot clear a newer commit", async () => {
  const { tracker, items } = setup();
  const first = tracker.run("name", "project.name", "One", async () => {});
  await expect(tracker.run("name", "project.name", "Two", async () => {})).rejects.toThrow("already pending");
  const other = tracker.run("colour", "project.accent", "blue", async () => {});
  await vi.advanceTimersByTimeAsync(200);
  await Promise.all([first, other]);
  let finish!: () => void;
  const second = tracker.run("name", "project.name", "Two", () => new Promise((resolve) => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(300);
  expect(items()).toMatchObject([{ target: "name", phase: "pending", value: "Two" }]);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  await second;
  expect(items()[0]?.phase).toBe("confirmed");
});
