/**
 * Crash recovery's draft store (QLT-06, D-190, Architecture → Crash recovery). Each open note's
 * unsaved text is kept as one draft file in the app's data folder,
 * `<userData>/recovery/<workspace key>/<draft>.draft`: a JSON header line (who the draft is and
 * where its note was last known) and then the text. A draft is named by its ID, never its path:
 * renames update the path the store keeps, and a late text can't land under an old name (DEF-34).
 *
 * R1: this store never writes, creates, renames, moves or deletes anything in the workspace. It
 * writes only inside its own folder and refuses any other path; at launch it only reads the
 * workspace (and Git, through a function it's given) to match each draft to its note. It may not
 * import the note writer, the batch or Git (`tools/check-boundaries.mjs`).
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { parseJournal, replay, textHash } from "@focus-notes/core/journal";
import { DATA_FOLDERS } from "@focus-notes/core/inventory";
import { titleOfMarkdown } from "@focus-notes/core/workspace";
import type { FoundDraft, RecoveredDraft, RecoveryFound } from "@focus-notes/core";

/** A draft's ID, from the window (a ULID there): letters, digits, `_` and `-` only, so never a path. */
export const DRAFT_ID = /^[0-9A-Za-z_-]{10,40}$/;
/** Unplaced drafts are kept this long from their last text. */
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** At most this much per workspace: past it, the oldest unplaced drafts go first. */
export const MAX_BYTES = 200 * 1024 * 1024;
/** A text over this size is kept at most every `LARGE_EVERY_MS` (QLT-03's second still holds). */
export const LARGE_BYTES = 256 * 1024;
export const LARGE_EVERY_MS = 500;
/** The biggest text kept (a note's text over IPC). */
export const MAX_TEXT_CHARS = 32 * 1024 * 1024;
/** How long Git's `HEAD` is taken as known for a repository. */
const HEAD_FRESH_MS = 60_000;
/** The most notes the matching ladder looks through for a moved note. */
const INDEX_LIMIT = 100_000;

/** Encryption with the operating system's key store (Electron `safeStorage`), for private notes' drafts. */
export interface DraftCrypt {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface DraftStoreOptions {
  /** The app's data folder (`userData`): drafts go in `recovery/` there, and nowhere else. */
  dataDir: string;
  /** The open workspace's folder. */
  workspace: string;
  /** The old path-keyed journal, read once and turned into drafts, then deleted. */
  journal?: string;
  /** Git, read-only, in a repository's folder: its standard output, or undefined when it failed. */
  git?: (cwd: string, args: string[]) => Promise<string | undefined>;
  crypt?: DraftCrypt;
  /** Counts and problem codes only: note names and text are private. */
  log?: (line: string) => void;
  now?: () => number;
  maxBytes?: number;
  /** Paths compare without case (Windows): the default follows the platform. */
  foldCase?: boolean;
}

interface Draft {
  id: string;
  /** Where its note was last known, relative to the workspace, with `/`. */
  rel: string;
  seq: number;
  noteId?: string;
  /** The hash of the note's text on disk under the draft. */
  base?: string;
  /** The note file's ID (`stat().ino`) after its last write or rename. */
  ino?: string;
  /** Git's `HEAD` of the note's repository at its last save. */
  head?: string;
  at: number;
  state?: "recovered";
  enc?: "os";
  bytes: number;
  /** The window (its `webContents` ID) whose open note this is, this session. */
  owner?: number;
}

interface Header {
  v: 1;
  draft: string;
  seq: number;
  path: string;
  noteId?: string;
  base?: string;
  ino?: string;
  head?: string;
  at: number;
  state?: "recovered";
  enc?: "os";
}

/** A text waiting for its turn: a newer one for the same draft takes its place (DEF-14). */
interface Pending {
  owner: number;
  seq: number;
  path: string;
  text: string;
  done: Promise<void>;
}

type Outcome =
  | { kind: "saved" | "recovered" | "damaged"; rel: string }
  | { kind: "matched"; rel: string; text: string }
  | { kind: "changed"; rel: string; text: string; disk: string };

export interface DraftStats {
  drafts: number;
  bytes: number;
  matched: number;
  changed: number;
  recovered: number;
}

/** The first 16 hex digits of the SHA-256 of the workspace folder's real path (lowercased on Windows, `/`). */
export function workspaceKey(folder: string, foldCase = process.platform === "win32"): string {
  let real = resolve(folder);
  try {
    real = realpathSync.native(real);
  } catch {
    // Not there (yet): its path as given.
  }
  let p = real.split(sep).join("/");
  if (foldCase) p = p.toLowerCase();
  return createHash("sha256").update(p).digest("hex").slice(0, 16);
}

/** A new draft ID, for a draft the window didn't name (one from the old journal). */
export const newDraftId = () => randomBytes(16).toString("base64url");

/** A note's front-matter `id`, when it has one. */
export function frontMatterId(text: string): string | undefined {
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const line = fm?.[1]?.split(/\r?\n/).find((l) => /^id:/.test(l));
  const id = line?.slice(3).trim().replace(/^(["'])(.*)\1$/, "$2");
  return id ? id : undefined;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p);
/** A path relative to the workspace, as the store keeps it: never absolute, never up and out. */
const goodRel = (p: string) => p !== "" && !p.includes("\\") && !p.startsWith("/") && !/^[A-Za-z]:/.test(p) && !p.split("/").some((s) => s === ".." || s === "." || s === "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Renames, retrying while Windows antivirus or a sync client briefly holds a file it just saw. */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await sleep(50 * 2 ** attempt);
    }
  }
}

/** Git's `diff --name-status -z` renames: old path to new path, relative to the repository. */
export function parseRenames(out: string): Map<string, string> {
  const parts = out.split("\0");
  const map = new Map<string, string>();
  for (let i = 0; i < parts.length;) {
    const status = parts[i++] ?? "";
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = parts[i++], to = parts[i++];
      if (status.startsWith("R") && from && to) map.set(from, to);
    } else i++;
  }
  return map;
}

/** Files the index reads at once: enough to hide each read's round trip, few enough to leave the disk to the window. */
const SCAN_AT_ONCE = 32;

/**
 * The workspace's notes, read lazily once per matching run: only reads, never a write. The first
 * rung that needs to look through the workspace reads every note once, several at a time, for all
 * three keys (its front-matter `id`, its file's ID, its text's hash): with 10,000 notes, three
 * passes one file at a time took about 30 s on Windows (D-222).
 */
class WorkspaceIndex {
  #files: Promise<string[]> | undefined;
  #scan: Promise<{ byIno: Map<string, string[]>; byHash: Map<string, string[]>; byId: Map<string, string[]> }> | undefined;
  readonly #root: string;
  constructor(root: string) {
    this.#root = root;
  }
  files(): Promise<string[]> {
    return (this.#files ??= (async () => {
      const out: string[] = [];
      const walk = async (dir: string, rel: string) => {
        if (out.length >= INDEX_LIMIT) return;
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
          if (e.name.startsWith(".") || e.name === "node_modules") continue;
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) await walk(join(dir, e.name), r);
          else if (e.isFile() && isMarkdown(e.name)) out.push(r);
          if (out.length >= INDEX_LIMIT) return;
        }
      };
      await walk(this.#root, "");
      return out;
    })());
  }
  #abs = (rel: string) => join(this.#root, ...rel.split("/"));
  #all() {
    return (this.#scan ??= (async () => {
      const files = await this.files();
      const keys: ({ ino: string; hash: string; id?: string } | undefined)[] = new Array(files.length);
      let next = 0;
      const worker = async () => {
        for (let i = next++; i < files.length; i = next++) {
          try {
            const h = await open(this.#abs(files[i]!), "r");
            try {
              const st = await h.stat({ bigint: true });
              const text = await h.readFile("utf8");
              keys[i] = { ino: String(st.ino), hash: textHash(text), id: frontMatterId(text) };
            } finally {
              await h.close();
            }
          } catch {
            // Gone or unreadable: not a place a draft can go.
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(SCAN_AT_ONCE, files.length) }, worker));
      const byIno = new Map<string, string[]>(), byHash = new Map<string, string[]>(), byId = new Map<string, string[]>();
      const add = (map: Map<string, string[]>, k: string | undefined, rel: string) => {
        if (k !== undefined) map.set(k, [...(map.get(k) ?? []), rel]);
      };
      files.forEach((rel, i) => {
        const k = keys[i];
        if (!k) return;
        add(byIno, k.ino, rel);
        add(byHash, k.hash, rel);
        add(byId, k.id, rel);
      });
      return { byIno, byHash, byId };
    })());
  }
  byIno = async () => (await this.#all()).byIno;
  byHash = async () => (await this.#all()).byHash;
  byId = async () => (await this.#all()).byId;
}

export class DraftStore {
  /** This workspace's folder of drafts. */
  readonly dir: string;
  readonly workspace: string;
  readonly #o: DraftStoreOptions;
  readonly #now: () => number;
  readonly #fold: boolean;
  readonly #drafts = new Map<string, Draft>();
  readonly #queues = new Map<string, Promise<unknown>>();
  readonly #pending = new Map<string, Pending>();
  readonly #lastWrite = new Map<string, number>();
  /** This session's renames and moves, oldest first: a new draft sent under a name that's gone follows its note (DEF-34). */
  readonly #renames: { from: string; to: string }[] = [];
  readonly #outcomes = new Map<string, Outcome>();
  readonly #heads = new Map<string, { at: number; head: string | undefined }>();
  /** Git asked for a new draft's `HEAD`, after its first text (R5). */
  readonly #asking = new Set<Promise<unknown>>();
  /** Who `found()` is told to next: the first window to ask after a launch, or the one whose renderer was replaced. */
  #offer: "any" | number | undefined = "any";
  #stats = { matched: 0, changed: 0 };
  #tmp = 0;
  #loaded: Promise<void>;
  #matched: Promise<void>;

  private constructor(o: DraftStoreOptions) {
    this.#o = o;
    this.#now = o.now ?? Date.now;
    this.#fold = o.foldCase ?? process.platform === "win32";
    this.workspace = resolve(o.workspace);
    this.dir = join(resolve(o.dataDir), DATA_FOLDERS.drafts, workspaceKey(this.workspace, this.#fold));
    this.#loaded = Promise.resolve();
    this.#matched = Promise.resolve();
  }

  /** Opens the workspace's drafts. Reading, the old journal's migration and matching run in the background. */
  static open(o: DraftStoreOptions): DraftStore {
    const s = new DraftStore(o);
    s.#loaded = s.#load().catch((e: unknown) => s.#log(`recovery: load failed (${(e as NodeJS.ErrnoException)?.code ?? "error"})`));
    s.#matched = s.#loaded.then(() => s.#matchLaunch()).catch((e: unknown) => s.#log(`recovery: match failed (${(e as NodeJS.ErrnoException)?.code ?? "error"})`));
    return s;
  }

  /** Resolves once the launch's reading and matching are done. */
  ready(): Promise<void> {
    return this.#matched;
  }

  // ---- while writing ----

  /** Keeps a note's unsaved text under its draft (see `RecoveryBridge.keep`). */
  async keep(owner: number, draft: string, seq: number, path: string, text: string): Promise<void> {
    this.#checkId(draft);
    if (!Number.isSafeInteger(seq) || seq < 0) throw new Error("A draft's sequence is a whole number");
    if (!isStr(text) || text.length > MAX_TEXT_CHARS) throw new Error("A draft's text is text");
    await this.#loaded;
    const known = this.#drafts.get(draft);
    if (known && known.owner !== owner) return;
    // A new draft is placed only on a Markdown note inside the open workspace.
    if (!known && !this.#pending.has(draft)) this.#noteRel(path);
    const slot = this.#pending.get(draft);
    if (slot) {
      if (slot.owner !== owner) return;
      if (seq > slot.seq) Object.assign(slot, { seq, text, path });
      return slot.done;
    }
    const p: Pending = { owner, seq, path, text, done: Promise.resolve() };
    this.#pending.set(draft, p);
    p.done = this.#enqueue(draft, async () => {
      // A big text is kept at most every half second; newer texts join this one meanwhile.
      const last = this.#lastWrite.get(draft);
      if (Buffer.byteLength(p.text) > LARGE_BYTES && last !== undefined) {
        const wait = last + LARGE_EVERY_MS - this.#now();
        if (wait > 0) await sleep(wait);
      }
      if (this.#pending.get(draft) === p) this.#pending.delete(draft);
      let d = this.#drafts.get(draft);
      if (d && d.owner !== owner) return;
      if (d && p.seq <= d.seq) return;
      let asksGit = false;
      if (!d) {
        d = { id: draft, rel: this.#place(this.#noteRel(p.path)), seq: p.seq, at: this.#now(), bytes: 0, owner };
        this.#drafts.set(draft, d);
        // The first text doesn't wait for Git (R5): `HEAD` joins the header after it, when Git answers.
        asksGit = this.#headKnown(d.rel) === null;
        Object.assign(d, await this.#facts(d.rel, p.text, true));
      }
      d.seq = p.seq;
      d.at = this.#now();
      await this.#write(d, p.text);
      this.#lastWrite.set(draft, this.#now());
      await this.#enforceCap();
      if (asksGit) {
        const placed = d;
        const ask: Promise<unknown> = this.#head(placed.rel).then((head) => {
          if (head === undefined) return;
          return this.#enqueue(draft, async () => {
            if (this.#drafts.get(draft) !== placed || placed.head !== undefined) return;
            placed.head = head;
            await this.#write(placed);
          });
        }).finally(() => this.#asking.delete(ask));
        this.#asking.add(ask);
      }
    });
    return p.done;
  }

  /** The text handed over at `seq` is saved: the draft goes, unless a newer text arrived since. */
  async saved(owner: number, draft: string, seq: number): Promise<void> {
    this.#checkId(draft);
    if (!Number.isSafeInteger(seq) || seq < 0) throw new Error("A draft's sequence is a whole number");
    await this.#loaded;
    if (!this.#mine(owner, draft)) return;
    this.#pending.delete(draft);
    return this.#enqueue(draft, async () => {
      const d = this.#drafts.get(draft);
      if (!d || d.owner !== owner) return;
      if (d.seq <= seq) return this.#delete(d);
      // Newer text arrived after the save: it stays, over what's on disk now.
      Object.assign(d, await this.#facts(d.rel));
      await this.#write(d);
    });
  }

  /** The person left the note without saving: its draft goes. */
  async discard(owner: number, draft: string): Promise<void> {
    this.#checkId(draft);
    await this.#loaded;
    if (!this.#mine(owner, draft)) return;
    this.#pending.delete(draft);
    return this.#enqueue(draft, async () => {
      const d = this.#drafts.get(draft);
      if (d && d.owner === owner) await this.#delete(d);
    });
  }

  /** Close without saving in a window: every draft it has goes. */
  async discardOwned(owner: number): Promise<void> {
    await this.#loaded;
    const ids = new Set([...this.#drafts.values()].filter((d) => d.owner === owner).map((d) => d.id));
    await Promise.all([...ids].map((id) => this.discard(owner, id)));
  }

  /** A note or folder was renamed or moved by the app: every draft at or under it follows. */
  async moved(from: string, to: string): Promise<void> {
    await this.#loaded;
    const a = this.#rel(from), b = this.#rel(to);
    if (a === undefined || b === undefined || a === b) return;
    this.#renames.push({ from: a, to: b });
    if (this.#renames.length > 1000) this.#renames.shift();
    const moved = [...this.#drafts.values()].filter((d) => this.#atOrUnder(d.rel, a));
    for (const d of moved) d.rel = b + d.rel.slice(a.length);
    await Promise.all(moved.map((d) => this.#enqueue(d.id, () => (this.#drafts.get(d.id) === d ? this.#write(d) : undefined))));
  }

  /** A note or folder was deleted in the app: the drafts of its notes go (Recovered ones stay). */
  async gone(path: string): Promise<void> {
    await this.#loaded;
    const a = this.#rel(path);
    if (a === undefined) return;
    const hit = [...this.#drafts.values()].filter((d) => d.state !== "recovered" && this.#atOrUnder(d.rel, a));
    for (const d of hit) this.#pending.delete(d.id);
    await Promise.all(hit.map((d) => this.#enqueue(d.id, () => (this.#drafts.get(d.id) === d ? this.#delete(d) : undefined))));
  }

  /** The app wrote a note itself (a batch's link rewrite): a draft holding that text goes; else it's over the new text. */
  async rewritten(path: string): Promise<void> {
    await this.#loaded;
    const a = this.#rel(path);
    if (a === undefined) return;
    const hit = [...this.#drafts.values()].filter((d) => d.state !== "recovered" && this.#same(d.rel, a));
    await Promise.all(hit.map((d) => this.#enqueue(d.id, async () => {
      if (this.#drafts.get(d.id) !== d) return;
      const disk = await this.#readNote(d.rel);
      if (disk !== undefined && disk === (await this.#textOf(d).catch(() => undefined))) return this.#delete(d);
      Object.assign(d, await this.#facts(d.rel));
      await this.#write(d);
    })));
  }

  /**
   * The app saved a note: its file was replaced (a temporary file renamed over it), so it has a new
   * file ID. A draft on it learns that ID before the save is answered, so a crash after the title
   * renames the file, before the store hears of the rename or the save's end, still finds the note
   * by its file ID (DEF-36). Its base stays the text it was typed over: the draft may be behind the save.
   */
  async written(path: string): Promise<void> {
    await this.#loaded;
    const a = this.#rel(path);
    if (a === undefined) return;
    const hit = [...this.#drafts.values()].filter((d) => d.state !== "recovered" && this.#same(d.rel, a));
    if (!hit.length) return;
    const st = await stat(path, { bigint: true }).catch(() => undefined);
    if (!st) return;
    const ino = String(st.ino);
    await Promise.all(hit.map((d) => this.#enqueue(d.id, async () => {
      if (this.#drafts.get(d.id) !== d || d.ino === ino) return;
      d.ino = ino;
      await this.#write(d);
    })));
  }

  /**
   * Notes the watcher saw go and appear (renamed outside the app while it runs): a draft whose
   * note's file ID turns up under a new name follows it.
   */
  async seen(gone: readonly string[], appeared: readonly string[]): Promise<void> {
    await this.#loaded;
    const goneRel = new Set(gone.map((p) => this.#rel(p)).filter(isStr).map((r) => this.#key(r)));
    const hit = [...this.#drafts.values()].filter((d) => d.ino !== undefined && goneRel.has(this.#key(d.rel)));
    if (!hit.length) return;
    const inos = new Map<string, string>();
    for (const p of appeared) {
      const r = this.#rel(p);
      if (r === undefined || !isMarkdown(r)) continue;
      const st = await stat(p, { bigint: true }).catch(() => undefined);
      if (st) inos.set(String(st.ino), r);
    }
    await Promise.all(hit.map((d) => {
      const to = inos.get(d.ino!);
      if (!to) return undefined;
      d.rel = to;
      return this.#enqueue(d.id, () => (this.#drafts.get(d.id) === d ? this.#write(d) : undefined));
    }));
  }

  // ---- at launch ----

  /**
   * What the last session left, matched to notes, without writing anything to the workspace. Told
   * once: to the first window that asks after a launch, or to the window whose renderer was replaced.
   */
  async found(owner: number): Promise<RecoveryFound> {
    await this.#matched;
    const out: RecoveryFound = { matched: [], changed: [], recovered: 0 };
    if (this.#offer === "any" || this.#offer === owner) {
      this.#offer = undefined;
      let index: WorkspaceIndex | undefined;
      for (const d of [...this.#drafts.values()]) {
        if (d.owner !== undefined || d.state === "recovered") continue;
        let o = this.#outcomes.get(d.id);
        if (!o || o.rel !== d.rel) o = await this.#enqueue(d.id, () => this.#ladder(d, (index ??= new WorkspaceIndex(this.workspace))));
        if (!o || (o.kind !== "matched" && o.kind !== "changed") || this.#drafts.get(d.id) !== d) continue;
        // The window that's told goes on keeping the text under this ID, counting from 1 again.
        d.owner = owner;
        d.seq = 0;
        const f: FoundDraft = { draft: d.id, path: this.#abs(d.rel), title: this.#title(d.rel, o.text), text: o.text, ...(o.kind === "changed" ? { disk: o.disk } : {}) };
        (o.kind === "matched" ? out.matched : out.changed).push(f);
      }
      this.#outcomes.clear();
    }
    out.recovered = this.#recoveredDrafts().length;
    return out;
  }

  /** The window's renderer was replaced (it crashed): its drafts are told to it again by `found()`. */
  release(owner: number): void {
    for (const d of this.#drafts.values()) {
      if (d.owner !== owner) continue;
      d.owner = undefined;
      this.#outcomes.delete(d.id);
      this.#pending.delete(d.id);
    }
    if (this.#offer !== "any") this.#offer = owner;
  }

  // ---- Files → Recovered ----

  async recovered(): Promise<RecoveredDraft[]> {
    await this.#matched;
    const out: RecoveredDraft[] = [];
    for (const d of this.#recoveredDrafts().sort((a, b) => b.at - a.at)) {
      const text = await this.#textOf(d).catch(() => undefined);
      if (text === undefined) continue;
      const slash = d.rel.lastIndexOf("/");
      out.push({ id: d.id, title: this.#title(d.rel, text), where: slash < 0 ? "" : d.rel.slice(0, slash), path: this.#abs(d.rel), at: d.at, until: d.at + KEEP_MS, chars: text.length });
    }
    return out;
  }

  async text(id: string): Promise<string> {
    this.#checkId(id);
    await this.#matched;
    const d = this.#drafts.get(id);
    if (!d || d.state !== "recovered") throw new Error("No such draft");
    return this.#textOf(d);
  }

  async remove(id: string): Promise<void> {
    this.#checkId(id);
    await this.#matched;
    const d = this.#drafts.get(id);
    if (!d || d.state !== "recovered") return;
    await this.#enqueue(id, () => (this.#drafts.get(id) === d ? this.#delete(d) : undefined));
  }

  async count(): Promise<number> {
    await this.#loaded;
    return this.#drafts.size;
  }

  /** Removing the workspace or signing out: every draft of this workspace goes. */
  async removeAll(): Promise<void> {
    await this.#loaded;
    this.#pending.clear();
    await this.settled();
    this.#drafts.clear();
    this.#outcomes.clear();
    await rm(this.#own(this.dir), { recursive: true, force: true });
  }

  /** Resolves once everything asked so far is on disk. */
  async settled(): Promise<void> {
    await this.#loaded;
    while (this.#queues.size || this.#asking.size) await Promise.allSettled([...this.#queues.values(), ...this.#asking]);
  }

  /** Counts only, for logs and the diagnostic report. */
  stats(): DraftStats {
    let bytes = 0;
    for (const d of this.#drafts.values()) bytes += d.bytes;
    return { drafts: this.#drafts.size, bytes, ...this.#stats, recovered: this.#recoveredDrafts().length };
  }

  // ---- inside ----

  #log(line: string): void {
    this.#o.log?.(line);
  }

  #checkId(id: unknown): asserts id is string {
    if (!isStr(id) || !DRAFT_ID.test(id)) throw new Error("Not a draft ID");
  }

  /** A path inside the store's own folder, or a refusal: the store writes nowhere else (R1). */
  #own(p: string): string {
    const r = relative(this.dir, resolve(p));
    if (r.startsWith("..") || isAbsolute(r)) throw new Error("The recovery store writes only in its own folder");
    return p;
  }

  #file = (id: string) => this.#own(join(this.dir, `${id}.draft`));
  #abs = (rel: string) => join(this.workspace, ...rel.split("/"));
  #key = (rel: string) => (this.#fold ? rel.toLowerCase() : rel);
  #same = (a: string, b: string) => this.#key(a) === this.#key(b);
  #atOrUnder = (p: string, base: string) => this.#same(p, base) || this.#key(p).startsWith(`${this.#key(base)}/`);
  /** Whether a draft (or a new one's text still waiting) is this window's. */
  #mine = (owner: number, id: string) => {
    const d = this.#drafts.get(id);
    return d ? d.owner === owner : this.#pending.get(id)?.owner === owner;
  };
  #title = (rel: string, text: string) => titleOfMarkdown(text) ?? basename(rel, extname(rel));
  #recoveredDrafts = () => [...this.#drafts.values()].filter((d) => d.state === "recovered");

  /** A path inside the workspace, relative with `/`, or undefined. */
  #rel(p: unknown): string | undefined {
    if (!isStr(p) || !p || !isAbsolute(p)) return undefined;
    const r = relative(this.workspace, resolve(p));
    if (!r || r.startsWith("..") || isAbsolute(r)) return undefined;
    return r.split(sep).join("/");
  }

  /** A Markdown note's path inside the open workspace, outside dot folders, or a refusal. */
  #noteRel(p: unknown): string {
    const r = this.#rel(p);
    if (r === undefined || !isMarkdown(r) || r.split("/").some((s) => s.startsWith("."))) throw new Error("A draft is only for a note in the open workspace");
    return r;
  }

  /** Where a new draft's note is: as sent, unless that's gone because this session renamed it since (DEF-34). */
  #place(rel: string): string {
    if (!this.#renames.length || existsSync(this.#abs(rel))) return rel;
    let p = rel;
    for (const r of this.#renames) if (this.#atOrUnder(p, r.from)) p = r.to + p.slice(r.from.length);
    return p;
  }

  /** One change per draft at a time, in the order asked. A failure costs only that change. */
  #enqueue<T>(id: string, job: () => Promise<T> | T): Promise<T | undefined> {
    const prev = this.#queues.get(id) ?? Promise.resolve();
    const next = prev.then(job).catch((e: unknown) => {
      this.#log(`recovery: write failed (${(e as NodeJS.ErrnoException)?.code ?? "error"})`);
      return undefined;
    });
    this.#queues.set(id, next);
    void next.then(() => {
      if (this.#queues.get(id) === next) this.#queues.delete(id);
    });
    return next;
  }

  #encrypts(rel: string): boolean {
    return (rel === "private" || this.#key(rel).startsWith("private/")) && !!this.#o.crypt?.available();
  }

  /**
   * What's on disk under a draft, read only: the hash, the file's ID, the front-matter `id`, Git's `HEAD`.
   * `quick` doesn't wait for Git (a new draft's first text, R5): `HEAD` is left out when it isn't known yet.
   */
  async #facts(rel: string, text?: string, quick = false): Promise<Pick<Draft, "base" | "ino" | "noteId" | "head">> {
    const disk = await this.#readNote(rel);
    const st = await stat(this.#abs(rel), { bigint: true }).catch(() => undefined);
    const noteId = (disk !== undefined ? frontMatterId(disk) : undefined) ?? (text !== undefined ? frontMatterId(text) : undefined);
    const head = quick ? (this.#headKnown(rel) ?? undefined) : await this.#head(rel);
    return { base: disk !== undefined ? textHash(disk) : undefined, ino: st ? String(st.ino) : undefined, noteId, head };
  }

  #readNote(rel: string): Promise<string | undefined> {
    return readFile(this.#abs(rel), "utf8").catch(() => undefined);
  }

  /** The repository a note is in: the private one for `private/…` when it's there, else the workspace's. */
  #repo(rel: string): { cwd: string; rel: string } | undefined {
    if (this.#key(rel).startsWith("private/") && existsSync(join(this.workspace, "private", ".git"))) return { cwd: join(this.workspace, "private"), rel: rel.slice("private/".length) };
    return existsSync(join(this.workspace, ".git")) ? { cwd: this.workspace, rel } : undefined;
  }

  /** Git's `HEAD` for a note when it's known without running Git; `null` when Git has to be asked. */
  #headKnown(rel: string): string | undefined | null {
    const repo = this.#repo(rel);
    if (!repo || !this.#o.git) return undefined;
    const known = this.#heads.get(repo.cwd);
    return known && this.#now() - known.at < HEAD_FRESH_MS ? known.head : null;
  }

  async #head(rel: string): Promise<string | undefined> {
    const repo = this.#repo(rel);
    if (!repo || !this.#o.git) return undefined;
    const known = this.#heads.get(repo.cwd);
    if (known && this.#now() - known.at < HEAD_FRESH_MS) return known.head;
    const out = (await this.#o.git(repo.cwd, ["rev-parse", "HEAD"]).catch(() => undefined))?.trim();
    const head = out && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(out) ? out : undefined;
    this.#heads.set(repo.cwd, { at: this.#now(), head });
    return head;
  }

  /** Writes a draft: a temporary file beside it, flushed, renamed over it. Without `text`, the text it has stays. */
  async #write(d: Draft, text?: string): Promise<void> {
    const file = this.#file(d.id);
    const enc = this.#encrypts(d.rel);
    let body: Buffer;
    if (text === undefined && !!d.enc === enc) body = await this.#rawBody(file);
    else {
      const t = text ?? (await this.#textOf(d));
      body = enc ? Buffer.from(this.#o.crypt!.encrypt(t).toString("base64"), "ascii") : Buffer.from(t, "utf8");
    }
    if (enc) d.enc = "os";
    else delete d.enc;
    const h: Header = { v: 1, draft: d.id, seq: d.seq, path: d.rel, at: d.at };
    if (d.noteId !== undefined) h.noteId = d.noteId;
    if (d.base !== undefined) h.base = d.base;
    if (d.ino !== undefined) h.ino = d.ino;
    if (d.head !== undefined) h.head = d.head;
    if (d.state) h.state = d.state;
    if (d.enc) h.enc = d.enc;
    const all = Buffer.concat([Buffer.from(`${JSON.stringify(h)}\n`, "utf8"), body]);
    await mkdir(this.#own(this.dir), { recursive: true });
    const tmp = this.#own(`${file}.${process.pid}.${++this.#tmp}.tmp`);
    try {
      const fh = await open(tmp, "w");
      try {
        await fh.writeFile(all);
        await fh.sync();
      } finally {
        await fh.close();
      }
      await renameRetrying(tmp, file);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
    d.bytes = all.length;
  }

  async #rawBody(file: string): Promise<Buffer> {
    const buf = await readFile(file);
    const nl = buf.indexOf(10);
    if (nl < 0) throw new Error("A damaged draft");
    return buf.subarray(nl + 1);
  }

  async #textOf(d: Draft): Promise<string> {
    const body = await this.#rawBody(this.#file(d.id));
    if (!d.enc) return body.toString("utf8");
    if (!this.#o.crypt?.available()) throw new Error("The key store isn't available");
    return this.#o.crypt.decrypt(Buffer.from(body.toString("ascii"), "base64"));
  }

  async #delete(d: Draft): Promise<void> {
    this.#drafts.delete(d.id);
    this.#outcomes.delete(d.id);
    this.#lastWrite.delete(d.id);
    await rm(this.#file(d.id), { force: true });
  }

  /** A draft file's header, or undefined when it's damaged: one draft's damage costs only that draft. */
  #parse(id: string, buf: Buffer, bytes: number): Draft | undefined {
    const nl = buf.indexOf(10);
    if (nl < 0) return undefined;
    let h: Partial<Header>;
    try {
      h = JSON.parse(buf.subarray(0, nl).toString("utf8")) as Partial<Header>;
    } catch {
      return undefined;
    }
    if (typeof h !== "object" || h === null || h.v !== 1 || h.draft !== id || !Number.isSafeInteger(h.seq) || (h.seq as number) < 0) return undefined;
    if (!isStr(h.path) || !goodRel(h.path) || typeof h.at !== "number" || !Number.isFinite(h.at)) return undefined;
    for (const k of ["noteId", "base", "ino", "head"] as const) if (h[k] !== undefined && !isStr(h[k])) return undefined;
    if ((h.state !== undefined && h.state !== "recovered") || (h.enc !== undefined && h.enc !== "os")) return undefined;
    const d: Draft = { id, rel: h.path, seq: h.seq as number, at: h.at, bytes };
    for (const k of ["noteId", "base", "ino", "head", "state", "enc"] as const) if (h[k] !== undefined) (d as unknown as Record<string, unknown>)[k] = h[k];
    return d;
  }

  async #load(): Promise<void> {
    let damaged = 0;
    const names = await readdir(this.dir).catch(() => [] as string[]);
    for (const name of names) {
      const file = join(this.dir, name);
      // What a crash left mid-write: the draft it was for is whole beside it.
      if (name.endsWith(".tmp")) {
        await rm(this.#own(file), { force: true }).catch(() => {});
        continue;
      }
      const m = /^(.+)\.draft$/.exec(name);
      if (!m || !DRAFT_ID.test(m[1]!)) continue;
      const buf = await readFile(file).catch(() => undefined);
      const d = buf ? this.#parse(m[1]!, buf, buf.length) : undefined;
      if (d) this.#drafts.set(d.id, d);
      else {
        damaged++;
        // A damaged file is kept as long as an unplaced draft would be, then goes.
        const st = await stat(file).catch(() => undefined);
        if (st && this.#now() - st.mtimeMs > KEEP_MS) await rm(this.#own(file), { force: true }).catch(() => {});
      }
    }
    await this.#migrate();
    // Unplaced drafts are kept 30 days from their last text.
    for (const d of [...this.#drafts.values()]) if (d.state === "recovered" && this.#now() - d.at > KEEP_MS) await this.#delete(d);
    await this.#enforceCap();
    if (this.#drafts.size || damaged) this.#log(`recovery: drafts=${this.#drafts.size} damaged=${damaged}`);
  }

  /**
   * The old journal (D-105), read once: each note it still held unsaved becomes a draft with its last
   * known place, and the ladder then decides. One for a note outside this workspace waits in
   * Recovered under its file name (D-219). Nothing is written to any workspace; the journal goes.
   */
  async #migrate(): Promise<void> {
    const file = this.#o.journal;
    if (!file || !existsSync(file)) return;
    const content = await readFile(file, "utf8").catch(() => undefined);
    if (content === undefined) return;
    const live = replay(parseJournal(content).records);
    let n = 0;
    for (const e of live.values()) {
      const rel = (() => {
        try {
          return this.#noteRel(e.path);
        } catch {
          return undefined;
        }
      })();
      const name = basename(e.path).replace(/[\\/]/g, "");
      const d: Draft = { id: newDraftId(), rel: rel ?? (isMarkdown(name) ? name : `${name || "note"}.md`), seq: 0, at: e.at, bytes: 0 };
      if (e.base !== undefined) d.base = e.base;
      if (rel === undefined) d.state = "recovered";
      await this.#write(d, e.text);
      this.#drafts.set(d.id, d);
      n++;
    }
    await rm(file, { force: true });
    this.#log(`recovery: migrated ${n} from the journal`);
  }

  /** At most `maxBytes`: the oldest unplaced drafts go first, never one matched or still open. */
  async #enforceCap(): Promise<void> {
    const max = this.#o.maxBytes ?? MAX_BYTES;
    let total = 0;
    for (const d of this.#drafts.values()) total += d.bytes;
    if (total <= max) return;
    for (const d of this.#recoveredDrafts().sort((a, b) => a.at - b.at)) {
      if (total <= max) break;
      total -= d.bytes;
      await this.#delete(d);
    }
  }

  async #matchLaunch(): Promise<void> {
    const t0 = performance.now();
    const index = new WorkspaceIndex(this.workspace);
    const counts = { saved: 0, matched: 0, changed: 0, recovered: 0 };
    // Each draft on its own queue, all at once: one draft's reads wait on the disk while another's go on.
    const waiting = [...this.#drafts.values()].filter((d) => d.owner === undefined && d.state !== "recovered");
    const outcomes = await Promise.all(waiting.map((d) => this.#enqueue(d.id, () => this.#ladder(d, index))));
    waiting.forEach((d, i) => {
      const o = outcomes[i];
      if (!o) return;
      if (o.kind === "matched" || o.kind === "changed" || o.kind === "recovered" || o.kind === "saved") counts[o.kind]++;
      if (o.kind === "matched" || o.kind === "changed") this.#outcomes.set(d.id, o);
    });
    await this.#enforceCap();
    this.#stats = { matched: counts.matched, changed: counts.changed };
    const ms = performance.now() - t0;
    try {
      performance.measure("fn:recovery.match", { start: t0, duration: ms });
    } catch {
      // A measure is never worth an error.
    }
    if (counts.saved + counts.matched + counts.changed + counts.recovered) {
      this.#log(`recovery: match-ms=${Math.round(ms)} saved=${counts.saved} matched=${counts.matched} changed=${counts.changed} recovered=${counts.recovered}`);
    }
  }

  /**
   * The matching ladder ("At launch: match, write nothing"), stopping at the first certain answer.
   * It reads the workspace and Git only; what it changes is in the store's own folder.
   */
  async #ladder(d: Draft, index: WorkspaceIndex): Promise<Outcome> {
    if (this.#drafts.get(d.id) !== d) return { kind: "saved", rel: d.rel };
    const text = await this.#textOf(d).catch(() => undefined);
    if (text === undefined) {
      // Unreadable now (a key store that's gone): kept as it is, never shown as a note's text.
      return { kind: "damaged", rel: d.rel };
    }
    const here = await this.#readNote(d.rel);
    if (here !== undefined) return this.#settle(d, d.rel, here, text);
    for (const find of [() => this.#byId(d, index), () => this.#byIno(d, index), () => this.#byGit(d), () => this.#byHash(d, index)]) {
      const rel = await find().catch(() => undefined);
      if (rel === undefined) continue;
      const disk = await this.#readNote(rel);
      if (disk === undefined) continue;
      d.rel = rel;
      return this.#settle(d, rel, disk, text, true);
    }
    d.state = "recovered";
    await this.#write(d);
    return { kind: "recovered", rel: d.rel };
  }

  async #settle(d: Draft, rel: string, disk: string, text: string, moved = false): Promise<Outcome> {
    if (disk === text) {
      await this.#delete(d);
      return { kind: "saved", rel };
    }
    if (moved) await this.#write(d);
    if (d.base !== undefined && textHash(disk) === d.base) return { kind: "matched", rel, text };
    return { kind: "changed", rel, text, disk };
  }

  async #unique(map: Map<string, string[]>, key: string | undefined): Promise<string | undefined> {
    if (key === undefined) return undefined;
    const hits = map.get(key) ?? [];
    return hits.length === 1 ? hits[0] : undefined;
  }

  async #byId(d: Draft, index: WorkspaceIndex): Promise<string | undefined> {
    return d.noteId === undefined ? undefined : this.#unique(await index.byId(), d.noteId);
  }

  async #byIno(d: Draft, index: WorkspaceIndex): Promise<string | undefined> {
    return d.ino === undefined ? undefined : this.#unique(await index.byIno(), d.ino);
  }

  async #byHash(d: Draft, index: WorkspaceIndex): Promise<string | undefined> {
    return d.base === undefined ? undefined : this.#unique(await index.byHash(), d.base);
  }

  /** Git's renames since the draft's recorded `HEAD`, committed or not. */
  async #byGit(d: Draft): Promise<string | undefined> {
    const repo = this.#repo(d.rel);
    if (!repo || !d.head || !this.#o.git || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(d.head)) return undefined;
    const out = await this.#o.git(repo.cwd, ["diff", "-M", "--name-status", "-z", d.head, "--"]);
    if (out === undefined) return undefined;
    const to = parseRenames(out).get(repo.rel);
    if (!to || !goodRel(to)) return undefined;
    const rel = repo.cwd === this.workspace ? to : `private/${to}`;
    return isMarkdown(rel) ? rel : undefined;
  }
}
