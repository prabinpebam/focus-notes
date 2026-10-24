/** The Files rows' menus (D-162), Duplicate (FIL-11's duplicate), and pinning the panel (D-161). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyTitle, createApp, importedNote, rowMenu, titleOfMarkdown, withoutNoteId, type AppStateFile, type FileRow, type FlatNote, type PlatformBridge, type WorkspaceOp } from "../src/index.ts";

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
  it("where the shell can show files, a note offers Open containing folder, a folder or a section Open in File Explorer; a selection neither (D-192)", () => {
    const n = row({});
    expect(rowMenu(n, [n], { both: true, reveal: true, openFolder: true })).toEqual([
      ["files.openItem", "files.revealItem"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.makePublic"], ["files.delete"],
    ]);
    const f = row({ kind: "folder", id: "drafts", path: "drafts", name: "drafts", label: "drafts" });
    expect(rowMenu(f, [f], { both: false, reveal: true, openFolder: true })).toEqual([
      ["files.newNote", "files.newFolder"], ["files.openFolderItem"], ["files.rename", "files.moveTo"], ["files.delete"],
    ]);
    const s = row({ kind: "root", id: "root:private", path: "private:", level: 1, name: "", label: "" });
    expect(rowMenu(s, [], { both: true, reveal: true, openFolder: true })).toEqual([["files.newNote", "files.newFolder"], ["files.openFolderItem"]]);
    // Read-only places can still be shown.
    const ro = row({ rootId: "public", readOnly: true, id: "public:a.md", path: "public:a.md" });
    expect(rowMenu(ro, [ro], { both: true, reveal: true, openFolder: true })).toEqual([["files.openItem", "files.revealItem"], ["files.copyPublicLink"]]);
    const rf = row({ kind: "folder", readOnly: true });
    expect(rowMenu(rf, [rf], { both: true, reveal: true, openFolder: true })).toEqual([["files.openFolderItem"]]);
    const rs = row({ kind: "root", id: "root:public", readOnly: true });
    expect(rowMenu(rs, [], { both: true, reveal: true, openFolder: true })).toEqual([["files.openFolderItem"]]);
    expect(rowMenu(n, [n, row({ id: "b.md", path: "b.md" })], { both: false, reveal: true, openFolder: true })).toEqual([["files.duplicate", "files.moveTo"], ["files.delete"]]);
  });
  it("Copy, Copy as path and Copy text, each where the shell can; Copy text for one note only (D-192)", () => {
    const all = { both: false, reveal: true, openFolder: true, paths: true, copyFiles: true, copyText: true };
    const n = row({});
    expect(rowMenu(n, [n], all)).toEqual([
      ["files.openItem", "files.revealItem"], ["files.copyItem", "files.copyPath", "files.copyText"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.delete"],
    ]);
    const f = row({ kind: "folder", id: "drafts", path: "drafts" });
    expect(rowMenu(f, [f], all)).toEqual([
      ["files.newNote", "files.newFolder"], ["files.openFolderItem"], ["files.copyItem", "files.copyPath"], ["files.rename", "files.moveTo"], ["files.delete"],
    ]);
    const s = row({ kind: "root", id: "root:private", path: "private:", level: 1 });
    expect(rowMenu(s, [], all)).toEqual([["files.newNote", "files.newFolder"], ["files.openFolderItem"], ["files.copyPath"]]);
    expect(rowMenu(n, [n, f], all)).toEqual([["files.duplicate", "files.moveTo"], ["files.copyItem", "files.copyPath"], ["files.delete"]]);
    // Read-only places can be copied too, never changed.
    const ro = row({ rootId: "public", readOnly: true, id: "public:a.md", path: "public:a.md" });
    expect(rowMenu(ro, [ro, ro], all)).toEqual([["files.copyItem", "files.copyPath"]]);
    // The browser: only the text, where it can copy text.
    expect(rowMenu(n, [n], { both: false, copyText: true })).toEqual([
      ["files.openItem"], ["files.copyText"], ["files.rename", "files.duplicate", "files.moveTo"], ["files.delete"],
    ]);
    expect(rowMenu(ro, [ro], { both: true, copyText: true })).toEqual([["files.openItem"], ["files.copyText"], ["files.copyPublicLink"]]);
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

describe("Import files (FIL-15, D-210)", () => {
  const toMd = (html: string) => `md(${html})`;
  it("a folder and a writable section offer it after New note and New folder, where the shell can read files; a note or a selection doesn't", () => {
    const f = row({ kind: "folder", id: "drafts", path: "drafts", name: "drafts", label: "drafts" });
    expect(rowMenu(f, [f], { both: false, importFiles: true })[0]).toEqual(["files.newNote", "files.newFolder", "files.import"]);
    const s = row({ kind: "root", id: "root:private", path: "private:", level: 1 });
    expect(rowMenu(s, [], { both: false, importFiles: true })).toEqual([["files.newNote", "files.newFolder", "files.import"]]);
    expect(rowMenu(row({ kind: "root", id: "root:public", readOnly: true }), [], { both: false, importFiles: true })).toEqual([]);
    expect(rowMenu(row({}), [row({})], { both: false, importFiles: true }).flat()).not.toContain("files.import");
    expect(rowMenu(f, [f, row({})], { both: false, importFiles: true }).flat()).not.toContain("files.import");
  });
  it("Markdown and text stay as they are, with \\n line ends and no app id; the first H1 is the title", () => {
    expect(importedNote({ name: "x", kind: "markdown", text: "---\nid: n-1\n---\r\n# Plan\r\n\r\n- a\r\n" }, toMd, "Imported note")).toEqual({ title: "Plan", text: "# Plan\n\n- a\n" });
    expect(importedNote({ name: "x", kind: "text", text: "# Notes\n*kept*\n" }, toMd, "Imported note")).toEqual({ title: "Notes", text: "# Notes\n*kept*\n" });
  });
  it("without an H1, the file's name becomes it; an empty file is just the title", () => {
    expect(importedNote({ name: "Meeting  notes", kind: "text", text: "Agenda\n" }, toMd, "Imported note")).toEqual({ title: "Meeting notes", text: "# Meeting notes\n\nAgenda\n" });
    expect(importedNote({ name: "Empty", kind: "markdown", text: "" }, toMd, "Imported note")).toEqual({ title: "Empty", text: "# Empty\n" });
    expect(importedNote({ name: " ", kind: "markdown", text: "" }, toMd, "Imported note").title).toBe("Imported note");
  });
  it("HTML and Word documents go through the HTML reader", () => {
    expect(importedNote({ name: "Doc", kind: "html", text: "<p>Hi</p>" }, (h) => `# From HTML\n\n${h.length}\n`, "Imported note")).toEqual({ title: "From HTML", text: "# From HTML\n\n9\n" });
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
async function started(f: ReturnType<typeof setup>, options: Parameters<typeof createApp>[3] = {}) {
  const app = createApp(f.bridge, messages, "en", options);
  await app.start();
  await settle();
  return app;
}
type Menu = { id: string; items: { id: string; label: string; shortcut?: string; disabled?: boolean; reason?: string }[] }[];
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.files", app.store.state) as {
  open: boolean; pinned: boolean; docked: boolean; width: number; pinLabel: string; menu: Menu; menuLabel: string; focusId: string; items: { id: string; label: string; selected: boolean }[];
};
const menuIds = (app: ReturnType<typeof createApp>) => vm(app).menu.map((s) => s.items.map((i) => i.id));

describe("the menu in the app (D-162)", () => {
  const notes = { "private:welcome.md": "# Welcome\n", "private:ideas.md": "---\nid: n-7\n---\n# Ideas\n\nSee [w](welcome.md).\n", "public:about.md": "# About\n" };
  it("Open containing folder shows a note in the system's file manager; a folder or section opens itself, only where the shell can (D-192)", async () => {
    const f = setup(notes);
    const shown: string[] = [];
    const opened: string[] = [];
    let fail = false;
    f.bridge.workspace!.revealItem = async (p) => { if (fail) throw new Error("notFound"); shown.push(p); };
    f.bridge.workspace!.openFolder = async (p) => { if (fail) throw new Error("notFound"); opened.push(p); };
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    expect(menuIds(app)[0]).toEqual(["files.openItem", "files.revealItem"]);
    expect(menuIds(app).flat()).not.toContain("files.openFolderItem");
    const item = vm(app).menu.flatMap((s) => s.items).find((i) => i.id === "files.revealItem");
    expect(item).toMatchObject({ label: "Open containing folder", shortcut: "Alt+Shift+R" });
    await app.commands.run("files.revealItem");
    await app.commands.run("files.select", { id: "root:public", mode: "replace" });
    expect(menuIds(app).flat()).toContain("files.openFolderItem");
    expect(menuIds(app).flat()).not.toContain("files.revealItem");
    expect(vm(app).menu.flatMap((s) => s.items).find((i) => i.id === "files.openFolderItem")).toMatchObject({ label: "Open in File Explorer" });
    // The same key opens a section or folder itself.
    await app.commands.run("files.revealItem");
    await app.commands.run("files.openFolderItem");
    await app.commands.run("files.revealItem", { path: "private:welcome.md" });
    expect(shown).toEqual(["private:ideas.md", "private:welcome.md"]);
    expect(opened).toEqual(["public:", "public:"]);
    // Gone since: a calm error, nothing else.
    fail = true;
    await app.commands.run("files.openFolderItem");
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Couldn't open the folder. It may have moved or been deleted.");
    // A shell that can't show files (the browser) has no such item.
    const web = await started(setup(notes));
    await web.commands.run("files.open");
    await web.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    expect(menuIds(web).flat()).not.toContain("files.revealItem");
    await web.commands.run("files.select", { id: "root:public", mode: "replace" });
    expect(menuIds(web).flat()).not.toContain("files.openFolderItem");
  });
  it("Copy puts files on the clipboard, Copy as path their paths, Copy text a note's text without the app's id (D-192)", async () => {
    const f = setup(notes);
    const files: string[][] = [];
    const texts: string[] = [];
    f.bridge.copyText = async (t) => { texts.push(t); };
    f.bridge.workspace!.revealItem = async () => {};
    f.bridge.workspace!.copyItems = async (ps) => { files.push(ps); };
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    expect(menuIds(app)[1]).toEqual(["files.copyItem", "files.copyPath", "files.copyText"]);
    const items = vm(app).menu.flatMap((s) => s.items);
    expect(items.filter((i) => ["files.copyItem", "files.copyPath", "files.copyText"].includes(i.id)).map((i) => [i.label, i.shortcut ?? ""])).toEqual([
      ["Copy", "Ctrl+C"], ["Copy as path", "Alt+Shift+C"], ["Copy text", ""],
    ]);
    const last = () => app.store.state.ui.toasts.at(-1)?.message;
    await app.commands.run("files.copyItem");
    expect(last()).toBe("Copied “Ideas”. Paste it in a folder, a mail or a chat.");
    await app.commands.run("files.copyPath");
    expect(last()).toBe("Copied the path to “Ideas”.");
    await app.commands.run("files.copyText");
    expect(last()).toBe("Copied the text of “Ideas”.");
    expect(files).toEqual([["private:ideas.md"]]);
    expect(texts).toEqual(["private:ideas.md", "# Ideas\n\nSee [w](welcome.md).\n"]);
    // The open note's text is the editor's, unsaved edits too.
    app.store.update((s) => ({ ...s, note: { ...s.note, markdown: "# Welcome\n\nNot saved yet.\n" } }));
    await app.commands.run("files.select", { id: "private:welcome.md", mode: "replace" });
    await app.commands.run("files.copyText");
    expect(texts.at(-1)).toBe("# Welcome\n\nNot saved yet.\n");
    // Several: every one; a section copies its path, never the whole folder as files.
    await app.commands.run("files.select", { id: "public:about.md", mode: "toggle" });
    await app.commands.run("files.copyItem");
    await app.commands.run("files.copyPath");
    expect(files.at(-1)).toEqual(["private:welcome.md", "public:about.md"]);
    expect(texts.at(-1)).toBe("private:welcome.md\npublic:about.md");
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Copied 2 paths.");
    expect(menuIds(app).flat()).not.toContain("files.copyText");
    await app.commands.run("files.select", { id: "root:public", mode: "replace" });
    expect(menuIds(app).flat()).not.toContain("files.copyItem");
    await app.commands.run("files.copyPath");
    expect(texts.at(-1)).toBe("public:");
    // Gone since: a calm error.
    f.bridge.workspace!.copyItems = async () => { throw new Error("notFound"); };
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.copyItem");
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Couldn't copy that. It may have moved or been deleted.");
  });
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

describe("Import files in the app (FIL-15, D-210)", () => {
  const notes = { "private:welcome.md": "# Welcome\n", "private:ideas.md": "# Ideas\n" };
  const importing = (read: { files: { name: string; kind: "markdown" | "text" | "html"; text: string }[]; skipped: string[] } | undefined) => {
    const f = setup(notes);
    f.bridge.workspace!.chooseImport = async () => (read ? { id: "pick-1", count: read.files.length + read.skipped.length } : undefined);
    f.bridge.workspace!.readImport = async (id) => { if (id !== "pick-1") throw new Error("notFound"); return read!; };
    return f;
  };
  const htmlToMarkdown = (html: string) => `# ${html.replace(/<[^>]+>/g, "")}\n`;
  it("only a shell that reads files, with the HTML reader, offers it", async () => {
    const plain = await started(setup(notes), { htmlToMarkdown });
    await plain.commands.run("files.open");
    await plain.commands.run("files.select", { id: "private:drafts", mode: "replace" });
    expect(menuIds(plain).flat()).not.toContain("files.import");
    const app = await started(importing(undefined), { htmlToMarkdown });
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:drafts", mode: "replace" });
    expect(menuIds(app)[0]).toEqual(["files.newNote", "files.newFolder", "files.import"]);
    expect(vm(app).menu.flatMap((s) => s.items).find((i) => i.id === "files.import")?.label).toBe("Import files…");
    const without = await started(importing(undefined));
    await without.commands.run("files.open");
    await without.commands.run("files.select", { id: "private:drafts", mode: "replace" });
    expect(menuIds(without).flat()).not.toContain("files.import");
  });
  it("makes a note in the folder for each file, in one batch, selected; a taken name is numbered; Undo removes them", async () => {
    const f = importing({ files: [
      { name: "ideas", kind: "markdown", text: "# Ideas\n\nMore.\n" },
      { name: "Report", kind: "html", text: "<h1>Report</h1>" },
      { name: "todo", kind: "text", text: "milk\r\n" },
    ], skipped: [] });
    const app = await started(f, { htmlToMarkdown });
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "root:private", mode: "replace" });
    await app.commands.run("files.import");
    await settle();
    expect(f.batches).toEqual([[
      { op: "create", path: "private:ideas-2.md", text: "# Ideas\n\nMore.\n" },
      { op: "create", path: "private:report.md", text: "# Report\n" },
      { op: "create", path: "private:todo.md", text: "# todo\n\nmilk\n" },
    ]]);
    expect(f.live().map((n) => n.path).sort()).toEqual(["private:ideas-2.md", "private:ideas.md", "private:report.md", "private:todo.md", "private:welcome.md"]);
    expect(vm(app).items.filter((i) => i.selected).map((i) => i.id)).toEqual(["private:ideas-2.md", "private:report.md", "private:todo.md"]);
    const t = app.store.state.ui.toasts.at(-1)!;
    expect(t.message).toBe("Imported 3 notes into “Private”.");
    expect(t.action?.label).toBe("Undo");
    await app.commands.run(t.action!.command, t.action!.args);
    await settle();
    expect(f.batches[1]!.map((o) => o.op)).toEqual(["delete", "delete", "delete"]);
    expect(f.live().map((n) => n.path).sort()).toEqual(["private:ideas.md", "private:welcome.md"]);
  });
  it("into a folder, says what it couldn't read; cancelled does nothing; nothing read imports nothing", async () => {
    const f = importing({ files: [{ name: "plan", kind: "markdown", text: "# Plan\n" }], skipped: ["huge.docx"] });
    const app = await started(f, { htmlToMarkdown });
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: "private:drafts", mode: "replace" });
    await app.commands.run("files.import");
    await settle();
    expect(f.batches).toEqual([[{ op: "create", path: "private:drafts/plan.md", text: "# Plan\n" }]]);
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Imported “Plan” into “drafts”. Couldn't read “huge.docx”.");
    const none = importing({ files: [], skipped: ["a.docx", "b.docx"] });
    const app2 = await started(none, { htmlToMarkdown });
    await app2.commands.run("files.import");
    await settle();
    expect(none.batches).toEqual([]);
    expect(app2.store.state.ui.toasts.at(-1)).toMatchObject({ message: "Couldn't read 2 files. Nothing was imported.", tone: "error" });
    const cancelled = importing(undefined);
    const app3 = await started(cancelled, { htmlToMarkdown });
    await app3.commands.run("files.import");
    await settle();
    expect(cancelled.batches).toEqual([]);
    expect(app3.store.state.ui.toasts).toEqual([]);
  });
});

describe("pinning the panel (D-161)", () => {
  const notes = { "private:welcome.md": "# Welcome\n", "private:ideas.md": "# Ideas\n" };
  it("the pin keeps it open when a note opens, says what it does, and is kept on this device", async () => {
    const f = setup(notes);
    const app = await started(f);
    await app.commands.run("files.open");
    expect(vm(app)).toMatchObject({ pinned: false, pinLabel: "Dock Files" });
    await app.commands.run("files.togglePin");
    expect(vm(app)).toMatchObject({ open: true, pinned: true, docked: true, pinLabel: "Undock Files" });
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
  it("docked (D-187): too little room closes it as an undocked panel; room again docks and opens it without focus; its width is kept", async () => {
    const f = setup(notes, { filesPinned: true, filesWidth: 320 });
    const app = await started(f);
    expect(vm(app)).toMatchObject({ open: true, docked: true, width: 320 });
    const asked = app.store.state.ui.files.focusRequest;
    await app.commands.run("files.setFits", { fits: false });
    expect(vm(app).open).toBe(false);
    // Undocked for room, it's an ordinary panel: opened, it closes as a note opens.
    await app.commands.run("files.open");
    expect(vm(app)).toMatchObject({ open: true, docked: false, pinned: true });
    await app.commands.run("files.select", { id: "private:ideas.md", mode: "replace" });
    await app.commands.run("files.openItem");
    expect(vm(app).open).toBe(false);
    await app.commands.run("files.setFits", { fits: true });
    expect(vm(app)).toMatchObject({ open: true, docked: true });
    // Opened without taking focus: no request for its tree to meet.
    expect(app.store.state.ui.files.focusRequest).toBe(0);
    expect(asked).toBe(0);
    await app.commands.run("files.setWidth", { width: 241.6 });
    expect(vm(app).width).toBe(242);
    expect(f.saved.at(-1)?.filesWidth).toBe(242);
  });
  it("says where the notes come from (D-188): the repository (its name alone when the account owns it), @login, and Open local folder", async () => {
    const f = setup(notes);
    const revealed: number[] = [];
    f.bridge.workspace!.info = async () => ({ folder: "C:\\Notes\\my-notes", format: '{"formatVersion":1}', repo: "ada/my-notes" });
    f.bridge.workspace!.reveal = async () => { revealed.push(1); };
    const app = await started(f);
    app.store.update((s) => ({ ...s, account: { login: "Ada" } }));
    await app.commands.run("files.open");
    const where = () => (app.viewModels.select("vm.files", app.store.state) as { source: Record<string, unknown> }).source;
    // Without a browser to open links in, the name and @login are plain text.
    expect(where()).toEqual({
      visible: true, icon: "github", title: "my-notes", login: "@Ada", hasLogin: true, label: "Notes from ada/my-notes, signed in as @Ada", revealable: true,
      repoLink: false, repoLabel: "Open ada/my-notes on GitHub", profileLink: false, profileLabel: "Open @Ada's profile on GitHub", titlePlain: true, loginPlain: true,
    });
    await app.commands.run("files.revealFolder");
    expect(revealed).toEqual([1]);
    // Someone else's repository keeps its owner; signed out, no login.
    app.store.update((s) => ({ ...s, account: { login: "" }, workspace: { ...s.workspace, repo: "team/shared" } }));
    expect(where()).toMatchObject({ title: "team/shared", login: "", hasLogin: false, label: "Notes from team/shared" });
    // No GitHub repository: the folder's name; no folder (the browser): nothing to show or open.
    app.store.update((s) => ({ ...s, workspace: { ...s.workspace, repo: undefined } }));
    expect(where()).toMatchObject({ visible: true, icon: "folder", title: "my-notes" });
    app.store.update((s) => ({ ...s, workspace: { ...s.workspace, folder: "" } }));
    expect(where()).toMatchObject({ visible: false, revealable: false });
  });
});

describe("Files opens the repository and the profile on GitHub, and Browse files leaves Recently deleted (D-189)", () => {
  it("the name opens the repository, @login the profile, only through the shell", async () => {
    const f = setup({ "private:welcome.md": "# Welcome\n" });
    const opened: string[] = [];
    f.bridge.openLink = (url) => void opened.push(url);
    f.bridge.workspace!.info = async () => ({ folder: "C:\\Notes\\notes", format: '{"formatVersion":1}', repo: "ada/notes" });
    const app = await started(f);
    app.store.update((s) => ({ ...s, account: { login: "ada" } }));
    await app.commands.run("files.open");
    expect((app.viewModels.select("vm.files", app.store.state) as { source: Record<string, unknown> }).source).toMatchObject({ repoLink: true, titlePlain: false, profileLink: true, loginPlain: false });
    await app.commands.run("files.openRepo");
    await app.commands.run("files.openProfile");
    expect(opened).toEqual(["https://github.com/ada/notes", "https://github.com/ada"]);
  });
  it("while Recently deleted shows, its footer reads Browse files and goes back to the tree", async () => {
    const f = setup({ "private:welcome.md": "# Welcome\n" });
    f.bridge.workspace!.deleted = async () => [];
    f.bridge.workspace!.restore = async () => [];
    const app = await started(f);
    app.store.update((s) => ({ ...s, sync: { ...s.sync, git: true } }));
    await app.commands.run("files.open");
    const deleted = () => app.viewModels.select("vm.deleted", app.store.state) as { open: boolean; footer: string; footerIcon: string };
    expect(deleted()).toMatchObject({ open: false, footerIcon: "history" });
    expect(deleted().footer).toMatch(/^Recently deleted/);
    await app.commands.run("files.toggleDeleted");
    expect(deleted()).toMatchObject({ open: true, footer: "Browse files", footerIcon: "folder" });
    await app.commands.run("files.toggleDeleted");
    expect(deleted().open).toBe(false);
  });
});
