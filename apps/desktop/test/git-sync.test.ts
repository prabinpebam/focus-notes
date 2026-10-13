/**
 * The Git adapter against real Git in temporary folders (WP-3.3): a bare remote for each
 * repository and a workspace clone with `private/` as a submodule. Covers save → commit → push
 * (EDT-11), private first and then the pointer (D-07), one commit per Files batch and deletes in
 * history (FIL-05), offline pushes that wait without losing anything, pulls, the lock file, the
 * status cache (PRF-07), and no credential in any argument (SEC-03).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitSync, type GitSyncOptions } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { LOCK_NAME, releaseLock, takeLock } from "../src/main/git/lock.ts";
import type { Clock } from "../src/main/git/cadence.ts";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "protocol.file.allow=always", "-c", "core.autocrlf=false", ...(cwd.endsWith(".git") ? [`--git-dir=${cwd}`] : []), ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
const configure = (dir: string) => {
  for (const [k, v] of [["user.name", "Test"], ["user.email", "test@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git(dir, "config", k!, v!);
};
const write = (p: string, text: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

/** A notes repository with `private/` as a submodule, each with a bare remote, cloned as a workspace. Built once. */
let built: string | undefined;
function template(): string {
  if (built) return built;
  const root = mkdtempSync(join(tmpdir(), "fn-git-"));
  const notesRemote = join(root, "notes.git");
  const privateRemote = join(root, "private.git");
  git(root, "init", "-q", "--bare", "-b", "main", notesRemote);
  git(root, "init", "-q", "--bare", "-b", "main", privateRemote);
  const seedP = join(root, "seed-private");
  git(root, "clone", "-q", privateRemote, seedP);
  configure(seedP);
  write(join(seedP, "notes", "welcome.md"), "# Welcome\n");
  git(seedP, "add", "-A");
  git(seedP, "commit", "-q", "-m", "Start");
  git(seedP, "push", "-q", "-u", "origin", "main");
  const seedN = join(root, "seed-notes");
  git(root, "clone", "-q", notesRemote, seedN);
  configure(seedN);
  write(join(seedN, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  write(join(seedN, "notes", "hello.md"), "# Hello\n\nSee [the list](list.md).\n");
  write(join(seedN, "notes", "list.md"), "# List\n");
  git(seedN, "submodule", "add", "-q", "-b", "main", privateRemote, "private");
  git(seedN, "add", "-A");
  git(seedN, "commit", "-q", "-m", "Start");
  git(seedN, "push", "-q", "-u", "origin", "main");
  const ws = join(root, "ws");
  git(root, "clone", "-q", "--recurse-submodules", notesRemote, ws);
  configure(ws);
  configure(join(ws, "private"));
  git(join(ws, "private"), "checkout", "-q", "main");
  rmSync(seedN, { recursive: true, force: true });
  rmSync(seedP, { recursive: true, force: true });
  return (built = root);
}
/** A fresh copy of the template, its remotes pointing at its own bare repositories (Git on Windows is slow to set up). */
function instance() {
  const root = mkdtempSync(join(tmpdir(), "fn-git-"));
  cpSync(template(), root, { recursive: true });
  const ws = join(root, "ws");
  const notesRemote = join(root, "notes.git");
  const privateRemote = join(root, "private.git");
  git(ws, "remote", "set-url", "origin", notesRemote);
  git(join(ws, "private"), "remote", "set-url", "origin", privateRemote);
  return { root, ws, notesRemote, privateRemote };
}
const subject = (repo: string, ref = "main") => git(repo, "log", "-1", "--format=%s", ref);
const count = (repo: string, ref = "main") => Number(git(repo, "rev-list", "--count", ref));

class FakeClock implements Clock {
  t = 1_000_000;
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
    this.t += ms;
    for (const [id, v] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (v.at > this.t) continue;
      this.timers.delete(id);
      v.fn();
    }
  }
}

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const opened: GitSync[] = [];
const spawned: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
const SECRET = "ghp_NotARealTokenButLooksLikeOne1234567890";
async function open(folder: string, extra: Partial<GitSyncOptions> = {}): Promise<GitSync> {
  const run = createRunner({ env: { ...process.env, GH_TOKEN: SECRET, GITHUB_TOKEN: SECRET }, onSpawn: (args, env) => spawned.push({ args, env }) });
  const s = await GitSync.open({ folder, run, clock: new FakeClock(), ...extra });
  if (!s) throw new Error("not a repository");
  opened.push(s);
  return s;
}
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});

describe("EDT-11 and D-07: save, commit, and push, private first", () => {
  it("commits a saved note by path with a readable message, pushes it, then moves the pointer to the pushed commit", async () => {
    const { ws, notesRemote, privateRemote } = instance();
    const s = await open(ws);
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nA new line.\n");
    // A file another program changed isn't the app's to commit.
    writeFileSync(join(ws, "notes", "outside.md"), "# Not mine\n");
    s.written(note);
    const from = spawned.length;
    const r = await s.request("save");
    expect(r.problem).toBeUndefined();
    expect(subject(privateRemote)).toBe("Update notes/welcome.md");
    expect(git(privateRemote, "show", "main:notes/welcome.md")).toBe("# Welcome\n\nA new line.");
    const privateHead = git(privateRemote, "rev-parse", "main");
    expect(git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2]).toBe(privateHead);
    expect(subject(notesRemote)).toBe(`Update private notes to ${privateHead.slice(0, 7)}`);
    expect(git(ws, "status", "--porcelain", "--", "notes/outside.md")).toBe("?? notes/outside.md");
    // Private first: its push comes before the notes repository's.
    const pushes = spawned.slice(from).filter((c) => c.args.includes("push")).map((c) => c.args[1]);
    expect(pushes).toEqual([join(ws, "private"), ws]);
  });

  it("moves the pointer at most once per gap in a writing session, and on quit whatever the gap", async () => {
    const { ws, notesRemote, privateRemote } = instance();
    const clock = new FakeClock();
    const s = await open(ws, { clock, pointerGapMs: 300_000 });
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nOne.\n");
    s.written(note);
    await s.request("save");
    expect(count(notesRemote)).toBe(2);
    clock.advance(60_000);
    writeFileSync(note, "# Welcome\n\nTwo.\n");
    s.written(note);
    await s.request("save");
    expect(count(privateRemote)).toBe(3);
    expect(count(notesRemote), "no second public commit within the gap").toBe(2);
    clock.advance(240_000);
    await s.sync("retry");
    expect(count(notesRemote)).toBe(3);
    expect(git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2]).toBe(git(privateRemote, "rev-parse", "main"));
    clock.advance(1000);
    writeFileSync(note, "# Welcome\n\nThree.\n");
    s.written(note);
    await s.quit();
    expect(count(notesRemote)).toBe(4);
    expect(git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2]).toBe(git(privateRemote, "rev-parse", "main"));
  });

  it("commits after 60 s with no typing (the idle commit)", async () => {
    const { ws, privateRemote } = instance();
    const clock = new FakeClock();
    const s = await open(ws, { clock });
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nIdle.\n");
    s.written(note);
    clock.advance(59_000);
    await s.sync("retry");
    expect(count(privateRemote)).toBe(1);
    clock.advance(1_000);
    await s.sync("retry");
    expect(count(privateRemote)).toBe(2);
    expect(subject(privateRemote)).toBe("Update notes/welcome.md");
  });

  it("commits a renamed note as a rename (FIL-07)", async () => {
    const { ws, privateRemote } = instance();
    const s = await open(ws);
    const a = join(ws, "private", "notes", "welcome.md");
    const b = join(ws, "private", "notes", "hello-there.md");
    renameSync(a, b);
    writeFileSync(b, "# Hello there\n");
    s.renamed(a, b);
    s.written(b);
    await s.request("switch");
    expect(subject(privateRemote)).toBe("Rename notes/welcome.md → notes/hello-there.md");
  });
});

describe("FIL-05: every file operation is a commit", () => {
  it("makes one Files batch (a move with its link updates) one commit with a readable message", async () => {
    const { ws, notesRemote } = instance();
    const s = await open(ws);
    const before = count(ws);
    mkdirSync(join(ws, "notes", "archive"));
    writeFileSync(join(ws, "notes", "archive", ".gitkeep"), "");
    renameSync(join(ws, "notes", "list.md"), join(ws, "notes", "archive", "list.md"));
    writeFileSync(join(ws, "notes", "hello.md"), "# Hello\n\nSee [the list](archive/list.md).\n");
    const problem = await s.commitBatch([
      { op: "createFolder", path: join(ws, "notes", "archive") },
      { op: "move", from: join(ws, "notes", "list.md"), to: join(ws, "notes", "archive", "list.md") },
      { op: "write", path: join(ws, "notes", "hello.md") },
    ]);
    expect(problem).toBeUndefined();
    expect(count(ws)).toBe(before + 1);
    expect(git(ws, "log", "-1", "--format=%B")).toBe("Change 2 items\n\nCreate folder notes/archive\nMove notes/list.md → notes/archive/list.md\nUpdate links in 1 note");
    expect(git(ws, "show", "--name-status", "-M", "--format=", "HEAD").split("\n").sort()).toEqual(["A\tnotes/archive/.gitkeep", "M\tnotes/hello.md", "R100\tnotes/list.md\tnotes/archive/list.md"]);
    // The batch is pushed in the background.
    await s.sync("retry");
    expect(git(notesRemote, "rev-parse", "main")).toBe(git(ws, "rev-parse", "HEAD"));
  });

  it("commits a delete, so the note can be recovered from history", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const p = join(ws, "notes", "list.md");
    const text = readFileSync(p, "utf8");
    rmSync(p);
    expect(await s.commitBatch([{ op: "delete", path: p }])).toBeUndefined();
    expect(subject(ws, "HEAD")).toBe("Delete notes/list.md");
    const deletedIn = git(ws, "log", "--diff-filter=D", "--format=%H", "--", "notes/list.md");
    expect(git(ws, "show", `${deletedIn}^:notes/list.md`)).toBe(text.trim());
  });

  it("makes each repository's part of a batch one commit there", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const pub = join(ws, "notes", "list.md");
    const priv = join(ws, "private", "notes", "welcome.md");
    rmSync(pub);
    rmSync(priv);
    const before = [count(ws), count(join(ws, "private"))];
    await s.commitBatch([{ op: "delete", path: pub }, { op: "delete", path: priv }]);
    expect(count(join(ws, "private"))).toBe(before[1]! + 1);
    expect(subject(join(ws, "private"), "HEAD")).toBe("Delete notes/welcome.md");
    expect(git(ws, "log", "--format=%s", "-2", "HEAD")).toContain("Delete notes/list.md");
  });
});

describe("Offline, pulls, and conflicts (Desktop and Git → Save and sync)", () => {
  it("keeps commits when a push fails offline, never points at them, and pushes them when the network is back", async () => {
    const { ws, notesRemote, privateRemote } = instance();
    const s = await open(ws);
    const pointer = git(notesRemote, "ls-tree", "main", "private");
    renameSync(privateRemote, `${privateRemote}.away`);
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nWritten offline.\n");
    s.written(note);
    const r = await s.request("save");
    expect(r).toMatchObject({ state: "problem", problem: "offline" });
    expect(subject(join(ws, "private"), "HEAD")).toBe("Update notes/welcome.md");
    expect(git(notesRemote, "ls-tree", "main", "private"), "the pointer never references an unpushed commit").toBe(pointer);
    expect(git(ws, "diff", "--cached", "--name-only"), "nothing half-staged in the notes repository").toBe("");
    renameSync(`${privateRemote}.away`, privateRemote);
    const again = await s.sync("retry");
    expect(again.problem).toBeUndefined();
    expect(git(privateRemote, "show", "main:notes/welcome.md")).toBe("# Welcome\n\nWritten offline.");
    expect(git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2]).toBe(git(privateRemote, "rev-parse", "main"));
  });

  it("pulls with rebase when the branch is behind and clean", async () => {
    const { root, ws, privateRemote } = instance();
    const other = join(root, "other");
    git(root, "clone", "-q", privateRemote, other);
    configure(other);
    write(join(other, "notes", "from-elsewhere.md"), "# Elsewhere\n");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "Elsewhere");
    git(other, "push", "-q");
    const s = await open(ws);
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nMine.\n");
    s.written(note);
    const r = await s.request("save");
    expect(r.problem).toBeUndefined();
    expect(readFileSync(join(ws, "private", "notes", "from-elsewhere.md"), "utf8")).toBe("# Elsewhere\n");
    expect(git(privateRemote, "log", "--format=%s", "main").split("\n")).toEqual(["Update notes/welcome.md", "Elsewhere", "Start"]);
  });

  it("stops when a pull can't apply cleanly: never mid-rebase, both versions kept, a problem shown", async () => {
    const { root, ws, privateRemote } = instance();
    const other = join(root, "other");
    git(root, "clone", "-q", privateRemote, other);
    configure(other);
    writeFileSync(join(other, "notes", "welcome.md"), "# Welcome\n\nTheirs.\n");
    git(other, "commit", "-q", "-am", "Theirs");
    git(other, "push", "-q");
    const s = await open(ws);
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nMine.\n");
    s.written(note);
    const r = await s.request("save");
    expect(r).toMatchObject({ state: "problem", problem: "conflict" });
    const p = join(ws, "private");
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nMine.\n");
    expect(git(p, "show", "HEAD:notes/welcome.md")).toBe("# Welcome\n\nMine.");
    expect(git(p, "show", "origin/main:notes/welcome.md")).toBe("# Welcome\n\nTheirs.");
    const gitDir = git(p, "rev-parse", "--absolute-git-dir");
    expect(existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"))).toBe(false);
  });
});

describe("Repositories, the lock, the status cache, and credentials", () => {
  it("isn't a repository unless the workspace folder is one (saving stays local)", async () => {
    const plain = mkdtempSync(join(tmpdir(), "fn-plain-"));
    expect(await GitSync.open({ folder: plain })).toBeUndefined();
    const { ws } = instance();
    expect(await GitSync.open({ folder: join(ws, "notes") }), "a folder inside a repository isn't the workspace's repository").toBeUndefined();
  });

  it("holds .git/focus-notes.lock while open, and takes over a stale one", async () => {
    const { ws } = instance();
    const gitDir = git(ws, "rev-parse", "--absolute-git-dir");
    const lock = join(gitDir, LOCK_NAME);
    writeFileSync(lock, JSON.stringify({ pid: 2 ** 31 - 2 }));
    const s = await open(ws);
    expect(JSON.parse(readFileSync(lock, "utf8")).pid).toBe(process.pid);
    expect(await takeLock(gitDir, 4242, () => true), "another tool can't take it while the app runs").toBe(false);
    await s.dispose();
    expect(existsSync(lock)).toBe(false);
    // While another running tool holds it, the app commits nothing and says so.
    // The test runner's parent process is running.
    await takeLock(gitDir, process.ppid);
    const blocked = await GitSync.open({ folder: ws, clock: new FakeClock() });
    opened.push(blocked!);
    expect(blocked!.report).toMatchObject({ state: "problem", problem: "locked" });
    await releaseLock(gitDir, process.ppid);
  });

  it("asks one status per repository, in parallel and without optional locks, and answers again from the cache (PRF-07)", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const from = spawned.length;
    await s.status();
    const calls = spawned.slice(from).filter((c) => c.args.includes("status"));
    expect(calls.map((c) => c.args[1]).sort()).toEqual([ws, join(ws, "private")].sort());
    for (const c of calls) {
      expect(c.args.slice(2)).toEqual(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=dirty"]);
      expect(c.env.GIT_OPTIONAL_LOCKS).toBe("0");
    }
    const again = spawned.length;
    await s.status();
    expect(spawned.length, "a cached answer starts no Git process").toBe(again);
    // A write changes the key, and a commit always asks fresh.
    writeFileSync(join(ws, "notes", "hello.md"), "# Hello again\n");
    s.written(join(ws, "notes", "hello.md"));
    await s.status();
    expect(spawned.length).toBe(again + 2);
  });

  it("never puts a credential, a note name, or a commit message in a process argument, and never prompts (SEC-03)", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nSecret plans.\n");
    s.written(note);
    await s.request("save");
    rmSync(join(ws, "notes", "list.md"));
    await s.commitBatch([{ op: "delete", path: join(ws, "notes", "list.md") }]);
    expect(spawned.length).toBeGreaterThan(5);
    for (const { args, env } of spawned) {
      const all = args.join(" ");
      expect(all).not.toContain(SECRET);
      expect(all).not.toMatch(/:\/\/[^/\s]*@/);
      expect(all).not.toMatch(/welcome\.md|list\.md|Update /);
      expect(env.GIT_TERMINAL_PROMPT).toBe("0");
      expect(env.GCM_INTERACTIVE).toBe("never");
      if (args.includes("add")) expect(args).toContain("--pathspec-from-file=-");
    }
  });
});
