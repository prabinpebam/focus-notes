/**
 * D-433: a shared note's saved edits reach its existing shares by themselves: the same link, access code and expiry,
 * re-sealed in the next website build. It runs after a backup (so behind the backup's push in D-432's per-repository
 * queue), once the notes have been idle `idleMs`, and only when a shared note actually changed since the last build.
 * It never blocks typing; a failure is reported quietly and retried on the next backup or with Retry.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** What the shares cover now: a key for the project (its private folder) and a signature of the shared notes' files. */
export interface SharedNotesState { key: string; signature: string }
export type ShareUpdateEvent = { status: "updated" } | { status: "failed"; problem: string };

export function sharedNoteUpdates(o: {
  /** Undefined when nothing is shared or sharing isn't on, so there's nothing to update. */
  current(): Promise<SharedNotesState | undefined>;
  /** Rebuilds and uploads the website (sealed shares included) through the shared publisher. */
  deploy(): Promise<void>;
  report(event: ShareUpdateEvent): void;
  idleMs?: number;
}) {
  let seen: SharedNotesState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let again = false;
  const read = () => o.current().catch(() => undefined);
  const run = async (): Promise<void> => {
    const now = await read();
    if (!now) return;
    // Another project, or the first look at this one: what's there now is the baseline, never a reason to upload.
    if (!seen || seen.key !== now.key) { seen = now; return; }
    if (seen.signature === now.signature) return;
    try {
      await o.deploy();
      seen = now;
      o.report({ status: "updated" });
    } catch (error) {
      o.report({ status: "failed", problem: error instanceof Error ? error.message : "sharing:failed" });
    }
  };
  const go = (): Promise<void> => {
    if (running) { again = true; return running; }
    running = run().finally(() => {
      running = undefined;
      if (again) { again = false; void go(); }
    });
    return running;
  };
  return {
    /** Takes what the shares cover now as the baseline (when a project opens). */
    prime: async () => { const now = await read(); if (now && (!seen || seen.key !== now.key)) seen = now; },
    /** What the shares cover now, read before another website build starts. */
    snapshot: read,
    /** That build carried the shared notes as they were in `before`: nothing older is left to update. */
    built: (before: SharedNotesState | undefined) => { if (before) seen = before; },
    /** A backup finished: once the notes stay idle, update the shares if a shared note changed. */
    changed: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void go(); }, o.idleMs ?? 5000);
      timer.unref?.();
    },
    /** Retry from the notification, at once. */
    retry: () => { if (timer) { clearTimeout(timer); timer = undefined; } return go(); },
  };
}

/** The shared notes' files under a private notes folder, by size and modification time, in a stable order. */
export async function sharedNotesSignature(notes: string, items: readonly { path: string; folder: boolean }[]): Promise<string> {
  const parts: string[] = [];
  const add = async (rel: string) => {
    const s = await stat(join(notes, ...rel.split("/"))).catch(() => undefined);
    parts.push(`${rel}:${s ? `${s.size}:${s.mtimeMs}` : "-"}`);
  };
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(join(notes, ...rel.split("/")), { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith(".")) continue;
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(child);
      else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) await add(child);
    }
  };
  for (const item of items) await (item.folder ? walk(item.path) : add(item.path));
  return [...new Set(parts)].sort().join("\n");
}
