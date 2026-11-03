/** The workspace in the app: its format (DST-05), first-save names (FIL-18), and outside changes (PRF-11). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type AppStateFile, type PlatformBridge, type WorkspaceBridge, type WorkspaceChange, type WorkspaceScan } from "../src/index.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const ROOT = "/w/private/notes";

function setup(opts: { files?: Record<string, string>; format?: string; open?: string; published?: string[] } = {}) {
  const files: Record<string, string> = { [`${ROOT}/welcome.md`]: "# Welcome to Focus Notes\n", ...opts.files };
  let state: AppStateFile = { version: 1, ...(opts.open ? { lastNotePath: opts.open } : {}) };
  const writes: string[] = [];
  const reads: string[] = [];
  const renames: [string, string][] = [];
  const formats: string[] = [];
  let emit: (c: WorkspaceChange[]) => void = () => {};
  const scan = (): WorkspaceScan => ({
    folder: "/w",
    roots: [{ id: "private", path: ROOT, readOnly: false }, { id: "public", path: "/w/notes", readOnly: false }],
    entries: Object.keys(files).map((path) => ({ path, kind: "note" as const, ...(opts.published?.includes(path) ? { published: true } : {}) })),
  });
  const workspace: WorkspaceBridge = {
    info: async () => ({ folder: "/w", ...(opts.format !== undefined ? { format: opts.format } : {}) }),
    scan: async () => scan(),
    writeFormat: async (text) => { formats.push(text); },
    renameNote: async (from, to) => {
      if (to in files) throw new Error("taken");
      files[to] = files[from]!;
      delete files[from];
      renames.push([from, to]);
    },
    onChange: (l) => { emit = l; return () => {}; },
  };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { reads.push(p); if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: checkingDisk(files, (p) => writes.push(p)).writeNote,
    chooseNote: async () => undefined, newNotePath: async (near) => {
      const dir = near ? near.slice(0, near.lastIndexOf("/")) : ROOT;
      for (let i = 1; ; i++) {
        const path = `${dir}/untitled${i > 1 ? `-${i}` : ""}.md`;
        if (!(path in files)) return path;
      }
    },
    defaultNotePath: async () => `${ROOT}/welcome.md`,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace,
  };
  return { bridge, files, writes, reads, renames, formats, emit: (c: WorkspaceChange[]) => emit(c), state: () => state };
}
const canvas = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.canvas", app.store.state) as Record<string, unknown>;
const toasts = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts.map((t) => t.message);
const settle = () => new Promise((r) => setTimeout(r, 0));

it("FIL-18, KEY-03: Back and Forward follow a new note's first-save filename even without a heading", async () => {
  const f = setup();
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  await app.commands.run("note.new");
  await app.commands.run("note.setContent", { value: "second note\n" });
  await app.commands.run("note.back");
  expect(app.store.state.note.path).toBe(`${ROOT}/welcome.md`);
  await app.commands.run("note.forward");
  expect(app.store.state.note.markdown).toBe("second note\n");
  expect(app.store.state.note.path).toBe(f.renames[0]![1]);
  expect(f.files[app.store.state.note.path!]).toBe("second note\n");
});

describe("FIL-17: choosing a writable workspace folder", () => {
  function pickerSetup() {
    const f = setup({ files: { [`${ROOT}/Drafts/start.md`]: "# Start\n\nKeep this.\n" }, open: `${ROOT}/Drafts/start.md` });
    const folders: string[] = ["/w/notes/Essays"];
    const scan = f.bridge.workspace!.scan;
    f.bridge.workspace!.scan = async () => {
      const s = await scan();
      return { ...s, entries: [...s.entries, ...folders.map((path) => ({ path, kind: "folder" as const }))] };
    };
    f.bridge.workspace!.apply = async (ops) => {
      for (const op of ops) {
        if (op.op === "createFolder") {
          if (folders.includes(op.path)) throw new Error("taken");
          folders.push(op.path);
        } else if (op.op === "create") {
          if (op.path in f.files) throw new Error("taken");
          f.files[op.path] = op.text;
        } else throw new Error("unexpected-operation");
      }
    };
    return f;
  }

  it("preselects the current private folder and Cancel creates nothing", async () => {
    const f = pickerSetup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    const before = { ...f.files };
    await app.commands.run("note.newIn");
    expect(app.store.state.ui.files.newNote).toMatchObject({ open: true, activeId: `${ROOT}/Drafts` });
    await app.commands.run("newNote.dismiss");
    expect(f.files).toEqual(before);
    expect(app.store.state.ui.files.newNote.open).toBe(false);
  });

  it("creates a folder inline and one note there with a guarded create", async () => {
    const f = pickerSetup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("note.newIn");
    await app.commands.run("newNote.select", { id: "/w/notes/Essays" });
    await app.commands.run("newNote.newFolder");
    await app.commands.run("files.setEditValue", { value: "Chapters" });
    await app.commands.run("files.commitEdit");
    expect(app.store.state.ui.files.newNote.activeId).toBe("/w/notes/Essays/Chapters");
    await app.commands.run("newNote.create");
    expect(app.store.state.note.path).toBe("/w/notes/Essays/Chapters/untitled.md");
    expect(f.files[app.store.state.note.path!]).toBe("");
    expect(f.files[`${ROOT}/Drafts/start.md`]).toBe("# Start\n\nKeep this.\n");
    expect(app.store.state.ui.files.newNote.open).toBe(false);
  });

  it("rejects a foreign destination before writes and never overwrites a newly taken path", async () => {
    const f = pickerSetup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await expect(app.commands.run("note.new", { folder: "/other" })).rejects.toThrow("folder-unavailable");
    await app.commands.run("note.newIn");
    f.bridge.newNotePath = async () => {
      const path = `${ROOT}/Drafts/untitled.md`;
      f.files[path] = "An external note.\n";
      return path;
    };
    await app.commands.run("newNote.create");
    expect(f.files[`${ROOT}/Drafts/untitled.md`]).toBe("An external note.\n");
    expect(app.store.state.note.path).toBe(`${ROOT}/Drafts/start.md`);
    expect(app.store.state.ui.files.newNote).toMatchObject({ open: true, busy: false, error: messages["newNote.createFailed"] });
  });
});

describe("the workspace format (DST-05)", () => {
  it("a workspace saved by a newer app opens read-only and says why, and nothing is written", async () => {
    const f = setup({ format: '{"formatVersion":2}' });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(canvas(app).readOnly).toBe(true);
    expect(toasts(app)).toEqual([messages["toast.workspaceNewer"]!.replace("{found}", "2")]);
    await app.commands.run("note.setContent", { value: "changed" });
    await app.commands.run("note.new");
    await app.flush();
    expect(f.writes).toEqual([]);
    expect(app.commands.describe("note.new").enabled).toBe(false);
    expect(app.viewModels.select("vm.account", app.store.state)).toMatchObject({ visible: true, readOnly: true, readOnlyText: messages["account.readOnlyNewer"] });
  });
  it("an unreadable format file is never overwritten", async () => {
    const f = setup({ format: "{ not json" });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(canvas(app).readOnly).toBe(true);
    expect(toasts(app)).toEqual([messages["toast.workspaceUnreadable"]]);
  });
  it("an older format asks first, stays read-only until the person agrees, then migrates", async () => {
    const f = setup({ format: '{"formatVersion":1,"templateVersion":"1.0.0"}' });
    const app = createApp(f.bridge, messages, "en", { workspaceFormat: { current: 2, migrations: { 1: (w) => ({ ...w, formatVersion: 2 }) } } });
    await app.start();
    expect(f.formats).toEqual([]);
    expect(canvas(app).readOnly).toBe(true);
    const ask = app.store.state.ui.toasts[0]!;
    expect(ask).toMatchObject({ message: messages["toast.workspaceOlder"], action: { command: "workspace.migrate", label: messages["toast.workspaceUpdate"] } });
    await app.commands.run("toast.action", { id: ask.id });
    expect(f.formats.map((t) => JSON.parse(t))).toEqual([{ formatVersion: 2, templateVersion: "1.0.0" }]);
    expect(canvas(app).readOnly).toBe(false);
    expect(toasts(app)).toContain(messages["toast.workspaceUpdated"]);
  });
  it("notes outside the workspace stay writable", async () => {
    const f = setup({ format: '{"formatVersion":9}', files: { "/elsewhere/a.md": "A" }, open: "/elsewhere/a.md" });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(canvas(app).readOnly).toBe(false);
  });
});

describe("FIL-18: a first-save name survives later title edits", () => {
  it("names an empty new note once, then retains its path after title edits and reopening", async () => {
    const f = setup({ files: { [`${ROOT}/untitled.md`]: "" }, open: `${ROOT}/untitled.md` });
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    const key = app.store.state.note.key;
    await app.commands.run("note.setContent", { value: "# On focus\n\nText" });
    await app.flush();
    expect(f.renames).toEqual([[`${ROOT}/untitled.md`, `${ROOT}/on-focus.md`]]);
    expect(app.store.state.note.path).toBe(`${ROOT}/on-focus.md`);
    // The editor isn't reset by a rename.
    expect(app.store.state.note.key).toBe(key);
    expect(f.state().lastNotePath).toBe(`${ROOT}/on-focus.md`);
    expect(f.files[`${ROOT}/on-focus.md`]).toBe("# On focus\n\nText");
    await app.commands.run("note.setContent", { value: "# On focus, again\n\nText" });
    await app.flush();
    expect(app.store.state.note.path).toBe(`${ROOT}/on-focus.md`);
    expect(f.renames).toHaveLength(1);
    const reopened = createApp(f.bridge, messages);
    await reopened.start();
    await settle();
    await reopened.commands.run("note.setContent", { value: "# A third title\n\nText" });
    await reopened.flush();
    expect(reopened.store.state.note.path).toBe(`${ROOT}/on-focus.md`);
    expect(f.renames).toHaveLength(1);
  });
  it("gives prose without a title a dated first-save name only once", async () => {
    const f = setup({ files: { [`${ROOT}/untitled.md`]: "" }, open: `${ROOT}/untitled.md` });
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("note.setContent", { value: "Words without a heading.\n" });
    await app.flush();
    expect(app.store.state.note.path).toMatch(/\/untitled-\d{4}-\d{2}-\d{2}\.md$/);
    const path = app.store.state.note.path;
    await app.commands.run("note.setContent", { value: "# A title later\n\nWords without a heading.\n" });
    await app.flush();
    expect(app.store.state.note.path).toBe(path);
    expect(f.renames).toHaveLength(1);
  });
  it("a published note keeps its name", async () => {
    const path = `${ROOT}/plan.md`;
    const f = setup({ files: { [path]: "# Plan\n" }, open: path, published: [path] });
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("note.setContent", { value: "# Launch plan\n" });
    await app.flush();
    expect(f.renames).toEqual([]);
    expect(app.store.state.note.path).toBe(path);
  });

  describe("FIL-17 / KEY-09: New note in chooses a workspace folder before writing", () => {
    it("preselects a private current folder, cancels without writes, then creates in the chosen public folder", async () => {
      const path = `${ROOT}/drafts/start.md`;
      const f = setup({ open: path, files: { [path]: "# Start\n", "/w/notes/essays/one.md": "# One\n" } });
      f.bridge.workspace!.apply = async (ops) => {
        for (const op of ops) {
          if (op.op !== "create") throw new Error("unexpected-operation");
          if (op.path in f.files) throw new Error("taken");
          f.files[op.path] = op.text;
          f.writes.push(op.path);
        }
      };
      const app = createApp(f.bridge, messages);
      await app.start(); await settle();
      expect(app.commands.match({ key: "N", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBe("note.newIn");
      await app.commands.run("note.newIn");
      const picker = () => app.viewModels.select("vm.newNote", app.store.state) as { open: boolean; activeId: string; items: { id: string }[] };
      expect(picker()).toMatchObject({ open: true, activeId: `${ROOT}/drafts` });
      expect(picker().items.some((i) => i.id === "/w/notes/essays")).toBe(true);
      await app.commands.run("newNote.dismiss");
      expect(f.writes).toEqual([]);
      expect(app.store.state.note.path).toBe(path);
      await app.commands.run("note.newIn");
      await app.commands.run("newNote.select", { id: "/w/notes/essays" });
      await app.commands.run("newNote.create");
      expect(picker().open).toBe(false);
      expect(app.store.state.note.path).toBe("/w/notes/essays/untitled.md");
      expect(f.writes).toEqual(["/w/notes/essays/untitled.md"]);
      await app.commands.run("note.newIn");
      expect(picker().activeId).toBe("/w/notes/essays");
    });
    it("rejects stale or foreign destinations with an explicit error, without writing", async () => {
      const f = setup();
      const app = createApp(f.bridge, messages);
      await app.start(); await settle();
      await app.commands.run("note.newIn");
      await app.commands.run("newNote.select", { id: "/other-project/notes" });
      expect(f.writes).toEqual([]);
      expect(app.viewModels.select("vm.newNote", app.store.state)).toMatchObject({ open: true });
      expect(toasts(app).length).toBeGreaterThan(0);
    });
  });
  it("a name chosen by hand isn't replaced", async () => {
    const f = setup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("note.setContent", { value: "# Hello\n" });
    await app.flush();
    expect(f.renames).toEqual([]);
  });
});

describe("changes from outside the app (PRF-11)", () => {
  it("reloads the open note quietly when it has no unsaved edits", async () => {
    const f = setup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    const before = canvas(app);
    f.files[`${ROOT}/welcome.md`] = "# Changed elsewhere\n";
    f.emit([{ path: `${ROOT}/welcome.md`, kind: "note", exists: true }]);
    await settle();
    expect(app.store.state.note.markdown).toBe("# Changed elsewhere\n");
    expect(canvas(app).initialMarkdown).toBe("# Changed elsewhere\n");
    expect(canvas(app).noteKey).not.toBe(before.noteKey);
  });
  it("a change to a note no view shows does no work at all", async () => {
    const f = setup({ files: { [`${ROOT}/other.md`]: "Other" } });
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    const version = app.store.version;
    const reads = f.reads.length;
    f.emit([{ path: `${ROOT}/other.md`, kind: "note", exists: true }]);
    await settle();
    expect(app.store.version).toBe(version);
    expect(f.reads.length).toBe(reads);
  });
  it("its own saves, reported back by the watcher, change nothing", async () => {
    const f = setup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("note.setContent", { value: "# Mine\n" });
    await app.flush();
    const key = app.store.state.note.key;
    f.emit([{ path: `${ROOT}/welcome.md`, kind: "note", exists: true }]);
    await settle();
    expect(app.store.state.note.key).toBe(key);
  });
  it("keeps unsaved edits when the note changes outside, and says so", async () => {
    const f = setup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("note.setContent", { value: "# Typing\n" });
    f.files[`${ROOT}/welcome.md`] = "# Theirs\n";
    f.emit([{ path: `${ROOT}/welcome.md`, kind: "note", exists: true }]);
    await settle();
    expect(app.store.state.note.markdown).toBe("# Typing\n");
    // Named by its title; the next save waits for a choice in the resolver (D-92, FIL-12).
    expect(toasts(app)).toEqual([messages["toast.changedOutside"]!.replace("{note}", "Typing")]);
    expect(await app.flush()).toBe(false);
    expect(f.files[`${ROOT}/welcome.md`]).toBe("# Theirs\n");
  });
  it("keeps the tree current, and re-reads the format when its file changes", async () => {
    const f = setup();
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    f.emit([{ path: `${ROOT}/new.md`, kind: "note", exists: true }]);
    await settle();
    expect(app.store.state.workspace.tree.roots[0]!.children.map((n) => n.name)).toEqual(["new.md", "welcome.md"]);
    f.bridge.workspace!.info = async () => ({ folder: "/w", format: '{"formatVersion":5}' });
    f.emit([{ path: "/w/.focus-notes/workspace.json", kind: "format", exists: true }]);
    await settle();
    await settle();
    expect(canvas(app).readOnly).toBe(true);
  });
});
