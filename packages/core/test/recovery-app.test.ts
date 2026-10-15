/**
 * QLT-03 and PRF-10 in the app core: unsaved text goes to the recovery journal at once, and at most
 * JOURNAL_INTERVAL_MS (0.15 s, DEF-14) after it arrives while typing goes on; without a journal (the browser)
 * the note itself is saved within UNJOURNALED_SAVE_MS (0.25 s); what a crash left is announced calmly at the next launch; and the warm-up
 * after start waits for the caret, pauses while someone types, and is off when the shell says so.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, JOURNAL_INTERVAL_MS, SAVE_DELAY_MS, UNJOURNALED_SAVE_MS, WarmUp, type PlatformBridge, type RestoredNote } from "../src/index.ts";

function fakeBridge(extra: Partial<PlatformBridge> = {}) {
  const files: Record<string, string> = { "/n/Welcome.md": "# Welcome\n" };
  const writes: [string, string][] = [];
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => files[p] ?? Promise.reject(new Error("missing")),
    writeNote: async (p, c) => {
      files[p] = c;
      writes.push([p, c]);
    },
    chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/Welcome.md",
    loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    ...extra,
  };
  return { bridge, files, writes };
}
const messages = {
  "command.note.setContent": "Set", "command.app.ready": "Ready",
  "toast.restored": "{count, plural, one {Restored what you were writing in “{note}” before Focus Notes closed.} other {Restored what you were writing in # notes before Focus Notes closed.}}",
  "toast.restoredCopy": "“{note}” changed while Focus Notes was closed, so what you were writing is kept beside it, in “{copy}”.",
};
afterEach(() => vi.useRealTimers());

describe("QLT-03: the recovery journal, from the app", () => {
  it("gets unsaved text at once, then every JOURNAL_INTERVAL_MS while typing goes on, and never saved text", async () => {
    vi.useFakeTimers();
    const journaled: [string, string, number][] = [];
    const f = fakeBridge({ journal: { write: async (p, t) => void journaled.push([p, t, Date.now()]), restored: async () => [] } });
    const app = createApp(f.bridge, messages);
    await app.start();
    const t0 = Date.now();
    // Typing that never pauses long enough to save: a handover every 100 ms for 2.5 s.
    for (let i = 1; i <= 25; i++) {
      await app.commands.run("note.setContent", { value: "x".repeat(i) });
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(f.writes).toEqual([]);
    const times = Array.from({ length: Math.floor(2500 / JOURNAL_INTERVAL_MS) + 1 }, (_, k) => k * JOURNAL_INTERVAL_MS);
    expect(journaled.map(([, , at]) => at - t0)).toEqual(times);
    expect(journaled.every(([p]) => p === "/n/Welcome.md")).toBe(true);
    // Each is the text as it was then: never more than JOURNAL_INTERVAL_MS behind what was handed over.
    expect(journaled.map(([, t]) => t.length)).toEqual(times.map((at) => Math.max(1, Math.ceil(at / 100))));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(f.writes).toEqual([["/n/Welcome.md", "x".repeat(25)]]);
    // The last text was written while saving; once saved, nothing more goes to the journal.
    const n = journaled.length;
    await vi.advanceTimersByTimeAsync(5 * JOURNAL_INTERVAL_MS);
    expect(journaled.length).toBe(n);
  });

  it("keeps a handover at once, not on a timer, when the journal wasn't just written; one just after a write waits only the rest of JOURNAL_INTERVAL_MS", async () => {
    vi.useFakeTimers();
    const journaled: [string, number][] = [];
    const f = fakeBridge({ journal: { write: async (_p, t) => void journaled.push([t, Date.now()]), restored: async () => [] } });
    const app = createApp(f.bridge, messages);
    await app.start();
    const t0 = Date.now();
    await app.commands.run("note.setContent", { value: "a" });
    // Kept within the same handover: no timer has run yet.
    expect(journaled).toEqual([["a", t0]]);
    await vi.advanceTimersByTimeAsync(50);
    await app.commands.run("note.setContent", { value: "ab" });
    expect(journaled.length).toBe(1);
    // The handover that arrived 50 ms after the write is kept when the interval since that write ends.
    await vi.advanceTimersByTimeAsync(JOURNAL_INTERVAL_MS - 50);
    expect(journaled).toEqual([["a", t0], ["ab", t0 + JOURNAL_INTERVAL_MS]]);
    // With the editor's 0.25 s handover, a key is kept within 0.4 s: most of QLT-03's second is headroom (DEF-14).
    expect(JOURNAL_INTERVAL_MS).toBe(150);
  });

  it("without a journal (the browser), typing that never pauses is saved at least every UNJOURNALED_SAVE_MS", async () => {
    vi.useFakeTimers();
    const f = fakeBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    for (let i = 1; i <= 30; i++) {
      await app.commands.run("note.setContent", { value: "y".repeat(i) });
      await vi.advanceTimersByTimeAsync(100);
    }
    // 3 s of typing: saved a UNJOURNALED_SAVE_MS (0.25 s) after each first unsaved change: at 0.25 s, 0.55 s, … 2.95 s.
    expect(UNJOURNALED_SAVE_MS).toBe(250);
    expect(f.writes.map(([, t]) => t.length)).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
    // A pause still saves after the usual short delay.
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(f.writes.at(-1)).toEqual(["/n/Welcome.md", "y".repeat(30)]);
  });

  it("says calmly what was restored after a crash, once, as an information toast", async () => {
    const restored: RestoredNote[][] = [[{ path: "/n/Welcome.md", title: "Welcome" }], []];
    const f = fakeBridge({ journal: { write: async () => {}, restored: async () => restored.shift() ?? [] } });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(app.store.state.ui.toasts.map((t) => [t.message, t.tone])).toEqual([["Restored what you were writing in “Welcome” before Focus Notes closed.", "info"]]);

    const many = fakeBridge({ journal: { write: async () => {}, restored: async () => [{ path: "/n/a.md", title: "A" }, { path: "/n/b.md", title: "B" }] } });
    const app2 = createApp(many.bridge, messages);
    await app2.start();
    expect(app2.store.state.ui.toasts[0]?.message).toBe("Restored what you were writing in 2 notes before Focus Notes closed.");
  });

  it("says where the text went when the note had changed since, so it was kept beside it", async () => {
    const f = fakeBridge({ journal: { write: async () => {}, restored: async () => [{ path: "/n/Welcome.md", title: "Welcome", copy: { path: "/n/Welcome (recovered).md", title: "Welcome (recovered)" } }] } });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(app.store.state.ui.toasts[0]?.message).toBe("“Welcome” changed while Focus Notes was closed, so what you were writing is kept beside it, in “Welcome (recovered)”.");
  });

  it("starts with no toast when there was nothing to restore, or the shell has no journal", async () => {
    const app = createApp(fakeBridge({ journal: { write: async () => {}, restored: async () => [] } }).bridge, messages);
    await app.start();
    expect(app.store.state.ui.toasts).toEqual([]);
  });
});

describe("PRF-10: the warm-up after start", () => {
  function clock() {
    let now = 0;
    const timers: { at: number; fn: () => void }[] = [];
    const idle: (() => void)[] = [];
    return {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => void timers.push({ at: now + ms, fn }),
      idle: (fn: () => void) => void idle.push(fn),
      async advance(ms: number) {
        const end = now + ms;
        for (;;) {
          timers.sort((a, b) => a.at - b.at);
          const t = timers[0];
          if (!t || t.at > end) break;
          timers.shift();
          now = t.at;
          t.fn();
          await Promise.resolve();
        }
        now = end;
      },
      async runIdle() {
        while (idle.length) {
          idle.shift()!();
          for (let i = 0; i < 5; i++) await Promise.resolve();
        }
      },
    };
  }

  it("does nothing until the caret is ready, then runs its tasks in order, at idle", async () => {
    const c = clock();
    const w = new WarmUp({ enabled: true, ...c, quietMs: 500 });
    const ran: string[] = [];
    w.add({ id: "views", run: () => void ran.push("views") });
    w.add({ id: "search", run: (report) => { report(4000, 10000); ran.push("search"); } });
    await c.runIdle();
    expect(ran).toEqual([]);
    expect(w.status().state).toBe("waiting");
    w.start();
    await c.runIdle();
    expect(ran).toEqual(["views", "search"]);
    await w.whenDone();
    expect(w.status()).toEqual({ state: "done" });
  });

  it("pauses while someone types, and goes on once the keys are quiet", async () => {
    const c = clock();
    const w = new WarmUp({ enabled: true, ...c, quietMs: 500 });
    const ran: number[] = [];
    w.add({ id: "views", run: () => void ran.push(c.now()) });
    w.typed();
    w.start();
    await c.runIdle();
    expect(ran).toEqual([]);
    await c.advance(300);
    w.typed(); // still typing
    await c.advance(300);
    await c.runIdle();
    expect(ran).toEqual([]);
    await c.advance(300);
    await c.runIdle();
    // Half a second after the last key, at the next idle moment.
    expect(ran).toHaveLength(1);
    expect(ran[0]).toBeGreaterThanOrEqual(800);
  });

  it("reports how far a task got, so a view opened early can say what it's waiting for", async () => {
    const c = clock();
    const w = new WarmUp({ enabled: true, ...c });
    let release!: () => void;
    w.add({ id: "search", run: (report) => { report(4000, 10000); return new Promise<void>((r) => (release = r)); } });
    w.start();
    await c.runIdle();
    expect(w.status()).toEqual({ state: "running", task: "search", done: 4000, total: 10000 });
    release();
    await w.whenDone();
    expect(w.status().state).toBe("done");
  });

  it("a task that fails doesn't stop the others; one added later runs too", async () => {
    const c = clock();
    const w = new WarmUp({ enabled: true, ...c });
    const ran: string[] = [];
    w.add({ id: "bad", run: () => { throw new Error("no"); } });
    w.add({ id: "good", run: () => void ran.push("good") });
    w.start();
    await c.runIdle();
    await w.whenDone();
    w.add({ id: "late", run: () => void ran.push("late") });
    await c.runIdle();
    await w.whenDone();
    expect(ran).toEqual(["good", "late"]);
  });

  it("is off when the shell says so (end-to-end tests): nothing runs, and it counts as done", async () => {
    const c = clock();
    const w = new WarmUp({ enabled: false, ...c });
    const run = vi.fn();
    w.add({ id: "views", run });
    w.start();
    await c.runIdle();
    await w.whenDone();
    expect(run).not.toHaveBeenCalled();
    expect(w.status().state).toBe("off");
  });

  it("the app starts it when the caret is ready, and typing pauses it", async () => {
    vi.useFakeTimers();
    const f = fakeBridge();
    const app = createApp(f.bridge, messages);
    const run = vi.fn();
    app.warmUp.add({ id: "views", run });
    await app.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).not.toHaveBeenCalled();
    await app.commands.run("note.setContent", { value: "typing" });
    await app.commands.run("app.ready");
    await vi.advanceTimersByTimeAsync(100);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    const off = createApp(fakeBridge({ warmUp: false }).bridge, messages);
    const never = vi.fn();
    off.warmUp.add({ id: "views", run: never });
    await off.start();
    await off.commands.run("app.ready");
    await vi.advanceTimersByTimeAsync(5000);
    expect(never).not.toHaveBeenCalled();
  });
});
