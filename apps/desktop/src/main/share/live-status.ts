/**
 * D-436 (owner, 27 November 10:35): whether a published file's page is actually live. Right after a Publish, an
 * Unpublish or an update, each affected note is pending until its page answers on the owner's own GitHub Pages site
 * with the bytes a build made after the change uploaded (a content hash), or, for Unpublish, answers 404. Checks back
 * off: every 10 s for the first minute, then every 30 s; after 10 minutes a note still not live is failed (`timeout`),
 * and a failed site build or Pages deploy fails it at once with its reason. A later build that carries it puts it back
 * to pending. The status (and whether a site rebuild is owed, D-436 B) is kept in the app's data folder, so a restart
 * resumes the checks. Only GETs of the paired github.io site, through `get`.
 */
import { createHash } from "node:crypto";

export type LiveAction = "publish" | "unpublish";
export type LiveState = "pending" | "live" | "failed";
export interface LiveEntry {
  /** Where the note is now (the notes root, and its path in it): where its badge shows. */
  root: "private" | "public";
  path: string;
  /** The page's address and its file in the site (`n/a/b/index.html`). */
  url: string;
  page: string;
  action: LiveAction;
  /** When the change was made: only a build that read the source after this counts. */
  since: number;
  /** Past this, a note still not live is failed (`timeout`); a later build that carries it moves it on. */
  deadline: number;
  /** The page bytes' hashes builds since then uploaded; one of them served means live. */
  expect: string[];
  state: LiveState;
  /** `timeout`, `pages`, `offline`, `signedout`, `refused`, `leak` or `failed`. */
  reason?: string;
}
export interface LiveRecord { version: 1; project: string; owed: boolean; entries: LiveEntry[] }
export interface BuiltSite { started: number; pages: ReadonlyMap<string, string> }
export type LiveItem = Pick<LiveEntry, "root" | "path" | "url" | "page" | "action">;

export const pageHash = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
const keyOf = (e: Pick<LiveEntry, "root" | "path">) => `${e.root}:${e.path}`;
/** Pages read at once, notes kept, and hashes kept per note: bounds for a large Publish or a tampered file. */
const MAX_READS = 4, MAX_ENTRIES = 500, MAX_HASHES = 8;

export function liveWatcher(deps: {
  /** The project this status belongs to: a record saved for another is ignored. */
  project: string;
  read(): Promise<LiveRecord | undefined>;
  write(record: LiveRecord): Promise<void>;
  /** The page's text, or undefined on 404; throws offline or on any other answer (only a missed check). */
  get(url: string): Promise<string | undefined>;
  /** Every change of the entries, for the window. */
  changed(entries: readonly LiveEntry[]): void;
  /** Whether a saved page address may be checked: only the owner's own Pages site (security review, D-436). */
  allowed?(url: string): boolean;
  now?(): number;
  fastMs?: number; fastForMs?: number; slowMs?: number; timeoutMs?: number;
  /** How long a confirmed note stays `live` (the success outline, at least 200 ms) before it leaves the list. */
  holdMs?: number;
}) {
  const now = deps.now ?? Date.now;
  const fast = deps.fastMs ?? 10_000, fastFor = deps.fastForMs ?? 60_000, slow = deps.slowMs ?? 30_000, limit = deps.timeoutMs ?? 600_000;
  const hold = Math.max(200, deps.holdMs ?? 1_500);
  const entries = new Map<string, LiveEntry>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let owed = false, disposed = false, loaded: Promise<void> | undefined;
  // At most a few pages are read at once, however many notes a folder's Publish covers.
  let reading = 0;
  const queue: (() => void)[] = [];
  const read = async (url: string) => {
    if (reading >= MAX_READS) await new Promise<void>(resolve => queue.push(resolve));
    reading++;
    try { return await deps.get(url); } finally { reading--; queue.shift()?.(); }
  };
  const list = () => [...entries.values()];
  const save = () => disposed ? Promise.resolve() : deps.write({ version: 1, project: deps.project, owed, entries: list().filter(e => e.state !== "live").map(e => ({ ...e, expect: [...e.expect] })) }).catch(() => {});
  const emit = () => { if (!disposed) deps.changed(list()); };
  const clear = (key: string) => { const t = timers.get(key); if (t) clearTimeout(t); timers.delete(key); };
  const later = (key: string, ms: number, fn: () => void) => {
    clear(key);
    if (disposed) return;
    const t = setTimeout(() => { timers.delete(key); fn(); }, Math.max(0, ms));
    t.unref?.();
    timers.set(key, t);
  };
  const fail = (entry: LiveEntry, reason: string) => {
    entry.state = "failed";
    entry.reason = reason;
    clear(keyOf(entry));
  };
  const confirm = (entry: LiveEntry) => {
    const key = keyOf(entry);
    entry.state = "live";
    delete entry.reason;
    later(key, hold, () => { if (entries.get(key) === entry) { entries.delete(key); emit(); } });
  };
  const schedule = (entry: LiveEntry, at?: number) => {
    later(keyOf(entry), at ?? (now() - entry.since < fastFor ? fast : slow), () => void check(entry));
  };
  const check = async (entry: LiveEntry): Promise<void> => {
    const key = keyOf(entry);
    if (disposed || entries.get(key) !== entry || entry.state !== "pending") return;
    let text: string | undefined, answered = false;
    // Unpublish: gone once it's 404. Publish: only a build since the change counts, so there's nothing to look for before one.
    if (entry.action === "unpublish" || entry.expect.length) {
      try { text = await read(entry.url); answered = true; } catch { /* Offline or a slow answer is only a missed check. */ }
    }
    if (disposed || entries.get(key) !== entry || entry.state !== "pending") return;
    if (answered && (entry.action === "unpublish" ? text === undefined : text !== undefined && entry.expect.includes(pageHash(text)))) confirm(entry);
    else if (now() >= entry.deadline) fail(entry, "timeout");
    else { schedule(entry); return; }
    await save();
    emit();
  };
  return {
    /** Loads the saved status and resumes every pending check; whether a site rebuild was owed when the app last ran. */
    start(): Promise<boolean> {
      loaded ??= (async () => {
        const saved = await deps.read().catch(() => undefined);
        if (saved?.version === 1 && saved.project === deps.project && Array.isArray(saved.entries)) {
          owed = saved.owed === true;
          for (const e of saved.entries.slice(0, MAX_ENTRIES)) {
            if (!e || (e.state !== "pending" && e.state !== "failed") || typeof e.url !== "string" || typeof e.path !== "string" || typeof e.page !== "string") continue;
            if (deps.allowed && !deps.allowed(e.url)) continue;
            const expect = Array.isArray(e.expect) ? e.expect.filter(h => typeof h === "string" && /^[a-f0-9]{64}$/.test(h)).slice(-MAX_HASHES) : [];
            entries.set(keyOf(e), { ...e, expect, deadline: Number(e.deadline) || e.since + limit });
          }
        }
        for (const e of entries.values()) if (e.state === "pending") schedule(e, 0);
        emit();
      })();
      return loaded.then(() => owed);
    },
    entries: list,
    /** Notes whose page changes now: pending from this moment. */
    async track(items: readonly LiveItem[]): Promise<void> {
      await this.start();
      if (!items.length || disposed) return;
      const at = now();
      for (const item of items.slice(0, MAX_ENTRIES)) {
        const entry: LiveEntry = { ...item, since: at, deadline: at + limit, expect: [], state: "pending" };
        // The same note moved since (Unpublish moves it): one badge, where it is now.
        for (const [key, e] of entries) if (e.page === item.page && key !== keyOf(item)) { clear(key); entries.delete(key); }
        entries.set(keyOf(entry), entry);
        schedule(entry);
      }
      await save();
      emit();
    },
    /** A build's upload landed: what each page it carries looks like, for every change it was built after. */
    async built(site: BuiltSite): Promise<void> {
      await this.start();
      let touched = false;
      for (const e of entries.values()) {
        if (e.state === "live" || e.since > site.started) continue;
        const hash = site.pages.get(e.page);
        // A page the build doesn't carry (Publish) or still carries (Unpublish) isn't this change.
        if (e.action === "publish" ? !hash : site.pages.has(e.page)) continue;
        if (hash && !e.expect.includes(hash)) e.expect = [...e.expect, hash].slice(-MAX_HASHES);
        if (e.state === "failed") { e.state = "pending"; delete e.reason; }
        e.deadline = Math.max(e.deadline, now() + limit);
        touched = true;
        // Checked at once: Pages often serves it within seconds of the deploy.
        schedule(e, 0);
      }
      if (touched) { await save(); emit(); }
    },
    /** A Publish or Unpublish stopped before its upload: those notes never reached the site, so nothing is kept of them. */
    async forget(items: readonly Pick<LiveEntry, "root" | "path">[]): Promise<void> {
      await this.start();
      let any = false;
      for (const item of items) { const key = keyOf(item); if (entries.has(key)) { clear(key); entries.delete(key); any = true; } }
      if (any) { await save(); emit(); }
    },
    /** A site build or its Pages deploy failed: every note still waiting says why. */
    async buildFailed(reason: string): Promise<void> {
      await this.start();
      let any = false;
      for (const e of entries.values()) if (e.state === "pending") { fail(e, reason); any = true; }
      if (any) { await save(); emit(); }
    },
    /** The note's Retry publish: pending again from now (the caller builds the site again). */
    async retry(root: LiveEntry["root"], path: string): Promise<LiveEntry | undefined> {
      await this.start();
      const e = entries.get(`${root}:${path}`);
      if (!e || disposed) return undefined;
      const at = now();
      Object.assign(e, { state: "pending", since: at, deadline: at + limit, expect: [] });
      delete e.reason;
      schedule(e);
      await save();
      emit();
      return e;
    },
    /** Whether a site rebuild is owed; kept with the status so it survives a restart. */
    async setOwed(value: boolean): Promise<void> {
      await this.start();
      if (owed === value) return;
      owed = value;
      await save();
    },
    /** The project closed: every check and timer stops. */
    dispose(): void {
      disposed = true;
      for (const key of [...timers.keys()]) clear(key);
    },
  };
}
export type LiveWatcher = ReturnType<typeof liveWatcher>;
