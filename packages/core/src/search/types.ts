/**
 * The search index's typed API (Spotlight → Index and privacy, SPT-07, SPT-08): what Spotlight
 * (WP-4.2) and Find in all notes (WP-4.3) ask, and what they get back. The index is MiniSearch in a
 * Web Worker, fed from the workspace model; it lives in memory only and is never sent anywhere.
 */
import type { RootId } from "../workspace.ts";

/** A result's kind. Notes, headings, and folders come from the workspace; commands and settings from the app. */
export type SearchKind = "note" | "heading" | "folder" | "command" | "setting";
/**
 * How well a result matched, best first (Spotlight → Ranking): the exact title, the title's start,
 * the start of a word, a fuzzy title match, a heading, then the full text.
 */
export const MATCH_TIERS = ["exact", "prefix", "word", "fuzzy", "heading", "text"] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

export interface SearchQuery {
  text: string;
  /**
   * `titles`: notes (title, file name, path, front-matter id), headings, folders, commands, and
   * settings, answered per keystroke (16 ms). `text`: notes' full text with a snippet (100 ms).
   */
  scope: "titles" | "text";
  /** At most this many hits (20 unless given, never more than 200). */
  limit?: number;
  /** Only these kinds (`type:` in Spotlight). */
  kinds?: readonly SearchKind[];
  /** Only notes, headings, and folders in these roots (`is:public`, `is:private`). */
  roots?: readonly RootId[];
  /** Only notes, headings, and folders in this folder, a path relative to its root (`in:essays/`). */
  within?: string;
  /** Full text only: the words must appear together, in order (`"…"` in Spotlight). */
  phrase?: boolean;
  /** Ranking inputs Spotlight keeps itself: frecency and context, keyed by a hit's `key`. */
  boost?: SearchBoost;
}

export interface SearchBoost {
  /** How recently and often each note was opened or command run, from 0 (never) up: the score is multiplied by 1 + it. */
  frecency?: Readonly<Record<string, number>>;
  /** Context, the same way: for example commands that apply to the selection. */
  context?: Readonly<Record<string, number>>;
  /** The current note's folder, relative to its root: its notes get a small boost. */
  folder?: string;
}

/** Where a match is in a label or snippet: [start, end) in UTF-16 code units. */
export type Range = readonly [number, number];

export interface SearchHit {
  kind: SearchKind;
  /** Unique across kinds: a note's or folder's path, `path#n` for a heading, a command's or setting's id. */
  key: string;
  /** What the row shows: a title, a heading, a folder's name, a command's name. */
  label: string;
  /** Where `label` matched the query. */
  highlights: Range[];
  tier: MatchTier;
  /** Higher is better within a tier, boosts included. */
  score: number;
  /** Notes, headings, and folders: the shell's path (the note's, for a heading). */
  path?: string;
  /** Notes, headings, and folders: the path relative to its root, as Spotlight shows it. */
  rel?: string;
  root?: RootId;
  /** Headings: their level, their place among the note's headings (from 0), and the note's title. */
  heading?: { level: number; index: number; note: string };
  /** Full text: the text around the first match, on one line. */
  snippet?: { text: string; highlights: Range[] };
}

export interface SearchResults {
  query: SearchQuery;
  hits: SearchHit[];
  /** Time the index spent answering, in ms. */
  ms: number;
}

/**
 * Find in all notes (FND-04): every match of a query in the notes' visible text, matched exactly as
 * the find bar matches in one note (case and accents ignored by default, whole word, regular expression).
 */
export interface FindQuery {
  text: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  /** Only notes in these roots (`is:public`, `is:private`). */
  roots?: readonly RootId[];
  /** Only notes in this folder, a path relative to its root (`in:essays/`). */
  within?: string;
  /** At most this many matches listed in all (1,000 unless given, never more than 5,000). Every match is counted. */
  limit?: number;
}

export interface FindMatch {
  /** Its place among the note's matches, from 0: the find bar shows it as "index + 1 of count". */
  index: number;
  /** The line it's on, from 0: one line per block of the note's visible text. */
  line: number;
  /**
   * Where the editor finds it again, even where the index and the editor see a block differently
   * (a block the editor shows as raw Markdown, a table): its line's `lineKey`, how many earlier
   * lines read the same, and its place among that line's matches.
   */
  lineKey: number;
  lineNth: number;
  occurrence: number;
  /** The line around the match, on one line, with the match marked. */
  snippet: { text: string; highlights: Range[] };
}

export interface FindNote {
  path: string;
  rel: string;
  root: RootId;
  title: string;
  /** Every match in the note, listed or not. */
  count: number;
  /** The matches listed, in order (fewer than `count` once the limit is reached). */
  matches: FindMatch[];
}

export interface FindResults {
  query: FindQuery;
  /** Notes with a match: by root (private, public, then this browser's), then by path. */
  notes: FindNote[];
  /** Every match, in every note. */
  total: number;
  /** Some matches weren't listed: the limit was reached. */
  truncated: boolean;
  /** The query is a regular expression that doesn't compile. */
  invalid: boolean;
  /** Notes whose text wasn't indexed yet, so couldn't be searched. */
  unread: number;
  ms: number;
}

/** How far the index has got (Spotlight's "Indexing 1,240 / 5,000"). Titles are searchable from the start. */
export interface IndexStatus {
  /** Notes the index knows. */
  notes: number;
  /** Notes whose full text is indexed, or couldn't be read. */
  indexed: number;
  /** Texts received but not yet indexed. */
  pending: number;
  /** The last batch of changes the index took in, so a caller can wait for its own. */
  seq: number;
}

/** A command or a setting, as Spotlight searches it: its name and synonyms ("dark", "night", "theme"). */
export interface SearchItem {
  id: string;
  title: string;
  keywords?: readonly string[];
}

/** One change to the index. Paths are the shell's own; `rel` is relative to the root. */
export type IndexOp =
  /** A note, with its title from the tree until its text is read. */
  | { op: "note"; path: string; rel: string; root: RootId; title?: string }
  /** A note's text, or `null` when it couldn't be read. Indexed in time slices, so queries never wait long. */
  | { op: "text"; path: string; markdown: string | null }
  | { op: "folder"; path: string; rel: string; root: RootId }
  /** A note or folder moved or renamed: a note's text moves with it, so nothing is read again. */
  | { op: "move"; from: string; to: string; rel: string }
  | { op: "remove"; path: string }
  /** Everything at or under a path, at once: the browser's `private:` notes when the vault locks (D-90). */
  | { op: "removeWithin"; path: string }
  /** Replaces every command, or every setting. */
  | { op: "items"; kind: "command" | "setting"; items: readonly SearchItem[] }
  | { op: "clear" };

/** The index as a caller sees it: in a worker in the app, or on the same thread in tests. */
export interface SearchIndexClient {
  /** Sends changes, in order. A query sent after them sees them (full text once it's indexed). */
  apply(ops: readonly IndexOp[]): void;
  query(query: SearchQuery): Promise<SearchResults>;
  /** Find in all notes (FND-04): exact matches in every indexed note's text, by note. */
  find(query: FindQuery): Promise<FindResults>;
  status(): IndexStatus;
  onStatus(listener: (status: IndexStatus) => void): () => void;
  /** Resolves once everything sent so far is indexed. */
  whenIndexed(): Promise<IndexStatus>;
  dispose(): void;
}
