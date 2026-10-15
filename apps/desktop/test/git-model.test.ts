/**
 * The Git adapter's pure parts (WP-3.3): the status parser (PRF-07), the status cache (PRF-07),
 * commit messages (FIL-05), and the save cadence (EDT-11, D-23, D-07).
 */
import { describe, expect, it } from "vitest";
import { parseStatus, covers, pointerMoved, trackedChanges, STATUS_ARGS } from "../src/main/git/status.ts";
import { StatusCache, filesKey, gitFiles } from "../src/main/git/cache.ts";
import { batchMessage, changesOf, pointerMessage, resolveMessage, saveMessage } from "../src/main/git/message.ts";
import { bothChanged, parseRaw } from "../src/main/git/resolve.ts";
import { BACKUP_POLICY, backupDue, backupDueAt, Cadence, changedChars, pointerDelay, retryDelay, type Clock } from "../src/main/git/cadence.ts";

const z = (...records: string[]) => records.map((r) => `${r}\0`).join("");

describe("PRF-07: the status call and its parser (porcelain v2, -z)", () => {
  it("is one call with the agreed flags", () => {
    expect([...STATUS_ARGS]).toEqual(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=dirty"]);
  });
  it("reads the branch, upstream, ahead and behind, and the head commit", () => {
    const s = parseStatus(z("# branch.oid 1234567890abcdef1234567890abcdef12345678", "# branch.head main", "# branch.upstream origin/main", "# branch.ab +2 -3"));
    expect(s).toEqual({ oid: "1234567890abcdef1234567890abcdef12345678", branch: "main", upstream: "origin/main", ahead: 2, behind: 3, entries: [] });
  });
  it("knows a repository before its first commit, and a detached head", () => {
    const s = parseStatus(z("# branch.oid (initial)", "# branch.head (detached)"));
    expect(s.oid).toBeUndefined();
    expect(s.branch).toBeUndefined();
    expect(s.upstream).toBeUndefined();
  });
  it("reads changed, renamed, unmerged, untracked, and ignored entries, with spaces and Unicode in paths", () => {
    const h = "a".repeat(40);
    const s = parseStatus(z(
      "# branch.oid " + h, "# branch.head main",
      `1 .M N... 100644 100644 100644 ${h} ${h} notes/On focus.md`,
      `2 R. N... 100644 100644 100644 ${h} ${h} R100 archive/new name.md`, "drafts/old name.md",
      `u UU N... 100644 100644 100644 100644 ${h} ${h} ${h} notes/clash.md`,
      "? notes/Café ☕.md",
      "! build/x",
      `1 .M SC.. 160000 160000 160000 ${h} ${h} private`,
    ));
    expect(s.entries).toEqual([
      { kind: "changed", xy: ".M", sub: "N...", path: "notes/On focus.md" },
      { kind: "renamed", xy: "R.", sub: "N...", path: "archive/new name.md", from: "drafts/old name.md" },
      { kind: "unmerged", xy: "UU", sub: "N...", path: "notes/clash.md" },
      { kind: "untracked", xy: "??", sub: "N...", path: "notes/Café ☕.md" },
      { kind: "ignored", xy: "!!", sub: "N...", path: "build/x" },
      { kind: "changed", xy: ".M", sub: "SC..", path: "private" },
    ]);
    expect(pointerMoved(s, "private")).toBe(true);
    expect(trackedChanges(s).map((e) => e.path)).toEqual(["notes/On focus.md", "archive/new name.md", "notes/clash.md"]);
  });
  it("refuses a record it doesn't know", () => {
    expect(() => parseStatus(z("X what"))).toThrow();
  });
  it("matches a path or anything inside a folder, not a sibling with the same prefix", () => {
    expect(covers("notes/a", "notes/a")).toBe(true);
    expect(covers("notes/a", "notes/a/b.md")).toBe(true);
    expect(covers("notes/a", "notes/ab.md")).toBe(false);
  });
});

describe("PRF-07: the status cache", () => {
  const setup = () => {
    let generation = 0;
    let now = 0;
    let calls = 0;
    let fail = false;
    let duringAsk: (() => void) | undefined;
    const cache = new StatusCache<number>({
      key: async () => `g${generation}`,
      now: () => now,
      ask: async () => {
        calls++;
        duringAsk?.();
        if (fail) throw new Error("git failed");
        return calls;
      },
    });
    return {
      cache,
      get calls() { return calls; },
      bump: () => generation++,
      advance: (ms: number) => { now += ms; },
      fail: (f: boolean) => { fail = f; },
      during: (fn: (() => void) | undefined) => { duringAsk = fn; },
    };
  };
  it("answers from the cache while the key matches", async () => {
    const t = setup();
    expect(await t.cache.get()).toBe(1);
    expect(await t.cache.get()).toBe(1);
    expect(t.calls).toBe(1);
  });
  it("asks again when the content generation or Git's files change", async () => {
    const t = setup();
    await t.cache.get();
    t.bump();
    expect(await t.cache.get()).toBe(2);
  });
  it("keeps an answer for at most 30 s", async () => {
    const t = setup();
    await t.cache.get();
    t.advance(29_999);
    expect(await t.cache.get()).toBe(1);
    t.advance(1);
    expect(await t.cache.get()).toBe(2);
  });
  it("shares a call in flight", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.cache.get(), t.cache.get()]);
    expect([a, b]).toEqual([1, 1]);
    expect(t.calls).toBe(1);
  });
  it("stores only a stable answer: a change while Git answers isn't cached", async () => {
    const t = setup();
    t.during(() => t.bump());
    expect(await t.cache.get()).toBe(1);
    t.during(undefined);
    expect(await t.cache.get()).toBe(2);
    expect(await t.cache.get()).toBe(2);
  });
  it("never stores a failure", async () => {
    const t = setup();
    t.fail(true);
    await expect(t.cache.get()).rejects.toThrow("git failed");
    t.fail(false);
    expect(await t.cache.get()).toBe(2);
  });
  it("asks fresh for commits, and is cleared after the app commits, pushes, or pulls", async () => {
    const t = setup();
    await t.cache.get();
    expect(await t.cache.fresh()).toBe(2);
    t.cache.clear();
    expect(await t.cache.get()).toBe(3);
    expect(t.cache.asked).toBe(3);
  });
  it("an answer asked before a clear isn't stored after it", async () => {
    const t = setup();
    t.during(() => t.cache.clear());
    await t.cache.get();
    t.during(undefined);
    expect(await t.cache.get()).toBe(2);
  });
  it("keys on the times and sizes of Git's own files in both Git folders", async () => {
    const files = gitFiles("main", "origin/main");
    expect(files.map((f) => f.replaceAll("\\", "/"))).toEqual(["index", "HEAD", "logs/HEAD", "packed-refs", "FETCH_HEAD", "refs/heads/main", "refs/remotes/origin/main"]);
    const seen: string[] = [];
    let size = 1;
    const fake = async (p: string) => {
      seen.push(p);
      if (p.endsWith("FETCH_HEAD")) throw new Error("missing");
      return { mtimeMs: 5, size };
    };
    const a = await filesKey(["/r/.git", "/r/.git"], files, fake);
    expect(seen).toHaveLength(files.length);
    size = 2;
    expect(await filesKey(["/r/.git"], files, fake)).not.toBe(a);
    expect(a).toContain("-");
  });
});

describe("FIL-05: readable commit messages", () => {
  it("says what one saved note's change is", () => {
    expect(saveMessage([{ status: "M", path: "essays/on-focus.md" }])).toBe("Update essays/on-focus.md");
    expect(saveMessage([{ status: "A", path: "notes/ideas.md" }])).toBe("Create notes/ideas.md");
    expect(saveMessage([{ status: "R", from: "notes/untitled.md", path: "notes/on-focus.md" }])).toBe("Rename notes/untitled.md → notes/on-focus.md");
  });
  it("counts several notes and lists each", () => {
    expect(saveMessage([{ status: "M", path: "a.md" }, { status: "M", path: "b.md" }])).toBe("Update 2 notes\n\nUpdate a.md\nUpdate b.md");
    expect(saveMessage([{ status: "M", path: "a.md" }, { status: "A", path: "b.md" }])).toBe("Save 2 changes\n\nUpdate a.md\nCreate b.md");
  });
  it("pairs a known move into a rename, including everything in a moved folder", () => {
    const entries = [
      { kind: "changed" as const, xy: ".D", sub: "N...", path: "drafts/a.md" },
      { kind: "untracked" as const, xy: "??", sub: "N...", path: "archive/drafts/a.md" },
      { kind: "changed" as const, xy: ".M", sub: "N...", path: "links.md" },
    ];
    expect(changesOf(entries, [["drafts", "archive/drafts"]])).toEqual([
      { status: "R", from: "drafts/a.md", path: "archive/drafts/a.md" },
      { status: "M", path: "links.md" },
    ]);
    // Without the move it's a delete and a create.
    expect(changesOf(entries).map((c) => c.status)).toEqual(["A", "D", "M"]);
  });
  it("says a batch as its operation, with its link updates", () => {
    expect(batchMessage([{ op: "move", from: "drafts/a.md", to: "archive/a.md" }])).toBe("Move drafts/a.md → archive/a.md");
    expect(batchMessage([{ op: "move", from: "notes/a.md", to: "notes/b.md" }, { op: "write", path: "notes/b.md" }])).toBe("Rename notes/a.md → notes/b.md");
    expect(batchMessage([{ op: "move", from: "a.md", to: "x/a.md" }, { op: "write", path: "c.md" }, { op: "write", path: "d.md" }]))
      .toBe("Move a.md → x/a.md\n\nUpdate links in 2 notes");
    expect(batchMessage([{ op: "createFolder", path: "notes/drafts" }])).toBe("Create folder notes/drafts");
    expect(batchMessage([{ op: "delete", path: "notes/old.md" }])).toBe("Delete notes/old.md");
    expect(batchMessage([{ op: "delete", path: "a.md" }, { op: "delete", path: "b" }])).toBe("Delete 2 items\n\nDelete a.md\nDelete b");
    expect(batchMessage([{ op: "move", from: "a.md", to: "box/a.md" }, { op: "move", from: "b.md", to: "box/b.md" }]))
      .toBe("Move 2 items to box\n\nMove a.md → box/a.md\nMove b.md → box/b.md");
  });
  it("names a new folder by its folder, not its .gitkeep, and the pointer by its commit", () => {
    expect(saveMessage([{ status: "A", path: "notes/drafts/.gitkeep" }])).toBe("Create folder notes/drafts");
    expect(pointerMessage("0123456789abcdef")).toBe("Update private notes to 0123456");
  });
});

class FakeClock implements Clock {
  t = 0;
  timers = new Map<number, { at: number; fn: () => void }>();
  #id = 1;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.#id++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => void this.timers.delete(h as number);
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = [...this.timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

describe("FIL-10, FIL-12: restoring and settling conflicts", () => {
  it("says a restore and a resolution as what they are", () => {
    expect(batchMessage([{ op: "restore", path: "notes/a.md" }])).toBe("Restore notes/a.md");
    expect(batchMessage([{ op: "restore", path: "notes/a.md" }, { op: "restore", path: "notes/b.md" }])).toBe("Restore 2 notes\n\nRestore notes/a.md\nRestore notes/b.md");
    expect(resolveMessage([{ path: "notes/a.md", choice: "mine" }, { path: "notes/b.md", choice: "both", copy: "notes/b-conflict-copy.md" }, { path: "notes/c.md", choice: "theirs", copy: "notes/c-your-version.md" }])).toBe(
      "Resolve conflicts in 3 notes\n\nKeep this computer's version: notes/a.md\nKeep both: notes/b.md and notes/b-conflict-copy.md\nTake the other version: notes/c.md (this computer's kept as notes/c-your-version.md)",
    );
  });

  it("finds the paths both sides changed to different results, from `git diff --raw -z`", () => {
    const z = (o: string) => o.repeat(40);
    const raw = (rows: [string, string, string][]) => rows.map(([st, oid, p]) => `:100644 100644 ${z("1")} ${oid} ${st}\0${p}\0`).join("");
    const mine = parseRaw(raw([["M", z("a"), "notes/same.md"], ["M", z("b"), "notes/both.md"], ["D", z("0"), "notes/gone here.md"], ["M", z("c"), "notes/mine.md"]]));
    const theirs = parseRaw(raw([["M", z("a"), "notes/same.md"], ["M", z("d"), "notes/both.md"], ["M", z("e"), "notes/gone here.md"], ["A", z("f"), "notes/theirs.md"]]));
    expect(bothChanged({ base: "", head: "", upstream: "", mine, theirs }).sort()).toEqual(["notes/both.md", "notes/gone here.md"]);
  });
});

describe("EDT-11 and D-133: the backup policy", () => {
  const p = BACKUP_POLICY;
  const u = (chars: number, since: number, lastEditAt: number) => ({ chars, since, lastEditAt });
  it("counts the characters changed: inserted plus deleted, between the common start and end", () => {
    expect(changedChars("abc", "abc")).toBe(0);
    expect(changedChars("abc", "abXc")).toBe(1);
    expect(changedChars("hello world", "hello there")).toBe(10);
    expect(changedChars("", "x".repeat(250))).toBe(250);
    expect(changedChars("aaaa", "aa")).toBe(2);
  });
  it("after a 60 s pause, backs up 200 characters or more, or a first change over 10 minutes old", () => {
    expect(backupDueAt(u(0, 0, 0), p)).toBeUndefined();
    expect(backupDueAt(u(200, 0, 5_000), p)).toBe(65_000);
    expect(backupDue("idle", u(199, 0, 5_000), 65_000, p)).toBe(false);
    // A small change waits until it's 10 minutes old, and then for the pause.
    expect(backupDueAt(u(50, 0, 5_000), p)).toBe(600_000);
    expect(backupDueAt(u(50, 0, 590_000), p)).toBe(650_000);
  });
  it("backs up 2,000 characters or more after a 10 s pause", () => {
    expect(backupDueAt(u(2_000, 0, 5_000), p)).toBe(15_000);
    expect(backupDueAt(u(1_999, 0, 5_000), p)).toBe(65_000);
  });
  it("never lets a change wait past 30 minutes: then the next 10 s pause backs up", () => {
    // Typing with pauses under a minute: the 10-minute rule never gets its pause; the ceiling does.
    expect(backupDueAt(u(150, 0, 1_795_000), p)).toBe(1_805_000);
    expect(backupDueAt(u(150, 0, 1_700_000), p)).toBe(1_760_000);
  });
  it("switching or closing a note backs up only when a threshold is met; quitting and Save to cloud always do", () => {
    expect(backupDue("switch", u(199, 0, 0), 1_000, p)).toBe(false);
    expect(backupDue("switch", u(200, 0, 0), 1_000, p)).toBe(true);
    expect(backupDue("switch", u(10, 0, 0), 600_001, p)).toBe(true);
    expect(backupDue("switch", u(0, 0, 0), 1_000, p)).toBe(false);
    for (const e of ["quit", "save"] as const) expect(backupDue(e, u(0, 0, 0), 1_000, p)).toBe(true);
    expect(backupDue("quit", u(1, 0, 0), 1, p)).toBe(true);
  });
  it("runs one timer for the earliest moment due, restarted by each write, and starts counting again after a backup", () => {
    const clock = new FakeClock();
    const runs: string[] = [];
    const c = new Cadence({ clock, sync: (r) => runs.push(r) });
    c.edited(150);
    clock.advance(59_000);
    c.edited(60);
    clock.advance(59_000);
    expect(runs).toEqual([]);
    clock.advance(1_000);
    expect(runs).toEqual(["idle"]);
    expect(c.waiting).toBe(false);
    // Small edits under the threshold: no backup after the pause.
    c.edited(20);
    clock.advance(60_000);
    expect(runs).toEqual(["idle"]);
    expect(c.switching()).toBe(false);
    // A big edit backs up after a 10 s pause.
    c.edited(2_000);
    clock.advance(10_000);
    expect(runs).toEqual(["idle", "idle"]);
  });
  it("Save to cloud and quitting back up at once and cancel the timer; switching does when a threshold is met", () => {
    const clock = new FakeClock();
    const runs: string[] = [];
    const c = new Cadence({ clock, policy: { idleMs: 1000 }, sync: (r) => runs.push(r) });
    c.edited(500);
    c.now("save");
    clock.advance(5000);
    expect(runs).toEqual(["save"]);
    c.edited(500);
    expect(c.switching()).toBe(true);
    c.now("quit");
    clock.advance(5000);
    expect(runs).toEqual(["save", "switch", "quit"]);
  });  it("moves the pointer at most once per gap (D-07), and backs off retries", () => {
    expect(pointerDelay(undefined, 1000)).toBe(0);
    expect(pointerDelay(0, 60_000)).toBe(240_000);
    expect(pointerDelay(0, 300_000)).toBe(0);
    expect(pointerDelay(0, 1000, 500)).toBe(0);
    expect([0, 1, 2, 3, 4, 5].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  });
});
