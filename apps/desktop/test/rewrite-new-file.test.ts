import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRewriteFile } from "../src/main/rewrite-new-file.ts";
import { RewriteAuthority } from "../src/main/rewrite-authority.ts";
import { NoteWriter } from "../src/main/note-write.ts";
import { realpath } from "node:fs/promises";

it.each(["public", "private"] as const)("new file preserves %s domain/source; refuses dirty, stale and same-note windows", async (domain) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-domain-")));
  const path = join(dir, "source.md"), source = "---\nid: original-id\n---\nOriginal\n";
  await writeFile(path, source);
  const identity = async () => ({ path, workspace: dir, domain, noteKey: "source-key", conflict: false });
  const authority = new RewriteAuthority({ writer: new NoteWriter({ rewriteIdentity: identity }), resolve: identity,
    original: async () => "original", variation: async () => "variation" });
  const prepare = async (text = source) => {
    const revision = (await authority.activate(1, path))!;
    const token = await authority.prepare(1, revision, text, { from: 0, to: text.length, startByte: 0, endByte: Buffer.byteLength(text), original: text, expanded: false });
    authority.streamStart(1, token);
    authority.streamEvent(1, token, { type: "delta", text: "# Rewritten\n" });
    authority.streamEvent(1, token, { type: "complete" });
    await authority.complete(1, token, "# Rewritten\n");
    return token;
  };
  try {
    let token = await prepare(source + "dirty");
    await expect(authority.newFile(1, token, "dirty.md")).rejects.toThrow();
    authority.closeAll();
    token = await prepare();
    await authority.activate(2, path);
    await expect(authority.newFile(1, token, "window.md")).rejects.toThrow();
    authority.close(2);
    await writeFile(path, "outside");
    await expect(authority.newFile(1, token, "stale.md")).rejects.toThrow();
    authority.closeAll(); await writeFile(path, source);
    token = await prepare();
    await expect(authority.newFile(2, token, "foreign.md")).rejects.toThrow();
    await expect(authority.newFile(1, token, "../escape.md")).rejects.toThrow();
    const created = await authority.newFile(1, token, "new.md");
    expect(created).toBe(join(dir, "new.md"));
    expect(await readFile(path, "utf8")).toBe(source);
    expect(await readFile(created, "utf8")).not.toContain("original-id");
    expect((await readdir(dir)).sort()).toEqual(["new.md", "source.md"]);
  } finally { authority.closeAll(); await rm(dir, { recursive: true, force: true }); }
});

it("publishes complete Markdown exclusively; collision and interrupted validation never overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-new-"));
  const source = join(dir, "source.md"), dest = join(dir, "new.md");
  await writeFile(source, "---\nid: source-id\n---\nOriginal\n");
  const before = await readFile(source);
  try {
    let live = true;
    await expect(createRewriteFile(dest, "---\nid: source-id\n---\nNew\n", async () => {
      if (!live) throw new Error("interrupted");
      live = false;
    })).rejects.toThrow("interrupted");
    expect(await readdir(dir)).toEqual(["source.md"]);
    await createRewriteFile(dest, "---\nid: source-id\n---\nNew\n", async () => {});
    const text = await readFile(dest, "utf8");
    expect(text).toContain("New");
    expect(text).toMatch(/id: [a-f0-9-]{36}/);
    expect(text).not.toContain("source-id");
    await expect(createRewriteFile(dest, "Collision", async () => {})).rejects.toThrow();
    expect(await readFile(dest, "utf8")).toBe(text);
    expect(await readFile(source)).toEqual(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
