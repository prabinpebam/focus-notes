import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpointEncryptionKey } from "../src/main/rewrite-key-checkpoint.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

describe("Windows native encryption key checkpoint", () => {
  it("does not acknowledge until the native key file is actually written", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-key-checkpoint-"));
    let done = false;
    try {
      const pending = checkpointEncryptionKey(root, "win32", 1000).then(() => { done = true; });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(done).toBe(false);
      await writeFile(join(root, "Local State"), JSON.stringify({ os_crypt: { encrypted_key: "synthetic-native-key" } }));
      await pending;
      expect(done).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("fails closed on absent or incomplete native state without creating it", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-key-checkpoint-"));
    try {
      await writeFile(join(root, "Local State"), "{}");
      await expect(checkpointEncryptionKey(root, "win32", 20)).rejects.toThrow("secure-storage-not-persisted");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("does not impose Chromium Windows key format on other platforms", async () => {
    await expect(checkpointEncryptionKey("unused", "darwin", 0)).resolves.toBeUndefined();
  });
  it("retries a transient malformed native file until valid publication", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-key-checkpoint-"));
    let sawMalformed!: () => void;
    const observed = new Promise<void>((resolve) => { sawMalformed = resolve; });
    const realOpen = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).open;
    vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
      const handle = await realOpen(...args), close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(async () => { await close(); sawMalformed(); });
      return handle;
    });
    try {
      await writeFile(join(root, "Local State"), '{"os_crypt":');
      const pending = checkpointEncryptionKey(root, "win32", 1000);
      await observed; // First parse and close completed while the native file was malformed.
      await writeFile(join(root, "Local State"), JSON.stringify({ os_crypt: { encrypted_key: "synthetic" } }));
      await expect(pending).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("never acknowledges when native file sync fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-key-checkpoint-"));
    const realOpen = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).open;
    const spy = vi.mocked(fs.open).mockImplementation(async (...args) => {
      const handle = await realOpen(...args);
      vi.spyOn(handle, "sync").mockRejectedValue(Error("synthetic sync failure"));
      return handle;
    });
    try {
      await writeFile(join(root, "Local State"), JSON.stringify({ os_crypt: { encrypted_key: "synthetic" } }));
      await expect(checkpointEncryptionKey(root, "win32", 20)).rejects.toThrow("secure-storage-not-persisted");
    } finally { spy.mockImplementation(realOpen); await rm(root, { recursive: true, force: true }); }
  });
});
