import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NoteWriter } from "../src/main/note-write.ts";
import { RewriteAuthority } from "../src/main/rewrite-authority.ts";

describe("main current-note authority", () => {
  it("New file requires whole UTF-16 AND byte coordinates, not renderer whole-file claims", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-whole-authority-")));
    const path = join(dir, "a.md"), source = "---\nid: original\ncustom: retained\n---\n# Café\n";
    await writeFile(path, source);
    const identity = async () => ({ path, workspace: dir, domain: "private" as const, noteKey: "note", conflict: false });
    const authority = new RewriteAuthority({ writer: new NoteWriter({ rewriteIdentity: identity }), resolve: identity,
      original: async () => "checkpoint", variation: async () => "variation" });
    try {
      const revision = (await authority.activate(1, path))!;
      const token = await authority.prepare(1, revision, source, {
        from: 1, to: source.length, original: source.slice(1), startByte: 0, endByte: Buffer.byteLength(source), expanded: false,
      });
      authority.streamStart(1, token);
      authority.streamEvent(1, token, { type: "delta", text: "# Result\n" });
      authority.streamEvent(1, token, { type: "complete" });
      await authority.complete(1, token, "# Result\n");
      await expect(authority.newFile(1, token, "forged.md")).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(source);
    } finally { authority.closeAll(); await rm(dir, { recursive: true, force: true }); }
  });
  it("restores only a reconciled saved document under current authority, never stale offsets", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-restore-")));
    const path = join(dir, "a.md"); await writeFile(path, "original");
    let foreign = false;
    const identity = async () => ({ path, workspace: dir, domain: "local" as const, noteKey: foreign ? "foreign" : "note", conflict: false });
    const authority = new RewriteAuthority({ writer: new NoteWriter({ rewriteIdentity: identity }), resolve: identity,
      original: async () => "checkpoint", history: async () => [{ source: "saved", original: "original" }] });
    try {
      const revision = (await authority.activate(1, path))!;
      await expect(authority.restore(2, revision, "original", 0, false)).rejects.toThrow();
      await expect(authority.restore(1, "stale", "original", 0, false)).rejects.toThrow();
      foreign = true;
      await expect(authority.restore(1, revision, "original", 0, false)).rejects.toThrow();
      foreign = false;
      const restored = await authority.restore(1, revision, "original", 0, false);
      expect(restored.source).toBe("saved");
      await authority.accept(1, restored.token);
      expect(await readFile(path, "utf8")).toBe("original");
      await writeFile(path, "saved");
      const savedRevision = (await authority.activate(1, path))!;
      const originalRestore = await authority.restore(1, savedRevision, "saved", 0, true);
      expect(originalRestore.source).toBe("original");
      await writeFile(path, "outside");
      await expect(authority.accept(1, originalRestore.token)).rejects.toThrow();
      authority.cancel(1, savedRevision);
      await writeFile(path, "changed original");
      await expect(authority.restore(1, revision, "original", 0, false)).rejects.toThrow();
      const next = (await authority.activate(1, path))!;
      await expect(authority.restore(1, next, "changed original", 0, false)).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("changed original");
    } finally { authority.closeAll(); await rm(dir, { recursive: true, force: true }); }
  });
  it("refuses navigation and outside edits occurring during the history read", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-late-restore-")));
    const path = join(dir, "a.md"); await writeFile(path, "original");
    const identity = async () => ({ path, workspace: dir, domain: "local" as const, noteKey: "note", conflict: false });
    let during: () => Promise<void> = async () => {};
    const authority = new RewriteAuthority({ writer: new NoteWriter({ rewriteIdentity: identity }), resolve: identity,
      original: async () => "checkpoint", history: async () => { await during(); return [{ source: "saved", original: "original" }]; } });
    try {
      const revision = (await authority.activate(1, path))!;
      during = async () => { await writeFile(path, "outside"); };
      await expect(authority.restore(1, revision, "original", 0, false)).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("outside");
      await writeFile(path, "original");
      const next = (await authority.activate(1, path))!;
      during = async () => { authority.close(1); };
      await expect(authority.restore(1, next, "original", 0, false)).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("original");
    } finally { authority.closeAll(); await rm(dir, { recursive: true, force: true }); }
  });
  it("binds saved previews to current window/revision and refuses external edits", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-preview-")));
    const path = join(dir, "a.md"); await writeFile(path, "original");
    const identity = async () => ({ path, workspace: dir, domain: "local" as const, noteKey: "note", conflict: false });
    const authority = new RewriteAuthority({ writer: new NoteWriter({ rewriteIdentity: identity }), resolve: identity,
      original: async () => "checkpoint", history: async (note) => {
        expect(note.noteKey).toBe("note"); return [{ source: "saved complete" }];
      } });
    try {
      const revision = (await authority.activate(1, path))!;
      await expect(authority.history(2, revision, "original")).rejects.toThrow();
      await expect(authority.history(1, "stale", "original")).rejects.toThrow();
      expect(await authority.history(1, revision, "original")).toEqual([{ source: "saved complete" }]);
      expect(await readFile(path, "utf8")).toBe("original");
      await writeFile(path, "external");
      await expect(authority.history(1, revision, "original")).rejects.toThrow();
    } finally { authority.closeAll(); await rm(dir, { recursive: true, force: true }); }
  });
  it("refuses incomplete, mismatched and foreign completions and Accept until durable completion", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "rewrite-authority-")));
    const path = join(dir, "a.md"); await writeFile(path, "original");
    const identity = async () => ({ path, workspace: dir, domain: "local" as const, noteKey: "note", conflict: false });
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const saved: string[] = [];
    const authority = new RewriteAuthority({ writer, resolve: identity, original: async () => "checkpoint",
      variation: async (input, checkpointId, replacement) => {
        expect(input.source).toBe("original"); expect(checkpointId).toBe("checkpoint");
        saved.push(replacement); return "durable-complete";
      } });
    try {
      const revision = await authority.activate(1, path);
      const token = await authority.prepare(1, revision!, "original", { from: 0, to: 8, original: "original", startByte: 0, endByte: 8, expanded: false });
      authority.streamStart(1, token);
      authority.streamEvent(1, token, { type: "delta", text: "complete" });
      await expect(authority.complete(1, token, "complete")).rejects.toThrow();
      await expect(authority.accept(1, token)).rejects.toThrow();
      authority.streamEvent(1, token, { type: "complete" });
      await expect(authority.complete(2, token, "complete")).rejects.toThrow();
      await expect(authority.complete(1, token, "modified")).rejects.toThrow();
      expect(saved).toEqual([]);
      expect(await authority.complete(1, token, "complete")).toBe("durable-complete");
      await authority.accept(1, token);
      expect(saved).toEqual(["complete"]);
      expect(await readFile(path, "utf8")).toBe("original");
    } finally { authority.closeAll(); await rm(dir, { recursive: true, force: true }); }
  });
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
