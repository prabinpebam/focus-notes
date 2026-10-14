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
  answerKey, createApp, formatChord, isInternalCommand, titleOfMarkdown, type App, type AppStateFile, type KeyEventLike, type PlatformBridge, type WorkspaceOp,
} from "../src/index.ts";
import { startSearch, type SearchService } from "../src/search/feed.ts";
import { localSearch } from "../src/search/serve.ts";

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
    writeNote: async (p, c) => { files[p] = c; },
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
          } else if (op.op === "write") files[op.path] = op.text;
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
    expect(labels(app)).toEqual(expect.arrayContaining(["Notes: On focus", "Commands: Focus mode", "Settings: Focus mode", "In notes: Ideas"]));
    expect(labels(app)).toContain(items[0]!.label === "Focus sessions" ? "Top hit: Focus sessions" : "Notes: Focus sessions");
    const ideas = items.find((i) => i.group === "In notes")!;
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
    expect(headers).toEqual(expect.arrayContaining(["Notes", "Commands", "Settings", "In notes", "Actions"]));
    expect(raw.filter((i) => i.header).every((i) => !i.highlights?.length && !i.disabled)).toBe(true);
  });

  it("finds headings in every note and folders by name, and shows a note's path and who can see it", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "deep work");
    const heading = vm(app).items.find((i) => i.label === "Deep work")!;
    expect(heading.description).toBe("On focus · essays/on-focus.md");
    await type(app, "essays");
    expect(vm(app).items.find((i) => i.label === "essays")).toMatchObject({ icon: "folder", description: "essays" });
    await type(app, "on focus");
    expect(vm(app).items.find((i) => i.label === "On focus")?.description).toBe("essays/on-focus.md · Public");
  });
});

describe("SPT-04: states, the empty field, and no match", () => {
  it("running a toggle leaves Spotlight open and its row shows the new state", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.commands");
    await type(app, "focus mode");
    const row = vm(app).items.find((i) => i.label === "Focus mode" && i.group === "Commands")!;
    await app.commands.run("spotlight.setActive", { id: row.id });
    await app.commands.run("spotlight.run");
    expect(app.store.state.focusMode).toBe(false);
    expect(sp(app).open).toBe(true);
    expect(vm(app).items.find((i) => i.id === row.id)?.state).toBe("Off");
    // Settings show their value and step it, staying open too.
    await type(app, "text size");
    const size = vm(app).items.find((i) => i.label === "Text size")!;
    expect(size.state).toBe("16 px");
    await app.commands.run("spotlight.setActive", { id: size.id });
    await app.commands.run("spotlight.run");
    expect(vm(app).items.find((i) => i.id === size.id)?.state).toBe("17 px");
  });

  it("the empty field shows recent notes, then suggestions, then a hint", async () => {
    const { app } = await started();
    for (const p of [`${PRIV}/ideas.md`, `${PUB}/essays/on-focus.md`, `${PRIV}/welcome.md`]) await app.commands.run("files.reveal", { path: p }).then(() => app.commands.run("files.openItem"));
    await app.commands.run("spotlight.open");
    expect(labels(app)).toEqual(["Recent: On focus", "Recent: Ideas", "Suggestions: New note", "Suggestions: Focus mode", "Suggestions: Switch light and dark"]);
    expect(vm(app).status).toBe("Type ? for help");
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
    // The empty commands list is every command it can run.
    expect(vm(app).items.length).toBeGreaterThan(100);
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
    expect(labels(app)[0]).toBe("Prefixes and filters: > Commands and settings");
  });

  it("a mode's key switches mode and keeps the query; the same key again closes", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.open");
    await type(app, "focus");
    await app.commands.run("spotlight.commands");
    expect(sp(app)).toMatchObject({ open: true, mode: "commands", query: "focus" });
    await vi.waitFor(() => expect(sp(app).answered).toBe(answerKey(sp(app))));
    expect(vm(app).items.every((i) => i.group === "Commands" || i.group === "Settings")).toBe(true);
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
    expect(vm(app).items.filter((i) => i.group === "Notes").map((i) => i.label)).toEqual(["Focus sessions"]);
    await type(app, "sesions");
    expect(vm(app).items[0]?.label).toBe("Focus sessions");
    // Only notes: no commands, and Enter opens the selected one.
    await type(app, "focus");
    expect(vm(app).items.filter((i) => i.group !== "Actions").every((i) => i.group === "Notes")).toBe(true);
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
    expect(vm(app).actionsTitle).toBe("Actions for “Ideas”");
    expect(vm(app).items.map((i) => `${i.label}${i.disabled ? " (unavailable)" : ""}`)).toEqual([
      "Open", "Open in new window (unavailable)", "Copy Markdown link", "Rename", "Move to…", "Make public", "Show in Files", "Delete",
    ]);
    expect(vm(app).items[1]!.description).toBe("New windows arrive in a later preview");
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
    expect(app.store.state.ui.files).toMatchObject({ open: true, edit: { kind: "rename", value: "Ideas" } });
    await app.commands.run("files.cancelEdit");
    await act("ideas", "moveTo");
    expect(app.store.state.ui.files.move).toMatchObject({ open: true, paths: [`${PRIV}/ideas.md`] });
    await app.commands.run("move.setOpen", { open: false });
    await act("ideas", "delete");
    await vi.waitFor(() => expect(app.store.state.workspace.tree.roots[0]!.children.some((c) => c.name === "ideas.md")).toBe(false));
  });

  it("a command's actions run it or copy its ID; a setting resets to its default", async () => {
    const { app, copied } = await started();
    await app.commands.run("spotlight.commands");
    await type(app, "larger text");
    await app.commands.run("spotlight.actions");
    expect(vm(app).items.map((i) => i.label)).toEqual(["Run", "Copy command ID"]);
    await app.commands.run("spotlight.setActive", { id: "copyId" });
    await app.commands.run("spotlight.run");
    expect(copied).toEqual(["font.larger"]);
    await app.commands.run("font.larger");
    await app.commands.run("spotlight.commands");
    await type(app, "text size");
    await app.commands.run("spotlight.actions");
    await app.commands.run("spotlight.setActive", { id: "reset" });
    await app.commands.run("spotlight.run");
    expect(app.store.state.appearance.fontSize).toBe(16);
  });
});

describe("KEY-01: every action is a command Spotlight can run, showing its shortcut", () => {
  it("lists every registered command but internal steps, each with its shortcut", async () => {
    const { app } = await started();
    await app.commands.run("spotlight.commands");
    const rows = vm(app).items;
    const ids = app.commands.ids().filter((id) => !isInternalCommand(id, app.commands.describe(id).handledBy));
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) {
      const row = rows.find((r) => r.id === `commands:${id}`);
      expect(row, id).toBeDefined();
      const d = app.commands.describe(id);
      if (d.shortcut) expect(row!.shortcut, id).toBe(formatChord(d.shortcut, "windows"));
    }
    // And each is found by its name through the index.
    for (const id of ["focus.toggle", "files.makePublic", "window.snap.left", "theme.dark.dusk", "spotlight.quickOpen"]) {
      await type(app, app.commands.describe(id).title === "Dusk" ? "dark theme dusk" : messages[app.commands.describe(id).title]!);
      expect(vm(app).items.map((r) => r.id), id).toContain(`commands:${id}`);
    }
  });
});
