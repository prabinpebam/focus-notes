/**
 * New notes without a private repository (D-158, SHR-01; Desktop and Git → New notes without a
 * private repository). In a clone that can't reach its private repository, a new note can only go
 * in the public `notes/` folder. It's held out of Git until the writer chooses: its path sits in a
 * block the app manages in the notes repository's `info/exclude` (local to this clone, never
 * committed), so neither the app's backups nor `git add -A` stage it. These are the pure parts:
 * the block's text, the two lists, and how a hold follows a rename, a move, and a delete.
 * Paths here are repository-relative with `/` (`notes/Untitled.md`).
 */
import type { WorkspaceTree } from "./workspace.ts";

export interface HeldNotes {
  /** New public notes waiting for Make it public or Keep it on this computer only. */
  readonly waiting: readonly string[];
  /** Notes the writer kept on this computer: never backed up or published. */
  readonly local: readonly string[];
}
export const NO_HELD: HeldNotes = { waiting: [], local: [] };
export type HeldState = "waiting" | "local";

const BEGIN = "# >>> Focus Notes (D-158): new public notes waiting for an answer. Managed by the app.";
const LOCAL = "# --- Focus Notes (D-158): notes kept on this computer only.";
const END = "# <<< Focus Notes";

/** One path as a pattern that matches only it: anchored at the top, Git's wildcard characters escaped. */
export function excludeLine(rel: string): string | undefined {
  if (/[\r\n]/.test(rel) || !rel) return undefined;
  const escaped = rel.replace(/[\\*?[]/g, (c) => `\\${c}`);
  // Git drops trailing spaces unless each is escaped.
  const trail = escaped.length - escaped.replace(/ +$/, "").length;
  return `/${trail ? `${escaped.slice(0, -trail)}${"\\ ".repeat(trail)}` : escaped}`;
}
function pathOfLine(line: string): string | undefined {
  if (!line.startsWith("/")) return undefined;
  return line.slice(1).replace(/\\(.)/g, "$1");
}

/** The lists in an `info/exclude` file: nothing held when it has no block. */
export function readHeld(text: string): HeldNotes {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(BEGIN);
  if (start < 0) return NO_HELD;
  const waiting: string[] = [];
  const local: string[] = [];
  let into = waiting;
  for (const line of lines.slice(start + 1)) {
    if (line === END) break;
    if (line === LOCAL) into = local;
    const p = pathOfLine(line);
    if (p !== undefined) into.push(p);
  }
  return { waiting, local };
}

/** The file with its block replaced (or added at the end, or removed when nothing's held); other lines stay. */
export function writeHeld(text: string, held: HeldNotes): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(BEGIN);
  let rest = lines;
  if (start >= 0) {
    const end = lines.indexOf(END, start);
    rest = [...lines.slice(0, start), ...(end < 0 ? [] : lines.slice(end + 1))];
  }
  let own = rest.join(eol);
  const block = [
    BEGIN, ...held.waiting.flatMap((p) => excludeLine(p) ?? []),
    LOCAL, ...held.local.flatMap((p) => excludeLine(p) ?? []), END,
  ];
  if (!held.waiting.length && !held.local.length) return own;
  if (own && !own.endsWith(eol)) own += eol;
  return `${own}${block.join(eol)}${eol}`;
}

const within = (base: string, p: string) => p === base || p.startsWith(`${base}/`);

export const heldOf = (held: HeldNotes, rel: string): HeldState | undefined =>
  held.waiting.includes(rel) ? "waiting" : held.local.includes(rel) ? "local" : undefined;

/** A new note waits for an answer, unless it's already held. */
export const holdNote = (held: HeldNotes, rel: string): HeldNotes =>
  heldOf(held, rel) ? held : { ...held, waiting: [...held.waiting, rel] };

/** Make it public releases the note; Keep it on this computer only moves it to the second list. */
export function answerHeld(held: HeldNotes, rel: string, choice: "public" | "local"): HeldNotes {
  const waiting = held.waiting.filter((p) => p !== rel);
  const local = held.local.filter((p) => p !== rel);
  return choice === "local" ? { waiting, local: [...local, rel] } : { waiting, local };
}

/** A note or folder moved: every hold at or under it follows. */
export function moveHeld(held: HeldNotes, from: string, to: string): HeldNotes {
  const move = (p: string) => (within(from, p) ? `${to}${p.slice(from.length)}` : p);
  return { waiting: held.waiting.map(move), local: held.local.map(move) };
}

/** A note or folder deleted: its holds go too. */
export const dropHeld = (held: HeldNotes, rel: string): HeldNotes =>
  ({ waiting: held.waiting.filter((p) => !within(rel, p)), local: held.local.filter((p) => !within(rel, p)) });

/** A workspace whose new notes can only go public: a writable Public root and no Private one (FRE-06). */
export const holdsNewNotes = (tree: WorkspaceTree): boolean =>
  tree.roots.some((r) => r.id === "public" && !r.readOnly) && !tree.roots.some((r) => r.id === "private");
