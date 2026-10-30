/**
 * QLT-06 in the app (WP-8.9, D-190, D-220; Architecture → Crash recovery): the open note's unsaved
 * text goes to the shell under a draft ID that stays with the note through renames, with a rising
 * sequence; a save confirms the sequence it covers, never a failed one; taking the other version
 * drops it. At launch a matched note shows its text as unsaved edits, one undo step back to the
 * disk's; other matched notes say unsaved in Files until opened; a changed one opens the resolver
 * with Recovered and On disk and nothing is written until a choice; one toast sums it up.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, JOURNAL_INTERVAL_MS, titleOfMarkdown, type FoundDraft, type PlatformBridge, type RecoveryBridge, type RecoveryFound, type WorkspaceOp } from "../src/index.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const WELCOME = `${PRIV}/welcome.md`;
const PLAN = `${PRIV}/plan.md`;
const DRAFT_ID = /^[0-9A-Za-z_-]{10,40}$/;
const NONE: RecoveryFound = { matched: [], changed: [], recovered: 0 };

type Call = ["keep", string, number, string, string] | ["saved", string, number] | ["discard", string];

function setup(opts: { files?: Record<string, string>; open?: string; found?: RecoveryFound | Promise<RecoveryFound>; recovery?: boolean } = {}) {
  const files: Record<string, string> = { [WELCOME]: "# Welcome\n\nFirst.\n", [PLAN]: "# Plan\n\nSteps.\n", ...opts.files };
  const disk = checkingDisk(files);
  const calls: Call[] = [];
  let failWrites = false;
  let gate: Promise<void> | undefined;
  const under = (base: string, p: string) => p === base || p.startsWith(`${base}/`);
  const recovery: RecoveryBridge = {
    keep: async (d, seq, p, t) => void calls.push(["keep", d, seq, p, t]),
    saved: async (d, seq) => void calls.push(["saved", d, seq]),
    discard: async (d) => void calls.push(["discard", d]),
    found: async () => opts.found ?? NONE,
    recovered: async () => [], text: async () => "", remove: async () => {}, count: async () => 0,
  };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: async (p, t, expected) => {
      await gate;
      if (failWrites) throw new Error("disk full");
      return disk.writeNote(p, t, expected);
    },
    chooseNote: async () => undefined, newNotePath: async () => `${PRIV}/untitled.md`,
    defaultNotePath: async () => WELCOME,
    loadAppState: async () => ({ version: 1, ...(opts.open ? { lastNotePath: opts.open } : {}) }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "/w",
        roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: "/w/notes", readOnly: false }],
        entries: Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" })),
      }),
      writeFormat: async () => {},
      renameNote: async (from, to) => { files[to] = files[from]!; delete files[from]; },
      apply: async (ops: WorkspaceOp[]) => {
        for (const op of ops) {
          if (op.op === "move") { for (const p of Object.keys(files)) if (under(op.from, p)) { files[op.to + p.slice(op.from.length)] = files[p]!; delete files[p]; } }
          else if (op.op === "write") disk.writeOp(op);
          else if (op.op === "create") files[op.path] = op.text;
          else if (op.op === "delete") { for (const p of Object.keys(files)) if (under(op.path, p)) delete files[p]; }
        }
      },
      deleted: async () => [],
      onChange: () => () => {},
    },
    ...(opts.recovery === false ? {} : { recovery }),
  };
  return {
    bridge, files, calls,
    keeps: () => calls.filter((c): c is Extract<Call, ["keep", ...unknown[]]> => c[0] === "keep"),
    failWrites: (on: boolean) => { failWrites = on; },
    hold: () => { let open!: () => void; gate = new Promise((r) => { open = r; }); return () => { gate = undefined; open(); }; },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  const actions: [string, Record<string, unknown> | undefined][] = [];
  app.onEditorAction((id, args) => actions.push([id, args]));
  await app.start();
  for (let i = 0; i < 5; i++) await settle();
  return { app, actions };
}
const found = (path: string, text: string, extra: Partial<FoundDraft> = {}): FoundDraft => ({ draft: `01JD${path.length}DRAFT${text.length}XYZ0123456`.slice(0, 26), path, title: titleOfMarkdown(text) ?? "", text, ...extra });
type ConflictVm = { open: boolean; title: string; mineLabel: string; theirsLabel: string; keepMine: string; takeTheirs: string };
const conflict = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.conflict", app.store.state) as ConflictVm;
const filesVm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.files", app.store.state) as { items: { id: string; description: string }[] };
const toasts = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts;

describe("QLT-06: handing unsaved text to the shell", () => {
  it("makes a draft at the first edit and keeps its ID through a title rename; the sequence rises; another note gets a new one", async () => {
    const f = setup({ files: { [`${PRIV}/untitled.md`]: "" }, open: `${PRIV}/untitled.md` });
    const { app } = await started(f);
    expect(f.calls).toEqual([]);
    await app.commands.run("note.setContent", { value: "# On focus\n\nText" });
    const [first] = f.keeps();
    expect(first).toEqual(["keep", expect.stringMatching(DRAFT_ID), 1, `${PRIV}/untitled.md`, "# On focus\n\nText"]);
    const id = first![1];
    expect(id).toHaveLength(26);
    await app.flush();
    // The file name followed the title (FIL-07): the draft didn't change.
    expect(app.store.state.note.path).toBe(`${PRIV}/on-focus.md`);
    expect(f.calls.at(-1)).toEqual(["saved", id, 1]);
    await wait(JOURNAL_INTERVAL_MS + 20);
    await app.commands.run("note.setContent", { value: "# On focus\n\nMore text" });
    expect(f.keeps().at(-1)).toEqual(["keep", id, 2, `${PRIV}/on-focus.md`, "# On focus\n\nMore text"]);
    await app.flush();
    await app.commands.run("files.open");
    await app.commands.run("files.activate", { id: PLAN });
    for (let i = 0; i < 5; i++) await settle();
    await wait(JOURNAL_INTERVAL_MS + 20);
    await app.commands.run("note.setContent", { value: "# Plan\n\nSteps, more." });
    const other = f.keeps().at(-1)!;
    expect(other[1]).toMatch(DRAFT_ID);
    expect(other[1]).not.toBe(id);
    expect(other.slice(2)).toEqual([1, PLAN, "# Plan\n\nSteps, more."]);
  });

  it("confirms the sequence a save's snapshot covered once it's on disk, and nothing after a failed save", async () => {
    const f = setup();
    const { app } = await started(f);
    await app.commands.run("note.setContent", { value: "# Welcome\n\nOne." });
    const id = f.keeps()[0]![1];
    // A save starts with the first text; the second arrives, and is kept, while it's written.
    const release = f.hold();
    const saving = app.flush();
    await settle();
    await wait(JOURNAL_INTERVAL_MS + 20);
    await app.commands.run("note.setContent", { value: "# Welcome\n\nOne. Two." });
    expect(f.keeps().at(-1)!.slice(1, 3)).toEqual([id, 2]);
    release();
    await saving;
    await app.flush();
    const saved = f.calls.filter((c) => c[0] === "saved");
    expect(saved[0]).toEqual(["saved", id, 1]);
    expect(saved.at(-1)).toEqual(["saved", id, 2]);
    // A save that fails confirms nothing: the draft stays until the text is on disk.
    await wait(JOURNAL_INTERVAL_MS + 20);
    f.failWrites(true);
    const before = f.calls.length;
    await app.commands.run("note.setContent", { value: "# Welcome\n\nThree." });
    await app.flush();
    expect(app.store.state.note.saveState).toBe("error");
    expect(f.calls.slice(before).map((c) => c[0])).toEqual(["keep"]);
  });

  it("without a shell keeping drafts (the browser), nothing is handed over and nothing waits at launch", async () => {
    const f = setup({ recovery: false });
    const { app } = await started(f);
    await app.commands.run("note.setContent", { value: "# Welcome\n\nTyped." });
    await app.flush();
    expect(f.files[WELCOME]).toBe("# Welcome\n\nTyped.");
    expect(toasts(app)).toEqual([]);
  });
});

describe("QLT-06: what the last session left, at launch", () => {
  it("nothing found says nothing", async () => {
    const { app, actions } = await started(setup());
    await app.commands.run("app.ready");
    expect(toasts(app)).toEqual([]);
    expect(actions.filter(([id]) => id === "note.recover")).toEqual([]);
  });

  it("a matched open note shows the text as unsaved edits through the editor's one-step replace, under the found draft, and the save writes it", async () => {
    const text = "# Welcome\n\nFirst.\n\nTyped before the crash.\n";
    const d = found(WELCOME, text);
    const f = setup({ found: { matched: [d], changed: [], recovered: 0 } });
    const { app, actions } = await started(f);
    expect(app.store.state.note).toMatchObject({ path: WELCOME, markdown: text, saveState: "unsaved" });
    // The editor gets it once it's ready, for this note only.
    await app.commands.run("app.ready");
    expect(actions.filter(([id]) => id === "note.recover")).toEqual([["note.recover", { markdown: text, key: app.store.state.note.key }]]);
    // The window goes on under the found draft, counting from 1; nothing is written but by the save.
    expect(f.keeps()).toEqual([["keep", d.draft, 1, WELCOME, text]]);
    expect(f.files[WELCOME]).toBe("# Welcome\n\nFirst.\n");
    await app.flush();
    expect(f.files[WELCOME]).toBe(text);
    expect(f.calls.at(-1)).toEqual(["saved", d.draft, 1]);
    expect(toasts(app).map((t) => [t.message, t.action])).toEqual([["Restored what you were writing in “Welcome”.", undefined]]);
  });

  it("another matched note says unsaved in Files until it's opened; opening it applies the text the same way", async () => {
    const text = "# Plan\n\nSteps.\n\nAnd the next one.\n";
    const d = found(PLAN, text);
    const f = setup({ found: { matched: [d], changed: [], recovered: 0 } });
    const { app, actions } = await started(f);
    await app.commands.run("app.ready");
    expect(app.store.state.note).toMatchObject({ path: WELCOME, saveState: "saved" });
    await app.commands.run("files.open");
    const desc = (p: string) => filesVm(app).items.find((i) => i.id === p)?.description;
    expect(desc(PLAN)).toBe("unsaved");
    expect(desc(WELCOME)).toBe("");
    await app.commands.run("files.activate", { id: PLAN });
    for (let i = 0; i < 5; i++) await settle();
    await app.commands.run("app.ready");
    expect(app.store.state.note).toMatchObject({ path: PLAN, markdown: text, saveState: "unsaved" });
    expect(actions.filter(([id]) => id === "note.recover").map(([, a]) => a?.markdown)).toEqual([text]);
    await app.commands.run("files.open");
    expect(desc(PLAN)).toBe("");
    expect(f.keeps()).toEqual([["keep", d.draft, 1, PLAN, text]]);
  });

  it("a matched note whose file changed before it's opened compares the two instead", async () => {
    const d = found(PLAN, "# Plan\n\nSteps.\n\nMine.\n");
    const f = setup({ found: { matched: [d], changed: [], recovered: 0 } });
    const { app } = await started(f);
    f.files[PLAN] = "# Plan\n\nChanged elsewhere.\n";
    await app.commands.run("files.open");
    await app.commands.run("files.activate", { id: PLAN });
    for (let i = 0; i < 5; i++) await settle();
    expect(conflict(app)).toMatchObject({ open: true, mineLabel: "Recovered", theirsLabel: "On disk" });
  });

  it("a changed note opens the resolver with Recovered and On disk; saves wait; taking the disk's version drops the draft", async () => {
    const text = "# Welcome\n\nFirst.\n\nMine.\n";
    const d = found(WELCOME, text, { disk: "# Welcome\n\nFirst.\n" });
    const f = setup({ found: { matched: [], changed: [d], recovered: 0 } });
    const { app } = await started(f);
    expect(conflict(app)).toMatchObject({
      open: true, title: "“Welcome” changed while Focus Notes was closed", mineLabel: "Recovered", theirsLabel: "On disk",
      keepMine: "Keep recovered text", takeTheirs: "Take the version on disk",
    });
    expect(app.store.state.note).toMatchObject({ markdown: text, saveState: "unsaved" });
    const t = toasts(app).at(-1)!;
    expect(t.message).toBe("“Welcome” changed while Focus Notes was closed. Compare to keep what you need.");
    expect(t.action).toMatchObject({ command: "recovery.review", label: "Review" });
    // Nothing is written until a choice.
    expect(await app.flush()).toBe(false);
    expect(f.files[WELCOME]).toBe("# Welcome\n\nFirst.\n");
    await app.commands.run("conflict.choose", { choice: "theirs" });
    for (let i = 0; i < 5; i++) await settle();
    expect(app.store.state.note).toMatchObject({ markdown: "# Welcome\n\nFirst.\n", saveState: "saved" });
    expect(f.calls.at(-1)).toEqual(["discard", d.draft]);
    expect(toasts(app).at(-1)?.message).toBe("Took the version of “Welcome” on disk. The recovered text is in Recently deleted.");
  });

  it("keeping the recovered text saves it under the found draft", async () => {
    const text = "# Welcome\n\nFirst.\n\nMine.\n";
    const d = found(WELCOME, text, { disk: "# Welcome\n\nOther.\n" });
    const f = setup({ files: { [WELCOME]: "# Welcome\n\nOther.\n" }, found: { matched: [], changed: [d], recovered: 0 } });
    const { app } = await started(f);
    await app.commands.run("conflict.choose", { choice: "mine" });
    for (let i = 0; i < 5; i++) await settle();
    expect(f.files[WELCOME]).toBe(text);
    expect(f.calls.at(-1)).toEqual(["saved", d.draft, 1]);
  });

  it.each(["mine", "theirs", "both"] as const)("%s restores a deleted conflicted note without prematurely dropping its recovered draft", async (choice) => {
    const text = "# Welcome\n\nFirst.\n\nMine.\n";
    const d = found(WELCOME, text, { disk: "# Welcome\n\nFirst.\n" });
    const f = setup({ found: { matched: [], changed: [d], recovered: 0 } });
    f.bridge.readNoteIfExists = async (path) => f.files[path] ?? null;
    const { app } = await started(f);
    delete f.files[WELCOME];
    f.failWrites(true);
    await app.commands.run("conflict.choose", { choice });
    expect(conflict(app).open).toBe(true);
    expect(f.calls.some((c) => c[0] === "discard")).toBe(false);
    expect(app.store.state.note.markdown).toBe(text);
    f.failWrites(false);
    await app.commands.run("conflict.choose", { choice });
    expect(conflict(app).open).toBe(false);
    expect(f.files[WELCOME]).toBe(choice === "mine" ? text : "# Welcome\n\nFirst.\n");
    expect(f.calls.at(-1)?.[0]).toBe(choice === "mine" ? "saved" : "discard");
  });

  it("typed before the answer came (D-220): what was typed is saved first, then compared with the recovered text", async () => {
    let answer!: (r: RecoveryFound) => void;
    const text = "# Welcome\n\nFirst.\n\nFrom before.\n";
    const d = found(WELCOME, text);
    const f = setup({ found: new Promise((r) => { answer = r; }) });
    const app = createApp(f.bridge, messages);
    const starting = app.start();
    for (let i = 0; i < 5; i++) await settle();
    await app.commands.run("note.setContent", { value: "# Welcome\n\nFirst.\n\nJust now.\n" });
    answer({ matched: [d], changed: [], recovered: 0 });
    await starting;
    for (let i = 0; i < 5; i++) await settle();
    expect(f.files[WELCOME]).toBe("# Welcome\n\nFirst.\n\nJust now.\n");
    expect(conflict(app)).toMatchObject({ open: true, mineLabel: "Recovered", theirsLabel: "On disk" });
    expect(app.store.state.note.markdown).toBe(text);
  });

  it("one toast sums up every kind, with Review when anything needs a choice; Review opens the first changed note", async () => {
    const f = setup({
      files: { [`${PRIV}/c.md`]: "# C\n" },
      found: {
        matched: [found(PLAN, "# Plan\n\nMore.\n"), found(`${PRIV}/c.md`, "# C\n\nMore.\n")],
        changed: [found(`${PRIV}/c2.md`, "# Other\n\nMine.\n")],
        recovered: 2,
      },
    });
    f.files[`${PRIV}/c2.md`] = "# Other\n";
    const { app } = await started(f);
    const t = toasts(app).at(-1)!;
    expect(t.message).toBe("Restored what you were writing in 2 notes. “Other” changed while Focus Notes was closed. Compare to keep what you need. Kept 2 drafts that couldn't go back in their notes.");
    expect(t.action).toMatchObject({ command: "recovery.review" });
    await app.commands.run("recovery.review");
    for (let i = 0; i < 5; i++) await settle();
    expect(app.store.state.note.path).toBe(`${PRIV}/c2.md`);
    expect(conflict(app)).toMatchObject({ open: true, mineLabel: "Recovered" });
  });

  it("drafts that couldn't be placed: the toast offers Review, which opens Files → Recovered (D-221)", async () => {
    const f = setup({ found: { matched: [], changed: [], recovered: 3 } });
    const { app } = await started(f);
    expect(toasts(app).at(-1)).toMatchObject({ message: "Kept 3 drafts that couldn't go back in their notes.", action: { command: "recovery.review", label: "Review" } });
    expect(app.commands.has("files.showRecovered")).toBe(true);
    // The browser has no drafts: no Recovered, and nothing to review.
    const web = createApp(setup({ recovery: false }).bridge, messages);
    expect(web.commands.has("files.showRecovered")).toBe(false);
  });
});
