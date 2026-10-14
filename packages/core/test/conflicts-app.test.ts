/**
 * Conflicts and Recently deleted in the app (WP-3.5): the resolver for a note changed on another
 * computer (FIL-12) and for a file changed outside while this window had unsaved edits (D-92), where
 * every choice keeps every word; Recently deleted in the Files sheet with Restore and Restore to…
 * (FIL-10); and Undo for moves and deletes (DD-FB-01).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, titleOfMarkdown, type ConflictChoice, type DeletedNote, type NoteConflict, type PlatformBridge, type SyncReport, type WorkspaceChange, type WorkspaceOp } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const PUB = "/w/notes";
const idle: SyncReport = { git: true, state: "idle", waiting: 0 };

function setup(opts: { files?: Record<string, string>; folders?: string[]; open?: string; conflicts?: NoteConflict[]; deleted?: DeletedNote[]; git?: boolean } = {}) {
  const files: Record<string, string> = { [`${PRIV}/welcome.md`]: "# Welcome\n\nFirst.\n", ...opts.files };
  const folders = new Set(opts.folders ?? []);
  const batches: WorkspaceOp[][] = [];
  const resolved: ConflictChoice[][] = [];
  const restored: { ids: string[]; folder?: string }[] = [];
  let conflicts = opts.conflicts ?? [];
  let deleted = opts.deleted ?? [];
  let status: ((r: SyncReport) => void) | undefined;
  let current: SyncReport = { ...idle, git: opts.git ?? true };
  let changed: ((c: WorkspaceChange[]) => void) | undefined;
  const under = (base: string, p: string) => p === base || p.startsWith(`${base}/`);
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: async (p, c) => { files[p] = c; },
    chooseNote: async () => undefined,
    newNotePath: async () => `${PRIV}/untitled.md`,
    defaultNotePath: async () => `${PRIV}/welcome.md`,
    loadAppState: async () => ({ version: 1, ...(opts.open ? { lastNotePath: opts.open } : {}) }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    sync: {
      now: async () => current,
      status: async () => current,
      onStatus: (l) => { status = l; return () => {}; },
      conflicts: async () => conflicts,
      resolve: async (choices) => { resolved.push(choices); conflicts = []; current = idle; return idle; },
    },
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "/w",
        roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
        entries: [...[...folders].map((path) => ({ path, kind: "folder" as const })), ...Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" }))],
      }),
      writeFormat: async () => {},
      renameNote: async () => {},
      apply: async (ops) => {
        batches.push(ops);
        for (const op of ops) {
          if (op.op === "move") {
            for (const p of Object.keys(files)) if (under(op.from, p)) { files[op.to + p.slice(op.from.length)] = files[p]!; delete files[p]; }
          } else if (op.op === "write") files[op.path] = op.text;
          else if (op.op === "create") { if (op.path in files) throw new Error("taken"); files[op.path] = op.text; }
          else if (op.op === "createFolder") folders.add(op.path);
          else if (op.op === "delete") { for (const p of Object.keys(files)) if (under(op.path, p)) delete files[p]; for (const d of [...folders]) if (under(op.path, d)) folders.delete(d); }
        }
      },
      deleted: async () => deleted,
      restore: async (ids, folder) => {
        restored.push({ ids, ...(folder ? { folder } : {}) });
        const back = ids.map((id) => {
          const d = deleted.find((x) => x.id === id)!;
          const path = folder ? `${folder}/${d.path.split("/").at(-1)}` : d.path;
          files[path] = `# ${d.title}\n`;
          return { path, title: d.title };
        });
        deleted = deleted.filter((d) => !ids.includes(d.id));
        return back;
      },
      onChange: (l) => { changed = l; return () => {}; },
    },
  };
  return {
    bridge, files, batches, resolved, restored,
    report: (r: SyncReport) => { current = r; status?.(r); },
    outside: (path: string, text: string) => { files[path] = text; changed?.([{ path, kind: "note", exists: true, title: titleOfMarkdown(text) ?? "" }]); },
    setDeleted: (d: DeletedNote[]) => { deleted = d; },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  for (let i = 0; i < 5; i++) await settle();
  return app;
}
const done = async (app: ReturnType<typeof createApp>) => { for (let i = 0; i < 8; i++) await settle(); await app.idle(); };
type ConflictVm = { open: boolean; title: string; position: string; mineLabel: string; theirsLabel: string; mine: { text: string; changed: boolean }[]; theirs: { text: string; changed: boolean }[]; theirsEmpty: string; takeTheirs: string };
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.conflict", app.store.state) as ConflictVm;
const toasts = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts;
const lastToast = (app: ReturnType<typeof createApp>) => toasts(app).at(-1);

describe("FIL-12: the conflict resolver for a note changed on another computer", () => {
  const welcome = `${PRIV}/welcome.md`;
  const essay = `${PUB}/essay.md`;
  const two: NoteConflict[] = [
    { path: welcome, mine: "# Welcome\n\nMine.\n", theirs: "# Welcome\n\nTheirs.\n", theirsAt: Date.UTC(2026, 9, 14, 3, 30) },
    { path: essay, mine: "# Essay\n\nHere.\n", theirs: undefined },
  ];

  it("a sync conflict's toast offers Resolve, which shows both versions block by block, one note at a time", async () => {
    const f = setup({ conflicts: two });
    const app = await started(f);
    f.report({ git: true, state: "problem", problem: "conflict", waiting: 1 });
    const t = lastToast(app)!;
    expect(t.message).toBe("Couldn't sync: GitHub has changes that don't fit with yours. Both versions are kept.");
    expect(t.action).toMatchObject({ command: "conflict.open", label: "Resolve" });
    await app.commands.run("toast.action", { id: t.id });
    await done(app);
    const v = vm(app);
    expect(v).toMatchObject({ open: true, title: "“Welcome” changed on another computer", position: "Note 1 of 2", mineLabel: "This computer" });
    expect(v.theirsLabel).toMatch(/^Other version, pushed /);
    expect(v.mine.map((b) => [b.text, b.changed])).toEqual([["# Welcome", false], ["Mine.", true]]);
    expect(v.theirs.map((b) => [b.text, b.changed])).toEqual([["# Welcome", false], ["Theirs.", true]]);
    // The trigger shows the problem until it's settled.
    expect(app.viewModels.select("vm.canvas", app.store.state)).toMatchObject({ problem: true, problemLabel: "Couldn't sync" });
  });

  it("settles every note together once each has a choice, naming the copies that keep this computer's text", async () => {
    const f = setup({ conflicts: two });
    const app = await started(f);
    f.report({ git: true, state: "problem", problem: "conflict", waiting: 1 });
    await app.commands.run("conflict.open");
    await done(app);
    await app.commands.run("conflict.choose", { choice: "theirs" });
    expect(f.resolved).toEqual([]);
    expect(vm(app)).toMatchObject({ title: "“Essay” changed on another computer", position: "Note 2 of 2", theirs: [], theirsEmpty: "Deleted in the other version." });
    await app.commands.run("conflict.choose", { choice: "both" });
    await done(app);
    expect(f.resolved).toHaveLength(1);
    const [a, b] = f.resolved[0]!;
    expect(a).toMatchObject({ path: welcome, choice: "theirs" });
    expect(a!.copyTitle).toMatch(/^Welcome \(your version, .+\)$/);
    expect(b).toEqual({ path: essay, choice: "both", copyTitle: "Essay (conflict copy)" });
    expect(vm(app).open).toBe(false);
    expect(lastToast(app)?.message).toBe("Settled 2 conflicts.");
  });

  it("Keep this computer's version needs no copy; Decide later changes nothing; opening a conflicting note opens the resolver", async () => {
    const f = setup({ conflicts: [two[0]!], files: { [essay]: "# Essay\n" } , open: essay });
    const app = await started(f);
    f.report({ git: true, state: "problem", problem: "conflict", waiting: 1 });
    await done(app);
    await app.commands.run("conflict.open");
    await done(app);
    await app.commands.run("conflict.later");
    expect(vm(app).open).toBe(false);
    expect(f.resolved).toEqual([]);
    expect(app.store.state.sync.problem).toBe("conflict");
    // Opening the note in conflict opens the resolver.
    await app.commands.run("files.open");
    await app.commands.run("files.activate", { id: welcome });
    await done(app);
    expect(app.store.state.note.path).toBe(welcome);
    expect(vm(app).open).toBe(true);
    await app.commands.run("conflict.choose", { choice: "mine" });
    await done(app);
    expect(f.resolved).toEqual([[{ path: welcome, choice: "mine" }]]);
    expect(lastToast(app)?.message).toBe("Kept this computer's version of “Welcome”. The other version is kept too.");
  });

  it("with nothing to choose (other notes changed), Resolve combines the changes and syncs", async () => {
    const f = setup({ conflicts: [] });
    const app = await started(f);
    f.report({ git: true, state: "problem", problem: "conflict", waiting: 1 });
    await app.commands.run("conflict.open");
    await done(app);
    expect(f.resolved).toEqual([[]]);
    expect(lastToast(app)?.message).toBe("Synced the changes from elsewhere.");
  });
});

describe("D-92 and FIL-12: a file changed outside while this window had unsaved edits", () => {
  const welcome = `${PRIV}/welcome.md`;
  async function typedThenChangedOutside() {
    const f = setup();
    const app = await started(f);
    await app.commands.run("note.setContent", { value: "# Welcome\n\nTyped here.\n" });
    f.outside(welcome, "# Welcome\n\nWritten elsewhere.\n");
    await wait(10);
    await done(app);
    return { f, app };
  }

  it("keeps the edits, never saves over the other version, and asks with Resolve", async () => {
    const { f, app } = await typedThenChangedOutside();
    expect(lastToast(app)).toMatchObject({ message: "“Welcome” changed outside Focus Notes. Your edits are kept here, and aren't saved over it until you choose.", action: { command: "conflict.open" } });
    await wait(600); // longer than the save delay
    expect(f.files[welcome]).toBe("# Welcome\n\nWritten elsewhere.\n");
    expect(app.store.state.note.markdown).toBe("# Welcome\n\nTyped here.\n");
    expect(app.viewModels.select("vm.canvas", app.store.state)).toMatchObject({ problem: true, problemLabel: "Changed in two places" });
    // Saving (or leaving the note, or closing) asks for the choice instead of overwriting.
    expect(await app.flush()).toBe(false);
    expect(vm(app)).toMatchObject({ open: true, title: "“Welcome” changed outside Focus Notes", takeTheirs: "Take the version on disk" });
    expect(f.files[welcome]).toBe("# Welcome\n\nWritten elsewhere.\n");
  });

  it("Keep this computer's version: saves it, and keeps the other as a copy that's deleted at once (recoverable)", async () => {
    const { f, app } = await typedThenChangedOutside();
    await app.commands.run("conflict.open");
    await app.commands.run("conflict.choose", { choice: "mine" });
    await done(app);
    expect(f.files[welcome]).toBe("# Welcome\n\nTyped here.\n");
    const [create, del] = f.batches;
    expect(create).toHaveLength(1);
    expect(create![0]).toMatchObject({ op: "create" });
    const copy = create![0] as { path: string; text: string };
    expect(copy.path).toMatch(/^\/w\/private\/notes\/welcome-other-version-.+\.md$/);
    expect(copy.text).toMatch(/^# Welcome \(other version, .+\)\n\nWritten elsewhere\.\n$/);
    expect(del).toEqual([{ op: "delete", path: copy.path }]);
    expect(app.viewModels.select("vm.canvas", app.store.state)).toMatchObject({ problem: false });
  });

  it("Take the version on disk: the editor shows it, and what was typed is kept as a recoverable copy", async () => {
    const { f, app } = await typedThenChangedOutside();
    await app.commands.run("conflict.open");
    await app.commands.run("conflict.choose", { choice: "theirs" });
    await done(app);
    expect(app.store.state.note).toMatchObject({ markdown: "# Welcome\n\nWritten elsewhere.\n", saveState: "saved" });
    expect(f.files[welcome]).toBe("# Welcome\n\nWritten elsewhere.\n");
    const copy = f.batches[0]![0] as { op: string; path: string; text: string };
    expect(copy.text).toMatch(/^# Welcome \(your version, .+\)\n\nTyped here\.\n$/);
    expect(f.batches[1]).toEqual([{ op: "delete", path: copy.path }]);
  });

  it("Keep both: the editor takes the other version, and what was typed stays as a conflict copy next to it", async () => {
    const { f, app } = await typedThenChangedOutside();
    await app.commands.run("conflict.open");
    await app.commands.run("conflict.choose", { choice: "both" });
    await done(app);
    expect(f.files[`${PRIV}/welcome-conflict-copy.md`]).toBe("# Welcome (conflict copy)\n\nTyped here.\n");
    expect(f.batches).toHaveLength(1);
    expect(app.store.state.note.markdown).toBe("# Welcome\n\nWritten elsewhere.\n");
  });
});

describe("FIL-10: Recently deleted in the Files sheet", () => {
  const at = (d: number, h: number) => new Date(2026, 9, d, h, 5).getTime();
  const gone: DeletedNote[] = [
    { id: `private:${"a".repeat(40)}:notes/drafts/spec-ideas.md`, root: "private", path: `${PRIV}/drafts/spec-ideas.md`, title: "Spec ideas", folder: "drafts", deletedAt: Date.now() - 60_000 },
    { id: `public:${"b".repeat(40)}:notes/about.md`, root: "public", path: `${PUB}/about.md`, title: "About", folder: "", deletedAt: at(1, 9) },
  ];

  it("opens in place from its footer, grouped by day with where each note was", async () => {
    const f = setup({ deleted: gone, folders: [`${PRIV}/drafts`] });
    const app = await started(f);
    await app.commands.run("files.open");
    let d = app.viewModels.select("vm.deleted", app.store.state) as { available: boolean; open: boolean; footer: string; groups: { label: string; notes: { title: string; description: string }[] }[]; status: string };
    expect(d).toMatchObject({ available: true, open: false, footer: "Recently deleted" });
    await app.commands.run("files.showDeleted");
    await done(app);
    d = app.viewModels.select("vm.deleted", app.store.state) as typeof d;
    expect(d.open).toBe(true);
    expect(d.footer).toBe("Recently deleted · 2");
    expect(d.status).toBe("2 notes deleted in the last 30 days.");
    expect(d.groups.map((g) => g.label)).toEqual(["Today", "Thursday, October 1, 2026"]);
    expect(d.groups[0]!.notes[0]!.title).toBe("Spec ideas");
    expect(d.groups[0]!.notes[0]!.description).toMatch(/^Private · drafts · /);
    expect(d.groups[1]!.notes[0]!.description).toMatch(/^Public · \d/);
  });

  it("Restore puts a note back where it was; Restore to… offers only folders in its own section", async () => {
    const f = setup({ deleted: gone, folders: [`${PRIV}/drafts`, `${PRIV}/archive`, `${PUB}/essays`] });
    const app = await started(f);
    await app.commands.run("files.showDeleted");
    await done(app);
    await app.commands.run("files.restore", { id: gone[0]!.id });
    await done(app);
    expect(f.restored).toEqual([{ ids: [gone[0]!.id] }]);
    expect(lastToast(app)?.message).toBe("Restored “Spec ideas” to “drafts”.");
    expect(app.store.state.workspace.tree.roots[0]!.children.some((c) => c.kind === "folder" && c.children.some((n) => n.name === "spec-ideas.md"))).toBe(true);
    f.setDeleted([{ ...gone[0]!, id: `private:${"c".repeat(40)}:notes/drafts/spec-ideas.md` }]);
    await app.commands.run("files.showDeleted");
    await done(app);
    const id = `private:${"c".repeat(40)}:notes/drafts/spec-ideas.md`;
    await app.commands.run("files.restoreTo", { id });
    const move = app.viewModels.select("vm.move", app.store.state) as { open: boolean; title: string; items: { id: string }[] };
    expect(move.title).toBe("Restore “Spec ideas” to…");
    expect(move.items.map((i) => i.id).sort()).toEqual([PRIV, `${PRIV}/archive`, `${PRIV}/drafts`].sort());
    await app.commands.run("move.choose", { id: `${PRIV}/archive` });
    await done(app);
    expect(f.restored.at(-1)).toEqual({ ids: [id], folder: `${PRIV}/archive` });
    expect(lastToast(app)?.message).toBe("Restored “Spec ideas” to “archive”.");
  });

  it("isn't offered without Git", async () => {
    const f = setup({ deleted: gone, git: false });
    const app = await started(f);
    await app.commands.run("files.open");
    expect(app.commands.describe("files.showDeleted").enabled).toBe(false);
    expect((app.viewModels.select("vm.deleted", app.store.state) as { available: boolean }).available).toBe(false);
  });
});

describe("DD-FB-01: Undo in the toast for moves and deletes", () => {
  it("a move's Undo moves it back as one batch", async () => {
    const f = setup({ files: { [`${PRIV}/a.md`]: "# A\n" }, folders: [`${PRIV}/drafts`] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PRIV}/a.md`, mode: "replace" });
    await app.commands.run("files.drop", { source: `${PRIV}/a.md`, target: `${PRIV}/drafts` });
    await done(app);
    const t = lastToast(app)!;
    expect(t.message).toBe("Moved “A” to “drafts”.");
    expect(t.action).toMatchObject({ command: "files.undo", label: "Undo" });
    await app.commands.run("toast.action", { id: t.id });
    await done(app);
    expect(f.batches.at(-1)).toEqual([{ op: "move", from: `${PRIV}/drafts/a.md`, to: `${PRIV}/a.md` }]);
    expect(f.files[`${PRIV}/a.md`]).toBe("# A\n");
    expect(lastToast(app)?.message).toBe("Moved “A” back.");
  });

  it("a delete's Undo, with Git, makes its folders again and restores its notes from history", async () => {
    const f = setup({ files: { [`${PRIV}/drafts/b.md`]: "# B\n" }, folders: [`${PRIV}/drafts`, `${PRIV}/drafts/old`] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PRIV}/drafts`, mode: "replace" });
    await app.commands.run("files.delete");
    await app.commands.run("files.confirm");
    await done(app);
    const t = lastToast(app)!;
    expect(t.action?.command).toBe("files.undo");
    f.setDeleted([{ id: `private:${"d".repeat(40)}:notes/drafts/b.md`, root: "private", path: `${PRIV}/drafts/b.md`, title: "B", folder: "drafts", deletedAt: Date.now() }]);
    await app.commands.run("toast.action", { id: t.id });
    await done(app);
    expect(f.batches.at(-1)).toEqual([{ op: "createFolder", path: `${PRIV}/drafts` }, { op: "createFolder", path: `${PRIV}/drafts/old` }]);
    expect(f.restored).toEqual([{ ids: [`private:${"d".repeat(40)}:notes/drafts/b.md`] }]);
    expect(lastToast(app)?.message).toBe("Restored “drafts”.");
  });

  it("without Git a delete has no Undo (it's in the trash)", async () => {
    const f = setup({ files: { [`${PRIV}/a.md`]: "# A\n" }, git: false });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PRIV}/a.md`, mode: "replace" });
    await app.commands.run("files.delete");
    await done(app);
    expect(lastToast(app)).toMatchObject({ message: "Moved “A” to the trash." });
    expect(lastToast(app)?.action).toBeUndefined();
  });
});
