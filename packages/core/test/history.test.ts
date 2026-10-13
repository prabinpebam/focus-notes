/**
 * Recently deleted from Git history (FIL-10) and the conflict resolver's model (FIL-12), without Git:
 * parsing the log of deletions, the 30-day window across both repositories, where a restored note
 * goes (in place, or to a chosen folder, numbered on a clash), the two versions block by block, and
 * the copies that keep every word.
 */
import { describe, expect, it } from "vitest";
import {
  blocksOf, compareVersions, conflictCopy, deletedId, groupByDay, parseDeletedId, parseDeletedLog, recentDeletions, restorePlace,
  RECENTLY_DELETED_DAYS, type DeletedEntry,
} from "../src/history.ts";

const H = (n: number) => String(n).repeat(40).slice(0, 40);
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const log = (...commits: [string, number, string, string[]][]) =>
  commits.map(([h, at, subject, paths]) => `\x01${h} ${Math.floor(at / 1000)} ${subject}\0\n${paths.join("\0")}\0\n`).join("");

describe("FIL-10: Recently deleted is found from Git history", () => {
  it("parses `git log --diff-filter=D -z --name-only`, including names with spaces", () => {
    const out = log([H(1), NOW - DAY, "Delete 2 items", ["notes/a.md", "notes/c d.md"]], [H(2), NOW - 2 * DAY, "Delete notes/b.md", ["notes/b.md"]]);
    expect(parseDeletedLog(out)).toEqual([
      { commit: H(1), at: Math.floor((NOW - DAY) / 1000) * 1000, subject: "Delete 2 items", path: "notes/a.md" },
      { commit: H(1), at: Math.floor((NOW - DAY) / 1000) * 1000, subject: "Delete 2 items", path: "notes/c d.md" },
      { commit: H(2), at: Math.floor((NOW - 2 * DAY) / 1000) * 1000, subject: "Delete notes/b.md", path: "notes/b.md" },
    ]);
    expect(parseDeletedLog("")).toEqual([]);
  });

  it("lists notes deleted in the last 30 days, newest first and once per path, leaving out moves between the roots, notes back at their path, and other files", () => {
    const e = (h: number, ago: number, path: string, subject = "Delete"): DeletedEntry => ({ commit: H(h), at: NOW - ago, subject, path });
    const entries = [
      e(1, 1 * DAY, "notes/a.md"),
      e(2, 5 * DAY, "notes/a.md"),
      e(3, 2 * DAY, "notes/made-public.md", "Make public: notes/made-public.md"),
      e(4, 2 * DAY, "notes/b.md", "Make 2 items private"),
      e(5, 3 * DAY, "notes/back.md"),
      e(6, (RECENTLY_DELETED_DAYS + 1) * DAY, "notes/old.md"),
      e(7, 1 * DAY, "notes/drafts/.gitkeep"),
      e(8, 1 * DAY, ".focus-notes/settings.json"),
      e(9, 4 * DAY, "notes/drafts/c.md"),
    ];
    const listed = recentDeletions(entries, { now: NOW, exists: (p) => p === "notes/back.md" });
    expect(listed.map((x) => [x.commit, x.path])).toEqual([[H(1), "notes/a.md"], [H(9), "notes/drafts/c.md"]]);
  });

  it("names each deletion by repository, commit, and path, and refuses anything that climbs out", () => {
    const id = deletedId("private", { commit: H(1), path: "notes/drafts/a b.md" });
    expect(parseDeletedId(id)).toEqual({ root: "private", commit: H(1), path: "notes/drafts/a b.md" });
    for (const bad of [`public:${H(1)}:notes/../x.md`, `public:${H(1)}:.git/config`, `other:${H(1)}:notes/a.md`, `public:zz:notes/a.md`, `public:${H(1)}:notes/.hidden/a.md`]) {
      expect(parseDeletedId(bad), bad).toBeUndefined();
    }
  });

  it("groups by the day deleted, newest first", () => {
    const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
    const groups = groupByDay([{ id: "a", deletedAt: at(13, 9) }, { id: "b", deletedAt: at(14, 8) }, { id: "c", deletedAt: at(13, 18) }]);
    expect(groups.map((g) => [g.day, g.notes.map((n) => n.id)])).toEqual([["2026-10-14", ["b"]], ["2026-10-13", ["c", "a"]]]);
  });

  it("restores in place, in its root when the folder is gone, or in a chosen folder, numbering a name that's taken", () => {
    const original = "/w/private/notes/drafts/spec-ideas.md";
    const root = "/w/private/notes";
    expect(restorePlace({ original, root, folderExists: true, taken: [] })).toBe("/w/private/notes/drafts/spec-ideas.md");
    expect(restorePlace({ original, root, folderExists: true, taken: ["Spec-Ideas.md"] })).toBe("/w/private/notes/drafts/spec-ideas-2.md");
    expect(restorePlace({ original, root, folderExists: false, taken: ["spec-ideas.md", "spec-ideas-2.md"] })).toBe("/w/private/notes/spec-ideas-3.md");
    expect(restorePlace({ original, root, folder: "/w/notes/essays", folderExists: true, taken: [] })).toBe("/w/notes/essays/spec-ideas.md");
    expect(restorePlace({ original: "C:\\w\\notes\\a.markdown", root: "C:\\w\\notes", folderExists: true, taken: ["a.markdown"] })).toBe("C:\\w\\notes\\a-2.markdown");
  });
});

describe("FIL-12: the conflict resolver's model", () => {
  it("splits Markdown into blocks at blank lines, keeping fences whole", () => {
    expect(blocksOf("# T\n\nOne\ntwo\n\n```\na\n\nb\n```\n\nEnd\n")).toEqual(["# T", "One\ntwo", "```\na\n\nb\n```", "End"]);
    expect(blocksOf("")).toEqual([]);
  });

  it("marks the blocks that differ in each version, in order", () => {
    const mine = "# On focus\n\nShared start.\n\nMine only.\n\nShared end.\n";
    const theirs = "# On focus\n\nShared start.\n\nTheirs only.\n\nAnd more.\n\nShared end.\n";
    const c = compareVersions(mine, theirs);
    expect(c.mine.map((b) => [b.text, b.changed])).toEqual([["# On focus", false], ["Shared start.", false], ["Mine only.", true], ["Shared end.", false]]);
    expect(c.theirs.filter((b) => b.changed).map((b) => b.text)).toEqual(["Theirs only.", "And more."]);
    expect(new Set([...c.mine, ...c.theirs].map((b) => b.id)).size).toBe(c.mine.length + c.theirs.length);
    // Moved blocks are changed where they left and where they arrived; equal versions have nothing changed.
    expect(compareVersions("A\n\nB\n", "B\n\nA\n").mine.filter((b) => b.changed)).toHaveLength(1);
    expect(compareVersions("A\n\nB\n", "A\n\nB\n").theirs.some((b) => b.changed)).toBe(false);
  });

  it("keeps a version as a copy with its own title and a free file name next to the note, so no choice loses words", () => {
    const copy = conflictCopy({ path: "/w/notes/on-focus.md", text: "# On focus\n\nMine.\n", title: "On focus (conflict copy)", taken: ["on-focus.md"] });
    expect(copy).toEqual({ path: "/w/notes/on-focus-conflict-copy.md", text: "# On focus (conflict copy)\n\nMine.\n" });
    const again = conflictCopy({ path: "notes/on-focus.md", text: "No title yet.\n", title: "On focus (your version, Oct 14, 2026, 9:05 AM)", taken: ["on-focus-your-version-oct-14-2026-9-05-am.md"] });
    expect(again.path).toBe("notes/on-focus-your-version-oct-14-2026-9-05-am-2.md");
    expect(again.text).toBe("# On focus (your version, Oct 14, 2026, 9:05 AM)\n\nNo title yet.\n");
  });
});
