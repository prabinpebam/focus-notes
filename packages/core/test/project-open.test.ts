/** Open (owner, 4 November): a project's folder path shows the folder, and a first load shows placeholders, not "empty". */
import { describe, expect, it } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import { createApp, type PlatformBridge, type ProjectEntry } from "../src/index.ts";

function appWith(projects: Partial<NonNullable<PlatformBridge["projects"]>>) {
  const bridge = {
    platform: "windows",
    readNote: async () => "",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/Welcome.md",
    loadAppState: async () => ({ version: 1 }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    projects,
  } as unknown as PlatformBridge;
  return createApp(bridge, en);
}
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.projects", app.store.state) as { error: string; details: string; query: string; open: boolean; retrying: boolean; recoveryAction: string; searchFocus: number; recentWaiting: boolean; entriesWaiting: boolean; entries: unknown[] };
const book: ProjectEntry = { folder: "C:\\Book", name: "Book", accent: "teal", logo: "book" } as ProjectEntry;

describe("Open", () => {
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
  it("waits with placeholders on a first load, then shows the list", async () => {
    let done!: (e: ProjectEntry[]) => void;
    const app = appWith({ list: () => new Promise<ProjectEntry[]>((r) => { done = r; }) });
    const opening = app.commands.run("projects.open");
    await Promise.resolve();
    expect(vm(app).entriesWaiting).toBe(true);
    done([book]);
    await opening;
    expect(vm(app).entriesWaiting).toBe(false);
    expect(vm(app).entries).toHaveLength(1);
  });
});
