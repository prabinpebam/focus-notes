/**
 * Note history against real Git (FIL-13, D-175): a note's versions newest first, following a rename,
 * with each commit's author and an agent's name from its trailer, a page at a time; a version's text
 * read from the file it was in that commit; nothing but a commit ID and a Markdown path in the note's
 * own repository is ever read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { GitSync } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { FakeClock, git, instance, write } from "./git-fixture.ts";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const opened: GitSync[] = [];
async function open(folder: string): Promise<GitSync> {
  const s = await GitSync.open({ folder, run: createRunner(), clock: new FakeClock() });
  if (!s) throw new Error("not a repository");
  opened.push(s);
  return s;
}
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});

function history() {
  const { ws } = instance();
  const priv = join(ws, "private");
  const commit = (msg: string, author = "Ann Writer <ann@example.com>") => {
    git(priv, "add", "-A");
    git(priv, "-c", "user.name=x", "commit", "-q", "--author", author, "-m", msg);
  };
  write(join(priv, "notes", "draft.md"), "# Draft\n\nFirst.\n");
  git(priv, "add", "-A");
  commit("Save notes/draft.md");
  write(join(priv, "notes", "draft.md"), "# Draft\n\nSecond.\n");
  commit("Save notes/draft.md", "Bo Other <bo@example.com>");
  write(join(priv, "notes", "draft.md"), "# Draft\n\nSecond.\n\nAn agent's line.\n");
  git(priv, "add", "-A");
  commit("Agent edit: notes/draft.md\n\nFocus-Notes-Agent: Claude Desktop");
  git(priv, "mv", "notes/draft.md", "notes/essay.md");
  commit("Rename notes/draft.md → notes/essay.md");
  write(join(priv, "notes", "essay.md"), "# Essay\n\nSecond.\n\nAn agent's line.\n");
  git(priv, "add", "-A");
  commit("Save notes/essay.md");
  return { ws, note: join(priv, "notes", "essay.md") };
}

describe("FIL-13: a note's versions from Git", () => {
  it("lists them newest first through a rename, with authors and the agent named", async () => {
    const { ws, note } = history();
    const s = await open(ws);
    const v = await s.versions(note);
    expect(v.map((x) => x.file)).toEqual(["notes/essay.md", "notes/essay.md", "notes/draft.md", "notes/draft.md", "notes/draft.md"]);
    expect(v.map((x) => x.author)).toEqual(["Ann Writer", "Ann Writer", "Ann Writer", "Bo Other", "Ann Writer"]);
    expect(v[2]!.agent).toBe("Claude Desktop");
    expect(v.filter((x) => x.agent)).toHaveLength(1);
  });
  it("reads a page at a time, through a rename", async () => {
    const { ws, note } = history();
    const s = await open(ws);
    const all = await s.versions(note);
    // Each page starts at the oldest one read, through the rename (it comes first again).
    const pages = [await s.versions(note, { limit: 2 })];
    while (pages.length < 5) {
      const last = pages.at(-1)!.at(-1)!;
      const next = (await s.versions(note, { from: { commit: last.commit, file: last.file }, limit: 3 })).filter((v) => v.commit !== last.commit);
      if (!next.length) break;
      pages.push(next);
    }
    expect(pages.flat().map((x) => x.commit)).toEqual(all.map((x) => x.commit));
    expect(await s.versions(note, { from: { commit: "--all", file: "notes/essay.md" }, limit: 2 })).toEqual([]);
  });
  it("reads a version's text from the file it was in then, and nothing else", async () => {
    const { ws, note } = history();
    const s = await open(ws);
    const v = await s.versions(note);
    expect(await s.readVersion(note, v[4]!.commit, v[4]!.file)).toBe("# Draft\n\nFirst.\n");
    expect(await s.readVersion(note, v[0]!.commit, v[0]!.file)).toBe("# Essay\n\nSecond.\n\nAn agent's line.\n");
    for (const file of ["../notes/essay.md", "notes/../../x.md", "-n.md", "notes/a.txt", "/etc/x.md"]) expect(await s.readVersion(note, v[0]!.commit, file)).toBeUndefined();
    expect(await s.readVersion(note, "--output=x", v[0]!.file)).toBeUndefined();
    // A note outside the workspace has no history.
    expect(await s.versions(join(ws, "..", "elsewhere.md"))).toEqual([]);
  });
});
