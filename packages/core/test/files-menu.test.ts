/** The Files rows' menus (D-162), Duplicate (FIL-11's duplicate), and pinning the panel (D-161). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyTitle, createApp, rowMenu, titleOfMarkdown, withoutNoteId, type AppStateFile, type FileRow, type FlatNote, type PlatformBridge, type WorkspaceOp } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;

const row = (over: Partial<FileRow>): FileRow => ({
  id: "a.md", path: "a.md", kind: "note", rootId: "private", level: 2, name: "a.md", label: "A", readOnly: false, published: false, expanded: false, hasChildren: false, ...over,
});

describe("the row menu's items (D-162)", () => {
  it("a note: open; rename, duplicate, move; who can see it; delete last", () => {
    expect(rowMenu(row({}), [row({})], { both: true })).toEqual([
      ["files.openItem"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.makePublic"], ["files.delete"],
    ]);
  });
  it("a public note adds Copy public link, and offers Make private", () => {
    const r = row({ rootId: "public", path: "public:a.md", id: "public:a.md" });
    expect(rowMenu(r, [r], { both: true })).toEqual([
      ["files.openItem"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.makePrivate", "files.copyPublicLink"], ["files.delete"],
    ]);
  });
  it("a workspace without both sections has no visibility items", () => {
    expect(rowMenu(row({ rootId: "local" }), [row({ rootId: "local" })], { both: false })).toEqual([
      ["files.openItem"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.delete"],
    ]);
  });
  it("a folder: new note and folder in it; rename, move; who can see it; delete", () => {
    const f = row({ kind: "folder", id: "drafts", path: "drafts", name: "drafts", label: "drafts" });
    expect(rowMenu(f, [f], { both: true })).toEqual([
      ["files.newNote", "files.newFolder"], ["files.rename", "files.moveTo"], ["files.makePublic"], ["files.delete"],
    ]);
  });
  it("a section: new note and new folder", () => {
    const s = row({ kind: "root", id: "root:private", path: "private:", level: 1, name: "", label: "" });
    expect(rowMenu(s, [], { both: true })).toEqual([["files.newNote", "files.newFolder"]]);
  });
  it("several selected: duplicate (when notes are among them), move, visibility both ways when mixed, delete", () => {
    const a = row({});
    const b = row({ id: "public:b.md", path: "public:b.md", rootId: "public" });
    const f = row({ kind: "folder", id: "drafts", path: "drafts" });
    expect(rowMenu(a, [a, b], { both: true })).toEqual([["files.duplicate", "files.moveTo"], ["files.makePublic", "files.makePrivate"], ["files.delete"]]);
    expect(rowMenu(f, [f, row({ kind: "folder", id: "x", path: "x" })], { both: false })).toEqual([["files.moveTo"], ["files.delete"]]);
  });
  it("a read-only section offers only what can be done there", () => {
    const r = row({ rootId: "public", readOnly: true, id: "public:a.md", path: "public:a.md" });
    expect(rowMenu(r, [r], { both: true })).toEqual([["files.openItem"], ["files.copyPublicLink"]]);
    const f = row({ kind: "folder", readOnly: true });
    expect(rowMenu(f, [f], { both: true })).toEqual([]);
    const s = row({ kind: "root", id: "root:public", readOnly: true });
    expect(rowMenu(s, [], { both: true })).toEqual([]);
  });
});

describe("Duplicate's names and text (D-162)", () => {
  const name = (title: string, n: number) => (n === 1 ? `${title} copy` : `${title} copy ${n}`);
  it("is “⟨title⟩ copy”, then numbered, clear of the titles beside it, ignoring case", () => {
    expect(copyTitle("Ideas", [], name)).toBe("Ideas copy");
    expect(copyTitle("Ideas", ["Ideas", "ideas COPY"], name)).toBe("Ideas copy 2");
    expect(copyTitle("Ideas", ["Ideas copy", "Ideas copy 2"], name)).toBe("Ideas copy 3");
  });
  it("a copy never carries the original's id: a share by ID mustn't reach it", () => {
    expect(withoutNoteId("---\nid: n-1\ntags: a\n---\n# A\n")).toBe("---\ntags: a\n---\n# A\n");
    expect(withoutNoteId("---\nid: n-1\n---\n# A\n")).toBe("# A\n");
    expect(withoutNoteId("---\r\nid: \"n-1\"\r\n---\r\n# A\r\n")).toBe("# A\r\n");
    expect(withoutNoteId("# A\n\nid: not front matter\n")).toBe("# A\n\nid: not front matter\n");
  });
});

/** A browser-like shell with private and public sections, both writable. */
function setup(notesIn: Record<string, string>, state: Partial<AppStateFile> = {}) {
  const notes = new Map<string, FlatNote>(Object.entries(notesIn).map(([path, text]) => [path, { path, text, updated: 0 }]));
  let folders: string[] = ["private:drafts"];
  const batches: WorkspaceOp[][] = [];
  const saved: AppStateFile[] = [];
  const live = () => [...notes.values()].filter((n) => !n.deleted);
  const bridge: PlatformBridge = {
    platform: "web",
    readNote: async (p) => { const n = notes.get(p); if (!n || n.deleted) throw new Error("missing"); return n.text; },
    writeNote: async (p, text) => { notes.set(p, { path: p, text, updated: 1 }); },
    chooseNote: async () => undefined,
    newNotePath: async () => "private:untitled.md",
    defaultNotePath: async () => "private:welcome.md",
    loadAppState: async () => ({ version: 1, lastNotePath: "private:welcome.md", ...state }),
    saveAppState: async (s) => { saved.push(s); },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "",
        roots: [{ id: "private", path: "private:", readOnly: false }, { id: "public", path: "public:", readOnly: false }],
        entries: [
          ...folders.map((path) => ({ path, kind: "folder" as const })),
          ...live().map((n) => ({ path: n.path, kind: "note" as const, title: titleOfMarkdown(n.text) ?? "" })),
        ],
      }),
      writeFormat: async () => {},
      renameNote: async () => {},
      apply: async (ops) => {
        batches.push(ops);
        for (const op of ops) {
          if (op.op === "create" || op.op === "write") notes.set(op.path, { path: op.path, text: op.text, updated: 1 });
          else if (op.op === "delete") notes.delete(op.path);
          else if (op.op === "createFolder") folders = [...folders, op.path];
        }
      },
    },
  };
  return { bridge, notes, batches, saved, live };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  return app;
}
type Menu = { id: string; items: { id: string; label: string; shortcut?: string; disabled?: boolean; reason?: string }[] }[];
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.files", app.store.state) as {
  open: boolean; pinned: boolean; pinLabel: string; menu: Menu; menuLabel: string; focusId: string; items: { id: string; label: string; selected: boolean }[];
};
const menuIds = (app: ReturnType<typeof createApp>) => vm(app).menu.map((s) => s.items.map((i) => i.id));

describe("the menu in the app (D-162)", () => {
  const notes = { "private:welcome.md": "# Welcome\n", "private:ideas.md": "---\nid: n-7\n---\n# Ideas\n\nSee [w](welcome.md).\n", "public:about.md": "# About\n" };
  it("acts on what's focused: labels, shortcuts and the menu's name follow the item", async () => {
    const app = await started(setup(notes));
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    expect(menuIds(app)).toEqual([["files.openItem"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.makePublic"], ["files.delete"]]);
    const items = vm(app).menu.flatMap((s) => s.items);
    expect(items.find((i) => i.id === "files.openItem")?.label).toBe("Open");
    expect(items.find((i) => i.id === "files.delete")?.shortcut).toBe("Delete");
    expect(items.find((i) => i.id === "files.moveTo")?.shortcut).toBe("Ctrl+Shift+M");
    expect(vm(app).menuLabel).toBe("Actions for “Ideas”");
    await app.commands.run("files.select", { id: "private:drafts", mode: "replace" });
    expect(menuIds(app)[0]).toEqual(["files.newNote", "files.newFolder"]);
    await app.commands.run("files.select", { id: "root:private", mode: "replace" });
    expect(menuIds(app)).toEqual([["files.newNote", "files.newFolder"]]);
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.select", { id: "public:about.md", mode: "toggle" });
    expect(menuIds(app)).toEqual([["files.duplicate", "files.moveTo"], ["files.makePublic", "files.makePrivate"], ["files.delete"]]);
    expect(vm(app).menuLabel).toBe("Actions for 2 items");
  });
  it("Duplicate makes “⟨title⟩ copy” beside it in one batch, retitled, without the id, links as they were; selected; Undo removes it", async () => {
    const f = setup(notes);
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.duplicate");
    await settle();
    expect(f.batches).toEqual([[{ op: "create", path: "private:ideas-copy.md", text: "# Ideas copy\n\nSee [w](welcome.md).\n" }]]);
    expect(vm(app).items.find((i) => i.id === "private:ideas-copy.md")).toMatchObject({ label: "Ideas copy", selected: true });
    expect(vm(app).focusId).toBe("private:ideas-copy.md");
    const t = app.store.state.ui.toasts.at(-1)!;
    expect(t.message).toBe("Duplicated “Ideas”.");
    expect(t.action?.label).toBe("Undo");
    // Again: the next copy is numbered.
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.duplicate");
    await settle();
    expect(f.batches[1]).toEqual([{ op: "create", path: "private:ideas-copy-2.md", text: "# Ideas copy 2\n\nSee [w](welcome.md).\n" }]);
    await app.commands.run(t.action!.command, t.action!.args);
    await settle();
    expect(f.batches[2]).toEqual([{ op: "delete", path: "private:ideas-copy.md" }]);
    expect(f.live().map((n) => n.path).sort()).toEqual(["private:ideas-copy-2.md", "private:ideas.md", "private:welcome.md", "public:about.md"]);
  });
  it("from Spotlight (the panel closed), Duplicate copies the open note, never a stale selection", async () => {
    const f = setup(notes);
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "public:about.md", mode: "replace" });
    await app.commands.run("files.close");
    await app.commands.run("files.duplicate");
    await settle();
    expect(f.batches.map((b) => b.map((o) => (o.op === "create" ? o.path : o.op)))).toEqual([["private:welcome-copy.md"]]);
  });
  it("several selected: every note is copied in one batch, folders aren't", async () => {
    const f = setup(notes);
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.select", { id: "public:about.md", mode: "toggle" });
    await app.commands.run("files.select", { id: "private:drafts", mode: "toggle" });
    await app.commands.run("files.duplicate");
    await settle();
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]!.map((o) => (o.op === "create" ? o.path : o.op))).toEqual(["private:ideas-copy.md", "public:about-copy.md"]);
    expect(app.store.state.ui.toasts.at(-1)!.message).toBe("Duplicated 2 items.");
  });
});

describe("pinning the panel (D-161)", () => {
  const notes = { "private:welcome.md": "# Welcome\n", "private:ideas.md": "# Ideas\n" };
  it("the pin keeps it open when a note opens, says what it does, and is kept on this device", async () => {
    const f = setup(notes);
    const app = await started(f);
    await app.commands.run("files.open");
    expect(vm(app)).toMatchObject({ pinned: false, pinLabel: "Keep Files open" });
    await app.commands.run("files.togglePin");
    expect(vm(app)).toMatchObject({ open: true, pinned: true, pinLabel: "Unpin Files" });
    expect(f.saved.at(-1)?.filesPinned).toBe(true);
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.openItem");
    expect(app.store.state.note.path).toBe("private:ideas.md");
    expect(vm(app).open).toBe(true);
    // A new note doesn't close it either.
    await app.commands.run("note.new");
    expect(vm(app).open).toBe(true);
    // Unpinned, it's an ordinary sheet again: opening a note closes it.
    await app.commands.run("files.togglePin");
    expect(vm(app)).toMatchObject({ open: true, pinned: false });
    expect(f.saved.at(-1)?.filesPinned).toBeUndefined();
    await app.commands.run("files.select", { id: "private:welcome.md", mode: "replace" });
    await app.commands.run("files.openItem");
    expect(vm(app).open).toBe(false);
  });
  it("pinned from closed, it opens; a pinned panel opens at launch without taking focus", async () => {
    const app = await started(setup(notes));
    await app.commands.run("files.togglePin");
    expect(vm(app)).toMatchObject({ open: true, pinned: true });
    const again = await started(setup(notes, { filesPinned: true }));
    expect(vm(again)).toMatchObject({ open: true, pinned: true });
    expect(again.store.state.ui.files.focusRequest).toBe(0);
  });
  it("Mod+O doesn't close a pinned panel: it moves focus into the tree", async () => {
    const app = await started(setup(notes, { filesPinned: true }));
    const asked = app.store.state.ui.files.focusRequest;
    await app.commands.run("files.open");
    expect(vm(app).open).toBe(true);
    expect(app.store.state.ui.files.focusRequest).toBe(asked + 1);
  });
});
