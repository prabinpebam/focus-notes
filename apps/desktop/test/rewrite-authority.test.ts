import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NoteWriter } from "../src/main/note-write.ts";
import { RewriteAuthority } from "../src/main/rewrite-authority.ts";

describe("main current-note authority", () => {
  it("binds opaque revisions to window/navigation and checkpoints dirty source before permission", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-authority-")));
    const path = join(dir, "a.md"), other = join(dir, "b.md");
    await writeFile(path, "disk"); await writeFile(other, "other");
    const identity = async (p: string) => ({ path: p, workspace: dir, domain: "local" as const, noteKey: createHash("sha256").update(p).digest("hex"), conflict: false });
    const writer = new NoteWriter({ rewriteIdentity: identity });
    let original: any;
    const authority = new RewriteAuthority({ writer, resolve: identity, original: async (input) => { original = input; return "durable"; } });
    try {
      await expect(authority.activate(1, path, "stale reader")).rejects.toThrow();
      const revision = await authority.activate(1, path);
      const target = { from: 0, to: 5, original: "dirty", startByte: 0, endByte: 5, expanded: false };
      await expect(authority.prepare(2, revision!, "dirty", target)).rejects.toThrow();
      const token = await authority.prepare(1, revision!, "dirty", target);
      expect(original.source).toBe("dirty");
      expect(original.diskExpectedHash).toBe(createHash("sha256").update("disk").digest("hex"));
      expect(authority.target(1, token)).toBe("dirty");
      await expect(authority.accept(2, token)).rejects.toThrow();
      await authority.activate(1, other);
      expect(() => authority.target(1, token)).toThrow();
      expect(await readFile(path, "utf8")).toBe("disk");
      await writer.write(path, "saved", "disk");
      expect(await readFile(path, "utf8")).toBe("saved");
    } finally { authority.close(1); await rm(dir, { recursive: true, force: true }); }
  });

  it("failed/late checkpoint never grants permission; close releases held saves and external edits refuse Accept", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-authority-")));
    const path = join(dir, "a.md"); await writeFile(path, "original");
    const identity = async () => ({ path, workspace: dir, domain: "public" as const, noteKey: "note", conflict: false });
    const writer = new NoteWriter({ rewriteIdentity: identity });
    let finish!: (value: string) => void;
    const authority = new RewriteAuthority({ writer, resolve: identity, original: () => new Promise((r) => { finish = r; }) });
    const target = { from: 0, to: 8, original: "original", startByte: 0, endByte: 8, expanded: false };
    try {
      const revision = await authority.activate(1, path);
      const preparing = authority.prepare(1, revision!, "original", target);
      while (!finish) await new Promise((r) => setTimeout(r, 1));
      authority.close(1); finish("durable");
      await expect(preparing).rejects.toThrow();
      await writer.write(path, "original", "original");
      const revision2 = await authority.activate(1, path);
      const pending = authority.prepare(1, revision2!, "original", target);
      await new Promise((r) => setTimeout(r, 10)); finish("durable");
      const token = await pending;
      await writeFile(path, "external");
      await expect(authority.accept(1, token)).rejects.toThrow();
      authority.close(1);
      expect(await writer.write(path, "replacement", "original")).toEqual({ outside: "external" });
    } finally { authority.close(1); await rm(dir, { recursive: true, force: true }); }
  });
});
