/**
 * Public and private roots in the app (WP-3.4): changing who can see notes from Files, Move to…, and
 * the ⋯ menu, always confirmed (FIL-06, SHR-01, SHR-02, DD-FILES-08); new notes private by default;
 * Import notes on the desktop (FRE-10); and Sync appearance (PRV-03).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, titleOfMarkdown, type AppStateFile, type PlatformBridge, type WorkspaceOp } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const PUB = "/w/notes";

/** A desktop-like shell over an in-memory folder with both roots. */
function setup(opts: { files?: Record<string, string>; folders?: string[]; open?: string; settings?: string | null; state?: Partial<AppStateFile> } = {}) {
  const files: Record<string, string> = { [`${PRIV}/welcome.md`]: "# Welcome\n", ...opts.files };
  const folders = new Set(opts.folders ?? []);
  let state: AppStateFile = { version: 1, ...opts.state, ...(opts.open ? { lastNotePath: opts.open } : {}) };
  let settings = opts.settings ?? undefined;
  const batches: WorkspaceOp[][] = [];
  const settingsWrites: string[] = [];
  let refuse = false;
  const imported: { id: string; to: string }[] = [];
  const under = (base: string, p: string) => p === base || p.startsWith(`${base}/`);
  const bridge: PlatformBridge = {
    platform: "windows",
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
    settings: opts.settings === null ? undefined : {
      load: async () => ({ available: true, ...(settings !== undefined ? { text: settings } : {}) }),
      save: async (t) => { settings = t; settingsWrites.push(t); },
      remove: async () => { settings = undefined; },
    },
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
      renameNote: async () => {},
      apply: async (ops) => {
        batches.push(ops);
        if (refuse) throw new Error("Error invoking remote method: failed");
        for (const op of ops) {
          if (op.op === "move") {
            for (const p of Object.keys(files)) if (under(op.from, p)) { files[op.to + p.slice(op.from.length)] = files[p]!; delete files[p]; }
            for (const d of [...folders]) if (under(op.from, d)) { folders.delete(d); folders.add(op.to + d.slice(op.from.length)); }
          } else if (op.op === "write") files[op.path] = op.text;
        }
      },
      chooseBundle: async () => ({ id: "b1", name: "focus-notes-export-2026-10-14.json", notes: 2 }),
      importBundle: async (id, to) => {
        imported.push({ id, to });
        files[`${to === "public" ? PUB : PRIV}/from-browser.md`] = "# From the browser\n";
        return { added: 2, renamed: 1 };
      },
    },
  };
  return { bridge, files, batches, imported, settingsWrites, state: () => state, settings: () => settings, refuseNext: () => { refuse = true; } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  return app;
}
const confirmVm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.confirm", app.store.state) as { open: boolean; title: string; message: string; confirmLabel: string; danger: boolean };
const toasts = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts.map((t) => t.message);
const done = async (app: ReturnType<typeof createApp>) => { for (let i = 0; i < 5; i++) await settle(); await app.idle(); };

describe("FIL-06, SHR-02: changing who can see a note, always confirmed", () => {
  it("Make public on the open note asks first, then moves it in one batch to the same folder path, and the note follows", async () => {
    const f = setup({ files: { [`${PRIV}/essays/on-focus.md`]: "# On focus\n" }, folders: [`${PRIV}/essays`], open: `${PRIV}/essays/on-focus.md` });
    const app = await started(f);
    expect(app.commands.describe("files.makePublic").enabled).toBe(true);
    expect(app.commands.describe("files.makePrivate").enabled).toBe(false);
    await app.commands.run("files.makePublic");
    expect(confirmVm(app)).toMatchObject({ open: true, title: "Make public?", confirmLabel: "Make public", danger: false });
    expect(confirmVm(app).message).toContain("Anyone with the link will be able to read “On focus”");
    // Nothing moves until confirmed.
    expect(f.batches).toEqual([]);
    await app.commands.run("files.confirm");
    await done(app);
    expect(f.batches).toEqual([[{ op: "move", from: `${PRIV}/essays/on-focus.md`, to: `${PUB}/essays/on-focus.md` }]]);
    expect(app.store.state.note.path).toBe(`${PUB}/essays/on-focus.md`);
    expect(toasts(app)).toContain("Made “On focus” public.");
  });

  it("Make private says what it can't undo, and cancelling changes nothing", async () => {
    const f = setup({ files: { [`${PUB}/about.md`]: "# About\n" }, open: `${PUB}/about.md` });
    const app = await started(f);
    await app.commands.run("files.makePrivate");
    expect(confirmVm(app).message).toContain("history");
    await app.commands.run("files.setConfirmOpen", { open: false });
    expect(confirmVm(app).open).toBe(false);
    expect(f.batches).toEqual([]);
    expect(app.store.state.note.path).toBe(`${PUB}/about.md`);
  });

  it("dropping onto the other section asks first, then it's one move; a refusal puts everything back", async () => {
    const f = setup({ files: { [`${PRIV}/plan.md`]: "# Plan\n", [`${PUB}/index.md`]: "See [plan](plan.md).\n" } });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PRIV}/plan.md`, mode: "replace" });
    await app.commands.run("files.drop", { source: `${PRIV}/plan.md`, target: "root:public" });
    expect(confirmVm(app)).toMatchObject({ open: true, title: "Make public?" });
    f.refuseNext();
    await app.commands.run("files.confirm");
    await done(app);
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]![0]).toEqual({ op: "move", from: `${PRIV}/plan.md`, to: `${PUB}/plan.md` });
    // Refused: the tree is as it was, and the reason is given.
    const ids = (app.viewModels.select("vm.files", app.store.state) as { items: { id: string }[] }).items.map((i) => i.id);
    expect(ids).toContain(`${PRIV}/plan.md`);
    expect(ids).not.toContain(`${PUB}/plan.md`);
    expect(toasts(app).at(-1)).toMatch(/^Couldn't make “Plan” public/);
  });

  it("links in a public note are never rewritten to name a private one", async () => {
    const f = setup({ files: { [`${PUB}/plan.md`]: "# Plan\n", [`${PUB}/index.md`]: "See [plan](plan.md).\n" } });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PUB}/plan.md`, mode: "replace" });
    await app.commands.run("files.makePrivate");
    await app.commands.run("files.confirm");
    await done(app);
    expect(f.batches[0]).toEqual([{ op: "move", from: `${PUB}/plan.md`, to: `${PRIV}/plan.md` }]);
    expect(f.files[`${PUB}/index.md`]).toBe("See [plan](plan.md).\n");
  });

  it("Move to… offers the other section's folders, saying it changes who can see them", async () => {
    const f = setup({ files: { [`${PRIV}/a.md`]: "# A\n" }, folders: [`${PUB}/essays`] });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PRIV}/a.md`, mode: "replace" });
    await app.commands.run("files.moveTo");
    const items = (app.viewModels.select("vm.move", app.store.state) as { items: { id: string; description: string; disabled?: boolean }[] }).items;
    const essays = items.find((i) => i.id === `${PUB}/essays`)!;
    expect(essays.disabled).toBeUndefined();
    expect(essays.description).toBe("Public · changes who can see it");
    await app.commands.run("move.choose", { id: `${PUB}/essays` });
    expect(confirmVm(app).open).toBe(true);
    await app.commands.run("files.confirm");
    await done(app);
    expect(f.batches[0]).toEqual([{ op: "move", from: `${PRIV}/a.md`, to: `${PUB}/essays/a.md` }]);
  });

  it("a multi-selection shows Make public and Make private only where they apply", async () => {
    const f = setup({ files: { [`${PRIV}/a.md`]: "# A\n", [`${PRIV}/b.md`]: "# B\n" } });
    const app = await started(f);
    await app.commands.run("files.open");
    await app.commands.run("files.select", { id: `${PRIV}/a.md`, mode: "replace" });
    await app.commands.run("files.select", { id: `${PRIV}/b.md`, mode: "toggle" });
    expect(app.viewModels.select("vm.files", app.store.state)).toMatchObject({ multi: true, canMakePublic: true, canMakePrivate: false });
    await app.commands.run("files.makePublic");
    expect(confirmVm(app).message).toContain("2 items");
  });
});

describe("SHR-01: new notes are private by default", () => {
  it("a new note from a public note goes into the Private root", async () => {
    const f = setup({ files: { [`${PUB}/about.md`]: "# About\n" }, open: `${PUB}/about.md` });
    const app = await started(f);
    await app.commands.run("note.new");
    await done(app);
    expect(app.store.state.note.path).toBe(`${PRIV}/untitled.md`);
  });
  it("…and next to the open note when that one is private", async () => {
    const f = setup({ files: { [`${PRIV}/journal/day.md`]: "# Day\n" }, open: `${PRIV}/journal/day.md` });
    const app = await started(f);
    await app.commands.run("note.new");
    await done(app);
    expect(app.store.state.note.path).toBe(`${PRIV}/journal/untitled.md`);
  });
});

describe("FRE-10: Import notes on the desktop", () => {
  it("asks where the notes go, private unless chosen, and adds them", async () => {
    const f = setup();
    const app = await started(f);
    await app.commands.run("notes.import");
    const vm = () => app.viewModels.select("vm.import", app.store.state) as { open: boolean; to: string; message: string; hint: string };
    expect(vm()).toMatchObject({ open: true, to: "private" });
    expect(vm().message).toContain("2 notes");
    await app.commands.run("import.setTo", { value: "public" });
    expect(vm().hint).toMatch(/Anyone/);
    await app.commands.run("import.setTo", { value: "private" });
    await app.commands.run("import.confirm");
    await done(app);
    expect(f.imported).toEqual([{ id: "b1", to: "private" }]);
    expect(vm().open).toBe(false);
    expect(toasts(app).at(-1)).toMatch(/^Imported 2 notes into Private; 1 kept with a new name/);
    const ids = (app.store.state.workspace.tree.roots.find((r) => r.id === "private")!.children).map((n) => n.name);
    expect(ids).toContain("from-browser.md");
  });
  it("a file that's too large or not an export is refused with the reason", async () => {
    const f = setup();
    f.bridge.workspace!.chooseBundle = async () => { throw new Error("Error invoking remote method 'bundle:choose': tooLarge"); };
    const app = await started(f);
    await app.commands.run("notes.import");
    expect(toasts(app).at(-1)).toBe(messages["toast.importTooLarge"]);
    expect(f.imported).toEqual([]);
  });
});

describe("PRV-03: Sync appearance stores synced settings in the private repository", () => {
  it("while on, the synced settings come from the file and go to it; the device keeps the rest", async () => {
    const f = setup({ settings: JSON.stringify({ appearance: { mode: "dark", darkTheme: "dusk" }, reading: { fontSize: 18 } }), state: { appearance: "light", fontSize: 14 } });
    const app = await started(f);
    expect(app.store.state.settingsSync).toBe("on");
    expect(app.store.state.appearance).toMatchObject({ mode: "dark", darkTheme: "dusk", fontSize: 18 });
    await app.commands.run("font.larger");
    await app.commands.run("focus.toggle");
    expect(JSON.parse(f.settings()!)).toEqual({ appearance: { mode: "dark", darkTheme: "dusk" }, reading: { fontSize: 20 } });
    // This device's own choices stay as they were, and focus mode is per device.
    expect(f.state()).toMatchObject({ appearance: "light", fontSize: 14, focusMode: false });
  });
  it("turning it on writes the current look; off keeps it on this device and removes the file", async () => {
    const f = setup({ state: { appearance: "dark", lightTheme: "sepia" } });
    const app = await started(f);
    expect(app.store.state.settingsSync).toBe("off");
    await app.commands.run("settings.sync");
    expect(JSON.parse(f.settings()!)).toEqual({ appearance: { mode: "dark", lightTheme: "sepia" } });
    await app.commands.run("appearance.light");
    expect(JSON.parse(f.settings()!).appearance.mode).toBe("light");
    expect(f.state().appearance).toBe("dark");
    await app.commands.run("settings.sync");
    expect(f.settings()).toBeUndefined();
    expect(f.state().appearance).toBe("light");
  });
  it("is unavailable without a private repository, and not in the menu", async () => {
    const f = setup({ settings: null });
    const app = await started(f);
    expect(app.store.state.settingsSync).toBe("unavailable");
    expect(app.commands.describe("settings.sync").enabled).toBe(false);
    const more = (app.viewModels.select("vm.toolbar", app.store.state) as { more: { id: string; items: { id: string }[] }[] }).more;
    expect(more.find((g) => g.id === "theme")!.items.map((i) => i.id)).not.toContain("settings.sync");
    expect(more.find((g) => g.id === "notes")!.items.map((i) => i.id)).toEqual(["files.makePublic", "files.makePrivate", "notes.import"]);
  });
});
