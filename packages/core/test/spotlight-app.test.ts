/**
 * Spotlight in the app (WP-4.2): opening it by its keys (SPT-01), one ranked list over notes,
 * headings, text, folders, commands, and settings (SPT-02), quick actions that go through Files
 * (SPT-03), live states, the empty field, and no-match actions (SPT-04), modes and prefixes
 * (SPT-05), quick open (FIL-04), and every command reachable with its shortcut (KEY-01).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerKey, CATALOG, createApp, formatChord, titleOfMarkdown, type App, type AppStateFile, type KeyEventLike, type PlatformBridge, type WorkspaceOp,
} from "../src/index.ts";
import { startSearch, type SearchService } from "../src/search/feed.ts";
import { localSearch } from "../src/search/serve.ts";
import type { IndexStatus, SearchHit, SearchQuery } from "../src/search/types.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const PUB = "/w/notes";

/** A desktop over an in-memory workspace with both roots, as in the Files tests. */
function desktop(platform: PlatformBridge["platform"] = "windows", extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    [`${PRIV}/welcome.md`]: "# Welcome\n\n## Getting started\n\nWrite here.\n\n## Scope of the work\n\nSmall steps.\n",
    [`${PUB}/essays/on-focus.md`]: "# On focus\n\n## Deep work\n\nOne line at a time.\n",
    [`${PRIV}/journal/focus-sessions.md`]: "# Focus sessions\n\nMorning blocks.\n",
    [`${PRIV}/ideas.md`]: "# Ideas\n\nKeep a foc list of things to try.\n",
    ...extra,
  };
  const folders = new Set([`${PUB}/essays`, `${PRIV}/journal`]);
  let state: AppStateFile = { version: 1, lastNotePath: `${PRIV}/welcome.md` };
  const batches: WorkspaceOp[][] = [];
  const copied: string[] = [];
  const under = (base: string, p: string) => p === base || p.startsWith(`${base}/`);
  const bridge: PlatformBridge = {
    platform,
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: checkingDisk(files).writeNote,
    chooseNote: async () => undefined,
    newNotePath: async (near) => {
      const dir = near ? near.slice(0, near.lastIndexOf("/")) : PRIV;
      for (let i = 1; ; i++) { const p = `${dir}/untitled${i > 1 ? `-${i}` : ""}.md`; if (!(p in files)) return p; }
    },
    defaultNotePath: async () => `${PRIV}/welcome.md`,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    copyText: async (t) => { copied.push(t); },
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "/w",
        roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
        entries: [
          ...[...folders].map((path) => ({ path, kind: "folder" as const })),
          ...Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" })),
        ],
      }),
      writeFormat: async () => {},
      renameNote: async (from, to) => { files[to] = files[from]!; delete files[from]; },
      apply: async (ops) => {
        batches.push(ops);
        for (const op of ops) {
          if (op.op === "move") {
            for (const p of Object.keys(files)) if (under(op.from, p)) { files[op.to + p.slice(op.from.length)] = files[p]!; delete files[p]; }
          } else if (op.op === "write") checkingDisk(files).writeOp(op);
          else if (op.op === "delete") for (const p of Object.keys(files)) if (under(op.path, p)) delete files[p];
        }
      },
    },
  };
  return { bridge, files, batches, copied };
}

const running: SearchService[] = [];
afterEach(() => { for (const s of running.splice(0)) s.stop(); });
async function started(d = desktop(), opts: { search?: boolean } = {}) {
  const app = createApp(d.bridge, messages);
  await app.start();
  await vi.waitFor(() => expect(app.store.state.workspace.tree.roots.length).toBe(2));
  if (opts.search !== false) {
    const search = startSearch(app, localSearch());
    running.push(search);
    app.useSearch(search);
    await search.whenIndexed();
  }
  return { app, ...d };
}
const sp = (app: App) => app.store.state.ui.spotlight;
type Item = { id: string; label: string; icon?: string; header?: boolean; state?: string; shortcut?: string; description?: string; disabled?: boolean; highlights: number[][] };
type Vm = { open: boolean; mode: string; query: string; activeId: string; summary: string; status: string; actionsTitle: string; items: Item[] };
/** The view model as ResultList shows it: header items head the groups after them. */
const rawVm = (app: App) => app.viewModels.select("vm.spotlight", app.store.state) as Vm;
/** The same, its results only, each with the label of the group it's in. */
const vm = (app: App) => {
  const raw = rawVm(app);
  let group = "";
  return { ...raw, items: raw.items.flatMap((i) => (i.header ? ((group = i.label), []) : [{ ...i, group }])) };
};
/** Types into the field and waits for the answers, full text included. */
async function type(app: App, value: string) {
  await app.commands.run("spotlight.setQuery", { value });
  await vi.waitFor(() => expect(sp(app)).toMatchObject({ busy: false, answered: answerKey(sp(app)) }));
}
const key = (key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const labels = (app: App) => vm(app).items.map((i) => `${i.group}: ${i.label}`);

describe("SPT-01: Mod+/ opens Spotlight from anywhere; Mod+Shift+P too, on every layout (D-16)", () => {
  it("finds the caret AI action through the search index when no text is selected", async () => {
    const { app } = await started();
    await app.commands.run("format.setState", { selection: false, toolbar: false });
    await app.commands.run("spotlight.open");
    await type(app, "write with ai");
    expect(vm(app).items.some((i) => i.label === "Write with AI…")).toBe(true);
  });
  it("finds the GitHub project opener by its full label through the search index", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "Open a project from GitHub");
    expect(vm(app).items.some((i) => i.label === "Open a project from GitHub…")).toBe(true);
  });
  it("replaces an automatic Create selection when an action becomes runnable on an index refresh", async () => {
    const { app } = await started(desktop(), { search: false });
    const search = startSearch(app, localSearch());
    running.push(search);
    const listeners: ((s: IndexStatus) => void)[] = [];
    const onStatus = search.onStatus.bind(search);
    vi.spyOn(search, "onStatus").mockImplementation((listener) => {
      listeners.push(listener);
      return onStatus(listener);
    });
    app.useSearch(search);
    await search.whenIndexed();
    let enabled = false;
    const describe = app.commands.describe.bind(app.commands);
    vi.spyOn(app.commands, "describe").mockImplementation((id) => id === "focus.toggle" ? { ...describe(id), enabled } : describe(id));
    await app.commands.run("spotlight.open");
    await type(app, "focus mode");
    expect(vm(app).items.find((i) => i.id === sp(app).activeId)?.label).toContain("Create note");
    enabled = true;
    const status = search.status();
    for (const listener of listeners) listener({ ...status, notes: status.notes + 1, indexed: status.indexed + 1 });
    await vi.waitFor(() => expect(vm(app).items.find((i) => i.id === sp(app).activeId)?.label).toBe("Focus mode"));
    const before = app.store.state.focusMode;
    await app.commands.run("spotlight.run");
    expect(app.store.state.focusMode).not.toBe(before);
  });
  it("replaces an automatic Create selection when availability changes without an index update", async () => {
    const { app } = await started();
    let enabled = false;
    const describe = app.commands.describe.bind(app.commands);
    vi.spyOn(app.commands, "describe").mockImplementation((id) => id === "focus.toggle" ? { ...describe(id), enabled } : describe(id));
    await app.commands.run("spotlight.open");
    await type(app, "focus mode");
    expect(vm(app).items.find((i) => i.id === sp(app).activeId)?.label).toContain("Create note");
    enabled = true;
    app.store.update((s) => ({ ...s }));
    expect(vm(app).items.find((i) => i.id === sp(app).activeId)?.label).toBe("Focus mode");
    const before = app.store.state.focusMode;
    await app.commands.run("spotlight.run");
    expect(app.store.state.focusMode).not.toBe(before);
  });
  it("keeps a deliberately selected Create row when another action becomes runnable", async () => {
    const { app } = await started();
    let enabled = false;
    const describe = app.commands.describe.bind(app.commands);
    vi.spyOn(app.commands, "describe").mockImplementation((id) => id === "focus.toggle" ? { ...describe(id), enabled } : describe(id));
    await app.commands.run("spotlight.open");
    await type(app, "focus mode");
    const chosen = sp(app).activeId;
    await app.commands.run("spotlight.setActive", { id: chosen });
    enabled = true;
    app.store.update((s) => ({ ...s }));
    expect(sp(app).activeId).toBe(chosen);
  });
  it("binds Mod+/ to All and Mod+Shift+P to commands, on every platform; Mod+K stays the link key", async () => {
    for (const platform of ["windows", "linux", "macos", "web"] as const) {
      const { app } = await started(desktop(platform), { search: false });
      const mod = platform === "macos" ? { metaKey: true } : { ctrlKey: true };
      expect(app.commands.match(key("/", { ...mod, code: "Slash" }))).toBe("spotlight.open");
      expect(app.commands.match(key("P", { ...mod, shiftKey: true, code: "KeyP" }))).toBe("spotlight.commands");
      // A layout whose P types another letter still has it, by the physical key.
      expect(app.commands.match(key("з", { ...mod, shiftKey: true, code: "KeyP" }))).toBe("spotlight.commands");
      expect(app.commands.match(key("p", { ...mod, code: "KeyP" }))).toBe("spotlight.quickOpen");
      expect(app.commands.match(key("O", { ...mod, shiftKey: true, code: "KeyO" }))).toBe("spotlight.headings");
      // Mod+K is never Spotlight's from the note: it's the link key.
      expect(app.commands.match(key("k", mod))).toBe("link.edit");
    }
  });

  it("names its keys in the footer as each system writes them (D-194)", async () => {
    const hints = async (platform: "windows" | "linux" | "macos") => {
      const { app } = await started(desktop(platform), { search: false });
      await app.commands.run("spotlight.open");
      return (vm(app) as unknown as { hints: string }).hints;
    };
    expect(await hints("windows")).toBe("Enter to open or run · Ctrl+Enter for the alternative · Ctrl+K for more actions · Esc to close");
    expect(await hints("linux")).toBe(await hints("windows"));
    expect(await hints("macos")).toBe("↩ to open or run · ⌘↩ for the alternative · ⌘K for more actions · Esc to close");
  });

  it("opens in All with the field focused, from the toolbar's Search too", async () => {
    const { app } = await started();
    expect(app.commands.describe("spotlight.open")).toMatchObject({ enabled: true, shortcut: "Mod+/" });
    await app.commands.run("command.run", { id: "spotlight.open" });
    expect(sp(app)).toMatchObject({ open: true, mode: "all", query: "" });
    expect(sp(app).focus).toBeGreaterThan(0);
    expect(vm(app)).toMatchObject({ open: true, mode: "All" });
    await app.commands.run("spotlight.setOpen", { open: false });
    expect(vm(app).open).toBe(false);
  });
});

describe("SPT-02: one ranked list of notes, headings, text, folders, commands, and settings", () => {
  it("“foc” finds a command with its state, notes, a folder-free text match, and create and find", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "foc");
    const items = vm(app).items;
    expect(items[0]).toMatchObject({ group: "Top hit" });
    const focus = items.find((i) => i.label === "Focus mode");
    expect(focus).toMatchObject({ state: "On", shortcut: formatChord("Mod+Shift+D", "windows") });
    expect(labels(app)).toEqual(expect.arrayContaining(["Files: On focus", "Files: Ideas"]));
    // One Focus mode, in App (or as the top hit): no second row for the setting (ACT-07).
    expect(labels(app).filter((l) => l.endsWith(": Focus mode"))).toHaveLength(1);
    expect(["App: Focus mode", "Top hit: Focus mode"]).toContain(labels(app).find((l) => l.endsWith(": Focus mode")));
    expect(labels(app)).toContain(items[0]!.label === "Focus sessions" ? "Top hit: Focus sessions" : "Files: Focus sessions");
    const ideas = items.find((i) => i.label === "Ideas")!;
    expect(ideas.description).toContain("foc");
    expect(items.slice(-2).map((i) => i.label)).toEqual(["Create note “foc”", "Find “foc” in all notes"]);
    // The top hit is selected, so Enter does the most likely thing.
    expect(vm(app).activeId).toBe(items[0]!.id);
    expect(items[0]!.highlights.length).toBeGreaterThan(0);
    expect(vm(app).summary).toMatch(/results$/);
    // Each group is headed once, by a header item with its label, before its first result.
    const raw = rawVm(app).items;
    expect(raw[0]).toMatchObject({ header: true, label: "Top hit" });
    const headers = raw.filter((i) => i.header).map((i) => i.label);
    expect(new Set(headers).size).toBe(headers.length);
    expect(headers).toEqual(expect.arrayContaining(["Files", "Actions"]));
    expect(raw.filter((i) => i.header).every((i) => !i.highlights?.length && !i.disabled)).toBe(true);
  });

  it("finds headings in every note and folders by name, and shows a note's path and who can see it", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "deep work");
    const heading = vm(app).items.find((i) => i.label === "On focus")!;
    expect(heading.description).toBe("Deep work");
    expect(sp(app).rows.find((r) => r.id === heading.id)).toMatchObject({ kind: "note", targetHeading: { index: 1, text: "Deep work" } });
    expect(vm(app).items.some((i) => i.label === "Deep work")).toBe(false);
    await type(app, "essays");
    expect(vm(app).items.find((i) => i.label === "essays")).toMatchObject({ icon: "folder", description: "essays" });
    await type(app, "on focus");
    expect(vm(app).items.find((i) => i.label === "On focus")?.description).toBe("essays/on-focus.md · Public");
  });
  it("ACT-04: heading matches open their file at the heading, once per file; body matches open Find", async () => {
    const { app } = await started();
    const actions: [string, Record<string, unknown> | undefined][] = [];
    app.onEditorAction((id, args) => { actions.push([id, args]); });
    await app.commands.run("spotlight.open");
    await type(app, "deep work");
    expect(sp(app).rows.filter((r) => r.path === `${PUB}/essays/on-focus.md`)).toHaveLength(1);
    await app.commands.run("spotlight.run");
    await vi.waitFor(() => expect(app.store.state.note).toMatchObject({ status: "ready", path: `${PUB}/essays/on-focus.md` }));
    await app.commands.run("app.ready");
    await vi.waitFor(() => expect(actions).toContainEqual(["editor.goToHeading", { index: 1, text: "Deep work" }]));
    await app.commands.run("spotlight.open");
    await type(app, "morning");
    expect(vm(app).items[0]?.label).toBe("Focus sessions");
    await app.commands.run("spotlight.run");
    await vi.waitFor(() => expect(app.store.state.note).toMatchObject({ status: "ready", path: `${PRIV}/journal/focus-sessions.md` }));
    await app.commands.run("app.ready");
    await vi.waitFor(() => expect(app.store.state.ui.find).toMatchObject({ open: true, query: "morning" }));
  });
  it("ACT-04: a moved result is removed without closing Actions or losing the query", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "ideas");
    const row = sp(app).rows.find((r) => r.path === `${PRIV}/ideas.md`)!;
    app.store.update((s) => ({
      ...s, workspace: { ...s.workspace, tree: {
        ...s.workspace.tree,
        roots: s.workspace.tree.roots.map((root) => ({ ...root, children: root.children.filter((node) => node.name !== "ideas.md") })),
      } },
    }));
    await app.commands.run("spotlight.choose", { id: row.id });
    expect(sp(app)).toMatchObject({ open: true, query: "ideas" });
    expect(sp(app).rows.some((r) => r.path === `${PRIV}/ideas.md`)).toBe(false);
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe(messages["actions.contentMissing"]);
  });
});

describe("SPT-04: states, the empty field, and no match", () => {
  it("opens a shell-listed newly unlocked note before the workspace tree catches up", async () => {
    const d = desktop();
    const path = `${PRIV}/unlocked.md`;
    d.bridge.listNotes = async () => [{ path, title: "Unlocked", updated: 1 }];
    const { app } = await started(d);
    d.files[path] = "# Unlocked\n\nAvailable now.\n";
    await app.commands.run("spotlight.quickOpen");
    await vi.waitFor(() => expect(sp(app).rows.some((r) => r.path === path)).toBe(true));
    const row = sp(app).rows.find((r) => r.path === path)!;
    await app.commands.run("spotlight.choose", { id: row.id });
    expect(app.store.state.note).toMatchObject({ path, status: "ready" });
    expect(app.store.state.note.markdown).toContain("Available now.");
  });
  it("SPT-10: dismisses before a command opens and focuses its destination", async () => {
    const app = createApp(desktop().bridge, messages);
    let openDuringRun: boolean | undefined;
    await app.start();
    // Keyboard shortcuts opens the cheat sheet: Actions is already closed when it does.
    app.store.subscribe(() => { if (app.store.state.ui.shortcuts.open && openDuringRun === undefined) openDuringRun = sp(app).open; });
    await app.commands.run("spotlight.commands");
    await type(app, "keyboard shortcuts");
    const row = sp(app).rows.find((r) => r.key === "shortcuts.open")!;
    await app.commands.run("spotlight.setActive", { id: row.id });
    await app.commands.run("spotlight.run");
    expect(openDuringRun).toBe(false);
    expect(sp(app).open).toBe(false);
  });

  it("SPT-10: a failed command retains the query and reports its error", async () => {
    const app = createApp(desktop().bridge, messages);
    await app.start();
    // The action's command refuses (as a shell might): Actions comes back with the query.
    const real = app.commands.run.bind(app.commands);
    const spy = vi.spyOn(app.commands, "run").mockImplementation(async (id, args) => { if (id === "shortcuts.open") throw new Error("refused"); return real(id, args); });
    await app.commands.run("spotlight.commands");
    await type(app, "keyboard shortcuts");
    const row = sp(app).rows.find((r) => r.key === "shortcuts.open")!;
    await app.commands.run("spotlight.setActive", { id: row.id });
    await expect(app.commands.run("spotlight.run")).rejects.toThrow("refused");
    expect(sp(app)).toMatchObject({ open: true, query: "keyboard shortcuts" });
    spy.mockRestore();
  });
  it("SPT-10: Enter dismisses toggles; Shift+Enter retains query and live state", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.commands");
    await type(app, "focus mode");
    const row = vm(app).items.find((i) => i.label === "Focus mode")!;
    await app.commands.run("spotlight.setActive", { id: row.id });
    await app.commands.run("spotlight.run");
    expect(app.store.state.focusMode).toBe(false);
    expect(sp(app).open).toBe(false);
    await app.commands.run("spotlight.commands");
    await type(app, "focus mode");
    expect(app.commands.match(key("Enter", { shiftKey: true }), ["spotlightField"])).toBe("spotlight.runKeep");
    await app.commands.run("spotlight.runKeep");
    expect(app.store.state.focusMode).toBe(true);
    expect(sp(app).open).toBe(true);
    expect(sp(app).query).toBe("focus mode");
    expect(vm(app).items.find((i) => i.id === row.id)?.state).toBe("On");
    expect(sp(app).activeId).toBe(row.id);
    await app.commands.run("spotlight.run");
    expect(app.store.state.focusMode).toBe(false);
    expect(sp(app).open).toBe(false);
    await app.commands.run("spotlight.commands");
    // Appearance is three plain actions, one of them On (D6): Shift+Enter keeps Actions open on it.
    await type(app, "dark appearance");
    const dark = vm(app).items.find((i) => i.label === "Use dark appearance")!;
    await app.commands.run("spotlight.setActive", { id: dark.id });
    await app.commands.run("spotlight.runKeep");
    expect(app.store.state.appearance.mode).toBe("dark");
    expect(sp(app).open).toBe(true);
  });

  it("keeps the active toggle through a pending settings write, then Enter runs it", async () => {
    const d = desktop();
    const { app } = await started(d);
    let release!: () => void;
    const saved = d.bridge.saveAppState!;
    d.bridge.saveAppState = async (value) => { await new Promise<void>((resolve) => { release = resolve; }); await saved(value); };
    await app.commands.run("spotlight.commands");
    await type(app, "focus mode");
    const row = sp(app).activeId;
    const pending = app.commands.run("spotlight.runKeep");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release();
    await pending;
    expect(sp(app).activeId).toBe(row);
    d.bridge.saveAppState = saved;
    await app.commands.run("spotlight.run");
    expect(sp(app).open).toBe(false);
  });

  it("the empty field shows recent notes, then what applies here, a few per group; > lists every action (ACT-06, D-361)", async () => {
    const { app } = await started();
    for (const p of [`${PRIV}/ideas.md`, `${PUB}/essays/on-focus.md`, `${PRIV}/welcome.md`]) await app.commands.run("files.reveal", { path: p }).then(() => app.commands.run("files.openItem"));
    await app.commands.run("spotlight.open");
    const empty = labels(app);
    expect(empty.slice(0, 2)).toEqual(["Recent: On focus", "Recent: Ideas"]);
    expect(vm(app).status).toBe("Type > to browse all actions · ? for help");
    // Then the groups for what's here (no selection: no This selection), at most four each.
    const groups = [...new Set(vm(app).items.slice(2).map((i) => i.group))];
    expect(groups).toEqual(["This note", "This project", "App"]);
    for (const g of groups) expect(vm(app).items.filter((i) => i.group === g).length).toBeLessThanOrEqual(4);
    // The arrow keys reach any of them and Enter runs it.
    const target = vm(app).items.find((i) => i.group === "App" && !i.disabled)!;
    for (let i = 0; i < 20 && sp(app).activeId !== target.id; i++) await app.commands.run("spotlight.next");
    expect(sp(app).activeId).toBe(target.id);
    // `>` lists the whole catalogue, by group.
    await type(app, ">");
    expect(vm(app).items.length).toBeGreaterThan(30);
    expect([...new Set(vm(app).items.map((i) => i.group))]).toEqual(["This selection", "This note", "This project", "App"]);
  });
  it("an open Spotlight's answer follows the index as it reads: a note listed after the query was answered appears", async () => {
    const { app } = await started(desktop(), { search: false });
    let hits: SearchHit[] = [];
    let status: IndexStatus = { notes: 0, indexed: 0, pending: 0, seq: 0 };
    const listeners = new Set<(s: IndexStatus) => void>();
    const service = {
      query: async (q: SearchQuery) => ({ query: q, hits: q.scope === "titles" ? hits : [], ms: 0 }),
      find: async () => { throw new Error("not asked"); },
      status: () => status,
      onStatus: (l: (s: IndexStatus) => void) => { listeners.add(l); return () => listeners.delete(l); },
      setItems: () => {},
      whenIndexed: async () => status,
      stop: () => {},
    } as unknown as SearchService;
    app.useSearch(service);
    await app.commands.run("spotlight.quickOpen");
    await type(app, "reading");
    expect(labels(app)).toEqual(["Actions: Create note “reading”", "Actions: Find “reading” in all notes"]);
    // The note arrives in the index (the browser lists its notes after start).
    hits = [{ kind: "note", key: `${PUB}/reading.md`, label: "Reading list", highlights: [[0, 7]], tier: "prefix", score: 1, path: `${PUB}/reading.md`, rel: "reading.md", root: "public" }];
    status = { notes: 1, indexed: 1, pending: 0, seq: 1 };
    for (const l of listeners) l(status);
    await vi.waitFor(() => expect(labels(app)[0]).toBe("Files: Reading list"));
    expect(vm(app).items.find((i) => i.id === sp(app).activeId)?.label).toBe("Reading list");
    // A row the person moved to stays active as more arrives.
    await app.commands.run("spotlight.next");
    const moved = sp(app).activeId;
    hits = [...hits, { ...hits[0]!, key: `${PUB}/reading-2.md`, label: "Reading log", path: `${PUB}/reading-2.md`, rel: "reading-2.md" }];
    status = { notes: 2, indexed: 2, pending: 0, seq: 2 };
    for (const l of listeners) l(status);
    await vi.waitFor(() => expect(labels(app)).toContain("Files: Reading log"));
    expect(sp(app).activeId).toBe(moved);
    // Nothing new in the index: it isn't asked again.
    const asked = vi.spyOn(service, "query");
    for (const l of listeners) l(status);
    await new Promise((r) => setTimeout(r, 400));
    expect(asked).not.toHaveBeenCalled();
  });

  it("no match offers Create note, which makes a note named after the query, and Find in all notes, which searches for it", async () => {
    const { app, files } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "Zebra crossings");
    expect(vm(app).items.map((i) => [i.label, Boolean(i.disabled)])).toEqual([["Create note “Zebra crossings”", false], ["Find “Zebra crossings” in all notes", false]]);
    await app.commands.run("spotlight.run");
    expect(sp(app).open).toBe(false);
    await vi.waitFor(() => expect(app.store.state.note.path).toBe(`${PRIV}/zebra-crossings.md`));
    expect(files[`${PRIV}/zebra-crossings.md`]).toBe("# Zebra crossings\n\n");

    // Find in all notes (WP-4.3) runs `find.allNotes` with the query: its sheet opens on it, searching.
    await app.commands.run("spotlight.open");
    await type(app, "nothing like this");
    const find = vm(app).items.at(-1)!;
    expect(find.disabled).toBeUndefined();
    await app.commands.run("spotlight.setActive", { id: find.id });
    await app.commands.run("spotlight.run");
    expect(sp(app).open).toBe(false);
    expect(app.store.state.ui.findAll).toMatchObject({ open: true, query: "nothing like this" });
    expect(app.viewModels.select("vm.findAll", app.store.state)).toMatchObject({ open: true, query: "nothing like this" });
  });
});

describe("SPT-05: modes and prefixes", () => {
  it("> runs commands, # goes to a heading in this note, ? is help, Backspace in the empty field returns to All", async () => {
    const { app } = await started();
    const actions: [string, unknown][] = [];
    app.onEditorAction((id, args) => actions.push([id, args]));
    await app.commands.run("spotlight.open");
    await type(app, ">");
    expect(sp(app)).toMatchObject({ mode: "commands", query: "" });
    // The empty actions list is the whole catalogue.
    expect(vm(app).items.length).toBeGreaterThan(30);
    expect(app.commands.match(key("Backspace"), ["spotlightField"])).toBe("spotlight.all");
    await app.commands.run("spotlight.all");
    expect(sp(app).mode).toBe("all");
    // In All with an empty field, Backspace is the field's own.
    expect(app.commands.match(key("Backspace"), ["spotlightField"])).toBeUndefined();

    await type(app, "#scop");
    expect(sp(app)).toMatchObject({ mode: "headings", everywhere: false, query: "scop" });
    expect(labels(app)).toEqual(["Headings: Scope of the work"]);
    await app.commands.run("spotlight.run");
    expect(sp(app).open).toBe(false);
    expect(actions).toContainEqual(["editor.goToHeading", { index: 2, text: "Scope of the work" }]);

    await app.commands.run("spotlight.open");
    await type(app, "?");
    expect(sp(app).mode).toBe("help");
    expect(labels(app)[0]).toBe("Prefixes and filters: > All actions");
  });

  it("a mode's key switches mode and keeps the query; the same key again closes", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "focus");
    await app.commands.run("spotlight.commands");
    expect(sp(app)).toMatchObject({ open: true, mode: "commands", query: "focus" });
    await vi.waitFor(() => expect(sp(app).answered).toBe(answerKey(sp(app))));
    expect(vm(app).items.every((i) => ["This selection", "This note", "This project", "App"].includes(i.group))).toBe(true);
    await app.commands.run("spotlight.commands");
    expect(sp(app).open).toBe(false);
  });

  it("## goes to a heading in another note, opening it first", async () => {
    const { app } = await started();
    const actions: [string, unknown][] = [];
    app.onEditorAction((id, args) => actions.push([id, args]));
    await app.commands.run("spotlight.headings");
    await type(app, "#deep");
    expect(sp(app)).toMatchObject({ mode: "headings", everywhere: true });
    expect(labels(app)).toEqual(["Headings: Deep work"]);
    await app.commands.run("spotlight.run");
    await vi.waitFor(() => expect(app.store.state.note.path).toBe(`${PUB}/essays/on-focus.md`));
    // Once its editor is ready, the heading is shown.
    await app.commands.run("app.ready");
    await vi.waitFor(() => expect(actions).toContainEqual(["editor.goToHeading", { index: 1, text: "Deep work" }]));
  });
});

describe("FIL-04: quick open finds notes by title or path, fuzzily (Mod+P)", () => {
  it("lists recent and other notes when empty, and matches titles, paths, and typos", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.quickOpen");
    expect(vm(app)).toMatchObject({ mode: "Notes" });
    expect(vm(app).items.map((i) => i.label).sort()).toEqual(["Focus sessions", "Ideas", "On focus", "Welcome"]);
    await type(app, "journal foc");
    expect(vm(app).items.filter((i) => i.group === "Files").map((i) => i.label)).toEqual(["Focus sessions"]);
    await type(app, "sesions");
    expect(vm(app).items[0]?.label).toBe("Focus sessions");
    // Only notes: no commands, and Enter opens the selected one.
    await type(app, "focus");
    expect(vm(app).items.filter((i) => i.group !== "Actions").every((i) => i.group === "Files")).toBe(true);
    await app.commands.run("spotlight.run");
    await vi.waitFor(() => expect(app.store.state.note.path).toMatch(/focus/));
  });
});

describe("SPT-03: quick actions (→ or Mod+K)", () => {
  it("lists a note's actions; Make public asks first, then moves it", async () => {
    const { app, batches, files } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "ideas");
    expect(app.commands.match(key("k", { ctrlKey: true }), ["spotlightField"])).toBe("spotlight.actions");
    expect(app.commands.match(key("ArrowRight", { caretAtEnd: true }), ["spotlightField"])).toBe("spotlight.actionsRight");
    // In the middle of the text, → moves the caret.
    expect(app.commands.match(key("ArrowRight", { caretAtEnd: false }), ["spotlightField"])).toBeUndefined();
    await app.commands.run("spotlight.actions");
    expect(vm(app).actionsTitle).toBe("More actions for “Ideas”");
    expect(vm(app).items.map((i) => `${i.label}${i.disabled ? " (unavailable)" : ""}`)).toEqual([
      "Open", "Open in new window (unavailable)", "Copy Markdown link", "Rename", "Move to…", "Make public", "Show in Files", "Delete",
    ]);
    // Without windows of their own (this shell has none), it says why.
    expect(vm(app).items[1]!.description).toBe("Only the desktop app opens a note in a new window");
    // ← goes back to the results; → again, then down to Make public.
    await app.commands.run("spotlight.back");
    expect(sp(app).actions).toBeUndefined();
    await app.commands.run("spotlight.actions");
    await app.commands.run("spotlight.setActive", { id: "makePublic" });
    await app.commands.run("spotlight.run");
    expect(sp(app).open).toBe(false);
    expect(app.store.state.ui.files.confirm).toMatchObject({ kind: "visibility", to: "public", paths: [`${PRIV}/ideas.md`] });
    await app.commands.run("files.confirm");
    await vi.waitFor(() => expect(files[`${PUB}/ideas.md`]).toBeDefined());
    expect(batches.at(-1)).toEqual([{ op: "move", from: `${PRIV}/ideas.md`, to: `${PUB}/ideas.md` }]);
  });

  it("copies a Markdown link relative to the open note, and renames, moves, and deletes through Files", async () => {
    const { app, copied } = await started();
    const act = async (query: string, action: string) => {
      await app.commands.run("spotlight.open");
      await type(app, query);
      await app.commands.run("spotlight.actions");
      await app.commands.run("spotlight.setActive", { id: action });
      await app.commands.run("spotlight.run");
    };
    await act("focus sessions", "copyLink");
    expect(copied).toEqual(["[Focus sessions](journal/focus-sessions.md)"]);
    // A private note's link from a public note is refused (a public note never links to a private one).
    await app.commands.run("files.reveal", { path: `${PUB}/essays/on-focus.md` });
    await app.commands.run("files.openItem");
    await app.commands.run("spotlight.open");
    await type(app, "ideas");
    await app.commands.run("spotlight.actions");
    expect(vm(app).items.find((i) => i.id === "copyLink")).toMatchObject({ disabled: true, description: "A public note can't link to a private one" });
    await app.commands.run("spotlight.setOpen", { open: false });

    await act("ideas", "rename");
    expect(app.store.state.ui.files).toMatchObject({ open: true, edit: { kind: "rename", value: "ideas" } });
    await app.commands.run("files.cancelEdit");
    await act("ideas", "moveTo");
    expect(app.store.state.ui.files.move).toMatchObject({ open: true, paths: [`${PRIV}/ideas.md`] });
    await app.commands.run("move.setOpen", { open: false });
    await act("ideas", "delete");
    await vi.waitFor(() => expect(app.store.state.workspace.tree.roots[0]!.children.some((c) => c.name === "ideas.md")).toBe(false));
  });

  it("an action does one thing: it has no More actions of its own (Copy command ID is out)", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.commands");
    await type(app, "keyboard shortcuts");
    expect(app.commands.describe("spotlight.actions").enabled).toBe(false);
    await app.commands.run("spotlight.actions");
    expect(sp(app).actions).toBeUndefined();
  });
});
describe("DSK-06 (D-179): a note in a new window from Spotlight", () => {
  const withWindows = () => {
    const d = desktop();
    const opened: string[] = [];
    d.bridge.windows = { open: async (p) => { opened.push(p); }, secondary: false };
    return { d, opened };
  };
  it("Mod+Enter on a note, a heading, or a match opens it in a new window, and this window keeps its note", async () => {
    const { d, opened } = withWindows();
    const { app } = await started(d);
    expect(app.commands.match(key("Enter", { ctrlKey: true }), ["spotlightField"])).toBe("spotlight.runAlt");
    await app.commands.run("spotlight.open");
    await type(app, "ideas");
    await app.commands.run("spotlight.runAlt");
    expect(opened).toEqual([`${PRIV}/ideas.md`]);
    expect(sp(app).open).toBe(false);
    expect(app.store.state.note.path).toBe(`${PRIV}/welcome.md`);
  });
  it("Open in new window is a quick action there, and a command for the open note", async () => {
    const { d, opened } = withWindows();
    const { app } = await started(d);
    await app.commands.run("spotlight.open");
    await type(app, "ideas");
    await app.commands.run("spotlight.actions");
    expect(vm(app).items.find((i) => i.id === "openWindow")).toMatchObject({ label: "Open in new window" });
    expect(vm(app).items.find((i) => i.id === "openWindow")?.disabled).toBeFalsy();
    await app.commands.run("spotlight.setActive", { id: "openWindow" });
    await app.commands.run("spotlight.run");
    expect(opened).toEqual([`${PRIV}/ideas.md`]);
    expect(app.commands.describe("note.openInNewWindow")).toMatchObject({ enabled: true, title: "command.note.openInNewWindow" });
    await app.commands.run("note.openInNewWindow");
    expect(opened).toEqual([`${PRIV}/ideas.md`, `${PRIV}/welcome.md`]);
  });
  it("without windows of its own the shell offers neither", async () => {
    const { app } = await started(desktop(), { search: false });
    expect(app.commands.describe("note.openInNewWindow").enabled).toBe(false);
  });
});

describe("DSK-06 (D-179): a window opened for a note", () => {
  it("opens that note, not the last one, and never changes which note the app reopens at launch", async () => {
    const d = desktop();
    d.bridge.windows = { open: async () => {}, initialNote: `${PRIV}/ideas.md`, secondary: true };
    const { app } = await started(d, { search: false });
    expect(app.store.state.note.path).toBe(`${PRIV}/ideas.md`);
    await app.commands.run("files.reveal", { path: `${PRIV}/journal/focus-sessions.md` });
    await app.commands.run("files.openItem");
    await vi.waitFor(() => expect(app.store.state.note.path).toBe(`${PRIV}/journal/focus-sessions.md`));
    const saved = await d.bridge.loadAppState();
    expect(saved.lastNotePath).toBe(`${PRIV}/welcome.md`);
  });
});

describe("KEY-04: the Spotlight Pro keys (D-160)", () => {
  it("Mod+1 to 9 run the nth result, Mod+Shift+C copies the selected note's link, Alt+↑/↓ jump between groups", async () => {
    const { app, copied } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "foc");
    const items = vm(app).items;
    expect(app.commands.match(key("2", { ctrlKey: true, code: "Digit2" }), ["spotlightField"])).toBe("spotlight.run2");
    expect(app.commands.match(key("C", { ctrlKey: true, shiftKey: true, code: "KeyC" }), ["spotlightField"])).toBe("spotlight.copyLink");
    expect(app.commands.match(key("ArrowDown", { altKey: true }), ["spotlightField"])).toBe("spotlight.nextGroup");
    // Alt+↓: the first result of the next group; Alt+↑: back to the first of the group above.
    const groups = [...new Set(items.map((i) => i.group))];
    await app.commands.run("spotlight.nextGroup");
    expect(vm(app).activeId).toBe(items.find((i) => i.group === groups[1])!.id);
    await app.commands.run("spotlight.nextGroup");
    expect(vm(app).activeId).toBe(items.find((i) => i.group === groups[2])!.id);
    await app.commands.run("spotlight.prevGroup");
    expect(vm(app).activeId).toBe(items.find((i) => i.group === groups[1])!.id);
    // Mod+Shift+C on a note copies its Markdown link and closes Spotlight.
    await type(app, "focus sessions");
    expect(app.commands.describe("spotlight.copyLink").enabled).toBe(true);
    await app.commands.run("spotlight.copyLink");
    expect(copied).toEqual(["[Focus sessions](journal/focus-sessions.md)"]);
    expect(sp(app).open).toBe(false);
    // Mod+3 runs the third result: here, a command.
    await app.commands.run("spotlight.commands");
    await type(app, "show");
    const third = vm(app).items.filter((i) => !i.disabled)[2]!;
    expect(app.commands.describe("spotlight.run3").enabled).toBe(true);
    expect(app.commands.describe("spotlight.run9").enabled).toBe(vm(app).items.length >= 9);
    await app.commands.run("spotlight.run3");
    expect(sp(app).activeId).toBe(third.id);
  });
});

describe("KEY-01 (amended by D-361): every catalogued action runs from Actions, showing its shortcut", () => {
  it("lists the catalogue's actions, each with its command's shortcut, found by name", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.commands");
    const rows = vm(app).items;
    for (const e of CATALOG) {
      const row = rows.find((r) => r.id === `${e.anchor}:${e.id}`);
      expect(row, e.id).toBeDefined();
      const d = app.commands.describe(e.steps[0]![0]);
      if (d.shortcut) expect(row!.shortcut, e.id).toBe(formatChord(d.shortcut, "windows"));
    }
    // A registered command that isn't catalogued still runs, but isn't listed.
    expect(app.commands.has("window.snap.left")).toBe(true);
    await type(app, "snap");
    expect(vm(app).items.map((r) => r.id).some((id) => id.endsWith(":window.snap.left"))).toBe(false);
    for (const label of ["Focus mode", "Keyboard shortcuts", "Find in all notes"]) {
      await type(app, label);
      expect(vm(app).items.map((r) => r.label), label).toContain(label);
    }
  });
});