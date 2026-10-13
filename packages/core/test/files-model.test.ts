/** The Files panel's model (WP-2.4): rows, selection (FIL-08), what operations act on, titles, and the browser's batch store. */
import { describe, expect, it } from "vitest";
import {
  actedOn, ancestorsOf, buildTree, destinations, keepShowing, NO_SELECTION, planFlatOps, rebase, retitle, rootRowId, select, selectAll,
  targetFolder, titleOfMarkdown, topLevel, visibleRows, applyChanges, dirOf, OpError, opErrorCode,
  type Openness, type WorkspaceScan,
} from "../src/index.ts";

const scan: WorkspaceScan = {
  folder: "",
  roots: [{ id: "local", path: "", readOnly: false }, { id: "public", path: "public:", readOnly: true }],
  entries: [
    { path: "journal", kind: "folder" },
    { path: "journal/2026-10-13.md", kind: "note", title: "Tuesday" },
    { path: "journal/old", kind: "folder" },
    { path: "journal/old/a.md", kind: "note" },
    { path: "drafts", kind: "folder" },
    { path: "spec-ideas.md", kind: "note", title: "Spec ideas" },
    { path: "public:Guides/Garden.md", kind: "note", published: true, title: "Garden log" },
  ],
};
const tree = buildTree(scan);
const open = (expanded: string[] = [], collapsed: string[] = []): Openness => ({ expanded: new Set(expanded), collapsed: new Set(collapsed) });

describe("rows (Files → Anatomy)", () => {
  it("shows each root as a section, folders first, titles not file names, and only open folders' contents", () => {
    const rows = visibleRows(tree, open(["journal"]));
    expect(rows.map((r) => [r.id, r.level, r.label])).toEqual([
      ["root:local", 1, ""],
      ["drafts", 2, "drafts"],
      ["journal", 2, "journal"],
      ["journal/old", 3, "old"],
      ["journal/2026-10-13.md", 3, "Tuesday"],
      ["spec-ideas.md", 2, "Spec ideas"],
      ["root:public", 1, ""],
      ["public:Guides", 2, "Guides"],
    ]);
    expect(rows.find((r) => r.id === "journal")).toMatchObject({ expanded: true, hasChildren: true, parent: "root:local" });
    expect(rows.find((r) => r.id === "drafts")).toMatchObject({ expanded: false, hasChildren: false });
    expect(rows.find((r) => r.id === "public:Guides")).toMatchObject({ readOnly: true });
  });
  it("collapses a root's section", () => {
    expect(visibleRows(tree, open([], [rootRowId("local")])).map((r) => r.id)).toEqual(["root:local", "root:public", "public:Guides"]);
  });
  it("filters by name, keeping and opening the ancestors of matches", () => {
    const rows = visibleRows(tree, open(), "GARDEN");
    expect(rows.map((r) => r.id)).toEqual(["root:local", "root:public", "public:Guides", "public:Guides/Garden.md"]);
    expect(visibleRows(tree, open(), "zzz").filter((r) => r.kind !== "root")).toEqual([]);
  });
  it("reveals a note: the folders it's in", () => {
    expect(ancestorsOf(tree, "journal/old/a.md")).toEqual(["journal", "journal/old"]);
    expect(ancestorsOf(tree, "spec-ideas.md")).toEqual([]);
    expect(ancestorsOf(tree, "public:Guides/Garden.md")).toEqual(["public:Guides"]);
    expect(dirOf("C:\\W\\notes\\a.md")).toBe("C:\\W\\notes");
  });
});

describe("selection (FIL-08)", () => {
  const rows = visibleRows(tree, open(["journal"]));
  it("click selects one, Mod+click adds and removes, Shift+click selects a range from the anchor", () => {
    let s = select(NO_SELECTION, rows, "drafts", "replace");
    expect(s).toEqual({ selected: ["drafts"], anchor: "drafts", focus: "drafts" });
    s = select(s, rows, "spec-ideas.md", "toggle");
    expect(s.selected).toEqual(["drafts", "spec-ideas.md"]);
    s = select(s, rows, "drafts", "toggle");
    expect(s.selected).toEqual(["spec-ideas.md"]);
    s = select(select(NO_SELECTION, rows, "journal", "replace"), rows, "journal/2026-10-13.md", "range");
    expect(s.selected).toEqual(["journal", "journal/old", "journal/2026-10-13.md"]);
    // A range upward from the same anchor replaces the last one.
    s = select(s, rows, "drafts", "range");
    expect(s).toEqual({ selected: ["drafts", "journal"], anchor: "journal", focus: "drafts" });
  });
  it("Shift+arrows extend from the anchor; Mod+arrows move focus only", () => {
    let s = select(NO_SELECTION, rows, "journal/old", "replace");
    s = select(s, rows, "journal/2026-10-13.md", "range");
    s = select(s, rows, "spec-ideas.md", "range");
    expect(s.selected).toEqual(["journal/old", "journal/2026-10-13.md", "spec-ideas.md"]);
    s = select(s, rows, "drafts", "focus");
    expect(s.focus).toBe("drafts");
    expect(s.selected).toHaveLength(3);
  });
  it("Mod+A selects every row showing except section labels; operations never act on sections", () => {
    const s = selectAll(NO_SELECTION, rows);
    expect(s.selected).not.toContain("root:local");
    expect(s.selected).toHaveLength(rows.length - 2);
    expect(actedOn({ selected: ["root:local", "drafts"], anchor: "", focus: "" }, "drafts")).toEqual(["drafts"]);
    // A row outside the selection acts alone.
    expect(actedOn({ selected: ["drafts", "journal"], anchor: "", focus: "" }, "spec-ideas.md")).toEqual(["spec-ideas.md"]);
    expect(actedOn({ selected: ["drafts", "journal"], anchor: "", focus: "" }, "journal")).toEqual(["drafts", "journal"]);
  });
  it("forgets rows that went away", () => {
    const s = keepShowing({ selected: ["drafts", "gone.md"], anchor: "gone.md", focus: "gone.md" }, rows);
    expect(s).toEqual({ selected: ["drafts"], anchor: "drafts", focus: "drafts" });
  });
});

describe("what operations act on", () => {
  it("a folder takes what's in it, so its contents aren't moved or deleted twice", () => {
    expect(topLevel(["journal/old/a.md", "journal", "drafts", "journal/old"])).toEqual(["journal", "drafts"]);
    expect(topLevel(["journal-2/a.md", "journal"])).toEqual(["journal-2/a.md", "journal"]);
  });
  it("paths follow moved folders", () => {
    const moves = [{ from: "journal", to: "drafts/journal" }];
    expect(rebase("journal/old/a.md", moves)).toBe("drafts/journal/old/a.md");
    expect(rebase("journal-2/a.md", moves)).toBe("journal-2/a.md");
  });
  it("new things go into the focused folder, next to the focused note, next to the open note, or the first writable root", () => {
    const rows = visibleRows(tree, open(["journal"]));
    expect(targetFolder(tree, rows, "journal/old")).toBe("journal/old");
    expect(targetFolder(tree, rows, "journal/2026-10-13.md")).toBe("journal");
    expect(targetFolder(tree, rows, "root:local")).toBe("");
    expect(targetFolder(tree, rows, "", "journal/old/a.md")).toBe("journal/old");
    // Never into a read-only root.
    expect(targetFolder(tree, rows, "public:Guides")).toBe("");
  });
  it("Move to… lists writable folders, never one that's moving or inside it", () => {
    const d = destinations(tree, ["journal"]).map((x) => [x.path, x.depth]);
    expect(d).toEqual([["", 0], ["drafts", 1]]);
  });
});

describe("titles (Files → Names and titles)", () => {
  it("the tree keeps titles the shell read, and updates them from changes", () => {
    const t2 = applyChanges(tree, [{ path: "spec-ideas.md", kind: "note", exists: true, title: "Spec, again" }]);
    expect(visibleRows(t2, open()).find((r) => r.id === "spec-ideas.md")!.label).toBe("Spec, again");
    // A change with no title keeps the node as it is.
    expect(applyChanges(t2, [{ path: "spec-ideas.md", kind: "note", exists: true }])).toBe(t2);
  });
  it("renaming a note edits its first H1, or adds one, and leaves the rest as it was", () => {
    expect(retitle("# Old\n\nBody\n", "New name")).toBe("# New name\n\nBody\n");
    expect(retitle("Intro\n\n## Sub\n", "Top")).toBe("# Top\n\nIntro\n\n## Sub\n");
    expect(retitle("---\ntags: a\n---\nText", "T")).toBe("---\ntags: a\n---\n# T\n\nText");
    expect(retitle("Old\n===\n\nBody", "New")).toBe("# New\n\nBody");
    expect(retitle("```\n# not a title\n```\n# Real\r\n", "X")).toBe("```\r\n# not a title\r\n```\r\n# X\r\n");
    expect(retitle("", "Fresh")).toBe("# Fresh\n");
    expect(titleOfMarkdown(retitle("# a\n", "  spaced   out "))).toBe("spaced out");
  });
});

describe("the browser's batches (FIL-01, FIL-02, FIL-03)", () => {
  const notes = [
    { path: "a.md", text: "A", updated: 1 },
    { path: "ideas/b.md", text: "B", updated: 1 },
    { path: "ideas/deep/c.md", text: "C", updated: 1 },
    { path: "gone.md", text: "G", updated: 1, deleted: true },
  ];
  it("creates folders, nested ones too, and refuses a taken or orphaned name", () => {
    expect(planFlatOps(notes, [], [{ op: "createFolder", path: "x" }, { op: "createFolder", path: "x/y" }], 5).folders).toEqual(["x", "x/y"]);
    expect(() => planFlatOps(notes, [], [{ op: "createFolder", path: "Ideas" }], 5)).toThrow(OpError);
    expect(() => planFlatOps(notes, [], [{ op: "createFolder", path: "nope/y" }], 5)).toThrow("notFound");
  });
  it("moves notes and folders with what's in them, in one batch", () => {
    const r = planFlatOps(notes, ["empty"], [{ op: "move", from: "ideas", to: "empty/ideas" }, { op: "move", from: "a.md", to: "empty/a.md" }], 5);
    expect(r.put.map((n) => n.path).sort()).toEqual(["empty/a.md", "empty/ideas/b.md", "empty/ideas/deep/c.md"]);
    expect(r.remove.sort()).toEqual(["a.md", "ideas/b.md", "ideas/deep/c.md"]);
  });
  it("refuses the whole batch if one move is refused", () => {
    expect(() => planFlatOps(notes, [], [{ op: "move", from: "a.md", to: "ideas/a.md" }, { op: "move", from: "ideas", to: "ideas/deep/ideas" }], 5)).toThrow("intoItself");
    expect(() => planFlatOps(notes, [], [{ op: "move", from: "a.md", to: "ideas/B.md" }], 5)).toThrow("taken");
    expect(() => planFlatOps(notes, [], [{ op: "move", from: "public:x.md", to: "x.md" }], 5)).toThrow("readOnly");
  });
  it("a deleted note is kept, marked deleted; a deleted folder takes its notes", () => {
    const r = planFlatOps(notes, ["ideas/empty"], [{ op: "delete", path: "ideas" }], 5);
    expect(r.put.map((n) => [n.path, n.deleted])).toEqual([["ideas/b.md", true], ["ideas/deep/c.md", true]]);
    expect(r.folders).toEqual([]);
    expect(() => planFlatOps(notes, [], [{ op: "delete", path: "gone.md" }], 5)).toThrow("notFound");
  });
  it("reads the reason at the end of a shell's error", () => {
    expect(opErrorCode(new Error("Error invoking remote method 'workspace:apply': Error: taken"))).toBe("taken");
    expect(opErrorCode(new Error("disk on fire"))).toBe("failed");
  });
});
