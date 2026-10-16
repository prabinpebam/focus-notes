/**
 * New notes without a private repository (D-158, SHR-01): a new public note is held out of Git, in a
 * block the app manages in the notes repository's `info/exclude`, until the writer chooses Make it
 * public or Keep it on this computer only; the hold follows renames, moves and deletes.
 */
import { describe, expect, it } from "vitest";
import {
  answerHeld, buildTree, dropHeld, excludeLine, heldOf, holdNote, holdsNewNotes, moveHeld, NO_HELD, readHeld, writeHeld,
} from "../src/index.ts";

const W = "/W";
const PUB = `${W}/notes`;
const PRIV = `${W}/private/notes`;

describe("the info/exclude block", () => {
  it("anchors each path at the repository's top and escapes Git's wildcard characters", () => {
    expect(excludeLine("notes/Untitled.md")).toBe("/notes/Untitled.md");
    expect(excludeLine("notes/a*b?[c]\\d.md")).toBe("/notes/a\\*b\\?\\[c]\\\\d.md");
    expect(excludeLine("notes/#tag !bang.md")).toBe("/notes/#tag !bang.md");
    expect(excludeLine("notes/trailing .md ")).toBe("/notes/trailing .md\\ ");
    // A line break can't be one pattern: such a path is never written as one.
    expect(excludeLine("notes/a\nb.md")).toBeUndefined();
  });

  it("writes its block after the person's own lines and reads back exactly what it wrote", () => {
    const own = "# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n";
    const held = { waiting: ["notes/Untitled.md", "notes/odd*name.md"], local: ["notes/journal.md"] };
    const text = writeHeld(own, held);
    expect(text.startsWith(own)).toBe(true);
    expect(text).toContain("/notes/Untitled.md\n");
    expect(text).toContain("/notes/odd\\*name.md\n");
    expect(readHeld(text)).toEqual(held);
    // Writing again replaces the block, never repeats it, and keeps the person's lines.
    const again = writeHeld(text, { waiting: [], local: ["notes/journal.md"] });
    expect(again.startsWith(own)).toBe(true);
    expect(again.match(/>>> Focus Notes/g)).toHaveLength(1);
    expect(readHeld(again)).toEqual({ waiting: [], local: ["notes/journal.md"] });
    // Nothing held: no block at all.
    expect(writeHeld(again, NO_HELD)).toBe(own);
  });

  it("reads a missing or foreign file as nothing held, and keeps lines after its block", () => {
    expect(readHeld("")).toEqual(NO_HELD);
    expect(readHeld("/notes/a.md\n")).toEqual(NO_HELD);
    const text = `${writeHeld("", { waiting: ["notes/a.md"], local: [] })}build/\n`;
    expect(readHeld(text)).toEqual({ waiting: ["notes/a.md"], local: [] });
    expect(writeHeld(text, NO_HELD)).toBe("build/\n");
  });

  it("keeps CRLF files CRLF", () => {
    const text = writeHeld("*.log\r\n", { waiting: ["notes/a.md"], local: [] });
    expect(text).not.toMatch(/[^\r]\n/);
    expect(readHeld(text)).toEqual({ waiting: ["notes/a.md"], local: [] });
  });
});

describe("holding a note", () => {
  it("holds a new note once, and an answer moves or releases it", () => {
    const h = holdNote(NO_HELD, "notes/Untitled.md");
    expect(heldOf(h, "notes/Untitled.md")).toBe("waiting");
    expect(holdNote(h, "notes/Untitled.md")).toEqual(h);
    const local = answerHeld(h, "notes/Untitled.md", "local");
    expect(heldOf(local, "notes/Untitled.md")).toBe("local");
    // A note kept here isn't held again as a new note.
    expect(holdNote(local, "notes/Untitled.md")).toEqual(local);
    expect(heldOf(answerHeld(local, "notes/Untitled.md", "public"), "notes/Untitled.md")).toBeUndefined();
    expect(heldOf(answerHeld(h, "notes/Untitled.md", "public"), "notes/Untitled.md")).toBeUndefined();
  });

  it("follows a rename, a folder move, and a delete", () => {
    const h = { waiting: ["notes/Untitled.md", "notes/drafts/b.md"], local: ["notes/drafts/c.md"] };
    expect(moveHeld(h, "notes/Untitled.md", "notes/My idea.md")).toEqual({ waiting: ["notes/My idea.md", "notes/drafts/b.md"], local: ["notes/drafts/c.md"] });
    expect(moveHeld(h, "notes/drafts", "notes/old/drafts")).toEqual({ waiting: ["notes/Untitled.md", "notes/old/drafts/b.md"], local: ["notes/old/drafts/c.md"] });
    // A name that only starts the same isn't inside the folder.
    expect(moveHeld(h, "notes/draft", "notes/x")).toEqual(h);
    expect(dropHeld(h, "notes/drafts")).toEqual({ waiting: ["notes/Untitled.md"], local: [] });
    expect(dropHeld(h, "notes/Untitled.md")).toEqual({ waiting: ["notes/drafts/b.md"], local: ["notes/drafts/c.md"] });
  });

  it("applies only to a workspace whose new notes can only go public", () => {
    const publicOnly = buildTree({ folder: W, roots: [{ id: "public", path: PUB, readOnly: false }], entries: [] });
    const both = buildTree({ folder: W, roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }], entries: [] });
    const folder = buildTree({ folder: W, roots: [{ id: "local", path: W, readOnly: false }], entries: [] });
    expect(holdsNewNotes(publicOnly)).toBe(true);
    expect(holdsNewNotes(both)).toBe(false);
    expect(holdsNewNotes(folder)).toBe(false);
  });
});
