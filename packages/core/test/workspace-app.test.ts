/** The workspace in the app: its format (DST-05), names that follow titles (FIL-07), and outside changes (PRF-11). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type AppStateFile, type PlatformBridge, type WorkspaceBridge, type WorkspaceChange, type WorkspaceScan } from "../src/index.ts";

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
    writeNote: async (p, c) => { files[p] = c; writes.push(p); },
    chooseNote: async () => undefined, newNotePath: async () => `${ROOT}/untitled.md`,
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

describe("file names follow titles until published (FIL-07)", () => {
  it("a new note's file is named after its title as it's typed", async () => {
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
    expect(app.store.state.note.path).toBe(`${ROOT}/on-focus-again.md`);
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
