import { resolve } from "node:path";

/** Runs `work` alone among everything else given the same repository folder, in arrival order. */
export type PushGate = <T>(dir: string, work: () => Promise<T>) => Promise<T>;

/**
 * D-432: one queue per repository for the writes that move its branch on GitHub: the backup's `git push` and the
 * website upload (head read to ref update). In the Private + Public layout both go to the public repository, so
 * neither starts while the other is between reading the branch and moving it.
 */
export function pushGate(): PushGate {
  const lanes = new Map<string, Promise<unknown>>();
  return <T>(dir: string, work: () => Promise<T>): Promise<T> => {
    const key = process.platform === "win32" || process.platform === "darwin" ? resolve(dir).toLowerCase() : resolve(dir);
    const before = lanes.get(key) ?? Promise.resolve();
    const next = before.then(work, work);
    const settled = next.then(() => {}, () => {});
    lanes.set(key, settled);
    void settled.then(() => { if (lanes.get(key) === settled) lanes.delete(key); });
    return next;
  };
}
