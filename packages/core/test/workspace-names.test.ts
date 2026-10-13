/** File names from titles (FIL-07): the rules, clashes, and when a name follows its title. */
import { describe, expect, it } from "vitest";
import { fileNameForTitle, fileStemForTitle } from "../src/text.ts";
import { buildTree, followsTitle, planRename, titleOfMarkdown, uniqueName, type WorkspaceScan } from "../src/workspace.ts";

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("file names from titles (FIL-07)", () => {
  it("is lowercase and hyphenated, and keeps letters in any language", () => {
    expect(fileNameForTitle("On focus")).toBe("on-focus.md");
    expect(fileNameForTitle("  Spec   ideas  ")).toBe("spec-ideas.md");
    expect(fileNameForTitle("Café au lait")).toBe("café-au-lait.md");
    expect(fileNameForTitle("Ελληνικά Σημειώσεις")).toBe("ελληνικά-σημειώσεις.md");
    expect(fileNameForTitle("日本語 のメモ")).toBe("日本語-のメモ.md");
  });
  it("removes characters Windows, macOS, or Linux reject", () => {
    for (const ch of ["\\", "/", ":", "*", "?", '"', "<", ">", "|", "\u0000", "\u001f", "\u007f"]) {
      expect(fileNameForTitle(`a${ch}b`)).toBe("a-b.md");
    }
    expect(fileNameForTitle("**Bold** idea: v2?")).toBe("bold-idea-v2.md");
  });
  it("drops leading and trailing dots, spaces, and hyphens, so nothing is hidden or trimmed by Windows", () => {
    expect(fileNameForTitle("...hidden")).toBe("hidden.md");
    expect(fileNameForTitle("Draft. . .")).toBe("draft.md");
    expect(fileNameForTitle(" - Dash - ")).toBe("dash.md");
    expect(fileNameForTitle("...")).toBe("untitled.md");
  });
  it("gives reserved Windows names a suffix, whatever their case or extension", () => {
    for (const name of ["CON", "con", "Nul", "PRN", "aux", "COM1", "lpt9", "COM¹"]) {
      expect(fileStemForTitle(name)).toBe(`${name.toLowerCase()}-note`);
    }
    expect(fileStemForTitle("con.backup")).toBe("con-note.backup");
    expect(fileStemForTitle("console")).toBe("console");
  });
  it("turns punctuation and symbols into hyphens, so names read well in links and URLs", () => {
    expect(fileNameForTitle("On focus, again!")).toBe("on-focus-again.md");
    expect(fileNameForTitle("Q&A #3 (draft) 50% done")).toBe("q-a-3-draft-50-done.md");
    expect(fileNameForTitle("v1.2_notes")).toBe("v1.2_notes.md");
    expect(fileNameForTitle("Ideas 💡")).toBe("ideas.md");
  });
  it("keeps at most 80 characters, never splits a character, and stays under Linux's 255-byte limit", () => {
    expect([...fileStemForTitle("a".repeat(200))]).toHaveLength(80);
    expect(fileStemForTitle(`${"a".repeat(79)} b`)).toBe("a".repeat(79));
    // g + a combining tilde has no single code point: one character, two code points, three bytes.
    const stem = fileStemForTitle("g\u0303".repeat(100));
    expect(stem).toBe("g\u0303".repeat(80));
    expect(bytes(`${stem}-99.md`)).toBeLessThanOrEqual(255);
    expect(bytes(fileNameForTitle("日".repeat(100)))).toBeLessThanOrEqual(255);
    expect(bytes(fileNameForTitle("\u{10900}".repeat(80)))).toBeLessThanOrEqual(255);
  });
});

describe("clashes (FIL-07)", () => {
  it("adds -2, -3 within a folder, ignoring case and Unicode form", () => {
    expect(uniqueName("plan", [])).toBe("plan.md");
    expect(uniqueName("plan", ["plan.md"])).toBe("plan-2.md");
    expect(uniqueName("plan", ["Plan.md", "plan-2.md"])).toBe("plan-3.md");
    expect(uniqueName("café", ["Cafe\u0301.md"])).toBe("café-2.md");
  });
  it("shortens the name to keep the suffix within 80 characters", () => {
    const long = "a".repeat(80);
    const name = uniqueName(long, [`${long}.md`]);
    expect(name).toBe(`${"a".repeat(78)}-2.md`);
  });
});

describe("titles and following them (FIL-07)", () => {
  it("reads the first H1, skipping front matter and code", () => {
    expect(titleOfMarkdown("---\nid: x\n---\n\n# On focus\n\nText")).toBe("On focus");
    expect(titleOfMarkdown("```\n# not a title\n```\n\n# Real  *title*  #\n")).toBe("Real title");
    expect(titleOfMarkdown("Setext title\n===\n")).toBe("Setext title");
    expect(titleOfMarkdown("## Only a section\n")).toBeUndefined();
  });
  it("a name follows its title when it's the title's name, a numbered clash of it, or untitled", () => {
    expect(followsTitle("on-focus.md", "On focus")).toBe(true);
    expect(followsTitle("on-focus-2.md", "On focus")).toBe(true);
    expect(followsTitle("Untitled 3.md", "Untitled 3")).toBe(true);
    expect(followsTitle("Welcome.md", "Welcome to Focus Notes")).toBe(false);
  });
});

describe("renaming after the first publish (FIL-07)", () => {
  const scan: WorkspaceScan = {
    folder: "/w",
    roots: [{ id: "public", path: "/w/notes", readOnly: false }],
    entries: [
      { path: "/w/notes/untitled.md", kind: "note" },
      { path: "/w/notes/about.md", kind: "note", published: true },
      { path: "/w/notes/plan.md", kind: "note" },
    ],
  };
  const tree = buildTree(scan);
  it("follows the title until the note is published", () => {
    expect(planRename(tree, "/w/notes/untitled.md", "Plan")).toMatchObject({ kind: "renamed", from: "/w/notes/untitled.md", to: "/w/notes/plan-2.md" });
  });
  it("keeps a published note's name, unless it's renamed on purpose", () => {
    expect(planRename(tree, "/w/notes/about.md", "About me")).toEqual({ kind: "blocked", reason: "published" });
    expect(planRename(tree, "/w/notes/about.md", "About me", { explicit: true })).toMatchObject({ kind: "renamed", to: "/w/notes/about-me.md" });
  });
  it("leaves a name that already fits the title alone", () => {
    expect(planRename(tree, "/w/notes/plan.md", "PLAN")).toEqual({ kind: "unchanged" });
  });
  it("never renames in a read-only root or outside the workspace", () => {
    const ro = buildTree({ ...scan, roots: [{ id: "public", path: "/w/notes", readOnly: true }] });
    expect(planRename(ro, "/w/notes/untitled.md", "Plan")).toEqual({ kind: "blocked", reason: "readOnly" });
    expect(planRename(tree, "/elsewhere/untitled.md", "Plan")).toBeUndefined();
  });
});
