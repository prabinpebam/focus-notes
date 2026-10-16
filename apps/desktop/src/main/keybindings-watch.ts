/**
 * keybindings.json's watch (KEY-07, D-170, PRF-14): polled here in the main process, so the window
 * does nothing while the file stays the same. A change is its modification time or its size (an
 * editor that replaces the file included); the window is told once per change.
 */
import { unwatchFile, watchFile, type Stats } from "node:fs";

export function watchKeybindings(file: string, changed: () => void, intervalMs = 500): () => void {
  const listener = (now: Stats, before: Stats) => {
    if (now.mtimeMs !== before.mtimeMs || now.size !== before.size) changed();
  };
  watchFile(file, { interval: intervalMs, persistent: false }, listener);
  return () => unwatchFile(file, listener);
}
