/**
 * Crash recovery in the window (QLT-06, D-190, D-220; Architecture → Crash recovery). The open
 * note's unsaved text goes to the shell under a draft ID that stays with the note while it's open,
 * through every rename, with a sequence number that rises at each handover. A save confirms the
 * sequence it covers, and leaving the text without saving it drops the draft. Nothing here writes a
 * note: at launch, what the last session left comes back as unsaved edits (matched, one undo step
 * back to the disk's text) or in the resolver beside the disk's version (changed), and one toast
 * says so. The browser keeps no drafts: it saves at least every second instead (QLT-03).
 */
import type { AppState } from "./app.ts";
import type { FoundDraft, PlatformBridge, RecoveryFound } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import { rebase } from "./files.ts";

/** The editor action that puts recovered text in the note as one undo step (`{ markdown, key }`). */
export const RECOVER_EDITOR = "note.recover";
/** Where Files → Recovered opens, once that list is there (slice C). */
const SHOW_RECOVERED = "files.showRecovered";

const ID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** A new draft ID: 26 characters, the time first so they sort, then 80 random bits (a ULID). */
export function newDraftId(now = Date.now()): string {
  let time = "";
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = ID_CHARS[t % 32] + time;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return time + Array.from(bytes, (b) => ID_CHARS[b % 32]).join("");
}

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { action?: { command: string; label: string } }) => number;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  afterPaint: (fn: () => void) => void;
  /** The text becomes the open note's, unsaved, as if typed: the normal save writes it. */
  typed: (markdown: string) => void;
  /** Hands over and writes the open note's unsaved text now; whether it's saved. */
  flush: () => Promise<boolean>;
  load: (path: string) => Promise<void>;
  /** The resolver, with the recovered text and the disk's: saves wait for a choice (D-92). */
  compare: (path: string, recovered: string, disk: string) => void;
  /** Whether the open note waits in the resolver with recovered text. */
  comparing: () => boolean;
  /** The longest a handover waits to be kept (JOURNAL_INTERVAL_MS). */
  interval: number;
}

interface Waiting {
  kind: "matched" | "changed";
  found: FoundDraft;
  /** A matched note's text on disk when it was matched: if it isn't there when the note opens, the two are compared. */
  base?: string;
}

export function registerDrafts(ctx: Ctx) {
  const { store, commands, catalog, bridge } = ctx;
  const recovery = bridge.recovery;
  /** The open note's draft: made at its first unsaved edit, dropped when another note opens. */
  let draft: { id: string; seq: number } | undefined;
  let keepTimer: ReturnType<typeof setTimeout> | undefined;
  let keptAt = -Infinity;
  /** Found at launch for notes not open yet, by path: each is applied once, when it opens. */
  const waiting = new Map<string, Waiting>();
  /** The note key the editor on screen was built for, and recovered text waiting for that editor. */
  let editorKey: string | undefined;
  let toEditor: { key: string; markdown: string } | undefined;

  /** Notes with recovered text not yet opened: Files marks them unsaved. */
  const mark = () => store.update((s) => ({ ...s, ui: { ...s.ui, files: { ...s.ui.files, unsaved: [...waiting.keys()] } } }));

  /**
   * Unsaved text goes to the shell at once, or, when it was just kept, `interval` after that with the
   * latest text, so a crash loses at most about a second. At once means now, not on a timer a busy
   * computer runs late. Off the typing path: the shell writes it.
   */
  const keepSoon = () => {
    if (!recovery || keepTimer) return;
    const keep = () => {
      keepTimer = undefined;
      const { path, markdown, saveState } = store.state.note;
      if (!path || saveState === "saved" || !draft) return;
      keptAt = Date.now();
      void recovery.keep(draft.id, ++draft.seq, path, markdown).catch(() => {});
    };
    const wait = keptAt + ctx.interval - Date.now();
    if (wait <= 0) keep();
    else keepTimer = setTimeout(keep, wait);
  };
  const leave = () => {
    clearTimeout(keepTimer);
    keepTimer = undefined;
    draft = undefined;
  };

  const sendToEditor = () => {
    const t = toEditor;
    toEditor = undefined;
    if (t && store.state.note.key === t.key) ctx.editorAction(RECOVER_EDITOR, { markdown: t.markdown, key: t.key });
  };
  /** The recovered text, as unsaved edits on the disk's text; it goes on under the draft's ID, counting from 1. */
  const restore = (f: FoundDraft) => {
    draft = { id: f.draft, seq: 0 };
    toEditor = { key: store.state.note.key, markdown: f.text };
    ctx.typed(f.text);
    if (editorKey === toEditor.key) sendToEditor();
  };
  /** The note changed since the text was typed over it: both go to the resolver, and nothing is written until a choice. */
  const differs = (f: FoundDraft, disk: string) => {
    const path = store.state.note.path!;
    // The disk has that text already: there's nothing to choose.
    if (disk === f.text) return void recovery?.discard(f.draft).catch(() => {});
    ctx.compare(path, f.text, disk);
    restore(f);
  };
  /** Applies what was found for the open note, freshly read from disk. */
  const apply = (w: Waiting, disk: string) => {
    if (w.kind === "matched" && (w.base === undefined || w.base === disk)) restore(w.found);
    else differs(w.found, disk);
  };
  /** The open note when the answer came: applied now. Typed in already (D-220): that's saved first, then compared. */
  const applyOpen = async (path: string) => {
    const w = waiting.get(path);
    if (!w) return;
    if (store.state.note.saveState !== "saved") {
      // Saved first, so nothing typed is lost; a note that can't be saved keeps it waiting.
      if (!(await ctx.flush()) || store.state.note.path !== path || waiting.get(path) !== w) return;
      waiting.delete(path);
      mark();
      return differs(w.found, store.state.note.markdown);
    }
    waiting.delete(path);
    mark();
    apply(w, store.state.note.markdown);
  };

  /** The words for one launch's finds, or nothing when there's nothing to say. */
  const summary = (found: RecoveryFound) => {
    const parts: string[] = [];
    const words = (key: string, list: readonly FoundDraft[]) => {
      if (list.length) parts.push(catalog.format(key, { count: list.length, note: list[0]!.title }));
    };
    words("toast.recovery.matched", found.matched);
    words("toast.recovery.changed", found.changed);
    if (found.recovered > 0) parts.push(catalog.format("toast.recovery.recovered", { count: found.recovered }));
    return parts.join(" ");
  };
  const needsChoice = () => [...waiting.values()].some((w) => w.kind === "changed") || ctx.comparing();

  commands.register({
    id: "recovery.review", title: "command.recovery.review",
    // The first note to compare, else the drafts that couldn't be placed.
    run: async (_a, c) => {
      if (ctx.comparing()) return c.run("conflict.open");
      const changed = [...waiting].find(([, w]) => w.kind === "changed");
      if (changed) return ctx.load(changed[0]);
      if (commands.has(SHOW_RECOVERED)) return c.run(SHOW_RECOVERED);
    },
  });

  return {
    /** A handover of unsaved text: the draft is made at the first one. */
    edited(): void {
      if (!recovery) return;
      draft ??= { id: newDraftId(), seq: 0 };
      keepSoon();
    },
    /**
     * At a save's snapshot: what the save covers. Called once it's on disk, with whether the text
     * is still what was written: then every handover so far is covered, else only those before it.
     */
    snapshot(): (unchanged: boolean) => void {
      const d = draft;
      if (!recovery || !d) return () => {};
      const seq = d.seq;
      return (unchanged) => void recovery.saved(d.id, unchanged ? d.seq : seq).catch(() => {});
    },
    /** The person left the text without saving it (another version taken in the resolver): its draft goes. */
    dropped(): void {
      const d = draft;
      leave();
      if (recovery && d) void recovery.discard(d.id).catch(() => {});
    },
    /** A note opened (its text read from disk): a new draft from its first edit, and what a crash left for it. */
    opened(path: string, disk: string): void {
      leave();
      const w = waiting.get(path);
      if (!w) return;
      waiting.delete(path);
      mark();
      apply(w, disk);
    },
    /** The editor for the open note is built: recovered text waiting for it goes in once it's painted. */
    editorReady(): void {
      editorKey = store.state.note.key;
      if (toEditor?.key === editorKey) ctx.afterPaint(sendToEditor);
    },
    /** Files moved notes or folders: what waits for them follows. */
    moved(moves: readonly { from: string; to: string }[]): void {
      if (!waiting.size || !moves.length) return;
      const next = [...waiting].map(([p, w]) => [rebase(p, moves), w] as const);
      waiting.clear();
      for (const [p, w] of next) waiting.set(p, w);
      mark();
    },
    /**
     * Asks the shell what the last session left (once per launch), without delaying the first note:
     * the open note gets its text now, the rest when they open, and one toast says what happened.
     */
    async start(): Promise<void> {
      if (!recovery) return;
      const found = await recovery.found().catch(() => undefined);
      if (!found) return;
      for (const f of found.matched) waiting.set(f.path, { kind: "matched", found: f });
      for (const f of found.changed) waiting.set(f.path, { kind: "changed", found: f });
      const open = store.state.note;
      // A matched note opened later is compared if its text on disk changes before then.
      for (const [p, w] of waiting) {
        if (w.kind === "matched" && p !== open.path) void bridge.readNote(p).then((t) => { w.base ??= t; }, () => {});
      }
      mark();
      if (open.path && open.status === "ready" && waiting.has(open.path)) await applyOpen(open.path);
      const words = summary(found);
      if (!words) return;
      const review = needsChoice() || (found.recovered > 0 && commands.has(SHOW_RECOVERED));
      ctx.toast(words, review ? { action: { command: "recovery.review", label: catalog.format("toast.recovery.review") } } : {});
    },
  };
}
