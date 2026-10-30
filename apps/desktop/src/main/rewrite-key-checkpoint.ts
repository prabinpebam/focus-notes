import { open } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Electron 42 Windows OSCrypt creates its profile key in memory before Chromium's
 * delayed Local State write. A saved ciphertext is not restartable before that
 * write. Observe and sync the native file; never manufacture or rewrite its key.
 * Other platforms do not use this Windows key format.
 */
export async function checkpointEncryptionKey(sessionData: string, platform = process.platform, timeoutMs = 15_000) {
  if (platform !== "win32") return;
  const deadline = Date.now() + timeoutMs;
  do {
    let file;
    try {
      // FlushFileBuffers on Windows requires a writable handle; never write through it.
      file = await open(join(sessionData, "Local State"), "r+");
      const state = JSON.parse(await file.readFile("utf8"));
      if (typeof state.os_crypt?.encrypted_key === "string" && state.os_crypt.encrypted_key.length > 0) {
        await file.sync();
        return;
      }
    } catch {
      // Native writer may not have published a complete file yet. No error details.
    } finally { await file?.close(); }
    if (Date.now() >= deadline) break;
    await delay(Math.min(100, deadline - Date.now()));
  } while (Date.now() <= deadline);
  throw new Error("secure-storage-not-persisted");
}
