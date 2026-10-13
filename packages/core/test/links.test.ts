/** Link updates (FIL-09): relative links follow renames and moves, byte for byte everywhere else. */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, serializeMarkdown } from "@focus-notes/markdown";
import { buildTree, planLinkWrites, rewriteLinks } from "../src/index.ts";

const rw = (text: string, from: string, moves: { from: string; to: string }[], to = from) => rewriteLinks(text, from, to, moves).text;

describe("rewriteLinks (FIL-09)", () => {
  it("rewrites a relative link to a moved note, and only its destination", () => {
    const src = "# N\n\nSee [the plan](../a/b.md) today.\n";
    expect(rw(src, "x/n.md", [{ from: "a/b.md", to: "c/b.md" }])).toBe("# N\n\nSee [the plan](../c/b.md) today.\n");
    expect(rewriteLinks(src, "x/n.md", "x/n.md", [{ from: "a/b.md", to: "c/b.md" }]).links).toBe(1);
  });
  it("keeps fragments and queries, titles, and a leading ./", () => {
    expect(rw("[t](b.md#heading) [u](./b.md?x=1 \"T\")\n", "n.md", [{ from: "b.md", to: "bee.md" }])).toBe("[t](bee.md#heading) [u](./bee.md?x=1 \"T\")\n");
  });
  it("keeps angle brackets and percent-encoding, spelling new names the same way", () => {
    const moves = [{ from: "My Note.md", to: "Box Two/My Note.md" }];
    expect(rw("[a](<My Note.md>) [b](My%20Note.md)\n", "n.md", moves)).toBe("[a](<Box Two/My Note.md>) [b](Box%20Two/My%20Note.md)\n");
    expect(rw("[c](caf%C3%A9.md)\n", "n.md", [{ from: "café.md", to: "d/café.md" }])).toBe("[c](d/caf%C3%A9.md)\n");
    expect(rw("[p](a\\(1\\).md)\n", "n.md", [{ from: "a(1).md", to: "d/a(1).md" }])).toBe("[p](d/a\\(1\\).md)\n");
    expect(rw("[n](x.md)\n", "n.md", [{ from: "x.md", to: "Odd (1)/x.md" }])).toBe("[n](Odd%20%281%29/x.md)\n");
  });
  it("rewrites images and reference definitions, and links to anything in a moved folder", () => {
    const src = "![pic](Box/img/p.png) and [r][id].\n\n[id]: Box/b.md \"Title\"\n";
    expect(rw(src, "n.md", [{ from: "Box", to: "Crate" }])).toBe("![pic](Crate/img/p.png) and [r][id].\n\n[id]: Crate/b.md \"Title\"\n");
  });
  it("never changes links in code, absolute URLs, site-root links, or links within the note", () => {
    const src = "`[c](b.md)`\n\n```\n[d](b.md)\n```\n\n[w](https://example.com/b.md) [m](mailto:a@b.c) [r](/b.md) [h](#b) <https://x.org/b.md>\n";
    expect(rw(src, "n.md", [{ from: "b.md", to: "Box/b.md" }])).toBe(src);
  });
  it("rewrites a moved note's own links relative to where it goes", () => {
    const src = "[up](../b.md) [sib](sib.md) ![img](pics/p.png) [self](n.md#top) [web](https://e.com)\n";
    expect(rw(src, "a/n.md", [{ from: "a/n.md", to: "n.md" }], "n.md")).toBe("[up](b.md) [sib](a/sib.md) ![img](a/pics/p.png) [self](n.md#top) [web](https://e.com)\n");
  });
  it("leaves links between notes that move together, and links out of the workspace's root, as they are", () => {
    const moves = [{ from: "a", to: "z/a" }];
    expect(rw("[s](s.md) [d](sub/d.md)\n", "a/n.md", moves, "z/a/n.md")).toBe("[s](s.md) [d](sub/d.md)\n");
    expect(rw("[o](../../outside.md)\n", "n.md", [{ from: "n.md", to: "q/n.md" }], "q/n.md")).toBe("[o](../../outside.md)\n");
  });
  it("follows a rename by title (FIL-07), matching names without regard to case", () => {
    expect(rw("[i](Idea.md) [j](idea.md)\n", "n.md", [{ from: "idea.md", to: "better-idea.md" }])).toBe("[i](better-idea.md) [j](better-idea.md)\n");
  });
  it("works on the desktop's own paths, with backslashes and a drive", () => {
    const moves = [{ from: "E:\\ws\\notes\\a\\b.md", to: "E:\\ws\\notes\\c\\d\\b.md" }];
    expect(rw("[b](../a/b.md)\n", "E:\\ws\\notes\\x\\n.md", moves)).toBe("[b](../c/d/b.md)\n");
    expect(rw("[b](/abs.md) [c](../../../../../up.md)\n", "E:\\ws\\notes\\x\\n.md", [{ from: "E:\\ws\\notes\\x\\n.md", to: "E:\\ws\\notes\\n.md" }], "E:\\ws\\notes\\n.md"))
      .toBe("[b](/abs.md) [c](../../../../../up.md)\n");
    expect(rw("[b](a/b.md)\n", "/home/u/n.md", [{ from: "/home/u/a", to: "/home/u/z" }])).toBe("[b](z/b.md)\n");
  });
  it("keeps a byte-order mark, CRLF line endings, and a trailing slash", () => {
    expect(rw("\uFEFF# T\r\n\r\n[f](Box/)\r\n", "n.md", [{ from: "Box", to: "Crate" }])).toBe("\uFEFF# T\r\n\r\n[f](Crate/)\r\n");
  });
  it("leaves every file of the round-trip corpus byte for byte when nothing it links to moves, and the bridge round-trips the result", () => {
    const dir = join(import.meta.dirname, "../../markdown/test/corpus");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(rw(src, "n.md", [{ from: "elsewhere.md", to: "x/elsewhere.md" }])).toBe(src);
      // Moving the note itself rewrites its relative links; the result is still a file the bridge keeps byte for byte.
      const out = rw(src, "n.md", [{ from: "n.md", to: "deep/n.md" }], "deep/n.md");
      const parsed = parseMarkdown(out);
      expect(serializeMarkdown(parsed.doc, parsed)).toBe(out);
    }
  });
});

describe("planLinkWrites (FIL-09)", () => {
  const tree = buildTree({
    folder: "",
    roots: [{ id: "local", path: "", readOnly: false }, { id: "public", path: "public:", readOnly: true }],
    entries: [
      { path: "a.md", kind: "note" }, { path: "b.md", kind: "note" }, { path: "c.md", kind: "note" }, { path: "Box", kind: "folder" },
      { path: "Box/inner.md", kind: "note" }, { path: "public:About.md", kind: "note", published: true },
    ],
  });
  const files: Record<string, string> = {
    "a.md": "# A\n\n[to b](b.md)\n",
    "b.md": "# B\n\n[back](a.md) [in](Box/inner.md)\n",
    "c.md": "# C\n\nMentions b.md in prose, and `[b](b.md)` in code.\n",
    "Box/inner.md": "[b](../b.md)\n",
    "public:About.md": "[b](b.md)\n",
  };
  it("lists every note whose links change, the moved one included, and never reads the instance's read-only notes", async () => {
    const read: string[] = [];
    const writes = await planLinkWrites(tree, [{ from: "b.md", to: "Box/b.md" }], async (p) => { read.push(p); return files[p]!; });
    expect(read).not.toContain("public:About.md");
    expect(writes).toEqual([
      { from: "Box/inner.md", path: "Box/inner.md", before: files["Box/inner.md"], text: "[b](b.md)\n", links: 1 },
      { from: "a.md", path: "a.md", before: files["a.md"], text: "# A\n\n[to b](Box/b.md)\n", links: 1 },
      { from: "b.md", path: "Box/b.md", before: files["b.md"], text: "# B\n\n[back](../a.md) [in](inner.md)\n", links: 2 },
    ]);
  });
  it("reads nothing for a batch with no moves, and skips notes it can't read", async () => {
    expect(await planLinkWrites(tree, [], async () => { throw new Error("no"); })).toEqual([]);
    // A rename in place: b's own links still work; c only mentions it; a can't be read.
    expect(await planLinkWrites(tree, [{ from: "b.md", to: "d.md" }], async (p) => { if (p === "a.md") throw new Error("gone"); return files[p]!; })).toEqual([
      { from: "Box/inner.md", path: "Box/inner.md", before: files["Box/inner.md"], text: "[b](../d.md)\n", links: 1 },
    ]);
  });
});
