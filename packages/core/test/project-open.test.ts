/** Open (owner, 4 November): a project's folder path shows the folder, and a first load shows placeholders, not "empty". */
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import { createApp, MessageCatalog, type PlatformBridge, type ProjectCreateProgress, type ProjectEntry } from "../src/index.ts";

function appWith(projects: Partial<NonNullable<PlatformBridge["projects"]>>, readNote: PlatformBridge["readNote"] = async () => "", overrides: Partial<PlatformBridge> = {}) {
  const bridge = {
    platform: "windows",
    readNote,
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/Welcome.md",
    loadAppState: async () => ({ version: 1 }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    projects,
    ...overrides,
  } as unknown as PlatformBridge;
  return createApp(bridge, en);
}
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.projects", app.store.state) as { error: string; details: string; query: string; open: boolean; retrying: boolean; recoveryAction: string; searchFocus: number; recentWaiting: boolean; entriesWaiting: boolean; entries: unknown[] };
const book: ProjectEntry = { folder: "C:\\Book", name: "Book", accent: "teal", logo: "book" } as ProjectEntry;
afterEach(() => vi.useRealTimers());

describe("Open", () => {
  it.each([false, true])("opens the saved disk note when launch metadata is stale or unreadable (unreadable: %s)", async (unreadable) => {
    const target = "C:\\Book\\renamed.md", stale = "C:\\Book\\Untitled.md";
    const writeNote = vi.fn(async () => {});
    const readNote = vi.fn(async (path: string) => { if (path !== target) throw new Error("missing"); return "# Recovered disk note"; });
    const app = appWith({
      lastNote: async () => { if (unreadable) throw new Error("protection unavailable"); return stale; },
      position: async () => undefined, remember: async () => {}, list: async () => [],
    }, readNote, { writeNote, loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: target }) });
    await app.start();
    expect(app.store.state.note).toMatchObject({ path: target, markdown: "# Recovered disk note", status: "ready" });
    expect(writeNote).not.toHaveBeenCalled();
    expect(app.store.state.ui.toasts).toContainEqual(expect.objectContaining({ tone: "error", message: en["project.launch.restoreFailed"] }));
  });
  it.each([false, true])("queues the renamed launch path without blocking its save and updates the saved disk path (rename fails: %s)", async (refused) => {
    const current = "/w/private/notes/untitled.md";
    const files: Record<string, string> = { [current]: "" };
    const remember = vi.fn<NonNullable<PlatformBridge["projects"]>["remember"]>(() => new Promise<void>(() => {}));
    const saveAppState = vi.fn(async () => {});
    const app = appWith({ remember, lastNote: async () => current, position: async () => undefined, edited: async () => {} }, async path => files[path]!, {
      writeNote: async (path, text) => { files[path] = text; },
      loadAppState: async () => ({ version: 1, firstRun: "done" }), saveAppState,
      workspace: {
        info: async () => ({ folder: "/w" }),
        scan: async () => ({ folder: "/w", roots: [{ id: "private", path: "/w/private/notes", readOnly: false }], entries: [{ path: current, kind: "note" }] }),
        renameNote: async (from, to) => {
          expect(saveAppState.mock.calls).toContainEqual([expect.objectContaining({ lastNotePath: to })]);
          if (refused) throw new Error("rename refused");
          files[to] = files[from]!;
          delete files[from];
        },
        writeFormat: async () => {},
        onChange: () => () => {},
      },
    });
    await app.start();
    await app.commands.run("note.setContent", { value: "# Kept title\n" });
    expect(await app.flush()).toBe(true);
    if (refused) {
      expect(app.store.state.note.path).toBe(current);
      expect(files[current]).toBe("# Kept title\n");
      expect(saveAppState.mock.calls.at(-1)).toEqual([expect.objectContaining({ lastNotePath: current })]);
      expect(app.store.state.ui.toasts).toContainEqual(expect.objectContaining({ tone: "error", message: en["files.firstNameFailed"] }));
      return;
    }
    expect(app.store.state.note.path).toBe("/w/private/notes/kept-title.md");
    expect(remember.mock.calls.at(-1)?.[0]).toBe("/w/private/notes/kept-title.md");
    expect(files["/w/private/notes/kept-title.md"]).toBe("# Kept title\n");
    expect(saveAppState.mock.calls).toContainEqual([expect.objectContaining({ lastNotePath: "/w/private/notes/kept-title.md" })]);
  });
  it("flushes typed text and finishes Mod+N while launch-record protection never acknowledges", async () => {
    const current = `${book.folder}\\notes\\current.md`;
    const remember = vi.fn(() => new Promise<void>(() => {}));
    const writeNote = vi.fn(async () => {});
    const app = appWith({ remember }, async () => "", { writeNote });
    app.store.update(s => ({ ...s, note: { ...s.note, path: current, key: "original", markdown: "# Typed just now", initialMarkdown: "# Before typing", status: "ready", saveState: "unsaved" } }));
    await app.commands.run("note.position", { key: "original", from: 2, to: 2, scroll: 0 });
    expect(await app.flush()).toBe(true);
    expect(writeNote).toHaveBeenCalledWith(current, "# Typed just now", "# Before typing");
    await app.commands.run("note.new");
    expect(app.store.state.note).toMatchObject({ path: "/n/Untitled.md", markdown: "", status: "ready", saveState: "saved" });
    expect(remember).toHaveBeenCalled();
  });
  it.each([false, true])("keeps typed text safe when opening from disk with an unreadable launch record (save fails: %s)", async (refused) => {
    const current = `${book.folder}\\notes\\current.md`, target = `${book.folder}\\notes\\target.md`;
    const writeNote = vi.fn(async (_path: string, _markdown: string) => { if (refused) throw new Error("storage refused"); });
    const readNote = vi.fn(async () => "# Accepted from disk");
    const position = vi.fn(async () => { throw new Error("Chromium key unavailable after crash"); });
    const app = appWith({ position, remember: async () => {} }, readNote, { writeNote, chooseNote: async () => target });
    app.store.update(s => ({ ...s, note: { ...s.note, path: current, key: "original", markdown: "# Typed just now", initialMarkdown: "# Before typing", status: "ready", saveState: "unsaved" } }));
    await app.commands.run("note.open");
    expect(writeNote.mock.calls[0]?.slice(0, 2)).toEqual([current, "# Typed just now"]);
    if (refused) {
      expect(readNote).not.toHaveBeenCalled();
      expect(app.store.state.note).toMatchObject({ path: current, markdown: "# Typed just now", saveState: "error" });
    } else {
      expect(position).toHaveBeenCalledWith(target);
      expect(app.store.state.note).toMatchObject({ path: target, markdown: "# Accepted from disk", status: "ready" });
      expect(app.store.state.ui.toasts).toContainEqual(expect.objectContaining({ tone: "error", message: en["project.launch.restoreFailed"] }));
    }
  });
  it("writes only the incoming launch record when switching, but persists the current cursor on flush and same-note reload", async () => {
    const previous = `${book.folder}\\notes\\previous.md`, target = `${book.folder}\\notes\\target.md`;
    const remember = vi.fn(async () => {});
    const position = { from: 6, to: 9, scroll: 120 };
    const app = appWith({ remember, position: async () => position }, async () => "# Target", { chooseNote: async () => target });
    app.store.update(s => ({ ...s, note: { ...s.note, key: "previous", path: previous, markdown: "# Previous", status: "ready", saveState: "saved" } }));
    await app.commands.run("note.position", { key: "previous", ...position });
    await app.commands.run("note.open");
    expect(remember.mock.calls).toEqual([[target]]);
    const key = app.store.state.note.key;
    await app.commands.run("note.position", { key, ...position });
    await app.flush();
    expect(remember.mock.calls.at(-1)).toEqual([target, { key, ...position }]);
    remember.mockClear();
    await app.commands.run("note.open");
    expect(remember.mock.calls).toEqual([[target, { key, ...position }], [target]]);
  });
  it("provides an argument-free command title while keeping platform-specific folder action labels", () => {
    const app = appWith({ reveal: async () => {} });
    const catalog = new MessageCatalog("en", en);
    expect(catalog.format(app.commands.describe("projects.reveal").title)).toBe("Show project folder");
    expect(catalog.format("project.open.reveal", { platform: "windows" })).toBe("Show in File Explorer");
  });
  it("accepts a read note when only remembering its next-launch path fails, reporting that separate failure", async () => {
    const target = `${book.folder}\\notes\\target.md`;
    const app = appWith({
      list: async () => [{ ...book, lastNote: target }], position: async () => undefined, remember: async () => {},
    }, async () => "# Accepted note", { saveAppState: async () => { throw new Error("storage refused"); } });
    app.store.update(s => ({ ...s, workspace: { ...s.workspace, folder: book.folder }, note: { ...s.note, path: `${book.folder}\\notes\\current.md`, status: "ready", saveState: "saved" } }));
    await app.commands.run("projects.open");
    await app.commands.run("projects.launch", { id: `${book.folder}|note` });
    expect(vm(app).open).toBe(false);
    expect(app.store.state.note).toMatchObject({ path: target, markdown: "# Accepted note", status: "ready" });
    expect(app.store.state.ui.toasts).toContainEqual(expect.objectContaining({ tone: "error", message: en["project.launch.rememberFailed"] }));
  });
  it("keeps Open and the current note when a same-project read fails, then accepts only a successful Retry", async () => {
    let refused = true;
    const target = `${book.folder}\\notes\\target.md`;
    const app = appWith({
      list: async () => [{ ...book, lastNote: target }], position: async () => undefined, remember: async () => {},
      open: async () => { throw new Error("Same-project notes must open here"); },
    }, async () => { if (refused) throw new Error("readOnly"); return "# Accepted target\n"; });
    app.store.update(s => ({ ...s, workspace: { ...s.workspace, folder: book.folder }, note: { ...s.note, path: `${book.folder}\\notes\\current.md`, key: "original", markdown: "# Kept current", initialMarkdown: "# Kept current", status: "ready", saveState: "saved" } }));
    await app.commands.run("projects.open");
    await app.commands.run("projects.launch", { id: `${book.folder}|note` });
    expect(vm(app)).toMatchObject({ open: true, error: en["project.open.failed"], recoveryAction: "Retry" });
    expect(app.store.state.note).toMatchObject({ key: "original", markdown: "# Kept current", status: "ready" });
    expect(performance.getEntriesByName("fn:project.open").length).toBeGreaterThan(0);
    refused = false;
    await app.commands.run("projects.retry");
    expect(vm(app).open).toBe(false);
    expect(app.store.state.note).toMatchObject({ path: target, markdown: "# Accepted target\n", status: "ready" });
  });

  it("retries the original Local copy with one request receipt after a lost acknowledgement", async () => {
    const calls: [string, string, string | undefined][] = [];
    const app = appWith({
      local: true, list: async () => [book], remember: async () => {},
      importLocal: async (path, folder, request) => {
        calls.push([path, folder, request]);
        if (calls.length === 1) throw new Error("sensitive lost reply");
        return `${folder}\\draft.md`;
      },
    });
    app.store.update(s => ({ ...s, note: { ...s.note, path: "C:\\Local\\draft.md", markdown: "# Kept", initialMarkdown: "# Kept", saveState: "saved" } }));
    await app.commands.run("local.import");
    await app.commands.run("local.copyTo", { id: book.folder });
    expect(app.viewModels.select("vm.localImport", app.store.state)).toMatchObject({ open: true, error: en["quick.import.failed"], recoveryAction: "Retry" });
    expect(JSON.stringify(app.viewModels.select("vm.localImport", app.store.state))).not.toContain("sensitive");
    await app.commands.run("local.importRetry");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]?.[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(app.store.state.note.markdown).toBe("# Kept");
    expect(app.viewModels.select("vm.localImport", app.store.state)).toMatchObject({ open: false, error: "" });
  });

  it("retries Local target listing in place rather than copying an unknown target", async () => {
    let lists = 0;
    const app = appWith({ local: true, list: async () => { if (++lists === 1) throw new Error("refused"); return [book]; } });
    app.store.update(s => ({ ...s, note: { ...s.note, path: "C:\\Local\\draft.md" } }));
    await app.commands.run("local.import");
    expect(app.viewModels.select("vm.localImport", app.store.state)).toMatchObject({ error: en["quick.import.listFailed"], recoveryAction: "Retry" });
    await app.commands.run("local.importRetry");
    expect(app.viewModels.select("vm.localImport", app.store.state)).toMatchObject({ open: true, error: "", targets: [expect.objectContaining({ id: book.folder })] });
  });

  it("opens a created project again without replaying creation, retaining its choices during Retry", async () => {
    let creates = 0, opens = 0, finish!: () => void, refuse!: (error: Error) => void;
    const app = appWith({
      parent: async () => "C:\\Projects",
      check: async (_parent, name) => ({ folder: `C:\\Projects\\${name}`, problem: "" }),
      create: async () => { creates++; return book.folder; },
      open: async () => { if (++opens === 1) throw new Error("notFound"); await new Promise<void>((resolve, reject) => { finish = resolve; refuse = reject; }); },
    });
    await app.commands.run("projects.new");
    await app.commands.run("projects.newname", { value: "Book" });
    for (let i = 0; i < 3; i++) await app.commands.run("projects.newNext");
    await app.commands.run("projects.newCreate");
    expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ name: "Book", error: en["project.new.openFailed"], recoveryAction: "Retry" });
    const retry = app.commands.run("projects.newRecover");
    await expect.poll(() => opens).toBe(2);
    expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ open: true, retrying: true, name: "Book", error: en["project.new.openFailed"] });
    expect(creates).toBe(1);
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(1000);
    const announced = app.store.state.announcement.n;
    refuse(new Error("notFound")); await retry;
    expect(app.store.state.announcement).toMatchObject({ n: announced + 1, text: en["project.new.openFailed"] });
    const accepted = app.commands.run("projects.newRecover");
    await vi.advanceTimersByTimeAsync(1000);
    finish(); await accepted;
    expect(creates).toBe(1);
    expect(opens).toBe(3);
    expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ open: false, error: "" });
  });

  it("does not blindly retry project creation when setup may have partially succeeded", async () => {
    let creates = 0, picks = 0;
    const app = appWith({
      parent: async () => "C:\\Projects",
      check: async () => ({ folder: book.folder, problem: "" }),
      create: async () => { creates++; throw new Error("partial setup"); },
      chooseParent: async () => { picks++; return undefined; },
    });
    await app.commands.run("projects.new");
    await app.commands.run("projects.newname", { value: "Book" });
    for (let i = 0; i < 3; i++) await app.commands.run("projects.newNext");
    await app.commands.run("projects.newCreate");
    expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ open: true, name: "Book", error: en["project.new.failed"], recoveryAction: en["project.new.change"] });
    await app.commands.run("projects.newRecover");
    expect(creates).toBe(1); expect(picks).toBe(1);
  });

    it("streams only the active creation's actual steps and keeps a completed receipt when Cancel arrives before Open", async () => {
      let progress!: (value: ProjectCreateProgress) => void, finish!: (folder: string) => void, active = "";
      const create = vi.fn(async (input: { request?: string }) => {
        active = input.request!;
        return new Promise<string>(resolve => { finish = resolve; });
      });
      const open = vi.fn(async () => {});
      const cancelCreate = vi.fn(async () => {});
      const app = appWith({
        parent: async () => "C:\\Projects", check: async () => ({ folder: book.folder, problem: "" }),
        create, open, cancelCreate, onCreateProgress: listener => { progress = listener; return () => {}; },
      });
      await app.commands.run("projects.new");
      await app.commands.run("projects.newname", { value: "Book" });
      for (let i = 0; i < 3; i++) await app.commands.run("projects.newNext");
      vi.useFakeTimers();
      const measure = vi.spyOn(performance, "measure");
      const operation = app.commands.run("projects.newCreate");
      await vi.advanceTimersByTimeAsync(0);
      expect(active).not.toBe("");
      const steps = ["check", "folder", "profile"] as const;
      progress({ request: active, steps: [...steps], step: "check", done: true });
      progress({ request: active, steps: [...steps], step: "folder", done: false });
      progress({ request: "obsolete", steps: ["check"], step: "check", done: true });
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({
        progress: 25, progressLabel: "1 of 4 steps completed",
        parts: [{ id: "check", tone: "success" }, { id: "folder", busy: true }, { id: "profile", busy: false }, { id: "open", busy: false }],
      });
      await vi.advanceTimersByTimeAsync(2999);
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ elapsed: "" });
      await vi.advanceTimersByTimeAsync(1);
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ elapsed: expect.stringContaining("3") });
      const announced = app.store.state.announcement.n;
      await app.commands.run("projects.newname", { value: "Changed while creating" });
      await app.commands.run("projects.newCreate");
      await app.commands.run("projects.newCancel");
      expect(cancelCreate).toHaveBeenCalledExactlyOnceWith(active);
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ name: "Book", pending: true, cancelLabel: en["project.new.stopping"], cancelReason: en["project.new.stopping"], nextReason: en["project.new.creating"], cannotCancel: true });
      finish(book.folder); await operation;
      expect(app.store.state.announcement.n).toBe(announced);
      expect(open).not.toHaveBeenCalled();
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ pending: false, created: book.folder, cancelled: true, error: en["project.new.cancelledReady"], recoveryAction: "Retry" });
      progress({ request: active, steps: ["check"], step: "check", done: false });
      await app.commands.run("projects.newRecover");
      expect(create).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledExactlyOnceWith(book.folder);
      expect(measure).toHaveBeenCalledWith("fn:project.create", expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }));
      measure.mockRestore();
    });

    it("explains pending validation, atomic creation and final Open without asking for another name", async () => {
      let checked!: () => void, created!: (folder: string) => void, opened!: () => void, holdCheck = true;
      const app = appWith({
        parent: async () => "C:\\Projects",
        check: async () => { if (holdCheck) await new Promise<void>(resolve => { checked = resolve; }); return { folder: book.folder, problem: "" }; },
        create: async () => new Promise<string>(resolve => { created = resolve; }),
        open: async () => new Promise<void>(resolve => { opened = resolve; }),
      });
      await app.commands.run("projects.new");
      const next = app.commands.run("projects.newname", { value: "Book" });
      await expect.poll(() => checked).toBeTypeOf("function");
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ pending: true, nextReason: en["project.new.checking"] });
      holdCheck = false; checked(); await next;
      for (let i = 0; i < 3; i++) await app.commands.run("projects.newNext");
      const create = app.commands.run("projects.newCreate");
      await expect.poll(() => created).toBeTypeOf("function");
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ cannotCancel: true, cancelReason: en["project.new.finishingStep"], nextReason: en["project.new.creating"] });
      created(book.folder);
      await expect.poll(() => opened).toBeTypeOf("function");
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ cannotCancel: true, cancelReason: en["project.new.finishingOpen"] });
      opened(); await create;
    });

    it("keeps a cancelled partial creation and offers a different location, never replaying Create", async () => {
      let refuse!: (error: Error) => void;
      const create = vi.fn(async () => new Promise<string>((_resolve, reject) => { refuse = reject; }));
      const chooseParent = vi.fn(async () => undefined);
      const app = appWith({
        parent: async () => "C:\\Projects", check: async () => ({ folder: book.folder, problem: "" }),
        create, chooseParent, cancelCreate: async () => {},
      });
      await app.commands.run("projects.new");
      await app.commands.run("projects.newname", { value: "Book" });
      for (let i = 0; i < 3; i++) await app.commands.run("projects.newNext");
      const operation = app.commands.run("projects.newCreate");
      await expect.poll(() => refuse).toBeTypeOf("function");
      await app.commands.run("projects.newCancel");
      refuse(new Error("sensitive partial path")); await operation;
      expect(app.viewModels.select("vm.projectNew", app.store.state)).toMatchObject({ name: "Book", pending: false, cancelled: true, error: en["project.new.cancelledPartial"], recoveryAction: en["project.new.change"] });
      await app.commands.run("projects.newCreate");
      await app.commands.run("projects.newRecover");
      expect(create).toHaveBeenCalledTimes(1);
      expect(chooseParent).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(app.viewModels.select("vm.projectNew", app.store.state))).not.toContain("sensitive");
    });
  it("retries a failed list in place, keeping the query, previous entries and error while only Retry is pending", async () => {
    let reads = 0, release!: (entries: ProjectEntry[]) => void;
    const app = appWith({ list: async () => {
      reads++;
      if (reads === 2) throw new Error("sensitive diagnostic must stay hidden readOnly");
      if (reads === 3) return new Promise<ProjectEntry[]>(resolve => { release = resolve; });
      return [book];
    } });
    await app.commands.run("projects.open");
    await app.commands.run("projects.query", { value: "Book" });
    await app.commands.run("projects.refresh");
    const error = vm(app).error;
    expect(vm(app)).toMatchObject({ error: en["project.open.listFailed"], details: en["project.open.details.readOnly"], recoveryAction: "Retry" });
    expect(JSON.stringify(vm(app))).not.toContain("sensitive diagnostic");
    const retry = app.commands.run("projects.retry");
    await Promise.resolve();
    expect(vm(app)).toMatchObject({ error, query: "Book", retrying: true, entriesWaiting: false });
    expect(vm(app).entries).toHaveLength(1);
    expect(app.commands.describe("projects.retry").enabled).toBe(false);
    release([book]); await retry;
    expect(vm(app)).toMatchObject({ error: "", details: "", query: "Book", retrying: false, recoveryAction: "", searchFocus: 1 });
    expect(vm(app).entries).toHaveLength(1);
  });

  it("shows a pin's own commit feedback: pending at once, confirmed with the new icon, then rest; a refused pin fails with Retry in Open", async () => {
    vi.useFakeTimers();
    let pinned = false, refuse = false, finish!: () => void;
    const app = appWith({
      list: async () => [{ ...book, pinned }],
      pin: () => new Promise<void>((resolve, reject) => { finish = () => { if (refuse) reject(new Error("readOnly")); else { pinned = !pinned; resolve(); } }; }),
    });
    await app.commands.run("projects.open");
    const entry = () => (vm(app).entries as { pinned?: boolean; pinCommit: string }[])[0]!;
    expect(entry().pinCommit).toBe("rest");
    const run = app.commands.run("projects.pin", { id: book.folder });
    await vi.waitFor(() => expect(entry().pinCommit).toBe("pending"));
    await app.commands.run("projects.pin", { id: book.folder });
    finish();
    await vi.waitFor(() => expect(entry().pinned).toBe(true));
    expect(entry().pinCommit).toBe("pending");
    await vi.advanceTimersByTimeAsync(200); await run;
    expect(entry()).toMatchObject({ pinned: true, pinCommit: "confirmed" });
    await vi.advanceTimersByTimeAsync(200);
    expect(entry().pinCommit).toBe("rest");

    refuse = true;
    const refused = app.commands.run("projects.pin", { id: book.folder });
    await vi.waitFor(() => expect(entry().pinCommit).toBe("pending"));
    finish();
    await vi.advanceTimersByTimeAsync(200); await refused;
    expect(entry()).toMatchObject({ pinned: true, pinCommit: "failed" });
    expect(vm(app)).toMatchObject({ error: en["project.open.pinFailed"], recoveryAction: "Retry" });
    refuse = false;
    const retry = app.commands.run("projects.retry");
    await vi.waitFor(() => expect(entry().pinCommit).toBe("pending"));
    finish();
    await vi.advanceTimersByTimeAsync(200); await retry;
    expect(entry()).toMatchObject({ pinned: false, pinCommit: "confirmed" });
    expect(vm(app).error).toBe("");
  });

  it("refreshes after a successful pin instead of repeating its toggle when only the following list failed", async () => {
    let reads = 0, pins = 0;
    const app = appWith({
      pin: async () => { pins++; },
      list: async () => { if (++reads === 2) throw new Error("list refused"); return [{ ...book, pinned: pins > 0 }]; },
    });
    await app.commands.run("projects.open");
    await app.commands.run("projects.pin", { id: book.folder });
    expect(pins).toBe(1);
    expect(vm(app).error).toBe(en["project.open.pinRefreshFailed"]);
    await app.commands.run("projects.retry");
    expect(pins).toBe(1);
    expect(vm(app)).toMatchObject({ error: "", entries: [expect.objectContaining({ pinned: true })] });
  });

  it("retries a refused pin with the original project and note, then keeps the acknowledged pin", async () => {
    const attempts: [string, string | undefined][] = [];
    const app = appWith({
      list: async () => [book],
      pin: async (folder, path) => { attempts.push([folder, path]); if (attempts.length === 1) throw new Error("readOnly"); },
    });
    await app.commands.run("projects.open");
    const id = `${book.folder}|${book.folder}\\notes\\draft.md`;
    await app.commands.run("projects.pin", { id });
    expect(vm(app).error).toBe(en["project.open.pinFailed"]);
    await app.commands.run("projects.query", { value: "Something else" });
    await app.commands.run("projects.retry");
    expect(attempts).toEqual([[book.folder, `${book.folder}\\notes\\draft.md`], [book.folder, `${book.folder}\\notes\\draft.md`]]);
    expect(vm(app).error).toBe("");
  });

  it("retries the same failed open target without changing or losing the current note", async () => {
    const opened: [string, string | undefined][] = [];
    const app = appWith({
      list: async () => [{ ...book, lastNote: `${book.folder}\\notes\\book.md` }],
      open: async (folder, path) => { opened.push([folder, path]); if (opened.length === 1) throw new Error("notFound"); },
    });
    await app.commands.run("projects.open");
    const before = app.store.state.note;
    await app.commands.run("projects.launch", { id: `${book.folder}|note` });
    expect(vm(app)).toMatchObject({ open: true, recoveryAction: "Retry", details: en["project.open.details.notFound"] });
    expect(app.store.state.note).toEqual(before);
    await app.commands.run("projects.retry");
    expect(opened).toEqual([[book.folder, `${book.folder}\\notes\\book.md`], [book.folder, `${book.folder}\\notes\\book.md`]]);
    expect(app.store.state.note).toEqual(before);
    expect(vm(app).open).toBe(false);
  });

  it("does not accept an obsolete list after Open closes and a newer request replaces it", async () => {
    let finish!: (entries: ProjectEntry[]) => void, reads = 0;
    const app = appWith({ list: async () => ++reads === 1 ? new Promise<ProjectEntry[]>(resolve => { finish = resolve; }) : [book] });
    const old = app.commands.run("projects.open");
    await Promise.resolve();
    await app.commands.run("projects.close");
    await app.commands.run("projects.open");
    finish([{ ...book, name: "Old response" }]); await old;
    expect(vm(app).entries).toEqual([expect.objectContaining({ name: "Book" })]);
  });

  it("does not let an old launch close a newly reopened Open surface", async () => {
    let finish!: () => void;
    const app = appWith({ list: async () => [book], open: () => new Promise<void>(resolve => { finish = resolve; }) });
    await app.commands.run("projects.open");
    const old = app.commands.run("projects.launch", { id: book.folder });
    await expect.poll(() => Boolean(finish)).toBe(true);
    await app.commands.run("projects.close");
    await app.commands.run("projects.open");
    finish(); await old;
    expect(vm(app)).toMatchObject({ open: true, entries: [expect.objectContaining({ name: "Book" })] });
    expect(app.commands.describe("projects.launch").enabled).toBe(true);
  });

  it("does not let a late post-pin list replace a newer read or its recovery", async () => {
    let reads = 0, reject!: (error: Error) => void;
    const app = appWith({
      pin: async () => {},
      list: async () => ++reads === 2 ? new Promise<ProjectEntry[]>((_resolve, fail) => { reject = fail; }) : [{ ...book, name: reads === 1 ? "Book" : "Latest" }],
    });
    await app.commands.run("projects.open");
    const old = app.commands.run("projects.pin", { id: book.folder });
    await expect.poll(() => Boolean(reject)).toBe(true);
    await app.commands.run("projects.refresh");
    reject(new Error("obsolete failure")); await old;
    expect(vm(app)).toMatchObject({ open: true, error: "", entries: [expect.objectContaining({ name: "Latest" })] });
  });

  it("clears the old recovery when a different picker is cancelled, without opening or changing notes", async () => {
    const app = appWith({
      list: async () => { throw new Error("readOnly"); },
      choose: async () => undefined,
      open: async () => { throw new Error("Cancelled picker must not open"); },
    });
    await app.commands.run("projects.open");
    expect(vm(app).recoveryAction).toBe("Retry");
    await app.commands.run("projects.choose");
    expect(vm(app)).toMatchObject({ error: "", recoveryAction: "", open: true });
    expect(app.commands.describe("projects.retry").enabled).toBe(false);
  });

  it("distinguishes first use from a filtered result and clears the query without opening another project", async () => {
    const app = appWith({ list: async () => [book] });
    await app.commands.run("projects.open");
    expect(app.viewModels.select("vm.projects", app.store.state)).toMatchObject({ emptyTitle: "No projects yet", emptyAction: "Open project" });
    await app.commands.run("projects.query", { value: "No matching project" });
    expect(app.viewModels.select("vm.projects", app.store.state)).toMatchObject({ entries: [], emptyTitle: "No matches", emptyAction: "Clear search" });
    await app.commands.run("projects.emptyAction");
    expect(app.viewModels.select("vm.projects", app.store.state)).toMatchObject({ query: "", entries: [expect.objectContaining({ name: "Book" })] });
  });
  it("shows a project's folder through the bridge", async () => {
    const shown: string[] = [];
    const app = appWith({ list: async () => [book], reveal: async (folder: string) => { shown.push(folder); } });
    await app.commands.run("projects.reveal", { id: "C:\\Book" });
    expect(shown).toEqual(["C:\\Book"]);
    expect(vm(app).error).toBe("");
  });
  it("says so when the folder can't be shown, and keeps the list", async () => {
    const app = appWith({ list: async () => [book], reveal: async () => { throw new Error("gone"); } });
    await app.commands.run("projects.open");
    await app.commands.run("projects.reveal", { id: "C:\\Book" });
    expect(vm(app).error).toBe(en["project.open.revealFailed"]);
    expect(vm(app).entries).toHaveLength(1);
  });
  it("reveals first-load shapes at exactly 300 ms, holds 500 ms and records the actual list wait", async () => {
    vi.useFakeTimers();
    const measure = vi.spyOn(performance, "measure");
    let done!: (e: ProjectEntry[]) => void;
    const app = appWith({ list: () => new Promise<ProjectEntry[]>((r) => { done = r; }) });
    const opening = app.commands.run("projects.open");
    await Promise.resolve();
    expect(vm(app).entriesWaiting).toBe(false);
    await vi.advanceTimersByTimeAsync(299);
    expect(vm(app).entriesWaiting).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(vm(app).entriesWaiting).toBe(true);
    done([book]);
    await vi.advanceTimersByTimeAsync(499);
    expect(vm(app).entries).toHaveLength(0);
    expect(vm(app).entriesWaiting).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await opening;
    expect(vm(app).entriesWaiting).toBe(false);
    expect(vm(app).entries).toHaveLength(1);
    expect(measure).toHaveBeenCalledWith("fn:project.list", { start: 0, end: 800 });
    measure.mockRestore();
  });
  it("does not flash first-use content while a fast list loads", async () => {
    const app = appWith({ list: async () => [book] });
    const opening = app.commands.run("projects.open");
    expect(vm(app)).toMatchObject({ entriesWaiting: false, recentWaiting: false });
    await opening;
    expect(vm(app).entries).toHaveLength(1);
  });
});
