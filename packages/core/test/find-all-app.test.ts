/**
 * Find in all notes in the app (FND-04): Mod+Shift+F opens its sheet; typing asks the search index;
 * results are grouped by note with counts and the match marked; the arrow keys move through the
 * lines; Enter opens the note at that match with the find bar open on it; F4 and Shift+F4 step
 * through results across notes; the options and filters narrow the search.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, MORE_MENU, type AppStateFile, type PlatformBridge, type WorkspaceBridge, type WorkspaceScan } from "../src/index.ts";
import { parseFindQuery } from "../src/find-all-app.ts";
import { startSearch, type SearchService } from "../src/search/feed.ts";
import { localSearch } from "../src/search/serve.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const W = "/w";
const PRIV = `${W}/private/notes`;
const PUB = `${W}/notes`;

function desktop(files: Record<string, string>) {
  let state: AppStateFile = { version: 1 };
  const scan = (): WorkspaceScan => ({
    folder: W,
    roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
    entries: [`${PRIV}/essays`].map((path) => ({ path, kind: "folder" as const })).concat(Object.keys(files).map((path) => ({ path, kind: "note" as const }))),
  });
  const workspace: WorkspaceBridge = {
    info: async () => ({ folder: W, format: '{ "formatVersion": 1 }' }),
    scan: async () => scan(), writeFormat: async () => {}, renameNote: async () => {},
  };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: async (p, c) => { files[p] = c; },
    chooseNote: async () => undefined, newNotePath: async () => `${PRIV}/untitled.md`,
    defaultNotePath: async () => `${PRIV}/start.md`,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace,
  };
  return bridge;
}

const NOTES = {
  [`${PRIV}/start.md`]: "# Start\n\nNothing to see.\n",
  [`${PRIV}/essays/on-focus.md`]: "# On focus\n\nFocus is a habit. Keep your focus.\n",
  [`${PUB}/garden.md`]: "# Garden\n\nThe garden needs focus too.\n",
};

const running: SearchService[] = [];
afterEach(() => { for (const s of running.splice(0)) s.stop(); });
async function started(files: Record<string, string> = { ...NOTES }) {
  const app = createApp(desktop(files), messages);
  await app.start();
  await vi.waitFor(() => expect(app.store.state.workspace.tree.roots.length).toBeGreaterThan(0));
  const search = startSearch({ store: app.store, bridge: app.bridge }, localSearch());
  running.push(search);
  await search.whenIndexed();
  app.useSearch(search);
  const actions: [string, Record<string, unknown> | undefined][] = [];
  app.onEditorAction((id, args) => actions.push([id, args]));
  const vm = () => app.viewModels.select("vm.findAll", app.store.state) as {
    open: boolean; items: { id: string; label: string; description?: string; header?: boolean; highlights?: number[][] }[];
    activeId: string; summary: string; summaryTone: string; invalid: boolean; focus: number;
  };
  /** Types a query and waits for its answer. */
  const type = async (query: string) => {
    const before = app.store.state.ui.findAll.results;
    await app.commands.run("findAll.setQuery", { value: query });
    await vi.waitFor(() => {
      expect(app.store.state.ui.findAll.results).not.toBe(before);
      expect(app.store.state.ui.findAll.searching).toBe(false);
    });
  };
  return { app, search, actions, vm, type };
}

describe("opening Find in all notes", () => {
  it("is Mod+Shift+F, in the ⋯ menu's Edit group, and focuses its field", async () => {
    const { app, vm } = await started();
    expect(app.commands.describe("find.allNotes")).toMatchObject({ shortcut: "Mod+Shift+F" });
    expect(MORE_MENU.find((g) => g.id === "edit")!.items).toContain("find.allNotes");
    await app.commands.run("find.allNotes");
    expect(vm()).toMatchObject({ open: true, focus: 1, summary: messages["findAll.hint"] });
    await app.commands.run("findAll.close");
    expect(vm().open).toBe(false);
  });
  it("takes a query from Spotlight's \"Find … in all notes\"", async () => {
    const { app } = await started();
    await app.commands.run("find.allNotes", { query: "garden" });
    await vi.waitFor(() => expect(app.store.state.ui.findAll.results?.total).toBe(2));
  });
});

describe("results", () => {
  it("groups matches by note with its path, visibility, and count, each line with the match marked", async () => {
    const { app, vm, type } = await started();
    await app.commands.run("find.allNotes");
    await type("focus");
    const v = vm();
    expect(v.summary).toBe("4 matches in 2 notes");
    expect(v.items.map((i) => [i.header ? "note" : "line", i.label, i.description ?? ""])).toEqual([
      ["note", "On focus", "essays/on-focus.md · Private · 3 matches"],
      ["line", "On focus", ""],
      ["line", "Focus is a habit. Keep your focus.", ""],
      ["line", "Focus is a habit. Keep your focus.", ""],
      ["note", "Garden", "garden.md · Public · 1 match"],
      ["line", "The garden needs focus too.", ""],
    ]);
    expect(v.items.filter((i) => !i.header).map((i) => i.label.slice(...(i.highlights![0] as [number, number])))).toEqual(["focus", "Focus", "focus", "focus"]);
    // The first match is active, and the arrow keys move through the lines, never onto a note's row.
    expect(v.activeId).toBe(v.items[1]!.id);
    await app.commands.run("findAll.next");
    await app.commands.run("findAll.next");
    await app.commands.run("findAll.next");
    expect(vm().activeId).toBe(v.items[5]!.id);
    await app.commands.run("findAll.next");
    expect(vm().activeId).toBe(v.items[5]!.id);
    await app.commands.run("findAll.prev");
    expect(vm().activeId).toBe(v.items[3]!.id);
  });
  it("says when nothing matches, and when a regular expression doesn't compile", async () => {
    const { app, vm, type } = await started();
    await app.commands.run("find.allNotes");
    await type("zebra");
    expect(vm()).toMatchObject({ summary: "No results", summaryTone: "danger", items: [] });
    await app.commands.run("findAll.toggle.regex");
    await type("foc(");
    expect(vm()).toMatchObject({ invalid: true, summary: "Not a valid regular expression", summaryTone: "danger" });
  });
  it("matches case, whole words, and regular expressions with the toggles", async () => {
    const { app, vm, type } = await started();
    await app.commands.run("find.allNotes");
    await type("Focus");
    await app.commands.run("findAll.toggle.caseSensitive");
    await vi.waitFor(() => expect(vm().summary).toBe("1 match in 1 note"));
    expect(app.commands.describe("findAll.toggle.caseSensitive").checked).toBe(true);
    await app.commands.run("findAll.toggle.caseSensitive");
    await app.commands.run("findAll.toggle.regex");
    await type("gard\\w+");
    expect(vm().summary).toBe("2 matches in 1 note");
    await app.commands.run("findAll.toggle.wholeWord");
    await type("gard");
    await vi.waitFor(() => expect(vm().summary).toBe("No results"));
  });
  it("narrows to a folder or a visibility with in: and is:", async () => {
    const { app, vm, type } = await started();
    await app.commands.run("find.allNotes");
    await type("focus is:public");
    expect(vm().items.filter((i) => i.header).map((i) => i.label)).toEqual(["Garden"]);
    await type("in:essays/ focus");
    expect(vm().items.filter((i) => i.header).map((i) => i.label)).toEqual(["On focus"]);
    expect(parseFindQuery("in:essays/ is:private the word")).toEqual({ text: "the word", roots: ["private"], within: "essays" });
    expect(parseFindQuery("main.is:x")).toEqual({ text: "main.is:x" });
  });
});

describe("jumping to a match", () => {
  it("drops every result the moment the vault locks, so nothing private stays on screen", async () => {
    const { app, vm, type } = await started();
    app.store.update((s) => ({ ...s, instance: { ...s.instance, vault: "unlocked" } }));
    await app.commands.run("find.allNotes");
    await type("focus");
    expect(vm().items.length).toBeGreaterThan(0);
    app.store.update((s) => ({ ...s, instance: { ...s.instance, vault: "locked" } }));
    expect(app.store.state.ui.findAll.results).toBeUndefined();
    expect(vm().items).toEqual([]);
  });
  it("opens the note and selects that match, with the find bar open on it and its field focused", async () => {
    const { app, vm, actions, type } = await started();
    await app.commands.run("find.allNotes");
    await type("focus");
    await app.commands.run("findAll.next");
    await app.commands.run("findAll.next");
    const focusFind = app.store.state.ui.find.focusFind;
    await app.commands.run("findAll.openActive");
    expect(app.store.state.note.path).toBe(`${PRIV}/essays/on-focus.md`);
    expect(vm().open).toBe(false);
    // The editor for the note, once it's built, selects the match.
    await app.commands.run("app.ready");
    expect(app.store.state.ui.find).toMatchObject({ open: true, query: "focus", caseSensitive: false, wholeWord: false, regex: false, focusFind: focusFind + 1 });
    const select = actions.filter(([id]) => id === "find.select");
    expect(select).toHaveLength(1);
    expect(select[0]![1]).toMatchObject({ query: "focus", index: 2, lineNth: 0, occurrence: 1 });
  });
  it("selects a match in the open note at once", async () => {
    const { app, actions, type } = await started({ ...NOTES, [`${PRIV}/start.md`]: "# Start\n\nA focus here, and focus there.\n" });
    await app.commands.run("find.allNotes");
    await type("here");
    await app.commands.run("findAll.next");
    await app.commands.run("findAll.openActive");
    expect(app.store.state.ui.find).toMatchObject({ open: true, query: "here" });
    expect(actions.filter(([id]) => id === "find.select").map(([, a]) => a?.index)).toEqual([1]);
  });
  it("steps to the next and previous result across notes with F4 and Shift+F4, without the sheet", async () => {
    const { app, actions, type } = await started();
    expect(app.commands.describe("find.nextResult")).toMatchObject({ shortcut: "F4" });
    expect(app.commands.describe("find.prevResult")).toMatchObject({ shortcut: "Shift+F4" });
    await app.commands.run("find.allNotes");
    await type("focus");
    await app.commands.run("findAll.close");
    // The first F4 opens the result that's active; each one after it, the next.
    await app.commands.run("find.nextResult");
    await app.commands.run("app.ready");
    expect(app.store.state.note.path).toBe(`${PRIV}/essays/on-focus.md`);
    await app.commands.run("find.nextResult");
    await app.commands.run("find.nextResult");
    await app.commands.run("find.nextResult");
    await app.commands.run("app.ready");
    expect(app.store.state.note.path).toBe(`${PUB}/garden.md`);
    expect(app.store.state.ui.findAll.open).toBe(false);
    // Past the last result, back to the first.
    await app.commands.run("find.nextResult");
    await app.commands.run("app.ready");
    expect(app.store.state.note.path).toBe(`${PRIV}/essays/on-focus.md`);
    await app.commands.run("find.prevResult");
    await app.commands.run("app.ready");
    expect(app.store.state.note.path).toBe(`${PUB}/garden.md`);
    expect(actions.filter(([id]) => id === "find.select").map(([, a]) => a?.index)).toEqual([0, 1, 2, 0, 0, 0]);
  });
});
