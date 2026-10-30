import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoteWriter, noteSave } from "../src/main/note-write.ts";

const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const fixture = () => {
  const path = join(mkdtempSync(join(tmpdir(), "fn-rewrite-hold-")), "note.md");
  writeFileSync(path, "Original\r\n");
  return realpathSync.native(path);
};
const identity = async () => ({ domain: "private" as const, noteKey: "opaque-note", conflict: false });
const request = { domain: "private" as const, noteKey: "opaque-note", baselineHash: hash("Original\r\n") };

describe("actual-note rewrite preparation (RWR-23/RWR-28)", () => {
  it("holds the real note: canonical noteSave acknowledgement waits for release, then uses the existing writer", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const lease = await writer.prepareRewrite(path, request);
    expect(lease.baselineHash).toBe(hash("Original\r\n"));
    expect(lease.identity).toMatchObject({ domain: "private", noteKey: "opaque-note", path });
    expect(lease.identity.fileId).toBeTruthy();
    expect(lease.generation).toBe("blocked-durable-history-unavailable");
    const written = vi.fn();
    const save = noteSave({ path: String, before: async () => "", write: (p, c, e) => writer.write(p, c, e), written });
    const saving = save(path, "Ordinary typing\r\n", "Original\r\n");
    await new Promise((r) => setTimeout(r, 10));
    expect(readFileSync(path, "utf8")).toBe("Original\r\n");
    expect(written).not.toHaveBeenCalled();
    lease.release();
    lease.release(); // idempotent discard/cancel cleanup
    await saving;
    expect(readFileSync(path, "utf8")).toBe("Ordinary typing\r\n");
    expect(written).toHaveBeenCalledOnce();
  });

  it("prepares after earlier writes, and refuses a stale baseline without leaving a hold", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const previous = writer.write(path, "Earlier save");
    await expect(writer.prepareRewrite(path, request)).rejects.toThrow("rewrite-stale");
    await previous;
    await writer.write(path, "Later save", "Earlier save");
    expect(readFileSync(path, "utf8")).toBe("Later save");
  });

  it("preserves outside edits even when a held save supplied no expectation", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const lease = await writer.prepareRewrite(path, request);
    const saving = writer.write(path, "Ordinary typing");
    writeFileSync(path, "Outside edit");
    lease.release();
    expect(await saving).toEqual({ outside: "Outside edit" });
    expect(readFileSync(path, "utf8")).toBe("Outside edit");
  });

  it("refuses competing preparations; abort releases queued saves and permits another operation", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const abort = new AbortController();
    const lease = await writer.prepareRewrite(path, { ...request, signal: abort.signal });
    await expect(writer.prepareRewrite(path, request)).rejects.toThrow("rewrite-busy");
    const saving = writer.write(path, "Original\r\n");
    abort.abort();
    await saving;
    lease.release(); // cannot release the next lease
    const next = await writer.prepareRewrite(path, request);
    expect(next.leaseId).not.toBe(lease.leaseId);
    next.release();
  });

  it.each([
    ["domain", { ...request, domain: "public" as const }, identity, "rewrite-identity"],
    ["note", { ...request, noteKey: "other-note" }, identity, "rewrite-identity"],
    ["conflict", request, async () => ({ ...(await identity()), conflict: true }), "rewrite-conflict"],
  ])("refuses %s without writing or exposing note text", async (_name, req, inspect, code) => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: inspect });
    await expect(writer.prepareRewrite(path, req)).rejects.toThrow(code);
    expect(readFileSync(path, "utf8")).toBe("Original\r\n");
    await writer.write(path, "Still writable", "Original\r\n");
  });

  it("uses the existing ready/read-only gate and fails closed without main identity support", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity, ready: async () => { throw new Error("read-only"); } });
    await expect(writer.prepareRewrite(path, request)).rejects.toThrow("read-only");
    await expect(new NoteWriter().prepareRewrite(path, request)).rejects.toThrow("rewrite-unavailable");
    expect(readFileSync(path, "utf8")).toBe("Original\r\n");
  });

  it("cancellation during preparation releases the queue and never returns a lease", async () => {
    const path = fixture();
    let ready!: () => void;
    const gate = new Promise<void>((r) => { ready = r; });
    const writer = new NoteWriter({ rewriteIdentity: identity, ready: () => gate });
    const abort = new AbortController();
    const preparing = writer.prepareRewrite(path, { ...request, signal: abort.signal });
    abort.abort();
    ready();
    await expect(preparing).rejects.toThrow("rewrite-cancelled");
    await writer.write(path, "After cancel", "Original\r\n");
    expect(readFileSync(path, "utf8")).toBe("After cancel");
  });

  it.each(["deleted", "replaced"])("never recreates or writes into a %s held note", async (kind) => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const lease = await writer.prepareRewrite(path, request);
    const saving = writer.write(path, "Ordinary typing", "Original\r\n");
    if (kind === "deleted") unlinkSync(path);
    else {
      renameSync(path, `${path}.old`);
      writeFileSync(path, "Original\r\n"); // same bytes, different file identity
    }
    lease.release();
    await expect(saving).rejects.toThrow("rewrite-stale");
    if (kind === "replaced") expect(readFileSync(path, "utf8")).toBe("Original\r\n");
    else expect(() => readFileSync(path)).toThrow();
  });

  it("serializes several held ordinary saves without mistaking its own atomic rename for path reuse", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const lease = await writer.prepareRewrite(path, request);
    const first = writer.write(path, "Typing one");
    const second = writer.write(path, "Typing two");
    lease.release();
    expect(await first).toBeUndefined();
    expect(await second).toBeUndefined();
    expect(readFileSync(path, "utf8")).toBe("Typing two");
  });

  it("refuses a same-content replacement made while the first held save's written hook is pending", async () => {
    const path = fixture();
    let entered!: () => void;
    let resume!: () => void;
    const started = new Promise<void>((r) => { entered = r; });
    const pending = new Promise<void>((r) => { resume = r; });
    const writer = new NoteWriter({
      rewriteIdentity: identity,
      written: async () => { entered(); await pending; },
    });
    const lease = await writer.prepareRewrite(path, request);
    const first = writer.write(path, "Typing one");
    const second = writer.write(path, "Typing two");
    lease.release();
    await started;
    renameSync(path, `${path}.saved`);
    writeFileSync(path, "Typing one"); // retain the saved file so its identity cannot be reused
    const refused = expect(second).rejects.toThrow("rewrite-stale");
    resume();
    await first;
    await refused;
    expect(readFileSync(path, "utf8")).toBe("Typing one");
    expect(readFileSync(`${path}.saved`, "utf8")).toBe("Typing one");
  });

  it("keeps successful rename lineage when a written hook throws so the latest held save lands", async () => {
    const path = fixture();
    const written = vi.fn().mockRejectedValueOnce(new Error("fixture-hook-failed")).mockResolvedValue(undefined);
    const writer = new NoteWriter({ rewriteIdentity: identity, written });
    const lease = await writer.prepareRewrite(path, request);
    const first = writer.write(path, "Typing one");
    const second = writer.write(path, "Typing two");
    const failed = expect(first).rejects.toThrow("fixture-hook-failed");
    const saved = expect(second).resolves.toBeUndefined();
    lease.release();
    await failed;
    await saved;
    expect(readFileSync(path, "utf8")).toBe("Typing two");
    expect(written).toHaveBeenCalledTimes(2);
  });

  it("does not hold unrelated notes and exposes only frozen content-free lease metadata", async () => {
    const path = fixture();
    const other = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const lease = await writer.prepareRewrite(path, request);
    await writer.write(other, "Unrelated typing");
    expect(readFileSync(other, "utf8")).toBe("Unrelated typing");
    expect(Object.isFrozen(lease)).toBe(true);
    expect(Object.isFrozen(lease.identity)).toBe(true);
    expect(JSON.stringify(lease)).not.toContain("Original");
    lease.release();
  });

  it("never relays arbitrary main-hook error text, including a rewrite-prefixed message", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: async () => { throw new Error("rewrite-private fixture content"); } });
    await expect(writer.prepareRewrite(path, request)).rejects.toThrow(/^rewrite-unavailable$/);
    await writer.write(path, "After failure", "Original\r\n");
    expect(readFileSync(path, "utf8")).toBe("After failure");
  });

  it("keeps the existing writeQueues boundary held even before any later save is enqueued", async () => {
    const path = fixture();
    const writer = new NoteWriter({ rewriteIdentity: identity });
    const lease = await writer.prepareRewrite(path, request);
    const boundary = writer.queues.get(path);
    expect(boundary).toBeDefined();
    let passed = false;
    const waiting = boundary!.then(() => { passed = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(passed).toBe(false);
    lease.release();
    await waiting;
    expect(passed).toBe(true);
  });
});
