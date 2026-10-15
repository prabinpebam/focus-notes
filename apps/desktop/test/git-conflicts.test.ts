/**
 * Conflicts and Recently deleted against real Git (WP-3.5): two clones of local bare remotes edit
 * the same note, the sync stops without losing anything, and each of the resolver's choices
 * produces the commits it promises (FIL-12, DD-FB-04); deletions in either repository appear in
 * Recently deleted for 30 days and can be read back and restored in a commit (FIL-10). No note
 * name ever appears in a process argument (SEC-03).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitSync, type GitSyncOptions } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { FakeClock, SETUP_TIMEOUT_MS, configure, count, git, instance, prepareTemplate, subject, write } from "./git-fixture.ts";
// One-time setup outside any test's time: a cold runner takes long over its first Git starts (DEF-13).
beforeAll(prepareTemplate, SETUP_TIMEOUT_MS);

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const opened: GitSync[] = [];
const spawned: string[][] = [];
async function open(folder: string, extra: Partial<GitSyncOptions> = {}): Promise<GitSync> {
  const run = createRunner({ onSpawn: (args) => spawned.push(args) });
  const s = await GitSync.open({ folder, run, clock: new FakeClock(), ...extra });
  if (!s) throw new Error("not a repository");
  opened.push(s);
  return s;
}
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});

/** Another computer: a clone of the private remote that changes welcome.md and pushes. */
function elsewhere(root: string, remote: string, text: string | undefined, name = "other") {
  const other = join(root, name);
  git(root, "clone", "-q", remote, other);
  configure(other);
  if (text === undefined) git(other, "rm", "-q", "notes/welcome.md");
  else writeFileSync(join(other, "notes", "welcome.md"), text);
  git(other, "commit", "-q", "-am", "Theirs");
  git(other, "push", "-q");
  return other;
}
/** This computer writes and saves its own version, which the remote now refuses: a conflict. */
async function conflicted(text: string | undefined = "# Welcome\n\nTheirs.\n", mine = "# Welcome\n\nMine.\n") {
  const { root, ws, privateRemote, notesRemote } = instance();
  elsewhere(root, privateRemote, text);
  const s = await open(ws);
  const note = join(ws, "private", "notes", "welcome.md");
  writeFileSync(note, mine);
  s.written(note);
  const r = await s.request("save");
  expect(r).toMatchObject({ state: "problem", problem: "conflict" });
  return { s, ws, note, privateRemote, notesRemote, p: join(ws, "private") };
}
const show = (repo: string, spec: string) => git(repo, "show", spec);

describe("FIL-12: a note changed here and elsewhere", () => {
  it("lists the conflicting note with both versions and when the other was made", async () => {
    const { s, note } = await conflicted();
    const list = await s.conflicts();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ path: note, mine: "# Welcome\n\nMine.\n", theirs: "# Welcome\n\nTheirs.\n" });
    expect(list[0]!.theirsAt).toBeGreaterThan(Date.now() - 10 * 60_000);
  });

  it("Keep this computer's version: pushes mine on top of theirs, which stays in history", async () => {
    const { s, note, p, privateRemote, notesRemote } = await conflicted();
    const theirs = git(p, "rev-parse", "origin/main");
    const r = await s.resolve([{ path: note, choice: "mine" }]);
    expect(r.problem).toBeUndefined();
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nMine.\n");
    expect(show(privateRemote, "main:notes/welcome.md")).toBe("# Welcome\n\nMine.");
    expect(git(privateRemote, "log", "-1", "--format=%B", "main")).toBe("Resolve conflict in notes/welcome.md\n\nKeep this computer's version: notes/welcome.md");
    // A line of history on top of the other version: no merge, nothing rewritten on the remote.
    expect(git(privateRemote, "rev-parse", "main^")).toBe(theirs);
    expect(git(privateRemote, "rev-list", "--merges", "--count", "main")).toBe("0");
    // The pointer follows the pushed private commit (D-07).
    expect(git(notesRemote, "ls-tree", "main", "private").split(/\s+/)[2]).toBe(git(privateRemote, "rev-parse", "main"));
    expect(await s.conflicts()).toEqual([]);
  });

  it("Take the other version: replaces mine, and keeps mine as a copy in Recently deleted", async () => {
    const { s, note, p, privateRemote } = await conflicted();
    const before = count(privateRemote);
    const r = await s.resolve([{ path: note, choice: "theirs", copyTitle: "Welcome (your version, 9:05 AM)" }]);
    expect(r.problem).toBeUndefined();
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nTheirs.\n");
    expect(show(privateRemote, "main:notes/welcome.md")).toBe("# Welcome\n\nTheirs.");
    // Two commits: the result with the copy, then the copy deleted, so it's recoverable for 30 days.
    expect(count(privateRemote)).toBe(before + 2);
    expect(subject(privateRemote)).toBe("Delete notes/welcome-your-version-9-05-am.md");
    expect(git(privateRemote, "log", "-1", "--format=%b", "main^")).toBe("Take the other version: notes/welcome.md (this computer's kept as notes/welcome-your-version-9-05-am.md)");
    expect(existsSync(join(p, "notes", "welcome-your-version-9-05-am.md"))).toBe(false);
    const deleted = await s.deleted();
    expect(deleted[0]).toMatchObject({ root: "private", title: "Welcome (your version, 9:05 AM)", folder: "" });
    expect((await s.readDeleted(deleted[0]!.id))?.text).toBe("# Welcome (your version, 9:05 AM)\n\nMine.\n");
  });

  it("Keep both: takes the other version and saves mine as a conflict copy next to it", async () => {
    const { s, note, p, privateRemote } = await conflicted();
    const r = await s.resolve([{ path: note, choice: "both", copyTitle: "Welcome (conflict copy)" }]);
    expect(r.problem).toBeUndefined();
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nTheirs.\n");
    expect(readFileSync(join(p, "notes", "welcome-conflict-copy.md"), "utf8")).toBe("# Welcome (conflict copy)\n\nMine.\n");
    expect(show(privateRemote, "main:notes/welcome-conflict-copy.md")).toBe("# Welcome (conflict copy)\n\nMine.");
    expect(git(privateRemote, "log", "-1", "--format=%B", "main")).toBe("Resolve conflict in notes/welcome.md\n\nKeep both: notes/welcome.md and notes/welcome-conflict-copy.md");
  });

  it("Decide later: without a choice nothing changes, and the conflict stays", async () => {
    const { s, note, p } = await conflicted();
    const head = git(p, "rev-parse", "HEAD");
    const r = await s.resolve([]);
    expect(r).toMatchObject({ state: "problem", problem: "conflict" });
    expect(git(p, "rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nMine.\n");
    expect(await s.conflicts()).toHaveLength(1);
  });

  it("keeps changes only one side made, and settles a note deleted elsewhere", async () => {
    const { root, ws, privateRemote } = instance();
    const other = elsewhere(root, privateRemote, undefined);
    write(join(other, "notes", "theirs-only.md"), "# Theirs only\n");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "Add");
    git(other, "push", "-q");
    const s = await open(ws);
    const note = join(ws, "private", "notes", "welcome.md");
    const mineOnly = join(ws, "private", "notes", "mine-only.md");
    writeFileSync(note, "# Welcome\n\nStill mine.\n");
    writeFileSync(mineOnly, "# Mine only\n");
    s.written(note);
    s.written(mineOnly);
    expect((await s.request("save")).problem).toBe("conflict");
    const list = await s.conflicts();
    expect(list.map((c) => [c.path, c.mine !== undefined, c.theirs])).toEqual([[note, true, undefined]]);
    expect((await s.resolve([{ path: note, choice: "theirs", copyTitle: "Welcome (your version)" }])).problem).toBeUndefined();
    expect(existsSync(note)).toBe(false);
    expect(readFileSync(join(ws, "private", "notes", "theirs-only.md"), "utf8")).toBe("# Theirs only\n");
    expect(show(privateRemote, "main:notes/mine-only.md")).toBe("# Mine only");
    const deleted = await s.deleted();
    expect(deleted.map((d) => d.title)).toContain("Welcome (your version)");
  });

  it("finds a conflict in text not committed yet, and commits it before settling", async () => {
    const { root, ws, privateRemote } = instance();
    const s = await open(ws);
    elsewhere(root, privateRemote, "# Welcome\n\nTheirs.\n");
    const note = join(ws, "private", "notes", "welcome.md");
    writeFileSync(note, "# Welcome\n\nTyped, not committed.\n");
    s.written(note);
    await s.sync("fetch");
    const list = await s.conflicts();
    expect(list).toHaveLength(1);
    expect(list[0]!.mine).toBe("# Welcome\n\nTyped, not committed.\n");
    expect((await s.resolve([{ path: note, choice: "mine" }])).problem).toBeUndefined();
    expect(show(privateRemote, "main:notes/welcome.md")).toBe("# Welcome\n\nTyped, not committed.");
    expect(git(privateRemote, "log", "--format=%s", "-3", "main").split("\n")).toEqual(["Resolve conflict in notes/welcome.md", "Theirs", "Start"]);
  });

  it("never names a note in a process argument while finding or settling conflicts (SEC-03)", async () => {
    const { s, note } = await conflicted();
    const from = spawned.length;
    await s.conflicts();
    await s.resolve([{ path: note, choice: "both", copyTitle: "Welcome (conflict copy)" }]);
    await s.deleted();
    for (const args of spawned.slice(from)) expect(args.join(" ")).not.toMatch(/welcome|conflict-copy|Resolve /);
  });
});

describe("FIL-10: Recently deleted, from both repositories' history", () => {
  it("lists notes deleted in the last 30 days in either repository, newest first, with titles and folders, but not moves between the roots", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const pub = join(ws, "notes", "list.md");
    const priv = join(ws, "private", "notes", "welcome.md");
    rmSync(pub);
    await s.commitBatch([{ op: "delete", path: pub }]);
    await new Promise((r) => setTimeout(r, 1100));
    rmSync(priv);
    await s.commitBatch([{ op: "delete", path: priv }]);
    // Made public: a delete in the private repository that isn't a deletion.
    const moved = join(ws, "private", "notes", "moved.md");
    writeFileSync(moved, "# Moved\n");
    s.written(moved);
    await s.request("save");
    writeFileSync(join(ws, "notes", "moved.md"), "# Moved\n");
    rmSync(moved);
    await s.commitBatch([{ op: "move", from: moved, to: join(ws, "notes", "moved.md") }]);
    const deleted = await s.deleted();
    expect(deleted.map((d) => [d.root, d.title, d.path])).toEqual([["private", "Welcome", priv], ["public", "List", pub]]);
    expect(deleted[0]!.id).toMatch(/^private:[0-9a-f]{40}:notes\/welcome\.md$/);
    expect((await s.readDeleted(deleted[1]!.id))?.text).toBe("# List\n");
    // Older than 30 days: no longer listed (still in Git history).
    expect(await s.deleted(Date.now() + 31 * 24 * 60 * 60 * 1000)).toEqual([]);
  });

  it("restores a deleted note in a commit, after which it's no longer listed", async () => {
    const { ws, notesRemote } = instance();
    const s = await open(ws);
    const pub = join(ws, "notes", "list.md");
    rmSync(pub);
    await s.commitBatch([{ op: "delete", path: pub }]);
    const [d] = await s.deleted();
    const back = await s.readDeleted(d!.id);
    writeFileSync(pub, back!.text);
    await s.commitBatch([{ op: "restore", path: pub }]);
    expect(subject(ws, "HEAD")).toBe("Restore notes/list.md");
    await s.sync("retry");
    expect(show(notesRemote, "main:notes/list.md")).toBe("# List");
    expect(await s.deleted()).toEqual([]);
    expect(await s.readDeleted("public:0000000:notes/../x.md")).toBeUndefined();
  });
});
