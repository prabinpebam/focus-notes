/**
 * The share reader (WP-5.4, SHR-10, IA-VIEW-PUBLIC, D-125): the page at `s/` where someone opens what
 * was shared with them, with a magic link or their name and a passcode. Its state is the view model
 * `vm.share` that `share.view.json` reads, and its commands are the page's only actions. The shell
 * (apps/web/src/share) supplies the sealed site, the session's storage, and a timer.
 * Every failure is the one generic error: it never says whether a name, a link, or a note exists.
 */
import { sharedListModel, sharedNoteFromHash, sharedPage, type ReaderModel } from "./public-page.ts";
import type { JsonSchema } from "./view-models.ts";

/** A share once opened: what it opens, a reader for each note, the session that reopens it, and when it ends. */
export interface OpenedShare {
  notes: readonly { path: string; title: string; updated: string }[];
  read(path: string): Promise<string>;
  session: unknown;
  expiresAt: string | null;
}
/** The sealed site. Each call fails with any error for every kind of failure; the reader never shows which. */
export interface ShareSource {
  openLink(link: { id: string; secret: string }): Promise<OpenedShare>;
  openPasscode(name: string, passcode: string): Promise<OpenedShare>;
  /** Reopens from a stored session, reading the site afresh (a deploy may have replaced it). */
  resume(session: unknown): Promise<OpenedShare>;
}
/**
 * Where the session lives (SHR-10): this tab only by default (sessionStorage), on this device when the
 * reader asks (localStorage, until the grant ends), and signing out reaches every tab (BroadcastChannel).
 */
export interface SessionStore {
  load(): { session: unknown; remembered: boolean } | undefined;
  save(session: unknown, remembered: boolean): void;
  /** Forgets the session here and tells every other tab to forget it too. */
  signOut(): void;
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
      remember: { type: "boolean" },
      signedOut: { type: "boolean" },
      multiple: { type: "boolean" },
      list: { type: "object", properties: { title: { type: "array", items: { type: "object" } }, body: { type: "array", items: { type: "object" } } } },
      note: { type: "object", properties: { title: { type: "array", items: { type: "object" } }, updated: { type: "number" }, body: { type: "array", items: { type: "object" } } } },
      focus: { type: "number" },
    },
  },
};
export const SHARE_COMMANDS = ["share.submit", "share.setRemember", "share.signOut", "share.showList"] as const;

const EMPTY: ReaderModel = { title: [], updated: 0, body: [] };
/** setTimeout's longest delay; a later expiry is checked again when it fires. */
const MAX_DELAY = 2 ** 31 - 1;

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
  let state: ShareState = { phase: "opening", error: false, empty: false, busy: false, remember: false, signedOut: false, multiple: false, list: EMPTY, note: EMPTY, focus: 0 };
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
    set({ phase: "gate", busy: false, empty: false, multiple: false, list: EMPTY, note: EMPTY, focus: state.phase === "gate" ? state.focus : state.focus + 1, ...patch });
  };
  /** Any failure: forget the session everywhere and show the one generic error. */
  const fail = () => {
    if (open) o.store.signOut();
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
    const list = sharedListModel(o.format("share.reader.list.title"), share.notes);
    set({ error: false, empty: false, busy: false, signedOut: false, multiple: share.notes.length > 1, list });
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
    const page = sharedPage(text, entry.path, entry.updated, new Set(open.notes.map((n) => n.path)));
    set({ phase: "note", note: page.model });
  };

  const opened = async (attempt: Promise<OpenedShare>, remember: boolean, hash?: string, stored = false) => {
    let share: OpenedShare;
    try { share = await attempt; } catch {
      // A stored session that no longer opens (withdrawn, expired, or a changed passcode) is forgotten.
      if (stored) o.store.signOut();
      fail();
      return;
    }
    o.store.save(share.session, remember);
    set({ remember });
    await show(share, hash);
  };

  o.store.onSignedOut(() => toGate({ error: false, signedOut: true, remember: false }));

  return {
    get state() { return state; },
    subscribe(l: () => void) { listeners.add(l); return () => void listeners.delete(l); },

    /** The page opened: with a magic link (already removed from the address), a stored session, or neither. */
    async start(link: { id: string; secret: string } | undefined, hash: string | undefined): Promise<void> {
      // A link keeps this device's choice to remember, whatever it remembered before.
      if (link) return opened(o.source.openLink(link), o.store.load()?.remembered ?? false, hash);
      const stored = o.store.load();
      if (!stored) { toGate({}); return; }
      await opened(o.source.resume(stored.session), stored.remembered, hash, true);
    },
    /** Open, or Open and remember (on this device), from the name and passcode form. */
    async submit(name: string, passcode: string, remember = false): Promise<void> {
      if (state.busy) return;
      if (!name.trim() || !passcode.trim()) { set({ empty: true, error: false, focus: state.focus + 1 }); return; }
      set({ busy: true, empty: false, error: false });
      await opened(o.source.openPasscode(name, passcode), remember);
    },
    /** Remember on this device, or only in this tab (SHR-10). */
    setRemember(on: boolean) {
      set({ remember: on });
      if (open) o.store.save(open.session, on);
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
