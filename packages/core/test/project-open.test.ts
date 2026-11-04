/** Open (owner, 4 November): a project's folder path shows the folder, and a first load shows placeholders, not "empty". */
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import { createApp, type PlatformBridge, type ProjectEntry } from "../src/index.ts";

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
    let creates = 0, opens = 0, finish!: () => void;
    const app = appWith({
      parent: async () => "C:\\Projects",
      check: async (_parent, name) => ({ folder: `C:\\Projects\\${name}`, problem: "" }),
      create: async () => { creates++; return book.folder; },
      open: async () => { if (++opens === 1) throw new Error("notFound"); await new Promise<void>(resolve => { finish = resolve; }); },
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
    finish(); await retry;
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
