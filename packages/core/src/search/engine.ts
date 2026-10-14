/**
 * The search index itself (Spotlight → Index and privacy): two MiniSearch indexes, one for titles
 * (notes' titles, file names, folders, and front-matter ids; headings; folders; commands and
 * settings) answered per keystroke, and one for full text. It runs in a Web Worker in the app
 * (worker.ts) and on the calling thread in tests and the benchmark. It never touches the network
 * or storage: everything it knows is in memory, and goes when it's dropped.
 *
 * Ranking (Spotlight → Ranking): match quality first, as tiers (exact title, title prefix, start of
 * a word, fuzzy title, heading, full text), then MiniSearch's score times the frecency and context
 * boosts the caller passes. Typos are tolerated: one edit for 4 to 7 characters, two for longer.
 */
import MiniSearch, { type Query, type SearchResult } from "minisearch";
import { isWithin, stemOf } from "../workspace.ts";
import type { RootId } from "../workspace.ts";
import { extractNote, type NoteFields } from "./extract.ts";
import type { IndexOp, IndexStatus, MatchTier, Range, SearchHit, SearchItem, SearchKind, SearchQuery, SearchResults } from "./types.ts";
import { MATCH_TIERS } from "./types.ts";

/** Case, accents, and other marks don't matter: "Café" finds "cafe". */
export const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** MiniSearch's own word boundaries: spaces, line breaks, and punctuation. */
const WORD = /[^\n\r\p{Z}\p{P}]+/gu;
const words = (s: string) => (s.match(WORD) ?? []).map(normalize).filter(Boolean);
const processTerm = (t: string) => normalize(t) || null;
/** One edit for 4 to 7 characters, two for longer, none for shorter (Spotlight → Ranking). */
export const editsFor = (term: string) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0);
const fuzzy = (term: string) => editsFor(term) || false;
/** Two neighbouring letters swapped ("lenght") is one typo, though Levenshtein counts two. */
function swapsOf(term: string): string[] {
  if (!editsFor(term)) return [];
  const out = new Set<string>();
  for (let i = 0; i < term.length - 1; i++) if (term[i] !== term[i + 1]) out.add(term.slice(0, i) + term[i + 1] + term[i] + term.slice(i + 2));
  return [...out];
}
/** Every word must match; each as typed (fuzzy), or with two letters swapped. `prefix` says which words may be the start of one. */
function queryOf(terms: readonly string[], prefix: (i: number) => boolean): Query {
  return {
    combineWith: "AND",
    queries: terms.map((t, i): Query => {
      const swaps = swapsOf(t);
      const typed: Query = { queries: [t], prefix: prefix(i), fuzzy };
      return swaps.length ? { combineWith: "OR", queries: [typed, { combineWith: "OR", queries: swaps, prefix: prefix(i), fuzzy: false }] } : typed;
    }),
  };
}

const DEFAULT_LIMIT = 20;
const VACUUM_MIN_DIRT = 1000;
const VACUUM_MIN_FACTOR = 0.2;
const MAX_LIMIT = 200;
/** The current note's folder gets a small boost (Spotlight → Ranking → Context). */
const FOLDER_BOOST = 1.25;
const TITLE_FIELDS = ["label", "name", "fmid", "keywords", "dir"];
const TITLE_BOOST = { label: 4, name: 2, fmid: 2, keywords: 1.5, dir: 1 };
/** Fields a "start of a word" match must be in: the title, its file name, id, or synonyms, not only the folder. */
const OWN_FIELDS = new Set(["label", "name", "fmid", "keywords"]);

interface TitleDoc {
  key: string;
  kind: SearchKind;
  label: string;
  name?: string;
  fmid?: string;
  keywords?: string;
  dir?: string;
  path?: string;
  rel?: string;
  root?: RootId;
  level?: number;
  index?: number;
  note?: string;
  /** The label's and file name's words, normalized once here rather than on every query. */
  nlabel?: string;
  nname?: string;
}
interface NoteRec {
  path: string;
  rel: string;
  root: RootId;
  /** From the tree, until the text is read. */
  treeTitle?: string;
  title?: string;
  fmid?: string;
  /** Headings indexed for it (the title's own H1 isn't one). */
  headingKeys: string[];
  headings: { text: string; level: number }[];
  text?: string;
  norm?: string;
  hash?: number;
  indexed: boolean;
}
interface FolderRec { path: string; rel: string; root: RootId }

const dirOfRel = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
const nameOfRel = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
const relWithin = (rel: string, folder: string) => {
  const f = folder.replace(/^\/+|\/+$/g, "");
  return f === "" || rel === f || rel.startsWith(`${f}/`);
};
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class SearchEngine {
  #titles = SearchEngine.#titleIndex();
  #text = SearchEngine.#textIndex();
  #notes = new Map<string, NoteRec>();
  #folders = new Map<string, FolderRec>();
  #items = { command: new Set<string>(), setting: new Set<string>() };
  /** Texts waiting to be indexed, by path: the newest one only. */
  #queue = new Map<string, string | null>();
  #indexed = 0;

  static #titleIndex() {
    return new MiniSearch<TitleDoc>({ idField: "key", fields: TITLE_FIELDS, storeFields: ["kind", "label", "path", "rel", "root", "level", "index", "note", "nlabel", "nname"], processTerm, autoVacuum: false });
  }
  static #textIndex() {
    return new MiniSearch<{ path: string; text: string }>({ idField: "path", fields: ["text"], storeFields: [], processTerm, autoVacuum: false });
  }

  status(seq = 0): IndexStatus {
    return { notes: this.#notes.size, indexed: this.#indexed, pending: this.#queue.size, seq };
  }

  apply(ops: readonly IndexOp[]): void {
    for (const op of ops) this.#apply(op);
  }

  /** Indexes waiting texts for about `budgetMs`. True while more are waiting. */
  work(budgetMs: number): boolean {
    const end = now() + budgetMs;
    for (const [path, markdown] of this.#queue) {
      this.#queue.delete(path);
      this.#indexText(path, markdown);
      if (now() >= end) break;
    }
    return this.#queue.size > 0;
  }

  /**
   * Cleans out what removed and changed notes left behind, all at once, when enough has piled up.
   * MiniSearch's own vacuuming runs in the background in batches and breaks if the index changes
   * meanwhile, so the worker calls this between messages, when nothing is waiting. True if it did.
   */
  tidy(): boolean {
    let did = false;
    for (const index of [this.#titles, this.#text] as MiniSearch<unknown>[]) {
      if (index.dirtCount < VACUUM_MIN_DIRT || index.dirtFactor < VACUUM_MIN_FACTOR) continue;
      // One batch as big as the index: the work is done before this returns.
      void index.vacuum({ batchSize: Number.MAX_SAFE_INTEGER });
      did = true;
    }
    return did;
  }

  /** Indexes everything waiting, however long it takes (tests, and the benchmark's setup). */
  flush(): void {
    while (this.work(1000));
  }

  query(q: SearchQuery): SearchResults {
    const t0 = now();
    const limit = Math.min(Math.max(1, q.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const hits = !words(q.text).length ? [] : q.scope === "text" ? this.#queryText(q, limit) : this.#queryTitles(q, limit);
    return { query: q, hits, ms: now() - t0 };
  }

  // ---- changes ----

  #apply(op: IndexOp): void {
    switch (op.op) {
      case "note": {
        const rec = this.#notes.get(op.path) ?? { path: op.path, rel: op.rel, root: op.root, headingKeys: [], headings: [], indexed: false };
        rec.rel = op.rel;
        rec.root = op.root;
        rec.treeTitle = op.title;
        this.#notes.set(op.path, rec);
        this.#putNoteDoc(rec);
        return;
      }
      case "text":
        if (this.#notes.has(op.path)) this.#queue.set(op.path, op.markdown);
        return;
      case "folder":
        this.#folders.set(op.path, { path: op.path, rel: op.rel, root: op.root });
        this.#put({ key: op.path, kind: "folder", label: nameOfRel(op.rel), dir: dirOfRel(op.rel), path: op.path, rel: op.rel, root: op.root });
        return;
      case "move":
        return this.#move(op.from, op.to, op.rel);
      case "remove":
        return this.#remove(op.path);
      case "removeWithin":
        for (const p of [...this.#notes.keys(), ...this.#folders.keys()]) if (isWithin(op.path, p)) this.#remove(p);
        for (const p of [...this.#queue.keys()]) if (isWithin(op.path, p)) this.#queue.delete(p);
        return;
      case "items": {
        const ids = this.#items[op.kind];
        for (const id of ids) this.#discard(this.#titles, `${op.kind}:${id}`);
        ids.clear();
        for (const item of op.items) this.#putItem(op.kind, item);
        return;
      }
      case "clear":
        this.#titles = SearchEngine.#titleIndex();
        this.#text = SearchEngine.#textIndex();
        this.#notes.clear();
        this.#folders.clear();
        this.#items.command.clear();
        this.#items.setting.clear();
        this.#queue.clear();
        this.#indexed = 0;
    }
  }

  #putItem(kind: "command" | "setting", item: SearchItem): void {
    this.#items[kind].add(item.id);
    this.#put({ key: `${kind}:${item.id}`, kind, label: item.title, keywords: (item.keywords ?? []).join(" ") });
  }

  #put(doc: TitleDoc): void {
    this.#discard(this.#titles, doc.key);
    this.#titles.add({ ...doc, nlabel: words(doc.label).join(" "), ...(doc.name !== undefined ? { nname: words(doc.name).join(" ") } : {}) });
  }
  #discard<T>(index: MiniSearch<T>, id: string): void {
    if (index.has(id)) index.discard(id);
  }

  #labelOf(rec: NoteRec): string {
    return rec.title ?? rec.treeTitle ?? stemOf(nameOfRel(rec.rel));
  }
  #putNoteDoc(rec: NoteRec): void {
    this.#put({
      key: rec.path, kind: "note", label: this.#labelOf(rec), name: stemOf(nameOfRel(rec.rel)), dir: dirOfRel(rec.rel),
      ...(rec.fmid ? { fmid: rec.fmid } : {}), path: rec.path, rel: rec.rel, root: rec.root,
    });
  }
  #putHeadings(rec: NoteRec): void {
    for (const k of rec.headingKeys) this.#discard(this.#titles, k);
    rec.headingKeys = [];
    let skipTitle = rec.title !== undefined;
    rec.headings.forEach((h, index) => {
      // The title's own H1 is the note's row, not a heading of its own.
      if (skipTitle && h.level === 1 && h.text === rec.title) {
        skipTitle = false;
        return;
      }
      const key = `${rec.path}#${index}`;
      rec.headingKeys.push(key);
      this.#titles.add({ key, kind: "heading", label: h.text, path: rec.path, rel: rec.rel, root: rec.root, level: h.level, index, note: this.#labelOf(rec) });
    });
  }
  #putText(rec: NoteRec): void {
    this.#discard(this.#text, rec.path);
    if (rec.text) this.#text.add({ path: rec.path, text: rec.text });
  }

  #indexText(path: string, markdown: string | null): void {
    const rec = this.#notes.get(path);
    if (!rec) return;
    if (!rec.indexed) this.#indexed++;
    rec.indexed = true;
    const h = markdown === null ? undefined : hash(markdown);
    if (h !== undefined && h === rec.hash) return;
    rec.hash = h;
    const f: NoteFields = markdown === null ? { headings: [], text: "" } : extractNote(markdown);
    rec.title = f.title;
    rec.fmid = f.id;
    rec.headings = f.headings;
    rec.text = f.text;
    rec.norm = undefined;
    this.#putNoteDoc(rec);
    this.#putHeadings(rec);
    this.#putText(rec);
  }

  #move(from: string, to: string, rel: string): void {
    const folder = this.#folders.get(from);
    if (folder) {
      this.#remove(from);
      this.#remove(to);
      this.#apply({ op: "folder", path: to, rel, root: folder.root });
      return;
    }
    const rec = this.#notes.get(from);
    if (!rec || from === to) return;
    const queued = this.#queue.get(from);
    this.#remove(from);
    // Over something already there (the feed never asks for that): it goes first.
    this.#remove(to);
    const moved: NoteRec = { ...rec, path: to, rel, headingKeys: [] };
    this.#notes.set(to, moved);
    if (moved.indexed) this.#indexed++;
    this.#putNoteDoc(moved);
    this.#putHeadings(moved);
    this.#putText(moved);
    if (queued !== undefined) this.#queue.set(to, queued);
  }

  #remove(path: string): void {
    const rec = this.#notes.get(path);
    if (rec) {
      this.#notes.delete(path);
      if (rec.indexed) this.#indexed--;
      this.#discard(this.#titles, path);
      for (const k of rec.headingKeys) this.#discard(this.#titles, k);
      this.#discard(this.#text, path);
    }
    if (this.#folders.delete(path)) this.#discard(this.#titles, path);
    this.#queue.delete(path);
  }

  // ---- queries ----

  #inScope(q: SearchQuery, kind: SearchKind, root: RootId | undefined, rel: string | undefined): boolean {
    if (q.kinds && !q.kinds.includes(kind)) return false;
    if (!q.roots && q.within === undefined) return true;
    if (root === undefined || rel === undefined) return false;
    if (q.roots && !q.roots.includes(root)) return false;
    return q.within === undefined || relWithin(rel, q.within);
  }

  #boost(q: SearchQuery, key: string, rel: string | undefined, kind: SearchKind): number {
    const b = q.boost;
    if (!b) return 1;
    let x = (1 + Math.max(0, b.frecency?.[key] ?? 0)) * (1 + Math.max(0, b.context?.[key] ?? 0));
    if (b.folder !== undefined && kind === "note" && rel !== undefined && dirOfRel(rel) === b.folder.replace(/^\/+|\/+$/g, "")) x *= FOLDER_BOOST;
    return x;
  }

  #queryTitles(q: SearchQuery, limit: number): SearchHit[] {
    const qTerms = words(q.text);
    const whole = qTerms.join(" ");
    const results = this.#titles.search(queryOf(qTerms, () => true), {
      fields: TITLE_FIELDS, boost: TITLE_BOOST,
      filter: (r) => this.#inScope(q, r.kind as SearchKind, r.root as RootId | undefined, r.rel as string | undefined),
    });
    const terms = new Map<string, string[]>();
    const hits = results.map((r): SearchHit => {
      const kind = r.kind as SearchKind;
      const label = r.label as string;
      const tier = kind === "heading" ? "heading" : this.#tierOf(r, whole, qTerms);
      const rel = r.rel as string | undefined;
      terms.set(r.id as string, r.terms);
      const hit: SearchHit = { kind, key: r.id as string, label, highlights: [], tier, score: r.score * this.#boost(q, r.id as string, rel, kind) };
      if (r.path !== undefined) Object.assign(hit, { path: r.path, rel, root: r.root });
      if (kind === "heading") hit.heading = { level: r.level as number, index: r.index as number, note: r.note as string };
      return hit;
    });
    // Only the hits shown are marked.
    const top = rank(hits).slice(0, limit);
    for (const h of top) h.highlights = highlight(h.label, qTerms, terms.get(h.key) ?? []);
    return top;
  }

  #tierOf(r: SearchResult, whole: string, qTerms: string[]): MatchTier {
    const l = r.nlabel as string;
    const name = r.nname as string | undefined;
    if (l === whole || name === whole) return "exact";
    if (l.startsWith(whole) || name?.startsWith(whole)) return "prefix";
    const own = Object.entries(r.match).filter(([, fields]) => fields.some((f) => OWN_FIELDS.has(f))).map(([t]) => t);
    return qTerms.every((qt) => own.some((t) => t.startsWith(qt))) ? "word" : "fuzzy";
  }

  #queryText(q: SearchQuery, limit: number): SearchHit[] {
    const qTerms = words(q.text);
    const phrase = q.phrase ? qTerms.join(" ") : undefined;
    const results = this.#text.search(queryOf(qTerms, (i) => i === qTerms.length - 1), {
      filter: (r) => {
        const rec = this.#notes.get(r.id as string);
        if (!rec || !this.#inScope(q, "note", rec.root, rec.rel)) return false;
        if (phrase === undefined) return true;
        rec.norm ??= words(rec.text ?? "").join(" ");
        return ` ${rec.norm} `.includes(` ${phrase}`);
      },
    });
    const hits = results.map((r): SearchHit => {
      const rec = this.#notes.get(r.id as string)!;
      return {
        kind: "note", key: rec.path, label: this.#labelOf(rec), highlights: [], tier: "text", score: r.score * this.#boost(q, rec.path, rec.rel, "note"),
        path: rec.path, rel: rec.rel, root: rec.root,
      };
    });
    const top = rank(hits).slice(0, limit);
    const termsOf = new Map(results.map((r) => [r.id as string, r.terms]));
    for (const h of top) h.snippet = snippet(this.#notes.get(h.path!)!.text ?? "", qTerms, termsOf.get(h.key) ?? [], phrase);
    return top;
  }
}

/** Best first: by tier, then score, then the shorter label, then the label. */
export function rank(hits: SearchHit[]): SearchHit[] {
  const tierIndex = (t: MatchTier) => MATCH_TIERS.indexOf(t);
  return hits.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier) || b.score - a.score || a.label.length - b.label.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** Words in `text` that a query term starts, or that matched (fuzzy) — the part a person typed. */
function highlight(text: string, qTerms: readonly string[], matched: readonly string[]): Range[] {
  const out: Range[] = [];
  const exact = new Set(matched);
  for (const m of text.matchAll(WORD)) {
    const w = normalize(m[0]);
    const start = m.index;
    const prefix = qTerms.filter((qt) => w.startsWith(qt)).reduce((a, qt) => Math.max(a, qt.length), 0);
    if (prefix) out.push([start, start + Math.min(m[0].length, prefix)]);
    else if (exact.has(w)) out.push([start, start + m[0].length]);
  }
  return out;
}

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 140;
/** The line around the first matching word, cut at word boundaries, with its matches marked. */
function snippet(text: string, qTerms: readonly string[], matched: readonly string[], phrase?: string): { text: string; highlights: Range[] } {
  const terms = new Set(matched);
  const first = phrase?.split(" ")[0];
  let at = -1;
  for (const m of text.matchAll(WORD)) {
    const w = normalize(m[0]);
    if (first !== undefined ? w === first || w.startsWith(first) : terms.has(w)) {
      at = m.index;
      break;
    }
  }
  if (at < 0) at = 0;
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = (() => {
    const e = text.indexOf("\n", at);
    return e < 0 ? text.length : e;
  })();
  let start = Math.max(lineStart, at - SNIPPET_BEFORE);
  if (start > lineStart) {
    const space = text.indexOf(" ", start);
    start = space >= 0 && space < at ? space + 1 : start;
  }
  let end = Math.min(lineEnd, start + SNIPPET_LENGTH);
  if (end < lineEnd) {
    const space = text.lastIndexOf(" ", end);
    end = space > at ? space : end;
  }
  const lead = start > lineStart ? "…" : "";
  const body = text.slice(start, end);
  const out = `${lead}${body}${end < lineEnd ? "…" : ""}`;
  return { text: out, highlights: highlight(out, qTerms, [...terms]) };
}
