/**
 * Readable commit messages (FIL-05, Files and sharing → Operations): `Update essays/on-focus.md`,
 * `Create notes/ideas.md`, `Move drafts/a.md → archive/a.md`. Pure, so it's unit-tested.
 */
import type { StatusEntry } from "./status.ts";

/** One file's change in a commit. Paths are repository-relative with forward slashes. */
export interface Change {
  status: "A" | "M" | "D" | "R";
  path: string;
  from?: string;
}

/**
 * A file operation from a batch (D-94), with repository-relative paths. A move between Public and
 * Private is a `visibility` change in each repository: the path it left, or the path it arrived at
 * (FIL-06). `import` is a note added from a browser's export bundle (FRE-10).
 */
export type BatchOp =
  | { op: "createFolder"; path: string }
  | { op: "move"; from: string; to: string }
  | { op: "delete"; path: string }
  | { op: "write"; path: string }
  | { op: "visibility"; path: string; to: "public" | "private" }
  | { op: "import"; path: string };

const parent = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const KEEP = "/.gitkeep";

/** Where a path goes under a batch's moves (a moved folder moves everything inside it). */
function moved(path: string, moves: [string, string][]): string | undefined {
  for (const [from, to] of moves) {
    if (path === from) return to;
    if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  }
  return undefined;
}

/**
 * The changes in status entries, pairing an added file with the deleted one it came from: a known
 * move (from a batch, or a file name that followed its title) is a rename, not a delete and a create.
 */
export function changesOf(entries: StatusEntry[], moves: [string, string][] = []): Change[] {
  const out: Change[] = [];
  for (const e of entries) {
    if (e.kind === "renamed") out.push({ status: "R", path: e.path, from: e.from ?? "" });
    else if (e.kind === "untracked" || e.xy.includes("A")) out.push({ status: "A", path: e.path });
    else if (e.xy.includes("D")) out.push({ status: "D", path: e.path });
    else if (e.kind !== "ignored") out.push({ status: "M", path: e.path });
  }
  const deleted = new Set(out.filter((c) => c.status === "D").map((c) => c.path));
  const paired = new Set<string>();
  for (const c of out) {
    if (c.status !== "A") continue;
    const from = [...deleted].find((d) => !paired.has(d) && moved(d, moves) === c.path);
    if (from) {
      c.status = "R";
      c.from = from;
      paired.add(from);
    }
  }
  return out.filter((c) => !(c.status === "D" && paired.has(c.path))).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** One line for one change. */
export function describe(c: Change): string {
  if (c.status === "R") return `${parent(c.from ?? "") === parent(c.path) ? "Rename" : "Move"} ${c.from} → ${c.path}`;
  if (c.status === "A" && c.path.endsWith(KEEP)) return `Create folder ${c.path.slice(0, -KEEP.length)}`;
  return `${c.status === "A" ? "Create" : c.status === "D" ? "Delete" : "Update"} ${c.path}`;
}

const VERBS = { A: "Create", M: "Update", D: "Delete", R: "Move" } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const message = (subject: string, body: string[]) => (body.length ? `${subject}\n\n${body.join("\n")}` : subject);

/** The message for saved notes: one change says what it is; several are counted, each listed below. */
export function saveMessage(changes: Change[]): string {
  if (changes.length === 1) return describe(changes[0]!);
  const kinds = new Set(changes.map((c) => c.status));
  const subject = kinds.size === 1 ? `${VERBS[changes[0]!.status]} ${plural(changes.length, "note", "notes")}` : `Save ${plural(changes.length, "change", "changes")}`;
  return message(subject, changes.map(describe));
}

/** The message for one batch from the Files panel, said as the operation, with its link updates (FIL-05, FIL-09). */
export function batchMessage(ops: BatchOp[], changes: Change[] = []): string {
  const main = ops.filter((o) => o.op !== "write");
  const writes = ops.filter((o): o is Extract<BatchOp, { op: "write" }> => o.op === "write");
  const movedTo = new Set(main.flatMap((o) => (o.op === "move" ? [o.to] : o.op === "visibility" ? [o.path] : [])));
  const line = (o: (typeof main)[number]) => (o.op === "createFolder" ? `Create folder ${o.path}` : o.op === "delete" ? `Delete ${o.path}`
    : o.op === "move" ? describe({ status: "R", from: o.from, path: o.to })
      : o.op === "visibility" ? `Make ${o.to}: ${o.path}` : o.op === "import" ? `Import ${o.path}` : "");
  const linkNotes = writes.filter((w) => !movedTo.has(w.path)).length;
  const links = linkNotes ? [`Update links in ${plural(linkNotes, "note", "notes")}`] : [];
  if (!main.length) return changes.length ? message(saveMessage(changes), []) : "Update notes";
  const kinds = new Set(main.map((o) => o.op));
  let subject: string;
  let lines: string[] = [];
  if (main.length === 1) {
    subject = line(main[0]!) || "Update notes";
  } else {
    const first = main[0]!;
    const kind = kinds.size === 1 && !(first.op === "visibility" && main.some((o) => o.op === "visibility" && o.to !== first.to)) ? first.op : "mixed";
    lines = main.map(line);
    if (kind === "visibility" && first.op === "visibility") subject = `Make ${plural(main.length, "item", "items")} ${first.to}`;
    else if (kind === "import") subject = `Import ${plural(main.length, "note", "notes")}`;
    else if (kind === "move") {
      const dests = new Set(main.map((o) => (o.op === "move" ? parent(o.to) : "")));
      subject = dests.size === 1 ? `Move ${plural(main.length, "item", "items")} to ${[...dests][0] || "the top"}` : `Move ${plural(main.length, "item", "items")}`;
    } else if (kind === "delete") subject = `Delete ${plural(main.length, "item", "items")}`;
    else if (kind === "createFolder") subject = `Create ${plural(main.length, "folder", "folders")}`;
    else subject = `Change ${plural(main.length, "item", "items")}`;
  }
  return message(subject, [...lines, ...links]);
}

/** The notes repository's commit that moves its pointer to the private repository (D-07). */
export const pointerMessage = (oid: string) => `Update private notes to ${oid.slice(0, 7)}`;
