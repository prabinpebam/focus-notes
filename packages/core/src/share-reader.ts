/**
 * The share reader (WP-5.4, SHR-10, IA-VIEW-PUBLIC, D-125): the page at `s/` where someone opens what
 * was shared with them, with a magic link or their name and a passcode. Its state is the view model
 * `vm.share` that `share.view.json` reads, and its commands are the page's only actions. The shell
 * (apps/web/src/share) supplies the sealed site, the session's storage, and a timer.
 * Every failure is the one generic error: it never says whether a name, a link, or a note exists.
 */
import { BLOCK_LIST_SCHEMA, sharedListModel, sharedNoteFromHash, sharedPage, type ReaderModel } from "./public-page.ts";
import type { JsonSchema } from "./view-models.ts";

/** A share once opened: what it opens, a reader for each note, the session that reopens it, and when it ends. */
export interface OpenedShare {
  notes: readonly { path: string; title: string; updated: string }[];
  read(path: string): Promise<string>;
  /** A sealed image the note at `path` references, decrypted (WP-9.6); fails for anything else. */
  media?(path: string, ref: string): Promise<{ type: string; bytes: Uint8Array }>;
  session: unknown;
  expiresAt: string | null;
}
/** The sealed site. Each call fails with any error for every kind of failure; the reader never shows which. */
export interface ShareSource {
  openLink(link: { id: string; secret: string }): Promise<OpenedShare>;
  openPasscode(name: string, passcode: string): Promise<OpenedShare>;
  openAccessCode?(value: string): Promise<OpenedShare>;
  /** Reopens from a stored session, reading the site afresh (a deploy may have replaced it). */
  resume(session: unknown): Promise<OpenedShare>;
}
/**
 * Where the session lives (SHR-10, D-125): records in IndexedDB holding the non-extractable key, found by
 * this tab's random record ID (in sessionStorage) or as the device's one remembered record; signing out
 * deletes them all and reaches every tab (BroadcastChannel). `pickSession` decides which a page may use.
 */
export interface SessionStore {
  load(): Promise<{ session: unknown; remembered: boolean } | undefined>;
  save(session: unknown, remembered: boolean): Promise<void>;
  /** Forgets the session here and tells every other tab to forget it too. */
  signOut(): void;
  /** Forgets only this tab's session, one that no longer opens (withdrawn, expired). */
  forget(): Promise<void>;
  /** Another tab signed out. */
  onSignedOut(listener: () => void): () => void;
}

export type SharePhase = "opening" | "gate" | "list" | "note";
export interface ShareState extends Record<string, unknown> {
  phase: SharePhase;
  /** The one generic error (SHR-06). */
  error: boolean;
  /** Open was pressed with a field left empty. */
  empty: boolean;
  busy: boolean;
  /** Which of Open and Open and remember is pending while busy (D-356); the other stays at rest. */
  openBusy: boolean;
  rememberBusy: boolean;
  legacy: boolean;
  remember: boolean;
  /** Signed out on this device, by this tab or another. */
  signedOut: boolean;
  /** The share opens more than one note, so a note offers the way back to the list. */
  multiple: boolean;
  list: ReaderModel;
  note: ReaderModel;
  /** Changes whenever the name field should take focus again. */
  focus: number;
}

export const SHARE_VIEW_MODEL: { id: string; schema: JsonSchema & { type: "object"; properties: Record<string, JsonSchema> } } = {
  id: "vm.share",
  schema: {
    type: "object",
    properties: {
      phase: { type: "string", enum: ["opening", "gate", "list", "note"] },
      error: { type: "boolean" },
      empty: { type: "boolean" },
      busy: { type: "boolean" },
      openBusy: { type: "boolean" },
      rememberBusy: { type: "boolean" },
      legacy: { type: "boolean" },
      remember: { type: "boolean" },
      signedOut: { type: "boolean" },
      multiple: { type: "boolean" },
      list: { type: "object", properties: { title: BLOCK_LIST_SCHEMA, body: BLOCK_LIST_SCHEMA } },
      note: { type: "object", properties: { title: BLOCK_LIST_SCHEMA, updated: { type: "number" }, body: BLOCK_LIST_SCHEMA } },
      focus: { type: "number" },
    },
  },
};
/** A stored session record's bookkeeping; the session itself (with its CryptoKey) rides alongside. */
export interface StoredShare { id: string; remembered: boolean; savedAt: number; usedAt: number; expiresAt: string | null }
/** A tab's session ends after 12 hours unused, even if the tab stays open or its record outlives the tab. */
export const TAB_IDLE_MS = 12 * 3600_000;
/** A remembered session of a grant that never expires ends after 30 days unused (each use renews it). */
export const REMEMBER_MS = 30 * 24 * 3600_000;

/**
 * Which stored session this page may use, and which records to delete: anything saved before the last
 * sign-out on this device, past its grant's expiry, a tab session idle 12 hours, or a remembered one of a
 * never-expiring grant unused 30 days. This tab's own record comes first, then the device's remembered one.
 */
export function pickSession<T extends StoredShare>(records: readonly T[], o: { now: number; signedOutAt: number; tabId: string | undefined }): { use: T | undefined; drop: string[] } {
  const drop: string[] = [];
  const live = records.filter((r) => {
    const dead = r.savedAt < o.signedOutAt
      || (r.expiresAt !== null && !(Date.parse(r.expiresAt) > o.now))
      || (!r.remembered && o.now - r.usedAt > TAB_IDLE_MS)
      || (r.remembered && r.expiresAt === null && o.now - r.usedAt > REMEMBER_MS);
    if (dead) drop.push(r.id);
    return !dead;
  });
  const mine = o.tabId === undefined ? undefined : live.find((r) => r.id === o.tabId);
  const device = live.filter((r) => r.remembered).sort((a, b) => b.usedAt - a.usedAt)[0];
  return { use: mine ?? device, drop };
}

export const SHARE_COMMANDS = ["share.submit", "share.submitCode", "share.setLegacy", "share.setRemember", "share.signOut", "share.showList"] as const;

const EMPTY: ReaderModel = { title: [], updated: 0, body: [] };
/** setTimeout's longest delay; a later expiry is checked again when it fires. */
const MAX_DELAY = 2 ** 31 - 1;
/** The image types the reader's image block shows from a data URL (NoteContent's print image). */
const SHOWN_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * A shared note's images (WP-9.6): each is opened through the share, decrypted, and shown from a data
 * URL, so the page never requests a file by its private path. One that can't be opened, or a type the
 * page can't show, shows its description instead.
 */
async function withImages(blocks: ReaderModel["body"], path: string, share: OpenedShare): Promise<ReaderModel["body"]> {
  const visit = async (n: ReaderModel["body"][number]): Promise<ReaderModel["body"][number]> => {
    if (n.type === "image") {
      const { src, ...attrs } = n.attrs ?? {};
      let printSrc: string | undefined;
      if (typeof src === "string" && src && share.media) {
        try {
          const image = await share.media(path, src);
          if (SHOWN_TYPES.has(image.type)) printSrc = `data:${image.type};base64,${base64(image.bytes)}`;
        } catch { /* shown as its description */ }
      }
      return { ...n, attrs: { ...attrs, print: true, ...(printSrc ? { printSrc } : {}) } };
    }
    return n.content ? { ...n, content: await Promise.all(n.content.map(visit)) } : n;
  };
  return Promise.all(blocks.map(visit));
}

export interface ShareReaderOptions {
  source: ShareSource;
  store: SessionStore;
  /** An interface string by key (`share.reader.list.title`). */
  format: (key: string) => string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => () => void;
}

export function createShareReader(o: ShareReaderOptions) {
  const now = o.now ?? Date.now;
  const setTimer = o.setTimer ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
  let state: ShareState = { phase: "opening", error: false, empty: false, busy: false, openBusy: false, rememberBusy: false, legacy: false, remember: false, signedOut: false, multiple: false, list: EMPTY, note: EMPTY, focus: 0 };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<ShareState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  let open: OpenedShare | undefined;
  let stopTimer = () => {};

  const toGate = (patch: Partial<ShareState>) => {
    open = undefined;
    stopTimer();
    // The name field takes focus when the gate replaces what had it; a failed try leaves focus on Open.
    set({ phase: "gate", busy: false, openBusy: false, rememberBusy: false, empty: false, multiple: false, list: EMPTY, note: EMPTY, focus: state.phase === "gate" ? state.focus : state.focus + 1, ...patch });
  };
  /** Any failure: forget the session everywhere and show the one generic error. */
  const fail = () => {
    if (open) void o.store.forget();
    toGate({ error: true, signedOut: false });
  };

  const watchExpiry = (expiresAt: string | null) => {
    stopTimer();
    if (!expiresAt) return;
    const check = () => {
      const left = Date.parse(expiresAt) - now();
      if (!(left > 0)) { fail(); return; }
      stopTimer = setTimer(check, Math.min(left, MAX_DELAY));
    };
    check();
  };

  const show = async (share: OpenedShare, hash: string | undefined) => {
    open = share;
    watchExpiry(share.expiresAt);
    // Already past its expiry: the gate shows the generic error, and the share never shows (review I8).
    if (open !== share) return;
    const list = sharedListModel(o.format("share.reader.list.title"), share.notes);
    set({ error: false, empty: false, busy: false, openBusy: false, rememberBusy: false, signedOut: false, multiple: share.notes.length > 1, list });
    const wanted = hash === undefined ? undefined : sharedNoteFromHash(hash);
    await showNote(wanted);
  };

  /** Shows a note the share opens, or the list for anything else: nothing outside the share is reachable. */
  const showNote = async (path: string | undefined) => {
    const share = open;
    // A share of one note always shows that note.
    const entry = share?.notes.length === 1 ? share.notes[0] : share?.notes.find((n) => n.path === path);
    if (!share || !entry) {
      if (share) set({ phase: "list", note: EMPTY });
      return;
    }
    let text: string;
    try {
      text = await share.read(entry.path);
    } catch {
      // The site may have been deployed since it opened: read it afresh once, then give up.
      try {
        const again = await o.source.resume(share.session);
        if (open !== share) return;
        open = again;
        text = await again.read(entry.path);
      } catch { if (open) fail(); return; }
    }
    if (!open) return;
    const current = open;
    const page = sharedPage(text, entry.path, entry.updated, new Set(current.notes.map((n) => n.path)));
    const body = await withImages(page.model.body, entry.path, current);
    // Signed out, expired or replaced while the images opened: they never land.
    if (open !== current) return;
    set({ phase: "note", note: { ...page.model, body } });
  };

  const opened = async (attempt: Promise<OpenedShare>, remember: boolean, hash?: string, stored = false) => {
    let share: OpenedShare;
    try { share = await attempt; } catch {
      // A stored session that no longer opens (withdrawn, expired, or a changed passcode) is forgotten.
      if (stored) void o.store.forget();
      fail();
      return;
    }
    await o.store.save(share.session, remember);
    set({ remember });
    await show(share, hash);
  };

  o.store.onSignedOut(() => toGate({ error: false, signedOut: true, remember: false }));

  return {
    get state() { return state; },
    subscribe(l: () => void) { listeners.add(l); return () => void listeners.delete(l); },

    /** The page opened: with a magic link (already removed from the address), a stored session, or neither. */
    async start(link: { id: string; secret: string } | undefined, hash: string | undefined): Promise<void> {
      // A link opens for this tab only; the reader chooses to remember it (review L3).
      if (link) return opened(o.source.openLink(link), false, hash);
      const stored = await o.store.load();
      if (!stored) { toGate({}); return; }
      await opened(o.source.resume(stored.session), stored.remembered, hash, true);
    },
    /** Open, or Open and remember (on this device), from the name and passcode form. */
    async submit(name: string, passcode: string, remember = false): Promise<void> {
      if (state.busy) return;
      if (!name.trim() || !passcode.trim()) { set({ empty: true, error: false, focus: state.focus + 1 }); return; }
      set({ busy: true, openBusy: !remember, rememberBusy: remember, empty: false, error: false });
      await opened(o.source.openPasscode(name, passcode), remember);
    },
    async submitCode(value: string, remember = false): Promise<void> {
      if (state.busy) return;
      if (!value) { set({ empty: true, error: false, focus: state.focus + 1 }); return; }
      set({ busy: true, openBusy: !remember, rememberBusy: remember, empty: false, error: false });
      await opened(Promise.resolve().then(() => {
        if (!o.source.openAccessCode) throw new Error("Access-code reader unavailable");
        return o.source.openAccessCode(value);
      }), remember);
    },
    setLegacy(legacy: boolean) {
      if (!state.busy) set({ legacy, error: false, empty: false, focus: state.focus + 1 });
    },
    /** Remember on this device, or only in this tab (SHR-10). */
    setRemember(on: boolean) {
      set({ remember: on });
      if (open) void o.store.save(open.session, on);
    },
    signOut() {
      o.store.signOut();
      toGate({ error: false, signedOut: true, remember: false });
    },
    /** The fragment changed: a link between shared notes, or back. */
    navigate(hash: string): Promise<void> {
      return showNote(sharedNoteFromHash(hash));
    },
    showList() {
      if (open && state.multiple) set({ phase: "list", note: EMPTY });
    },
  };
}
export type ShareReader = ReturnType<typeof createShareReader>;
