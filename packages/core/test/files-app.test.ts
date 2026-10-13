/** The Files panel in the app (WP-2.4): FIL-01, FIL-02, FIL-03, FIL-08, and changes shown before they're saved (PRF-09). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, planFlatOps, titleOfMarkdown, type FlatNote, type PlatformBridge, type WorkspaceOp } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;

/** A browser-like shell: its own notes on a flat store, plus the instance's read-only public notes. */
function setup(opts: { notes?: Record<string, string>; folders?: string[]; open?: string } = {}) {
  const notes = new Map<string, FlatNote>(Object.entries({ "welcome.md": "# Welcome\n", ...opts.notes }).map(([path, text]) => [path, { path, text, updated: 0 }]));
  let folders = [...(opts.folders ?? [])];
  const batches: WorkspaceOp[][] = [];
  /** Holds each batch until released, so a test can look at the screen in between. */
  let gate: { promise: Promise<void>; release: (fail?: Error) => void } | undefined;
  const hold = () => {
    let release!: (fail?: Error) => void;
    const promise = new Promise<void>((res, rej) => { release = (fail) => (fail ? rej(fail) : res()); });
    gate = { promise, release };
    return gate;
  };
  const live = () => [...notes.values()].filter((n) => !n.deleted);
  const bridge: PlatformBridge = {
    platform: "web",
    readNote: async (p) => { const n = notes.get(p); if (!n || n.deleted) throw new Error("missing"); return n.text; },
    writeNote: async (p, text) => { notes.set(p, { path: p, text, updated: 1 }); },
    chooseNote: async () => undefined,
    newNotePath: async (near) => {
      const dir = near?.includes("/") ? near.slice(0, near.lastIndexOf("/") + 1) : "";
      for (let i = 1; ; i++) { const p = `${dir}untitled${i > 1 ? `-${i}` : ""}.md`; if (!notes.has(p)) return p; }
    },
    defaultNotePath: async () => "welcome.md",
    loadAppState: async () => ({ version: 1, ...(opts.open ? { lastNotePath: opts.open } : {}) }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "",
        roots: [{ id: "local", path: "", readOnly: false }, { id: "public", path: "public:", readOnly: true }],
        entries: [
          ...folders.map((path) => ({ path, kind: "folder" as const })),
          ...live().map((n) => ({ path: n.path, kind: "note" as const, title: titleOfMarkdown(n.text) ?? "" })),
          { path: "public:About.md", kind: "note", published: true, title: "About" },
        ],
      }),
      writeFormat: async () => {},
      renameNote: async (from, to) => { const n = notes.get(from)!; notes.delete(from); notes.set(to, { ...n, path: to }); },
      apply: async (ops) => {
        batches.push(ops);
        if (gate) await gate.promise;
        const plan = planFlatOps([...notes.values()], folders, ops, 2);
        for (const p of plan.remove) notes.delete(p);
        for (const n of plan.put) notes.set(n.path, n);
        folders = plan.folders;
      },
    },
  };
  return { bridge, notes, batches, hold, folders: () => folders, live };
}

type Item = { id: string; label: string; kind: string; level: number; selected: boolean; pending: boolean; expanded: boolean; editing: boolean; current: boolean };
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.files", app.store.state) as { open: boolean; items: Item[]; focusId: string; editError: string; selectionText: string; multi: boolean };
const ids = (app: ReturnType<typeof createApp>) => vm(app).items.map((i) => i.id);
const toasts = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts.map((t) => t.message);
const settle = () => new Promise((r) => setTimeout(r, 0));
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  return app;
}

describe("opening the panel (IA-VIEW-FILES)", () => {
  it("Open… opens it with the current note revealed and focused, and again closes it", async () => {
    const f = setup({ notes: { "journal/day.md": "# Day one\n" }, open: "journal/day.md" });
    const app = await started(f);
    await app.commands.run("note.open");
    expect(vm(app).open).toBe(true);
    expect(ids(app)).toEqual(["root:local", "journal", "journal/day.md", "welcome.md", "root:public", "public:About.md"]);
    expect(vm(app).items.find((i) => i.id === "journal/day.md")).toMatchObject({ label: "Day one", selected: true, current: true, level: 3 });
    expect(vm(app).focusId).toBe("journal/day.md");
    await app.commands.run("note.open");
    expect(vm(app).open).toBe(false);
  });
  it("opening a note from the tree closes the panel", async () => {
    const f = setup({ notes: { "b.md": "# Bee\n" } });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "b.md", mode: "replace" });
    await app.commands.run("files.openItem");
    expect(vm(app).open).toBe(false);
    expect(app.store.state.note.path).toBe("b.md");
  });
});

describe("creating, renaming, and deleting (FIL-01, FIL-02)", () => {
  it("a new folder is named in place, nested too; a taken name keeps the field open with an error", async () => {
    const f = setup({ folders: ["Projects"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.newFolder");
    expect(vm(app).items.find((i) => i.editing)).toMatchObject({ id: "new:", label: "New folder", level: 2 });
    await app.commands.run("files.setEditValue", { value: "projects" });
    await app.commands.run("files.commitEdit");
    expect(vm(app).editError).toBe(messages["files.nameError.taken"]);
    expect(f.batches).toEqual([]);
    await app.commands.run("files.setEditValue", { value: "Ideas" });
    await app.commands.run("files.commitEdit");
    expect(f.folders()).toEqual(["Projects", "Ideas"]);
    expect(vm(app).focusId).toBe("Ideas");
    // Nested: the new folder goes into the focused folder.
    await app.commands.run("files.newFolder");
    await app.commands.run("files.setEditValue", { value: "Drafts" });
    await app.commands.run("files.commitEdit");
    expect(f.folders()).toEqual(["Projects", "Ideas", "Ideas/Drafts"]);
    expect(ids(app)).toContain("Ideas/Drafts");
  });
  it("Esc, or clicking away with an empty name, cancels", async () => {
    const f = setup();
    const app = await started(f);
    await app.commands.run("files.newFolder");
    await app.commands.run("files.cancelEdit");
    await app.commands.run("files.newFolder");
    await app.commands.run("files.setEditValue", { value: "  " });
    await app.commands.run("files.editBlur");
    expect(vm(app).items.some((i) => i.editing)).toBe(false);
    expect(f.batches).toEqual([]);
  });
  it("New note goes into the selected folder and closes the panel", async () => {
    const f = setup({ folders: ["Ideas"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "Ideas", mode: "replace" });
    await app.commands.run("note.new");
    expect(app.store.state.note.path).toBe("Ideas/untitled.md");
    expect(vm(app).open).toBe(false);
  });
  it("renaming a note edits its title, and the file name follows", async () => {
    const f = setup({ notes: { "idea.md": "# Idea\n\nBody\n" }, open: "idea.md" });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.rename");
    expect(vm(app).items.find((i) => i.editing)).toMatchObject({ id: "idea.md", label: "Idea" });
    await app.commands.run("files.setEditValue", { value: "Better idea" });
    await app.commands.run("files.commitEdit");
    expect(f.notes.get("better-idea.md")?.text).toBe("# Better idea\n\nBody\n");
    expect(f.notes.has("idea.md")).toBe(false);
    // The open note follows, showing its new title.
    expect(app.store.state.note).toMatchObject({ path: "better-idea.md", initialMarkdown: "# Better idea\n\nBody\n" });
    expect(vm(app).items.find((i) => i.id === "better-idea.md")).toMatchObject({ label: "Better idea", selected: true });
  });
  it("renaming a folder moves everything in it, and the open note follows", async () => {
    const f = setup({ notes: { "a/n.md": "# N\n" }, open: "a/n.md" });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "a", mode: "replace" });
    await app.commands.run("files.rename");
    await app.commands.run("files.setEditValue", { value: "b" });
    await app.commands.run("files.commitEdit");
    await app.idle();
    await settle();
    expect(f.batches).toEqual([[{ op: "move", from: "a", to: "b" }]]);
    expect(app.store.state.note.path).toBe("b/n.md");
  });
  it("one note is deleted without asking; a folder with notes asks first", async () => {
    const f = setup({ notes: { "x.md": "# X\n", "f/y.md": "# Y\n" } });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "x.md", mode: "replace" });
    await app.commands.run("files.delete");
    await settle();
    expect(f.notes.get("x.md")?.deleted).toBe(true);
    expect(toasts(app)).toContain("Deleted “X”.");
    await app.commands.run("files.select", { id: "f", mode: "replace" });
    await app.commands.run("files.delete");
    expect(app.viewModels.select("vm.confirm", app.store.state)).toMatchObject({ open: true, message: "Delete “f”? This deletes 1 note.", confirmLabel: "Delete 1 note" });
    expect(f.batches).toHaveLength(1);
    await app.commands.run("files.confirmDelete");
    await settle();
    expect(f.notes.get("f/y.md")?.deleted).toBe(true);
  });
  it("the instance's read-only notes can't be renamed, moved, or deleted, and say why", async () => {
    const f = setup();
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "public:About.md", mode: "replace" });
    await app.commands.run("files.rename");
    await app.commands.run("files.delete");
    await app.commands.run("files.drop", { source: "public:About.md", target: "root:local" });
    expect(f.batches).toEqual([]);
    expect(vm(app).items.some((i) => i.editing)).toBe(false);
    expect(toasts(app).join(" ")).toMatch(/read-only/);
    expect(vm(app).items.find((i) => i.id === "public:About.md")).toMatchObject({ readOnly: true, draggable: false });
  });
});

describe("multiple selection and moving (FIL-03, FIL-08)", () => {
  it("Mod+click, Shift+click, and Mod+A select; the selection moves as one batch, by drag and drop", async () => {
    const f = setup({ notes: { "a.md": "# A\n", "b.md": "# B\n", "c.md": "# C\n" }, folders: ["Box"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "a.md", mode: "replace" });
    await app.commands.run("files.select", { id: "c.md", mode: "toggle" });
    expect(vm(app)).toMatchObject({ multi: true, selectionText: "2 selected" });
    await app.commands.run("files.select", { id: "a.md", mode: "replace" });
    await app.commands.run("files.select", { id: "c.md", mode: "range" });
    expect(vm(app).items.filter((i) => i.selected).map((i) => i.id)).toEqual(["a.md", "b.md", "c.md"]);
    await app.commands.run("files.drop", { source: "b.md", target: "Box" });
    await settle();
    expect(f.batches).toEqual([[
      { op: "move", from: "a.md", to: "Box/a.md" }, { op: "move", from: "b.md", to: "Box/b.md" }, { op: "move", from: "c.md", to: "Box/c.md" },
    ]]);
    // The moved items stay selected, in their open folder.
    expect(vm(app).items.filter((i) => i.selected).map((i) => i.id)).toEqual(["Box/a.md", "Box/b.md", "Box/c.md"]);
    expect(toasts(app)).toContain("Moved 3 items to “Box”.");
    await app.commands.run("files.selectAll");
    // Every row showing but the section labels, read-only ones too (acting on them is refused).
    expect(vm(app).items.filter((i) => i.selected)).toHaveLength(6);
  });
  it("Move to… lists folders, never into what's moving, and moves there", async () => {
    const f = setup({ notes: { "a.md": "# A\n" }, folders: ["Box", "Box/Inner", "Other"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "Box", mode: "replace" });
    await app.commands.run("files.moveTo");
    const move = () => app.viewModels.select("vm.move", app.store.state) as { open: boolean; title: string; items: { id: string; label: string }[]; activeId: string };
    expect(move()).toMatchObject({ open: true, title: "Move “Box” to…" });
    expect(move().items.map((i) => i.id)).toEqual(["", "Other"]);
    await app.commands.run("move.setQuery", { value: "oth" });
    expect(move().activeId).toBe("Other");
    await app.commands.run("move.chooseActive");
    await settle();
    expect(f.batches).toEqual([[{ op: "move", from: "Box", to: "Other/Box" }]]);
    expect(f.folders()).toEqual(["Other/Box", "Other/Box/Inner", "Other"]);
  });
  it("a folder can't be dropped into itself", async () => {
    const f = setup({ folders: ["Box", "Box/Inner"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.setExpanded", { id: "Box", expanded: true });
    await app.commands.run("files.drop", { source: "Box", target: "Box/Inner" });
    expect(f.batches).toEqual([]);
    expect(toasts(app)).toEqual(["Couldn't move “Box”: a folder can't go inside itself."]);
  });
});

describe("changes show before they're saved (PRF-09)", () => {
  it("the tree changes at once, the row shows it's saving, and success changes nothing else", async () => {
    const f = setup({ notes: { "a.md": "# A\n" }, folders: ["Box"] });
    const app = await started(f);
    await app.commands.run("files.open");
    const gate = f.hold();
    void app.commands.run("files.drop", { source: "a.md", target: "Box" });
    // Shown before the write finished.
    expect(ids(app)).toContain("Box/a.md");
    expect(vm(app).items.find((i) => i.id === "Box/a.md")!.pending).toBe(true);
    expect(f.notes.has("a.md")).toBe(true);
    expect(toasts(app)).toEqual([]);
    gate.release();
    await settle(); await settle();
    expect(vm(app).items.find((i) => i.id === "Box/a.md")!.pending).toBe(false);
    expect(toasts(app)).toEqual(["Moved “A” to “Box”."]);
  });
  it("a refused write puts the tree and the selection back and says why", async () => {
    const f = setup({ notes: { "a.md": "# A\n" }, folders: ["Box"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "a.md", mode: "replace" });
    const before = app.store.state.workspace.tree;
    const gate = f.hold();
    void app.commands.run("files.drop", { source: "a.md", target: "Box" });
    expect(ids(app)).not.toContain("a.md");
    gate.release(new Error("Error invoking remote method 'workspace:apply': Error: taken"));
    await settle(); await settle();
    expect(app.store.state.workspace.tree).toBe(before);
    expect(vm(app).items.find((i) => i.id === "a.md")).toMatchObject({ selected: true, pending: false });
    expect(vm(app).focusId).toBe("a.md");
    expect(toasts(app)).toEqual(["Couldn't move “A”: that name is taken."]);
    expect(app.store.state.ui.toasts[0]!.tone).toBe("error");
  });
});

describe("links follow renames and moves (FIL-09)", () => {
  const text = (f: ReturnType<typeof setup>, p: string) => f.notes.get(p)?.text;
  it("a move rewrites links in other notes and in the moved note, in the same batch, and says how many", async () => {
    const f = setup({ notes: { "a.md": "# A\n\nSee [B](b.md#part).\n", "b.md": "# B\n\nBack to [A](a.md).\n", "c.md": "# C\n\n`[b](b.md)`\n" }, folders: ["Box"] });
    const read: string[] = [];
    const readNote = f.bridge.readNote;
    f.bridge.readNote = (p) => { read.push(p); return readNote(p); };
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.drop", { source: "b.md", target: "Box" });
    await app.idle();
    await settle();
    expect(f.batches).toEqual([[
      { op: "move", from: "b.md", to: "Box/b.md" },
      { op: "write", path: "a.md", text: "# A\n\nSee [B](Box/b.md#part).\n" },
      { op: "write", path: "Box/b.md", text: "# B\n\nBack to [A](../a.md).\n" },
    ]]);
    expect(text(f, "Box/b.md")).toBe("# B\n\nBack to [A](../a.md).\n");
    expect(text(f, "c.md")).toBe("# C\n\n`[b](b.md)`\n");
    expect(toasts(app)).toContain("Moved “B” to “Box”. Updated links in 2 notes.");
    // The instance's read-only notes are never read, let alone rewritten (D-90).
    expect(read.some((p) => p.startsWith("public:"))).toBe(false);
  });
  it("renaming a folder rewrites links into it; links between notes inside it stay as they are", async () => {
    const f = setup({ notes: { "a.md": "[x](Box/x.md) [y](./Box/sub/y.md)\n", "Box/x.md": "# X\n\n[y](sub/y.md)\n", "Box/sub/y.md": "# Y\n" }, folders: ["Box", "Box/sub"] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "Box", mode: "replace" });
    await app.commands.run("files.rename");
    await app.commands.run("files.setEditValue", { value: "Crate" });
    await app.commands.run("files.commitEdit");
    await app.idle();
    await settle();
    expect(f.batches).toEqual([[{ op: "move", from: "Box", to: "Crate" }, { op: "write", path: "a.md", text: "[x](Crate/x.md) [y](./Crate/sub/y.md)\n" }]]);
    expect(text(f, "Crate/x.md")).toBe("# X\n\n[y](sub/y.md)\n");
  });
  it("renaming a note by its title renames the file and rewrites links to it, all in one batch", async () => {
    const f = setup({ notes: { "idea.md": "# Idea\n\nBody\n", "other.md": "# Other\n\n[i](idea.md) [j](<idea.md>)\n" } });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "idea.md", mode: "replace" });
    await app.commands.run("files.rename");
    await app.commands.run("files.setEditValue", { value: "Better idea" });
    await app.commands.run("files.commitEdit");
    expect(f.batches).toEqual([[
      { op: "move", from: "idea.md", to: "better-idea.md" },
      { op: "write", path: "better-idea.md", text: "# Better idea\n\nBody\n" },
      { op: "write", path: "other.md", text: "# Other\n\n[i](better-idea.md) [j](<better-idea.md>)\n" },
    ]]);
    expect(text(f, "other.md")).toBe("# Other\n\n[i](better-idea.md) [j](<better-idea.md>)\n");
    expect(toasts(app)).toContain("Renamed to “Better idea”. Updated links in 1 note.");
  });
  it("a file name that follows the title as it's typed (FIL-07) rewrites links to it in the same batch", async () => {
    const f = setup({ notes: { "idea.md": "# Idea\n", "other.md": "[i](idea.md)\n" }, open: "idea.md" });
    const app = await started(f);
    await app.commands.run("note.setContent", { value: "# Plan\n" });
    await app.commands.run("note.save");
    await settle();
    expect(app.store.state.note.path).toBe("plan.md");
    expect(f.batches).toEqual([[{ op: "move", from: "idea.md", to: "plan.md" }, { op: "write", path: "other.md", text: "[i](plan.md)\n" }]]);
    expect(text(f, "plan.md")).toBe("# Plan\n");
  });
  it("the open note's links update in the editor, keeping what was typed before the move", async () => {
    const f = setup({ notes: { "a.md": "# A\n\n[b](b.md)\n", "b.md": "# B\n" }, folders: ["Box"], open: "a.md" });
    const app = await started(f);
    await app.commands.run("note.setContent", { value: "# A\n\n[b](b.md)\n\nTyped just now.\n" });
    await app.commands.run("files.open");
    await app.commands.run("files.drop", { source: "b.md", target: "Box" });
    await app.idle();
    await settle();
    const after = "# A\n\n[b](Box/b.md)\n\nTyped just now.\n";
    expect(text(f, "a.md")).toBe(after);
    expect(app.store.state.note).toMatchObject({ path: "a.md", initialMarkdown: after, markdown: after, saveState: "saved" });
  });
  it("a refused batch writes no links, and the editor and the tree stay as they were", async () => {
    const f = setup({ notes: { "a.md": "# A\n\n[b](b.md)\n", "b.md": "# B\n" }, folders: ["Box"], open: "a.md" });
    const app = await started(f);
    const key = app.store.state.note.key;
    await app.commands.run("files.open");
    const before = app.store.state.workspace.tree;
    const gate = f.hold();
    void app.commands.run("files.drop", { source: "b.md", target: "Box" });
    await settle(); await settle();
    gate.release(new Error("taken"));
    await settle(); await settle();
    expect(f.batches[0]!.map((o) => o.op)).toEqual(["move", "write"]);
    expect(text(f, "a.md")).toBe("# A\n\n[b](b.md)\n");
    expect(f.notes.has("b.md")).toBe(true);
    expect(app.store.state.note).toMatchObject({ key, markdown: "# A\n\n[b](b.md)\n" });
    expect(app.store.state.workspace.tree).toBe(before);
  });
  it("the flat store applies a batch's writes after its moves, and refuses the whole batch if one can't be written", () => {
    const notes: FlatNote[] = [{ path: "a.md", text: "old", updated: 0 }, { path: "b.md", text: "b", updated: 0 }];
    const plan = planFlatOps(notes, [], [{ op: "move", from: "b.md", to: "c.md" }, { op: "write", path: "c.md", text: "new c" }, { op: "write", path: "a.md", text: "new a" }], 5);
    expect(plan.put).toEqual([{ path: "c.md", text: "new c", updated: 5 }, { path: "a.md", text: "new a", updated: 5 }]);
    expect(plan.remove).toEqual(["b.md"]);
    expect(() => planFlatOps(notes, [], [{ op: "move", from: "b.md", to: "c.md" }, { op: "write", path: "b.md", text: "x" }], 5)).toThrow("notFound");
    expect(() => planFlatOps(notes, [], [{ op: "write", path: "public:About.md", text: "x" }], 5)).toThrow("readOnly");
  });
});
