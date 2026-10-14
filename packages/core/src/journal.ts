/**
 * The recovery journal's format (QLT-03, Performance and quality → Reliability): one JSON record
 * per line, appended. The desktop's main process keeps it in the app's data folder; this module is
 * the format and its replay, with no I/O, so it's tested on its own.
 *
 * - `text`: a note's unsaved text, with its hash and the hash of what was on disk under it (`base`).
 * - `saved`: the note was written with text of that hash. It clears the entry if that's its text;
 *   otherwise what's on disk is now that text, so it becomes the entry's base.
 * - `moved`: a note or folder was renamed; entries at or under it follow.
 * - `gone`: entries at or under a path are dropped (deleted, or restored).
 *
 * Replay keeps the latest entry per note. A line that isn't a whole, valid record (a write cut off
 * by a crash, or a damaged disk) is skipped, so a torn tail never hides the records before it.
 */

export const JOURNAL_VERSION = 1;

export type JournalRecord =
  | { v: 1; op: "text"; path: string; at: number; hash: string; base?: string; text: string }
  | { v: 1; op: "saved"; path: string; at: number; hash: string }
  | { v: 1; op: "moved"; path: string; to: string; at: number }
  | { v: 1; op: "gone"; path: string; at: number };

/** A note's latest unsaved text. */
export interface JournalEntry {
  path: string;
  text: string;
  hash: string;
  /** The hash of the note's text on disk when this text was typed over it; absent when unknown. */
  base?: string;
  at: number;
}

/** FNV-1a (32 bits) over UTF-16 code units, as 8 hex digits: a cheap check, not a security hash. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const encodeRecord = (r: JournalRecord): string => `${JSON.stringify(r)}\n`;

const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** A record as written, or undefined when it isn't one (or its text doesn't match its hash). */
function check(raw: unknown): JournalRecord | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || r.v !== JOURNAL_VERSION || !isStr(r.path) || !r.path || !isNum(r.at)) return undefined;
  if (r.op === "text" && isStr(r.text) && isStr(r.hash) && (r.base === undefined || isStr(r.base)) && textHash(r.text) === r.hash) return r as JournalRecord;
  if (r.op === "saved" && isStr(r.hash)) return r as JournalRecord;
  if (r.op === "moved" && isStr(r.to) && r.to) return r as JournalRecord;
  if (r.op === "gone") return r as JournalRecord;
  return undefined;
}

/** The records in a journal file. Lines that aren't whole records, including an unfinished last line, are skipped. */
export function parseJournal(content: string): { records: JournalRecord[]; skipped: number } {
  const lines = content.split("\n");
  // The part after the last newline was never finished: a crash cut the write short.
  const tail = lines.pop() ?? "";
  const records: JournalRecord[] = [];
  let skipped = tail.trim() ? 1 : 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let r: JournalRecord | undefined;
    try {
      r = check(JSON.parse(line));
    } catch {
      r = undefined;
    }
    if (r) records.push(r);
    else skipped++;
  }
  return { records, skipped };
}

/** Whether `p` is `base` or inside it, with either separator. */
export const atOrUnder = (p: string, base: string) => p === base || p.startsWith(`${base}/`) || p.startsWith(`${base}\\`);

/** Applies one record to the entries, in place. */
export function applyRecord(live: Map<string, JournalEntry>, r: JournalRecord): void {
  switch (r.op) {
    case "text":
      live.set(r.path, { path: r.path, text: r.text, hash: r.hash, at: r.at, ...(r.base !== undefined ? { base: r.base } : {}) });
      return;
    case "saved": {
      const e = live.get(r.path);
      if (!e) return;
      if (e.hash === r.hash) live.delete(r.path);
      else live.set(r.path, { ...e, base: r.hash });
      return;
    }
    case "moved": {
      for (const [p, e] of [...live]) {
        if (!atOrUnder(p, r.path)) continue;
        const to = r.to + p.slice(r.path.length);
        live.delete(p);
        live.set(to, { ...e, path: to });
      }
      return;
    }
    case "gone":
      for (const p of [...live.keys()]) if (atOrUnder(p, r.path)) live.delete(p);
  }
}

/** The entries a list of records leaves. Replaying the same records again gives the same entries. */
export function replay(records: readonly JournalRecord[], start: ReadonlyMap<string, JournalEntry> = new Map()): Map<string, JournalEntry> {
  const live = new Map(start);
  for (const r of records) applyRecord(live, r);
  return live;
}

/** The smallest journal with the same entries: one `text` record per note. */
export function compactJournal(live: ReadonlyMap<string, JournalEntry>): string {
  return [...live.values()].map((e) => encodeRecord({ v: 1, op: "text", path: e.path, at: e.at, hash: e.hash, ...(e.base !== undefined ? { base: e.base } : {}), text: e.text })).join("");
}
