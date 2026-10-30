/**
 * The conflict resolver in the app (FIL-12, IA-CMP-CONFLICT, DD-FB-04). Two ways a note can have
 * two versions: sync found it changed on another computer, or another program changed the file
 * while this window had unsaved edits (D-92); and text a crash left over a note that changed since
 * (QLT-06) compares the same way, as Recovered and On disk. Either way both versions show, block by block, and
 * every choice keeps every word: Keep this computer's version, Take the other version (yours is kept
 * in Recently deleted), or Keep both. Decide later keeps your text and changes nothing.
 */
import type { AppState } from "./app.ts";
import type { NoteConflict, PlatformBridge, ConflictChoice } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { TaskTracker } from "./tasks.ts";
import { compareVersions, conflictCopy, titleOrName, type ConflictChoiceKind } from "./history.ts";
import { dirOf, walk } from "./workspace.ts";
import { SYNC_PROBLEMS } from "./sync-app.ts";

export interface ConflictState {
  open: boolean;
  /**
   * `sync`: changed on another computer. `outside`: changed by another program while this window had
   * unsaved edits. `recovered`: text a crash left, over a note that changed since (QLT-06, D-220).
   */
  kind: "sync" | "outside" | "recovered";
  notes: NoteConflict[];
  /** The note showing: they're settled one after another. */
  index: number;
  /** Choices made so far, settled together when the last note has one. */
  choices: ConflictChoice[];
  /** A note whose unsaved edits wait for a choice: its saves are held, so the other version isn't overwritten. */
  held?: string;
  busy: boolean;
  /** Bumped to move focus into the resolver. */
  focus: number;
}
export const CONFLICT_CLOSED: ConflictState = { open: false, kind: "sync", notes: [], index: 0, choices: [], busy: false, focus: 0 };

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  tracker: TaskTracker;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }) => number;
  announce: (text: string) => void;
  /** Runs after pending edits are written, with saves held until it finishes. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Shares the save lane without trying to save the held note first. */
  afterWrites: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Hands over any typing still held by the editor before comparing or preserving it. */
  handOver: () => void;
  setNote: (patch: Partial<AppState["note"]>) => void;
  /** The open note was loaded again with this text. */
  loaded: (path: string, markdown: string) => void;
  /** The person saw this text on disk and chose: the next save expects it there (DEF-26). */
  sawOnDisk?: (path: string, text: string) => void;
  /** Writes the open note's unsaved text now. */
  flush: () => Promise<boolean>;
  /** The open note's text was replaced by the other version; what was typed is in a copy now (QLT-06). */
  dropped?: () => void;
  now?: () => number;
}

const nameOf = (path: string) => path.split(/[\\/:]/).at(-1) ?? path;

export function registerConflicts(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge, toast, announce } = ctx;
  const now = ctx.now ?? (() => Date.now());
  const conflict = () => store.state.ui.conflict;
  const set = (patch: Partial<ConflictState>) => store.update((s) => ({ ...s, ui: { ...s.ui, conflict: { ...s.ui.conflict, ...patch } } }));
  const titleOf = (n: NoteConflict) => titleOrName(n.mine ?? n.theirs, nameOf(n.path));
  const quoted = (n: NoteConflict) => catalog.format("files.quoted", { name: titleOf(n) });
  const resolveAction = () => ({ command: "conflict.open", label: catalog.format("conflict.resolve") });

  /** Names a copy: "⟨title⟩ (conflict copy)", or a version kept with its time. */
  const copyTitle = (n: NoteConflict, choice: ConflictChoiceKind, version: "yours" | "other" = "yours") =>
    choice === "both" ? catalog.format("conflict.copyTitle", { title: titleOf(n) })
      : catalog.format(version === "yours" ? "conflict.yourVersionTitle" : "conflict.otherVersionTitle", { title: titleOf(n), at: now() });

  // ---- sync conflicts ----
  async function openSync(): Promise<void> {
    if (!bridge.sync?.conflicts || !bridge.sync.resolve) return;
    const notes = await bridge.sync.conflicts().catch(() => [] as NoteConflict[]);
    // Nothing to choose (changes elsewhere touched other notes): combine them and sync.
    if (!notes.length) return settle([]);
    set({ open: true, kind: "sync", notes, index: 0, choices: [], busy: false, focus: conflict().focus + 1 });
  }
  async function settle(choices: ConflictChoice[]): Promise<void> {
    set({ busy: true });
    const notes = conflict().notes;
    try {
      const r = await ctx.tracker.run("conflict", "task.resolving", () => ctx.exclusive(() => bridge.sync!.resolve!(choices)));
      store.update((s) => ({ ...s, ui: { ...s.ui, conflict: { ...CONFLICT_CLOSED, focus: s.ui.conflict.focus, ...(s.ui.conflict.held ? { held: s.ui.conflict.held } : {}) } } }));
      if (r.state === "problem") {
        const p = r.problem && SYNC_PROBLEMS.includes(r.problem) ? r.problem : "failed";
        toast(catalog.format(`sync.problem.${p}`), { tone: "error", ...(p === "conflict" ? { action: resolveAction() } : {}) });
        return;
      }
      const done = settled(choices, notes);
      toast(done);
      announce(done);
    } catch {
      set({ busy: false });
      toast(catalog.format("sync.problem.failed"), { tone: "error", action: resolveAction() });
    }
  }
  const settled = (choices: readonly ConflictChoice[], notes: readonly NoteConflict[]) => {
    if (!choices.length) return catalog.format("conflict.combined");
    if (choices.length > 1) return catalog.format("conflict.settledMany", { count: choices.length });
    const n = notes.find((x) => x.path === choices[0]!.path) ?? notes[0]!;
    return catalog.format(`conflict.settled.${choices[0]!.choice}`, { what: quoted(n) });
  };

  // ---- a file changed outside while this window had unsaved edits (D-92) ----
  /** Keeps the text that was here: the other version is never overwritten until a choice is made. */
  function outside(path: string, mine: string, theirs: string): void {
    // The watcher can report one change more than once: it's offered once.
    const held = conflict();
    if (held.held === path && held.kind === "outside" && held.notes[0]?.theirs === theirs) {
      if (held.notes[0]?.mine !== mine) set({ notes: [{ ...held.notes[0]!, mine }] });
      return;
    }
    const n: NoteConflict = { path, mine, theirs, theirsAt: now() };
    set({ kind: "outside", notes: [n], index: 0, choices: [], held: path, busy: false });
    toast(catalog.format("toast.changedOutside", { note: titleOf(n) }), { action: resolveAction() });
  }
  /**
   * Text a crash left over a note that changed since (QLT-06): the resolver opens with Recovered and
   * On disk, and nothing is written until a choice is made. The launch's toast has said so already.
   */
  function recovered(path: string, mine: string, theirs: string): void {
    const n: NoteConflict = { path, mine, theirs, theirsAt: now() };
    set({ open: true, kind: "recovered", notes: [n], index: 0, choices: [], held: path, busy: false, focus: conflict().focus + 1 });
  }
  /** Siblings' names, so a copy's name is free next to the note. */
  const siblings = async (path: string) => {
    const dir = dirOf(path);
    const out: string[] = [];
    // A previous attempt can already have made a copy before its watcher event arrives.
    const entries = bridge.workspace ? (await bridge.workspace.scan()).entries : walk(store.state.workspace.tree);
    for (const { path: p } of entries) if (dirOf(p) === dir) out.push(nameOf(p));
    return out;
  };
  /** A copy of one version next to the note; `recoverable` deletes it at once, so it's in Recently deleted (or the trash). */
  async function keepCopy(n: NoteConflict, text: string, title: string, recoverable: boolean): Promise<void> {
    const copy = conflictCopy({ path: n.path, text, title, taken: await siblings(n.path) });
    const ws = bridge.workspace;
    if (!ws?.apply) return void (await bridge.writeNote(copy.path, copy.text));
    await ws.apply([{ op: "create", path: copy.path, text: copy.text }]);
    if (recoverable) await ws.apply([{ op: "delete", path: copy.path }]);
  }
  const currentMine = () => {
    ctx.handOver();
    const c = conflict();
    const n = c.notes[0];
    if (c.kind !== "sync" && n && store.state.note.path === n.path && n.mine !== store.state.note.markdown) {
      set({ notes: [{ ...n, mine: store.state.note.markdown }] });
    }
  };
  async function chooseOutside(choice: ConflictChoiceKind): Promise<void> {
    currentMine();
    const n = conflict().notes[0];
    if (!n || n.mine === undefined || n.theirs === undefined) return;
    const kind = conflict().kind;
    set({ busy: true });
    try {
      const ready = await ctx.tracker.run("conflict", "task.resolving", () => ctx.afterWrites(async () => {
        const stillCurrent = async () => {
          const disk = await bridge.readNote(n.path);
          ctx.handOver();
          const open = store.state.note;
          if (open.path !== n.path || disk !== n.theirs || (choice !== "mine" && open.markdown !== n.mine)) {
            if (open.path === n.path) {
              set({ open: true, busy: false, notes: [{ ...n, mine: open.markdown, theirs: disk, theirsAt: now() }], held: n.path });
              toast(catalog.format("conflict.changedAgain"));
            } else set({ busy: false });
            return false;
          }
          return true;
        };
        if (!(await stillCurrent())) return false;
        // Whichever version isn't kept at the note is preserved before anything is replaced.
        if (choice === "mine") await keepCopy(n, n.theirs!, copyTitle(n, "theirs", "other"), true);
        else await keepCopy(n, n.mine!, copyTitle(n, choice), choice === "theirs");
        if (!(await stillCurrent())) return false;
        ctx.sawOnDisk?.(n.path, n.theirs!);
        if (choice !== "mine") {
          ctx.setNote({ key: `${n.path}#conflict-${now()}`, initialMarkdown: n.theirs, markdown: n.theirs, saveState: "saved" });
          ctx.loaded(n.path, n.theirs!);
          ctx.dropped?.();
        }
        store.update((s) => ({ ...s, ui: { ...s.ui, conflict: { ...CONFLICT_CLOSED, focus: s.ui.conflict.focus } } }));
        return true;
      }));
      if (!ready) return;
    } catch {
      set({ busy: false, open: true });
      toast(catalog.format("conflict.copyFailed"), { tone: "error" });
      return;
    }
    if (choice === "mine" && !(await ctx.flush())) {
      // Typing may have advanced during a successful write. Leave those edits on the ordinary
      // save lane, rather than holding them against the obsolete pre-resolution disk version.
      if (!conflict().held && store.state.note.saveState === "error") {
        set({ open: true, kind, notes: [{ ...n, mine: store.state.note.markdown }], held: n.path, busy: false });
        toast(catalog.format("toast.saveFailed"), { tone: "error" });
      }
      return;
    }
    const done = catalog.format(`conflict.${kind === "recovered" ? "settledRecovered" : "settled"}.${choice}`, { what: quoted(n) });
    toast(done);
    announce(done);
  }

  // ---- commands ----
  commands.register({
    id: "conflict.open", title: "command.conflict.open",
    enabled: (s) => s.sync.problem === "conflict" || Boolean(s.ui.conflict.held),
    run: async () => {
      if (conflict().held && conflict().kind !== "sync") {
        currentMine();
        return set({ open: true, focus: conflict().focus + 1 });
      }
      await openSync();
    },
  });
  commands.register<{ choice: string }>({
    id: "conflict.choose", title: "command.conflict.choose",
    run: async ({ choice }) => {
      const c = conflict();
      const kind = (["mine", "theirs", "both"] as const).find((k) => k === choice);
      const n = c.notes[c.index];
      if (!c.open || c.busy || !kind || !n) return;
      if (c.kind !== "sync") return chooseOutside(kind);
      const choices = [...c.choices, { path: n.path, choice: kind, ...(kind !== "mine" && n.mine !== undefined ? { copyTitle: copyTitle(n, kind) } : {}) }];
      if (c.index + 1 < c.notes.length) return set({ choices, index: c.index + 1, focus: c.focus + 1 });
      set({ choices });
      await settle(choices);
    },
  });
  // Esc or Decide later: your text stays, and nothing changes until a choice is made.
  commands.register({ id: "conflict.later", title: "command.conflict.later", run: () => { if (!conflict().busy) set({ open: false, choices: [], index: 0 }); } });
  commands.register<{ open: boolean }>({ id: "conflict.setOpen", title: "command.conflict.later", run: ({ open }) => { if (!open && !conflict().busy) set({ open: false, choices: [], index: 0 }); } });

  // ---- the view model ----
  const BLOCK = { type: "object" as const, properties: { id: { type: "string" as const }, text: { type: "string" as const }, changed: { type: "boolean" as const } } };
  const CLOSED_VM = { open: false, title: "", position: "", multiple: false, mineLabel: "", theirsLabel: "", mine: [], theirs: [], mineEmpty: "", theirsEmpty: "", busy: false, focus: 0, keepMine: "", takeTheirs: "" };
  viewModels.register({
    id: "vm.conflict",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, title: { type: "string" }, position: { type: "string" }, mineLabel: { type: "string" }, theirsLabel: { type: "string" },
        mine: { type: "array", items: BLOCK }, theirs: { type: "array", items: BLOCK }, mineEmpty: { type: "string" }, theirsEmpty: { type: "string" },
        busy: { type: "boolean" }, focus: { type: "number" }, keepMine: { type: "string" }, takeTheirs: { type: "string" }, multiple: { type: "boolean" },
      },
    },
    reads: ["ui.conflict"],
    select: (s) => {
      const c = s.ui.conflict;
      const n = c.notes[c.index];
      if (!c.open || !n) return { ...CLOSED_VM, focus: c.focus };
      const v = compareVersions(n.mine ?? "", n.theirs ?? "");
      const sync = c.kind === "sync";
      const recovered = c.kind === "recovered";
      return {
        open: true, busy: c.busy, focus: c.focus,
        title: catalog.format(sync ? "conflict.title" : recovered ? "conflict.titleRecovered" : "conflict.titleOutside", { what: quoted(n) }),
        position: c.notes.length > 1 ? catalog.format("conflict.position", { n: c.index + 1, count: c.notes.length }) : "", multiple: c.notes.length > 1,
        mineLabel: catalog.format(recovered ? "conflict.recovered" : "conflict.mine"),
        theirsLabel: recovered ? catalog.format("conflict.onDisk") : n.theirsAt !== undefined ? catalog.format(sync ? "conflict.theirsAt" : "conflict.outsideAt", { at: n.theirsAt }) : catalog.format("conflict.theirs"),
        mine: n.mine === undefined ? [] : v.mine, theirs: n.theirs === undefined ? [] : v.theirs,
        mineEmpty: catalog.format(n.mine === undefined ? "conflict.deletedHere" : "conflict.emptyNote"),
        theirsEmpty: catalog.format(n.theirs === undefined ? "conflict.deletedThere" : "conflict.emptyNote"),
        keepMine: catalog.format(recovered ? "conflict.keepRecovered" : "conflict.keepMine"), takeTheirs: catalog.format(sync ? "conflict.takeTheirs" : "conflict.takeOutside"),
      };
    },
  });

  // A conflict that sync reports is offered on its toast ([Resolve]); its notes are listed so
  // opening one of them opens the resolver too.
  let known: string[] = [];
  let asked = false;
  store.subscribe(() => {
    const p = store.state.sync.problem;
    if (p !== "conflict") {
      asked = false;
      known = [];
      return;
    }
    if (asked || !bridge.sync?.conflicts) return;
    asked = true;
    void bridge.sync.conflicts().then((list) => { known = list.map((n) => n.path); }, () => {});
  });

  return {
    outside,
    recovered,
    /** Whether saves to this note wait for a choice (D-92). */
    holds: (path: string | undefined) => path !== undefined && conflict().held === path,
    /** Opens the resolver for a held note, or for a note sync found in conflict when it's opened. */
    offer(path: string | undefined): void {
      if (path === undefined) return;
      if (conflict().held === path && !conflict().open) {
        currentMine();
        set({ open: true, focus: conflict().focus + 1 });
      }
      else if (known.includes(path) && !conflict().open) void openSync();
    },
    /** The app moved a note waiting for a choice (Files): the choice waits at its new path, saves still held (DEF-26). */
    moved(from: string, to: string): void {
      const c = conflict();
      if (c.held !== from) return;
      set({ held: to, notes: c.notes.map((n) => (n.path === from ? { ...n, path: to } : n)) });
    },
    /** The open note went away (deleted, or another note was opened after a choice): nothing is held for it. */
    release(path: string | undefined): void {
      if (path !== undefined && conflict().held === path) set({ held: undefined, open: false });
    },
  };
}
