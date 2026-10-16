/**
 * New notes without a private repository, with real Git (D-158, SHR-01): a held note is never
 * listed by `git status`, staged by `git add -A`, committed by a backup, or pushed, until the writer
 * answers Make it public; a note kept on this computer stays out for good; the hold follows a rename.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitSync } from "../src/main/git/sync.ts";
import { HeldFile, excludeFileOf } from "../src/main/git/held.ts";
import { FakeClock, configure, git, write } from "./git-fixture.ts";

vi.setConfig({ testTimeout: 60_000 });
const opened: GitSync[] = [];
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});

/** A clone of a notes repository with no private/ (FRE-06 without access to the private repository). */
function publicOnly() {
  const root = mkdtempSync(join(tmpdir(), "fn-held-"));
  const remote = join(root, "notes.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const ws = join(root, "ws");
  git(root, "clone", "-q", remote, ws);
  configure(ws);
  write(join(ws, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  write(join(ws, "notes", "hello.md"), "# Hello\n");
  git(ws, "add", "-A");
  git(ws, "commit", "-q", "-m", "Start");
  git(ws, "push", "-q", "-u", "origin", "main");
  return { ws, remote };
}
const untracked = (ws: string) => git(ws, "status", "--porcelain", "--untracked-files=all");
const pushedFiles = (remote: string) => git(remote, "ls-tree", "-r", "--name-only", "main");

describe("D-158: a new public note is held out of Git until the writer answers", () => {
  it("finds the exclude file of a clone", async () => {
    const { ws } = publicOnly();
    expect(await excludeFileOf(ws)).toBe(join(ws, ".git", "info", "exclude"));
    expect(await excludeFileOf(mkdtempSync(join(tmpdir(), "fn-held-none-")))).toBeUndefined();
  });

  it("isn't listed, staged, committed or pushed while it waits; Make it public backs it up", async () => {
    const { ws, remote } = publicOnly();
    const held = new HeldFile(ws, (await excludeFileOf(ws))!);
    // An odd name: Git's wildcard characters are escaped, so the line matches only this note.
    const note = join(ws, "notes", "Untitled [1].md");
    const neighbour = join(ws, "notes", "Untitled 1.md");
    await held.hold(note);
    writeFileSync(note, "# My secret plan\n");
    writeFileSync(neighbour, "# Neighbour\n");
    expect(await held.list()).toEqual({ waiting: [note], local: [] });
    expect(untracked(ws)).not.toContain("Untitled [1]");
    expect(untracked(ws)).toContain("Untitled 1.md");

    const s = (await GitSync.open({ folder: ws, clock: new FakeClock() }))!;
    opened.push(s);
    s.written(note);
    s.written(neighbour);
    expect((await s.request("save")).problem).toBeUndefined();
    expect(pushedFiles(remote)).toContain("notes/Untitled 1.md");
    expect(pushedFiles(remote)).not.toContain("Untitled [1]");
    // Even a terminal's add-everything leaves it out.
    git(ws, "add", "-A");
    expect(git(ws, "diff", "--cached", "--name-only")).toBe("");

    await held.answer(note, "public");
    expect(await held.list()).toEqual({ waiting: [], local: [] });
    s.written(note);
    expect((await s.request("save")).problem).toBeUndefined();
    expect(pushedFiles(remote)).toContain("notes/Untitled [1].md");
  });

  it("a note kept on this computer stays out of Git, and the person's own exclude lines stay", async () => {
    const { ws, remote } = publicOnly();
    const file = (await excludeFileOf(ws))!;
    writeFileSync(file, "*.log\n");
    const held = new HeldFile(ws, file);
    const note = join(ws, "notes", "Journal.md");
    await held.hold(note);
    writeFileSync(note, "# Journal\n");
    await held.answer(note, "local");
    expect(await held.list()).toEqual({ waiting: [], local: [note] });
    expect(readFileSync(file, "utf8").startsWith("*.log\n")).toBe(true);
    const s = (await GitSync.open({ folder: ws, clock: new FakeClock() }))!;
    opened.push(s);
    s.written(note);
    await s.request("save");
    expect(pushedFiles(remote)).not.toContain("Journal");
  });

  it("follows a rename and a folder move, and forgets a deleted note", async () => {
    const { ws } = publicOnly();
    const held = new HeldFile(ws, (await excludeFileOf(ws))!);
    const a = join(ws, "notes", "Untitled.md");
    const b = join(ws, "notes", "My idea.md");
    await held.hold(a);
    writeFileSync(a, "# My idea\n");
    await held.moved(a, b);
    renameSync(a, b);
    expect(await held.list()).toEqual({ waiting: [b], local: [] });
    expect(untracked(ws)).toBe("");
    await held.moved(join(ws, "notes"), join(ws, "notes2"));
    expect((await held.list()).waiting).toEqual([join(ws, "notes2", "My idea.md")]);
    await held.removed(join(ws, "notes2"));
    expect(await held.list()).toEqual({ waiting: [], local: [] });
    expect(existsSync(join(ws, ".git", "info", "exclude"))).toBe(true);
  });
});
