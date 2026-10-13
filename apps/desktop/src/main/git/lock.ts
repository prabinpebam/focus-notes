/**
 * One writer at a time (Desktop and Git → One writer at a time): `.git/focus-notes.lock` holds
 * the owning process ID. The desktop app holds it while it runs; a lock left by a process that no
 * longer exists is taken over safely.
 */
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const LOCK_NAME = "focus-notes.lock";

/** Whether a process is running. EPERM means it exists but belongs to someone else. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

const holder = async (file: string): Promise<number | undefined | "none"> => {
  const text = await readFile(file, "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : ""));
  if (text === null) return "none";
  const pid = Number((JSON.parse(text || "{}") as { pid?: unknown }).pid);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
};

/**
 * Takes the lock in a Git folder. True if this process holds it (now or already); false if another
 * running process does. A stale lock (its process is gone, or it's unreadable) is replaced.
 */
export async function takeLock(gitDir: string, pid = process.pid, alive: (pid: number) => boolean = isAlive): Promise<boolean> {
  const file = join(gitDir, LOCK_NAME);
  const body = `${JSON.stringify({ pid, by: "Focus Notes" })}\n`;
  try {
    await writeFile(file, body, { flag: "wx" });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const owner = await holder(file).catch(() => undefined);
  if (owner === pid) return true;
  if (typeof owner === "number" && alive(owner)) return false;
  // Stale: replaced in one step, then read back, so two takers can't both believe they hold it.
  const tmp = `${file}.${pid}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, file);
  return (await holder(file).catch(() => undefined)) === pid;
}

/** Releases the lock if this process holds it. */
export async function releaseLock(gitDir: string, pid = process.pid): Promise<void> {
  const file = join(gitDir, LOCK_NAME);
  if ((await holder(file).catch(() => undefined)) === pid) await rm(file, { force: true });
}
