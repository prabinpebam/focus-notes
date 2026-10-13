/**
 * File operations on a flat store of notes keyed by path, with folders kept as a list: the
 * browser's IndexedDB (D-90, D-94) and the test bridges. A batch is checked whole against a
 * working copy, then returned as the records to write, so the store applies it in one transaction.
 */
import type { WorkspaceOp, OpErrorCode } from "./bridge.ts";
import { isReadOnlyPath } from "./notes.ts";

export interface FlatNote {
  path: string;
  text: string;
  updated: number;
  /** Deleted in the Files panel: kept in this browser, and treated as gone (D-94). */
  deleted?: boolean;
}

export class OpError extends Error {
  readonly code: OpErrorCode;
  constructor(code: OpErrorCode) {
    super(code);
    this.code = code;
  }
}

const key = (p: string) => p.normalize("NFC").toLowerCase();
const inside = (dir: string, p: string) => p === dir || p.startsWith(`${dir}/`);
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/**
 * The records to write for a batch: notes to put (moved or marked deleted), paths to remove, and
 * the new folder list. Throws an {@link OpError} if any operation is refused; nothing is written then.
 */
export function planFlatOps(notes: readonly FlatNote[], folders: readonly string[], ops: readonly WorkspaceOp[], now: number):
  { put: FlatNote[]; remove: string[]; folders: string[] } {
  const live = new Map(notes.filter((n) => !n.deleted).map((n) => [n.path, n]));
  const dead = new Map(notes.filter((n) => n.deleted).map((n) => [n.path, n]));
  let dirs = [...folders];
  const put = new Map<string, FlatNote>();
  const remove = new Set<string>();
  const isFolder = (p: string) => p !== "" && (dirs.some((d) => key(d) === key(p)) || [...live.keys()].some((n) => key(n).startsWith(`${key(p)}/`)));
  const exists = (p: string) => [...live.keys()].some((n) => key(n) === key(p)) || isFolder(p);
  const writePut = (n: FlatNote) => { put.set(n.path, n); remove.delete(n.path); };
  const writeRemove = (p: string) => { remove.add(p); put.delete(p); };

  for (const op of ops) {
    const paths = op.op === "move" ? [op.from, op.to] : [op.path];
    if (paths.some((p) => isReadOnlyPath(p))) throw new OpError("readOnly");
    if (paths.some((p) => !p || p.startsWith("/") || p.split("/").some((part) => !part || part === "." || part === ".."))) throw new OpError("invalid");
    if (op.op === "createFolder") {
      if (exists(op.path)) throw new OpError("taken");
      const parent = parentOf(op.path);
      if (parent && !isFolder(parent)) throw new OpError("notFound");
      dirs.push(op.path);
    } else if (op.op === "move") {
      const { from, to } = op;
      if (!exists(from)) throw new OpError("notFound");
      if (inside(from, to) && from !== to) throw new OpError("intoItself");
      if (key(from) !== key(to) && exists(to)) throw new OpError("taken");
      const parent = parentOf(to);
      if (parent && !isFolder(parent)) throw new OpError("notFound");
      for (const [p, n] of [...live]) {
        if (!inside(from, p)) continue;
        const moved = { ...n, path: to + p.slice(from.length), updated: now };
        live.delete(p);
        writeRemove(p);
        live.set(moved.path, moved);
        dead.delete(moved.path);
        writePut(moved);
      }
      dirs = dirs.map((d) => (inside(from, d) ? to + d.slice(from.length) : d));
    } else {
      if (!exists(op.path)) throw new OpError("notFound");
      for (const [p, n] of [...live]) {
        if (!inside(op.path, p)) continue;
        live.delete(p);
        const gone = { ...n, deleted: true, updated: now };
        dead.set(p, gone);
        writePut(gone);
      }
      dirs = dirs.filter((d) => !inside(op.path, d));
    }
  }
  return { put: [...put.values()], remove: [...remove], folders: dirs };
}
