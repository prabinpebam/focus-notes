/** PRF-08: the task tracker's timing rules, with a fake clock. */
import { describe, expect, it } from "vitest";
import { TaskTracker, type Clock, type TaskView } from "../src/index.ts";

const T = { signDelay: 300, signMinimum: 500, announceDelay: 1000, elapsedDelay: 3000, doneDuration: 1500 };

function fakeClock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => (timers.push({ at: now + ms, fn, id: ++id }), id),
    clearTimeout: (h) => (timers = timers.filter((t) => t.id !== h)),
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
      await Promise.resolve();
    }
    now = end;
    await Promise.resolve();
  };
  return { clock, advance };
}

function setup() {
  const { clock, advance } = fakeClock();
  let tasks: TaskView[] = [];
  const said: string[] = [];
  const tracker = new TaskTracker(T, { change: (t) => (tasks = t), announce: (k) => said.push(k) }, clock);
  const deferred = () => {
    let resolve!: () => void, reject!: (e: unknown) => void;
    const p = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
    return { p, resolve, reject };
  };
  return { tracker, advance, tasks: () => tasks, said, deferred };
}

describe("the task tracker (PRF-08)", () => {
  it("projects bounded rewrite progress and refuses stale or post-completion updates", async () => {
    const { tracker, tasks, deferred } = setup();
    const d = deferred();
    let update!: (progress: import("../src/tasks.ts").TaskProgress) => boolean;
    const run = tracker.run("rewrite.send", "rewrite.status.sending", (progress) => {
      update = progress;
      return d.p;
    });
    const first = { requestId: "attempt", seq: 1, stage: "checkpoint" as const, completedChunks: 0, totalChunks: 1, elapsedMs: 0, cancellable: true };
    expect(update(first)).toBe(true);
    first.completedChunks = 1;
    expect(tasks()[0]!.progress?.completedChunks).toBe(0);
    expect(update({ ...first, seq: 1 })).toBe(false);
    expect(update({ ...first, requestId: "other", seq: 2 })).toBe(false);
    expect(() => update({ ...first, seq: 2, totalChunks: 5 })).toThrow("invalid-task-progress");
    expect(update({ ...first, seq: 2, stage: "streaming" })).toBe(true);
    expect(tasks()[0]!.progress?.stage).toBe("streaming");
    d.resolve();
    await run;
    expect(update({ ...first, seq: 3 })).toBe(false);
    expect(tasks()).toEqual([]);
  });
  it("shows nothing for work that ends within wait.signDelay", async () => {
    const { tracker, advance, tasks, deferred } = setup();
    const d = deferred();
    const run = tracker.run("note.save", "task.saving", () => d.p);
    expect(tasks()[0]!.phase).toBe("ack");
    await advance(200);
    d.resolve();
    await run;
    expect(tasks()).toEqual([]);
  });
  it("shows the sign after 300 ms, holds it at least 500 ms, then says done for 1.5 s", async () => {
    const { tracker, advance, tasks, deferred } = setup();
    const d = deferred();
    const run = tracker.run("note.save", "task.saving", () => d.p, "task.saved");
    await advance(300);
    expect(tasks()[0]!.phase).toBe("on");
    await advance(100);
    d.resolve();
    await run;
    expect(tasks()[0]!.phase).toBe("on"); // held for the minimum
    await advance(400);
    expect(tasks()[0]!.phase).toBe("done");
    await advance(1500);
    expect(tasks()).toEqual([]);
  });
  it("announces after 1 s and at the end, and adds elapsed seconds after 3 s", async () => {
    const { tracker, advance, tasks, said, deferred } = setup();
    const d = deferred();
    const run = tracker.run("publish", "task.publishing", () => d.p, "task.published");
    await advance(999);
    expect(said).toEqual([]);
    await advance(1);
    expect(said).toEqual(["task.publishing"]);
    await advance(2000);
    expect(tasks()[0]!.elapsed).toBe(3);
    await advance(2000);
    expect(tasks()[0]!.elapsed).toBe(5);
    d.resolve();
    await run;
    expect(said).toEqual(["task.publishing", "task.published"]);
  });
  it("ends the sign at once on failure, rethrows, and reports idle", async () => {
    const { tracker, advance, tasks, deferred } = setup();
    const d = deferred();
    const run = tracker.run("note.save", "task.saving", () => d.p);
    await advance(400);
    d.reject(new Error("disk full"));
    await expect(run).rejects.toThrow("disk full");
    expect(tasks()).toEqual([]);
    await tracker.idle();
  });
});
