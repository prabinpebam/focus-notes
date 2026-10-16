/**
 * FIL-13 (D-175): Note history. The open note's versions from Git, newest first and grouped by day,
 * with their author (an agent's labeled); a chosen version shows block by block against the note
 * now; Restore this version saves its text as a new version, and the toast's Undo puts back the text
 * it replaced. The log that lists versions follows renames and is parsed without Git here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, isVersionFile, NOTE_HISTORY_PAGE, parseVersionLog, VERSION_LOG_ARGS, type NoteVersion, type PlatformBridge, type SyncReport } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const NOTE = `${PRIV}/welcome.md`;
const T0 = new Date(2026, 9, 16, 14, 2).getTime();
const H = 3_600_000;

describe("the version log (FIL-13)", () => {
  it("follows renames, and the note's path comes after -- so it's never an option", () => {
    const args = VERSION_LOG_ARGS("notes/-x.md");
    expect(args).toContain("--follow");
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe("notes/-x.md");
    // The next page starts at a commit already listed, before the --.
    const next = VERSION_LOG_ARGS("notes/a.md", { from: "abc1234", limit: 51 });
    expect(next.slice(-3)).toEqual(["abc1234", "--", "notes/a.md"]);
    expect(next).toContain("-n51");
  });
  it("reads only a Markdown file's path in the repository", () => {
    expect(isVersionFile("notes/a b.md")).toBe(true);
    for (const bad of ["../a.md", "notes/../../a.md", "-a.md", "/a.md", "notes/a.txt", "a\\b.md", "c:a.md", 3]) expect(isVersionFile(bad)).toBe(false);
  });
  it("parses each commit with its time, author, message, and the note's path then", () => {
    const out = "\x01aaaaaaa1\x1f1792142341\x1fAnn\x1fAgent edit: notes/b.md\n\nFocus-Notes-Agent: Claude\n\x02\0\nnotes/b.md\0"
      + "\x01bbbbbbb2\x1f1792142340\x1fAnn Lee\x1fRename\n\x02\0\nnotes/b.md\0"
      + "\x01ccccccc3\x1f1792142000\x1fBo\x1fSave a\n\x02\0\nnotes/a.md\0";
    expect(parseVersionLog(out)).toEqual([
      { commit: "aaaaaaa1", at: 1792142341000, author: "Ann", message: "Agent edit: notes/b.md\n\nFocus-Notes-Agent: Claude", path: "notes/b.md" },
      { commit: "bbbbbbb2", at: 1792142340000, author: "Ann Lee", message: "Rename", path: "notes/b.md" },
      { commit: "ccccccc3", at: 1792142000000, author: "Bo", message: "Save a", path: "notes/a.md" },
    ]);
  });
  it("skips what isn't a commit", () => {
    expect(parseVersionLog("")).toEqual([]);
    expect(parseVersionLog("\x01not-a-sha\x1f1\x1fA\x1fm\x02\0notes/a.md\0")).toEqual([]);
  });
});

function setup(o: { git?: boolean; versions?: NoteVersion[]; texts?: Record<string, string>; failVersions?: boolean } = {}) {
  const pages: { from?: { commit: string; file: string }; limit: number }[] = [];
  const files: Record<string, string> = { [NOTE]: "# Welcome\n\nNow.\n" };
  const writes: string[] = [];
  const asked: string[] = [];
  const report: SyncReport = { git: o.git ?? true, state: "idle", waiting: 0 };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => files[p] ?? "", writeNote: async (p, c) => { files[p] = c; writes.push(c); }, chooseNote: async () => undefined,
    newNotePath: async () => `${PRIV}/untitled.md`, defaultNotePath: async () => NOTE,
    loadAppState: async () => ({ version: 1, firstRun: "done" }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    sync: { now: async () => report, status: async () => report, onStatus: () => () => {} },
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({ folder: "/w", roots: [{ id: "private", path: PRIV, readOnly: false }], entries: [{ path: NOTE, kind: "note", title: "Welcome" }] }),
      writeFormat: async () => {}, renameNote: async () => {}, apply: async () => {},
      versions: async (p, page) => {
        asked.push(p);
        if (page) pages.push(page);
        if (o.failVersions) throw new Error("git");
        const all = o.versions ?? [];
        const start = page?.from ? all.findIndex((v) => v.commit === page.from!.commit) : 0;
        return all.slice(Math.max(0, start), Math.max(0, start) + (page?.limit ?? all.length));
      },
      version: async (_p, commit, file) => (file.endsWith(".md") ? o.texts?.[commit] : undefined),
    },
  };
  return { bridge, files, writes, asked, pages };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  return app;
}
type Item = { id: string; label: string; description?: string; state?: string; header?: boolean };
type HistoryVm = { open: boolean; status: string; items: Item[]; activeId: string; showing: boolean; versionLabel: string; blocks: { text: string; changed: boolean }[]; canRestore: boolean; more: boolean };
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.history", app.store.state) as HistoryVm;

const VERSIONS: NoteVersion[] = [
  { commit: "c0ffee3", at: T0, author: "Claude", agent: "Claude", file: "notes/welcome.md" },
  { commit: "c0ffee2", at: T0 - 2 * H, author: "Ann", file: "notes/welcome.md" },
  { commit: "c0ffee1", at: T0 - 26 * H, author: "Ann", file: "notes/hello.md" },
];
const TEXTS = { c0ffee3: "# Welcome\n\nNow.\n", c0ffee2: "# Welcome\n\nEarlier.\n", c0ffee1: "# Welcome\n\nFirst.\n" };

describe("Note history in the app (FIL-13)", () => {
  it("is offered for a note in a Git workspace, and not without Git", async () => {
    expect((await started(setup())).commands.describe("history.open").enabled).toBe(true);
    expect((await started(setup({ git: false }))).commands.describe("history.open").enabled).toBe(false);
  });

  it("lists the open note's versions newest first, grouped by day, with the agent labeled", async () => {
    const f = setup({ versions: VERSIONS, texts: TEXTS });
    const app = await started(f);
    await app.commands.run("history.open");
    await settle();
    expect(f.asked).toEqual([NOTE]);
    const v = vm(app);
    expect(v.open).toBe(true);
    expect(v.status).toBe("3 saved versions, newest first.");
    const headers = v.items.filter((i) => i.header);
    expect(headers).toHaveLength(2);
    const rows = v.items.filter((i) => !i.header);
    expect(rows.map((r) => r.id)).toEqual(["c0ffee3", "c0ffee2", "c0ffee1"]);
    expect(rows[0]).toMatchObject({ description: "Claude", state: "Agent" });
    expect(rows[1]).toMatchObject({ description: "Ann" });
    expect(rows[1]!.state).toBeUndefined();
    expect(v.activeId).toBe("c0ffee3");
    expect(v.showing).toBe(false);
  });

  it("says when there are no versions, or they couldn't be read", async () => {
    const none = await started(setup());
    await none.commands.run("history.open");
    await settle();
    expect(vm(none).status).toMatch(/^No saved versions yet/);
    const failed = await started(setup({ failVersions: true }));
    await failed.commands.run("history.open");
    await settle();
    expect(vm(failed).status).toBe("Couldn't read this note's history.");
  });

  it("shows a chosen version with the blocks that differ from the note now marked", async () => {
    const app = await started(setup({ versions: VERSIONS, texts: TEXTS }));
    await app.commands.run("history.open");
    await settle();
    await app.commands.run("history.setActive", { id: "c0ffee2" });
    expect(vm(app).activeId).toBe("c0ffee2");
    // Day headings aren't versions.
    await app.commands.run("history.setActive", { id: vm(app).items[0]!.id });
    expect(vm(app).activeId).toBe("c0ffee2");
    await app.commands.run("history.choose", { id: "c0ffee2" });
    await settle();
    const v = vm(app);
    expect(v.showing).toBe(true);
    expect(v.versionLabel).toMatch(/^Viewing the version from /);
    expect(v.blocks.map((b) => [b.text, b.changed])).toEqual([["# Welcome", false], ["Earlier.", true]]);
    expect(v.canRestore).toBe(true);
    await app.commands.run("history.back");
    expect(vm(app).showing).toBe(false);
  });

  it("restores a version as a new save, announced, and Undo puts back the text it replaced", async () => {
    const f = setup({ versions: VERSIONS, texts: TEXTS });
    const app = await started(f);
    await app.commands.run("history.open");
    await settle();
    await app.commands.run("history.choose", { id: "c0ffee1" });
    await settle();
    await app.commands.run("history.restore");
    await settle();
    expect(f.files[NOTE]).toBe("# Welcome\n\nFirst.\n");
    expect(app.store.state.note.markdown).toBe("# Welcome\n\nFirst.\n");
    expect(vm(app).open).toBe(false);
    expect(app.store.state.announcement.text).toMatch(/^Restored the version from /);
    const toast = app.store.state.ui.toasts.at(-1)!;
    expect(toast.action).toMatchObject({ command: "history.undoRestore", label: "Undo" });
    await app.commands.run("history.undoRestore");
    await settle();
    expect(f.files[NOTE]).toBe("# Welcome\n\nNow.\n");
    expect(app.store.state.note.markdown).toBe("# Welcome\n\nNow.\n");
    expect(app.commands.describe("history.undoRestore").enabled).toBe(false);
  });

  it("reads only as the sheet opens, a page at a time; Show older versions reads the next from the oldest one read", async () => {
    const many: NoteVersion[] = Array.from({ length: NOTE_HISTORY_PAGE + 20 }, (_, i) => ({ commit: `aa${String(i).padStart(5, "0")}`, at: T0 - i * H, author: "Ann", file: "notes/welcome.md" }));
    const f = setup({ versions: many });
    const app = await started(f);
    // Nothing is read until Note history opens.
    expect(f.asked).toEqual([]);
    await app.commands.run("history.open");
    await settle();
    expect(f.pages[0]).toEqual({ limit: NOTE_HISTORY_PAGE + 1 });
    expect(vm(app).items.filter((i) => !i.header)).toHaveLength(NOTE_HISTORY_PAGE);
    expect(vm(app).more).toBe(true);
    await app.commands.run("history.more");
    await settle();
    const last = many[NOTE_HISTORY_PAGE - 1]!;
    expect(f.pages[1]).toEqual({ limit: NOTE_HISTORY_PAGE + 2, from: { commit: last.commit, file: last.file } });
    const rows = vm(app).items.filter((i) => !i.header).map((i) => i.id);
    expect(rows).toEqual(many.map((v) => v.commit));
    expect(vm(app).more).toBe(false);
  });

  it("closes with Esc (history.close), forgetting the version shown", async () => {
    const app = await started(setup({ versions: VERSIONS, texts: TEXTS }));
    await app.commands.run("history.open");
    await settle();
    await app.commands.run("history.choose", { id: "c0ffee2" });
    await settle();
    await app.commands.run("history.close");
    expect(vm(app)).toMatchObject({ open: false, showing: false, items: [] });
  });
});
