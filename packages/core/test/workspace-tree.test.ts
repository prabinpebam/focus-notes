/** The workspace model: one tree of notes and folders over its roots, and pure plans for each operation. */
import { describe, expect, it } from "vitest";
import {
  applyChanges, buildTree, findNode, markPublished, planCreateFolder, planCreateNote, planDelete, planMove, planRenameFolder, rootOf, walk,
  type FolderNode, type WorkspaceScan, type WorkspaceTree,
} from "../src/workspace.ts";

/** The desktop layout: public notes in notes/, private ones in the private/ submodule's notes/ (D-84). */
const desktop: WorkspaceScan = {
  folder: "C:\\W",
  roots: [
    { id: "private", path: "C:\\W\\private\\notes", readOnly: false },
    { id: "public", path: "C:\\W\\notes", readOnly: false },
  ],
  entries: [
    { path: "C:\\W\\private\\notes\\journal", kind: "folder" },
    { path: "C:\\W\\private\\notes\\journal\\2026-10-13.md", kind: "note" },
    { path: "C:\\W\\private\\notes\\journal\\2026-10-12.md", kind: "note" },
    { path: "C:\\W\\private\\notes\\spec-ideas.md", kind: "note" },
    { path: "C:\\W\\private\\notes\\drafts", kind: "folder" },
    { path: "C:\\W\\notes\\essays\\on-focus.md", kind: "note", published: true },
    { path: "C:\\W\\notes\\about.md", kind: "note", published: true },
  ],
};
/** The browser: its own notes, and the instance's read-only ones (D-90). */
const web: WorkspaceScan = {
  folder: "",
  roots: [
    { id: "local", path: "", readOnly: false },
    { id: "public", path: "public:", readOnly: true },
    { id: "private", path: "private:", readOnly: true },
  ],
  entries: [
    { path: "Welcome.md", kind: "note" },
    { path: "ideas/one.md", kind: "note" },
    { path: "public:Guides/Garden.md", kind: "note", published: true },
    { path: "private:Plans/Launch plan.md", kind: "note", published: true },
  ],
};
const names = (t: WorkspaceTree, rootId: string) => {
  const root = t.roots.find((r) => r.id === rootId)!;
  const out: string[] = [];
  const go = (nodes: FolderNode["children"], prefix: string) => {
    for (const n of nodes) {
      out.push(prefix + n.name + (n.kind === "folder" ? "/" : ""));
      if (n.kind === "folder") go(n.children, `${prefix}${n.name}/`);
    }
  };
  go(root.children, "");
  return out;
};

describe("one tree over the workspace's roots", () => {
  it("shows the private repository and the public notes as one tree, folders first", () => {
    const t = buildTree(desktop);
    expect(t.roots.map((r) => r.id)).toEqual(["private", "public"]);
    expect(names(t, "private")).toEqual(["drafts/", "journal/", "journal/2026-10-12.md", "journal/2026-10-13.md", "spec-ideas.md"]);
    expect(names(t, "public")).toEqual(["essays/", "essays/on-focus.md", "about.md"]);
    expect(findNode(t, "C:\\W\\notes\\about.md")?.node).toMatchObject({ kind: "note", name: "about.md", published: true });
    expect(rootOf(t, "C:\\W\\private\\notes\\spec-ideas.md")?.id).toBe("private");
    expect(rootOf(t, "C:\\W\\notesbook\\x.md")).toBeUndefined();
  });
  it("shows the browser's notes with the instance's read-only ones", () => {
    const t = buildTree(web);
    expect(names(t, "local")).toEqual(["ideas/", "ideas/one.md", "Welcome.md"]);
    expect(names(t, "public")).toEqual(["Guides/", "Guides/Garden.md"]);
    expect(rootOf(t, "public:Guides/Garden.md")?.readOnly).toBe(true);
    expect(rootOf(t, "Welcome.md")?.id).toBe("local");
    expect([...walk(t)].filter((e) => e.node.kind === "note").map((e) => e.path)).toContain("private:Plans/Launch plan.md");
  });
});

describe("changes from outside keep everything else as the same objects", () => {
  it("adds, removes, and leaves unrelated folders untouched", () => {
    const t = buildTree(desktop);
    const journal = findNode(t, "C:\\W\\private\\notes\\journal")!.node;
    const pub = t.roots[1];
    const next = applyChanges(t, [
      { path: "C:\\W\\private\\notes\\drafts\\new.md", kind: "note", exists: true },
      { path: "C:\\W\\private\\notes\\spec-ideas.md", kind: "note", exists: false },
    ]);
    expect(names(next, "private")).toEqual(["drafts/", "drafts/new.md", "journal/", "journal/2026-10-12.md", "journal/2026-10-13.md"]);
    expect(findNode(next, "C:\\W\\private\\notes\\journal")!.node).toBe(journal);
    expect(next.roots[1]).toBe(pub);
  });
  it("returns the same tree when nothing in it changed", () => {
    const t = buildTree(desktop);
    expect(applyChanges(t, [{ path: "C:\\W\\private\\notes\\spec-ideas.md", kind: "note", exists: true }])).toBe(t);
    expect(applyChanges(t, [{ path: "C:\\W\\README.md", kind: "note", exists: true }])).toBe(t);
  });
  it("creates the folders a new note needs, and removes a folder with everything in it", () => {
    const t = applyChanges(buildTree(desktop), [
      { path: "C:\\W\\notes\\a\\b\\c.md", kind: "note", exists: true },
      { path: "C:\\W\\private\\notes\\journal", kind: "folder", exists: false },
    ]);
    expect(names(t, "public")).toEqual(["a/", "a/b/", "a/b/c.md", "essays/", "essays/on-focus.md", "about.md"]);
    expect(names(t, "private")).toEqual(["drafts/", "spec-ideas.md"]);
  });
  it("marks notes published once they're pushed (set by sync from M3)", () => {
    const t = markPublished(buildTree(desktop), ["C:\\W\\private\\notes\\spec-ideas.md"]);
    expect(findNode(t, "C:\\W\\private\\notes\\spec-ideas.md")?.node).toMatchObject({ published: true });
  });
});

describe("operations are pure plans", () => {
  const t = buildTree(desktop);
  it("creates a note named from its title, in place", () => {
    const p = planCreateNote(t, "C:\\W\\private\\notes", "Spec ideas");
    expect(p).toMatchObject({ kind: "created", path: "C:\\W\\private\\notes\\spec-ideas-2.md" });
    expect(p.kind === "created" && names(p.tree, "private")).toContain("spec-ideas-2.md");
    expect(names(t, "private")).not.toContain("spec-ideas-2.md");
    expect(planCreateNote(t, "public:x", "A")).toEqual({ kind: "refused", reason: "notFound" });
  });
  it("creates folders with valid, unused names only", () => {
    expect(planCreateFolder(t, "C:\\W\\private\\notes", "Drafts")).toEqual({ kind: "refused", reason: "taken" });
    expect(planCreateFolder(t, "C:\\W\\private\\notes", "a/b")).toEqual({ kind: "refused", reason: "invalid" });
    expect(planCreateFolder(t, "C:\\W\\private\\notes", "NUL")).toEqual({ kind: "refused", reason: "invalid" });
    expect(planCreateFolder(t, "C:\\W\\private\\notes", " Ideas. ")).toMatchObject({ kind: "created", path: "C:\\W\\private\\notes\\Ideas" });
  });
  it("moves keep the moved items as the same objects, and say when visibility changes", () => {
    const journal = findNode(t, "C:\\W\\private\\notes\\journal")!.node;
    const p = planMove(t, ["C:\\W\\private\\notes\\journal"], "C:\\W\\private\\notes\\drafts");
    expect(p).toMatchObject({ kind: "moved", crossesVisibility: false, moves: [{ from: "C:\\W\\private\\notes\\journal", to: "C:\\W\\private\\notes\\drafts\\journal" }] });
    if (p.kind !== "moved") throw new Error();
    expect(findNode(p.tree, "C:\\W\\private\\notes\\drafts\\journal")!.node).toBe(journal);
    expect(planMove(t, ["C:\\W\\private\\notes\\spec-ideas.md"], "C:\\W\\notes")).toMatchObject({ kind: "moved", crossesVisibility: true });
    expect(planMove(t, ["C:\\W\\private\\notes\\journal"], "C:\\W\\private\\notes\\journal")).toEqual({ kind: "refused", reason: "intoItself" });
  });
  it("a moved note whose name is taken gets a free one", () => {
    const withClash = applyChanges(t, [{ path: "C:\\W\\notes\\spec-ideas.md", kind: "note", exists: true }]);
    expect(planMove(withClash, ["C:\\W\\private\\notes\\spec-ideas.md"], "C:\\W\\notes")).toMatchObject({ moves: [{ to: "C:\\W\\notes\\spec-ideas-2.md" }] });
  });
  it("refuses changes to read-only notes", () => {
    const w = buildTree(web);
    expect(planMove(w, ["public:Guides/Garden.md"], "")).toEqual({ kind: "refused", reason: "readOnly" });
    expect(planDelete(w, ["public:Guides/Garden.md"])).toEqual({ kind: "refused", reason: "readOnly" });
  });
  it("deletes, and says when to ask first: folders with notes, five or more items, or a public note", () => {
    expect(planDelete(t, ["C:\\W\\private\\notes\\spec-ideas.md"])).toMatchObject({ kind: "deleted", notes: ["C:\\W\\private\\notes\\spec-ideas.md"], ask: false });
    expect(planDelete(t, ["C:\\W\\private\\notes\\drafts"])).toMatchObject({ kind: "deleted", notes: [], ask: false });
    expect(planDelete(t, ["C:\\W\\private\\notes\\journal"])).toMatchObject({ ask: true, notes: ["C:\\W\\private\\notes\\journal\\2026-10-12.md", "C:\\W\\private\\notes\\journal\\2026-10-13.md"] });
    expect(planDelete(t, ["C:\\W\\notes\\about.md"])).toMatchObject({ ask: true });
  });
  it("renames folders, keeping what's inside as the same objects", () => {
    const inside = (findNode(t, "C:\\W\\private\\notes\\journal")!.node as FolderNode).children[0];
    const p = planRenameFolder(t, "C:\\W\\private\\notes\\journal", "Diary");
    expect(p).toMatchObject({ kind: "renamed", to: "C:\\W\\private\\notes\\Diary" });
    if (p.kind !== "renamed") throw new Error();
    expect((findNode(p.tree, "C:\\W\\private\\notes\\Diary")!.node as FolderNode).children[0]).toBe(inside);
  });
});
