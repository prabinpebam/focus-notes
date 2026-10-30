import { afterEach, describe, expect, it } from "vitest";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RewriteOriginalStore } from "../src/main/rewrite-original.ts";
import { createRunner } from "../src/main/git/run.ts";
import type { DraftCrypt } from "../src/main/drafts.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
// Disposable encryption boundary double, NOT evidence of Electron/OS key-store availability.
const key = randomBytes(32);
const crypt: DraftCrypt = {
  available: () => true,
  encrypt: (text) => {
    const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  },
  decrypt: (b) => {
    const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString("utf8");
  },
};
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), "rewrite-original-"));
  roots.push(dataDir);
  const options = { dataDir, workspace: join(dataDir, "workspace"), crypt };
  const source = "\uFEFFOriginal fixture café\r\n";
  const target = { from: 1, to: 9, startByte: 3, endByte: 11, original: "Original", expanded: false };
  const diskExpectedHash = createHash("sha256").update("Older persisted fixture; canonical source is dirty").digest("hex");
  const input = { sessionId: randomUUID(), noteKey: "fixture-identity", domain: "public" as "public" | "private", diskExpectedHash, source, target };
  return { options, input, store: new RewriteOriginalStore(options) };
}
describe("D-247 original prerequisite (no generation integration)", () => {
  it("persists distinct complete variations bound to the original and recovers after reconstruction", async () => {
    const { options, input, store } = await fixture();
    input.domain = "private";
    const original = await store.original(input);
    const first = await store.variation(input, original.commitId, "First complete.");
    const second = await store.variation(input, original.commitId, "Second complete.");
    expect(first).not.toBe(second);
    const recovered = await new RewriteOriginalStore(options).variations(input);
    expect(recovered.map((r) => r.replacement).sort()).toEqual(["First complete.", "Second complete."]);
    expect(recovered.every((r) => r.checkpointId === original.commitId)).toBe(true);
    expect(await store.recoverSession(input)).toEqual(input);
    await expect(store.variation(input, "0".repeat(40), "Wrong checkpoint")).rejects.toThrow();
    await expect(store.variation(input, original.commitId, "")).rejects.toThrow();
  });
  it.each(["public", "private"] as const)("recovers exact %s canonical source after reconstruction, never writes workspace", async (domain) => {
    const { options, input, store } = await fixture();
    input.domain = domain;
    const ack = await store.original(input);
    expect(await new RewriteOriginalStore(options).recover(ack, { domain, noteKey: input.noteKey })).toEqual(input);
    expect(await new RewriteOriginalStore(options).recoverSession(input)).toEqual(input);
    expect(await readdir(options.dataDir)).toEqual(["rewrite-history"]);
    expect(ack.domain).toBe(domain);
  });
  it("encrypts private original AND identity/target index in every reachable Git blob", async () => {
    const { input, store, options } = await fixture();
    input.domain = "private";
    const ack = await store.original(input);
    const repo = join(options.dataDir, "rewrite-history", ack.workspaceKey, "private.git");
    const runner = createRunner({ here: true });
    const run: typeof runner = (call) => runner({ ...call, args: [`--git-dir=${repo}`, ...call.args] });
    const tree = await run({ cwd: repo, args: ["ls-tree", "-r", ack.commitId] });
    expect(tree.code, tree.stderr).toBe(0);
    expect(tree.stdout).toContain("\tcontent\n");
    expect(tree.stdout).toContain("\trecord.json\n");
    for (const name of ["content", "record.json"]) {
      const blob = await run({ cwd: repo, args: ["show", `${ack.commitId}:${name}`] });
      expect(blob.stdout).not.toContain("Original");
      expect(blob.stdout).not.toContain(input.noteKey);
      expect(blob.stdout).not.toContain("startByte");
      expect(JSON.parse(blob.stdout).encoding).toBe("os-encrypted");
    }
    expect((await run({ cwd: repo, args: ["remote"] })).stdout).toBe("");
    await expect(readFile(join(repo, "index"))).rejects.toThrow();
    await expect(readFile(join(repo, "logs", "HEAD"))).rejects.toThrow();
  });
  it("refuses cross-domain/note/workspace identity and missing or corrupt state", async () => {
    const { input, store, options } = await fixture();
    const ack = await store.original(input);
    await expect(store.recover(ack, { domain: "private", noteKey: input.noteKey })).rejects.toThrow("rewrite-history-unavailable");
    await expect(store.recover(ack, { domain: "public", noteKey: "other" })).rejects.toThrow("rewrite-history-unavailable");
    await expect(new RewriteOriginalStore({ ...options, workspace: "different" }).recover(ack, input)).rejects.toThrow("rewrite-history-unavailable");
    const repo = join(options.dataDir, "rewrite-history", ack.workspaceKey, "public.git");
    await writeFile(join(repo, ...ack.ref.split("/")), "broken\n");
    await expect(store.recover(ack, input)).rejects.toThrow("rewrite-history-unavailable");
    await rm(repo, { recursive: true });
    await expect(store.recover(ack, input)).rejects.toThrow("rewrite-history-unavailable");
  });
  it("fails closed without encryption, Git or durable ref acknowledgement; never leaks errors", async () => {
    const { input, options } = await fixture();
    await expect(new RewriteOriginalStore({ ...options, crypt: undefined }).original({ ...input, domain: "private" })).rejects.toThrow("rewrite-history-unavailable");
    await expect(new RewriteOriginalStore({ ...options, crypt: { ...crypt, available: () => false } }).original({ ...input, domain: "private" })).rejects.toThrow("rewrite-history-unavailable");
    const run = createRunner({ here: true });
    const store = new RewriteOriginalStore({ ...options, run: async (call) => {
      if (call.args.includes("update-ref")) throw new Error(input.source);
      return run(call);
    } });
    await expect(store.original(input)).rejects.toThrow(/^rewrite-history-unavailable$/);
    await expect(new RewriteOriginalStore({ ...options, run: async () => ({ code: -1, stdout: "", stderr: input.source }) }).original(input)).rejects.toThrow(/^rewrite-history-unavailable$/);
  });
  it("refuses remote configuration and stale source coordinates", async () => {
    const { input, store, options } = await fixture();
    await expect(store.original({ ...input, target: { ...input.target, startByte: 0 } })).rejects.toThrow("rewrite-history-unavailable");
    await expect(store.original({ ...input, diskExpectedHash: "not-main-sha256" })).rejects.toThrow("rewrite-history-unavailable");
    const ack = await store.original(input);
    const repo = join(options.dataDir, "rewrite-history", ack.workspaceKey, "public.git");
    const config = await readFile(join(repo, "config"), "utf8");
    await writeFile(join(repo, "config"), config + '\n[remote "forbidden"]\nurl = https://invalid.example\n');
    await expect(store.recover(ack, input)).rejects.toThrow("rewrite-history-unavailable");
  });
  it("acknowledges only after durable ref/readback, serializes across instances and refuses duplicate sessions", async () => {
    const { input, options } = await fixture();
    const run = createRunner({ here: true });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const reached = new Promise<void>((r) => { entered = r; });
    const calls: string[][] = [];
    const store = new RewriteOriginalStore({ ...options, run: async (call) => {
      calls.push(call.args);
      if (call.args.includes("update-ref")) { entered(); await gate; }
      return run(call);
    } });
    let acknowledged = false;
    const pending = store.original(input).then((ack) => { acknowledged = true; return ack; });
    await reached;
    try {
      expect(acknowledged).toBe(false);
      await expect(new RewriteOriginalStore(options).original({ ...input, sessionId: randomUUID() })).rejects.toThrow("rewrite-history-unavailable");
    } finally { release(); }
    const ack = await pending;
    expect(await new RewriteOriginalStore(options).recoverSession(input)).toEqual(input);
    await expect(new RewriteOriginalStore(options).original(input)).rejects.toThrow("rewrite-history-unavailable");
    expect(calls.every((args) => args.includes("core.fsync=all") && args.includes("core.fsyncMethod=fsync"))).toBe(true);
    const repo = join(options.dataDir, "rewrite-history", ack.workspaceKey, "public.git");
    await symlink(options.dataDir, join(repo, "objects", "escape"), "junction");
    await expect(new RewriteOriginalStore(options).recover(ack, input)).rejects.toThrow("rewrite-history-unavailable");
  });
  it("refuses encryption/readback corruption instead of acknowledging an unrecoverable original", async () => {
    const { input, options } = await fixture();
    const broken = new RewriteOriginalStore({ ...options, crypt: { ...crypt, decrypt: () => { throw new Error(input.source); } } });
    await expect(broken.original({ ...input, domain: "private" })).rejects.toThrow(/^rewrite-history-unavailable$/);
    const ack = await new RewriteOriginalStore(options).original(input);
    const run = createRunner({ here: true });
    const corrupted = new RewriteOriginalStore({ ...options, run: async (call) => call.args.at(-1)?.endsWith(":content")
      ? { code: 0, stdout: "damaged", stderr: "" } : run(call) });
    await expect(corrupted.recover(ack, input)).rejects.toThrow(/^rewrite-history-unavailable$/);
  });
});
