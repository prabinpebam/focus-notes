import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpointEncryptionKey } from "../src/main/rewrite-key-checkpoint.ts";

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
});
