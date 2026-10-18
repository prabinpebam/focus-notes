/**
 * Backup by repository against real Git (FIL-14, D-191): what waits in each repository's notes
 * (folders with nothing in them, files another program made, commits not pushed), and Back up to
 * GitHub for one repository, which keeps empty folders with a `.gitkeep`, commits only the notes
 * folder, and pushes.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GitSync } from "../src/main/git/sync.ts";
import { backupMessage } from "../src/main/git/message.ts";
import { FakeClock, SETUP_TIMEOUT_MS, git, instance, prepareTemplate } from "./git-fixture.ts";

beforeAll(prepareTemplate, SETUP_TIMEOUT_MS);
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const opened: GitSync[] = [];
async function open(folder: string): Promise<GitSync> {
  const s = await GitSync.open({ folder, clock: new FakeClock() });
  if (!s) throw new Error("not a repository");
  opened.push(s);
  return s;
}
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});

describe("FIL-14: what waits in each repository", () => {
  it("counts an empty folder, a file made outside the app, and nothing outside the notes folder", async () => {
    const { ws } = instance();
    const s = await open(ws);
    expect(await s.repos()).toEqual([
      { repo: "private", folders: 0, notes: 0, other: 0, commits: 0 },
      { repo: "public", folders: 0, notes: 0, other: 0, commits: 0 },
    ]);
    mkdirSync(join(ws, "notes", "Empty", "Inner"), { recursive: true });
    writeFileSync(join(ws, "private", "notes", "outside.md"), "# Outside\n");
    writeFileSync(join(ws, "README.md"), "Not a note\n");
    s.changed();
    const [priv, pub] = await s.repos();
    expect(priv).toMatchObject({ repo: "private", folders: 0, notes: 1 });
    // Only the innermost empty folder: its parent is kept through it.
    expect(pub).toMatchObject({ repo: "public", folders: 1, notes: 0, other: 0 });
  });

  it("Back up commits the empty folder with a .gitkeep and the outside note, pushes, and leaves other files alone", async () => {
    const { ws, notesRemote, privateRemote } = instance();
    const s = await open(ws);
    mkdirSync(join(ws, "notes", "Empty"));
    mkdirSync(join(ws, "notes", "Also empty"));
    writeFileSync(join(ws, "notes", "outside.md"), "# Outside\n");
    writeFileSync(join(ws, "README.md"), "Not a note\n");
    s.changed();
    const r = await s.backupRepo("public");
    expect(r.problem).toBeUndefined();
    expect(existsSync(join(ws, "notes", "Empty", ".gitkeep"))).toBe(true);
    expect(git(notesRemote, "log", "-1", "--format=%s", "main")).toBe("Back up 2 folders and 1 note");
    expect(git(notesRemote, "ls-tree", "-r", "--name-only", "main")).toContain("notes/Empty/.gitkeep");
    expect(git(ws, "status", "--porcelain")).toBe("?? README.md");
    expect((await s.repos())[1]).toMatchObject({ folders: 0, notes: 0, other: 0, commits: 0 });
    // The private repository wasn't asked about.
    expect(git(privateRemote, "log", "-1", "--format=%s", "main")).toBe("Start");
  });

  it("commits not pushed yet are counted by what they changed", async () => {
    const { ws } = instance();
    const s = await open(ws);
    mkdirSync(join(ws, "private", "notes", "Later"));
    writeFileSync(join(ws, "private", "notes", "Later", ".gitkeep"), "");
    git(join(ws, "private"), "add", "-A");
    git(join(ws, "private"), "commit", "-q", "-m", "Create folder notes/Later");
    s.changed();
    expect((await s.repos())[0]).toMatchObject({ repo: "private", folders: 1, commits: 1 });
  });
});

describe("FIL-14: the backup's commit message", () => {
  it("one change says what it is; several are counted", () => {
    expect(backupMessage([{ status: "A", path: "notes/Empty/.gitkeep" }])).toBe("Create folder notes/Empty");
    expect(backupMessage([{ status: "A", path: "notes/A/.gitkeep" }, { status: "M", path: "notes/b.md" }, { status: "A", path: "notes/c.png" }]))
      .toBe("Back up 1 folder, 1 note and 1 file\n\nCreate folder notes/A\nUpdate notes/b.md\nCreate notes/c.png");
  });
});
