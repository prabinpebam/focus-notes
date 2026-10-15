/**
 * Public and private roots with real Git (WP-3.4): moving a note between the roots is one commit
 * in each repository, the private side first, and the pointer follows (FIL-06, SHR-02, D-97); no
 * private text ever reaches the public repository's history; a workspace whose `private/` isn't a
 * repository never commits private notes to the public one; and an import is one commit (FRE-10).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitSync, type GitSyncOptions } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { batchMessage } from "../src/main/git/message.ts";
import { FakeClock, SETUP_TIMEOUT_MS, git, instance, prepareTemplate, subject } from "./git-fixture.ts";
// One-time setup outside any test's time: a cold runner takes long over its first Git starts (DEF-13).
beforeAll(prepareTemplate, SETUP_TIMEOUT_MS);

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const opened: GitSync[] = [];
const commits: string[] = [];
async function open(folder: string, extra: Partial<GitSyncOptions> = {}): Promise<GitSync> {
  const run = createRunner({ onSpawn: (args) => { if (args.includes("commit")) commits.push(args[1]!); } });
  const s = await GitSync.open({ folder, run, clock: new FakeClock(), ...extra });
  if (!s) throw new Error("not a repository");
  opened.push(s);
  return s;
}
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
  commits.length = 0;
});
/** Every patch ever committed to a repository, on every branch. */
const history = (repo: string) => git(repo, "log", "--all", "-p", "--format=%H %s");

describe("commit messages say who can see it now", () => {
  it("a move between the roots is Make public or Make private, with link updates counted", () => {
    expect(batchMessage([{ op: "visibility", path: "notes/journal/day.md", to: "private" }])).toBe("Make private: notes/journal/day.md");
    expect(batchMessage([{ op: "visibility", path: "notes/a.md", to: "public" }, { op: "visibility", path: "notes/b.md", to: "public" }, { op: "write", path: "notes/index.md" }]))
      .toBe("Make 2 items public\n\nMake public: notes/a.md\nMake public: notes/b.md\nUpdate links in 1 note");
    // The moved note's own text isn't a link update elsewhere.
    expect(batchMessage([{ op: "visibility", path: "notes/a.md", to: "private" }, { op: "write", path: "notes/a.md" }])).toBe("Make private: notes/a.md");
    expect(batchMessage([{ op: "import", path: "notes/a.md" }, { op: "import", path: "notes/b.md" }])).toBe("Import 2 notes\n\nImport notes/a.md\nImport notes/b.md");
  });
});

describe("FIL-06, SHR-02: moving a note between Public and Private", () => {
  it("public → private and back: one commit in each repository, private first, then the pointer; no private text in the public history", async () => {
    const { ws, notesRemote, privateRemote } = instance();
    const s = await open(ws);
    const pub = join(ws, "notes", "hello.md");
    const priv = join(ws, "private", "notes", "hello.md");
    // Make private: the file moves into the private repository's notes/.
    renameSync(pub, priv);
    expect(await s.commitBatch([{ op: "move", from: pub, to: priv }])).toBeUndefined();
    expect(commits).toEqual([join(ws, "private"), ws]);
    expect(subject(join(ws, "private"), "HEAD")).toBe("Make private: notes/hello.md");
    expect(subject(ws, "HEAD")).toBe("Make private: notes/hello.md");
    expect(git(join(ws, "private"), "show", "HEAD:notes/hello.md")).toContain("# Hello");
    expect(git(ws, "ls-tree", "HEAD", "notes/hello.md")).toBe("");
    // Pushing follows, private first, and the pointer moves to the pushed private commit.
    await s.request("save");
    expect(subject(privateRemote)).toBe("Make private: notes/hello.md");
    expect(git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2]).toBe(git(privateRemote, "rev-parse", "main"));

    // Written while private: committed to the private repository only.
    writeFileSync(priv, "# Hello\n\nA private thought: tangerine-42.\n");
    writeFileSync(join(ws, "private", "notes", "diary.md"), "# Diary\n\nOnly mine: walnut-17.\n");
    s.written(priv);
    s.written(join(ws, "private", "notes", "diary.md"));
    await s.request("save");
    expect(git(privateRemote, "show", "main:notes/hello.md")).toContain("tangerine-42");
    const publicHistory = history(notesRemote) + history(ws);
    expect(publicHistory).not.toContain("tangerine-42");
    expect(publicHistory).not.toContain("walnut-17");
    expect(publicHistory).not.toContain("diary.md");

    // Make public again: the private side's delete is committed first, then the public add.
    commits.length = 0;
    renameSync(priv, pub);
    await s.commitBatch([{ op: "move", from: priv, to: pub }]);
    expect(commits).toEqual([join(ws, "private"), ws]);
    expect(subject(ws, "HEAD")).toBe("Make public: notes/hello.md");
    expect(subject(join(ws, "private"), "HEAD")).toBe("Make public: notes/hello.md");
    await s.request("save");
    expect(git(notesRemote, "show", "main:notes/hello.md")).toContain("tangerine-42");
    // The note that stayed private never appears in the public repository.
    expect(history(notesRemote)).not.toContain("walnut-17");
    // The public repository's commits touch only notes/ and the pointer.
    const touched = git(notesRemote, "log", "--format=", "--name-only", "main").split(/\r?\n/).filter(Boolean);
    expect(touched.every((p) => p.startsWith("notes/") || p === "private" || p.startsWith(".focus-notes/") || p === ".gitmodules")).toBe(true);
  });

  it("a folder moves with everything in it, and the links written in the same batch are in the same commits", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const from = join(ws, "private", "notes");
    mkdirSync(join(from, "trip"), { recursive: true });
    writeFileSync(join(from, "trip", "day-1.md"), "# Day 1\n");
    writeFileSync(join(from, "trip", "day-2.md"), "# Day 2\n\n[Before](day-1.md)\n");
    s.written(join(from, "trip", "day-1.md"));
    s.written(join(from, "trip", "day-2.md"));
    await s.request("save");
    const to = join(ws, "notes", "trip");
    renameSync(join(from, "trip"), to);
    await s.commitBatch([{ op: "move", from: join(from, "trip"), to }, { op: "write", path: join(to, "day-2.md") }]);
    expect(subject(ws, "HEAD")).toBe("Make public: notes/trip");
    expect(git(ws, "show", "--name-status", "--format=", "HEAD").split(/\r?\n/).sort()).toEqual(["A\tnotes/trip/day-1.md", "A\tnotes/trip/day-2.md"]);
    expect(git(join(ws, "private"), "show", "--name-status", "--format=", "HEAD").split(/\r?\n/).sort()).toEqual(["D\tnotes/trip/day-1.md", "D\tnotes/trip/day-2.md"]);
  });

  it("without a private repository, private notes are never committed to the public one", async () => {
    const { ws } = instance();
    // private/ is only a folder here: not a repository of its own.
    rmSync(join(ws, "private", ".git"), { recursive: true, force: true });
    const s = await open(ws);
    expect(s.privateRepo).toBeUndefined();
    const note = join(ws, "private", "notes", "secret.md");
    writeFileSync(note, "# Secret\n\npersimmon-9\n");
    s.written(note);
    const pub = join(ws, "notes", "hello.md");
    const moved = join(ws, "private", "notes", "hello.md");
    renameSync(pub, moved);
    await s.commitBatch([{ op: "move", from: pub, to: moved }]);
    await s.request("save");
    expect(subject(ws, "HEAD")).toBe("Make private: notes/hello.md");
    expect(history(ws)).not.toContain("persimmon-9");
    expect(git(ws, "log", "--all", "--format=", "--name-only").split(/\r?\n/).some((p) => p.startsWith("private/"))).toBe(false);
  });
});

describe("FRE-10: an import is ordinary commits", () => {
  it("adds the notes in one commit in the chosen root's repository", async () => {
    const { ws, privateRemote } = instance();
    const s = await open(ws);
    const a = join(ws, "private", "notes", "from-browser", "a.md");
    const b = join(ws, "private", "notes", "from-browser", "b.md");
    mkdirSync(join(a, ".."), { recursive: true });
    writeFileSync(a, "# A\n");
    writeFileSync(b, "# B\n");
    await s.commitBatch([{ op: "import", path: a }, { op: "import", path: b }]);
    await s.request("save");
    expect(git(privateRemote, "log", "-1", "--format=%B", "main").trim()).toBe("Import 2 notes\n\nImport notes/from-browser/a.md\nImport notes/from-browser/b.md");
  });
});
