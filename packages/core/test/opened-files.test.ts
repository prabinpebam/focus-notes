/** Opened files vertical tabs above Pinned in Files (D-410, FIL-20). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, planFlatOps, titleOfMarkdown, type FlatNote, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;

function setup(notesMap: Record<string, string> = {}) {
  const notes = new Map<string, FlatNote>(
    Object.entries({
      "welcome.md": "# Welcome\n",
      "spec.md": "# Spec ideas\n",
      "reading.md": "# Reading list\n",
      "weekly.md": "# Weekly review\n",
      ...notesMap,
    }).map(([path, text]) => [path, { path, text, updated: 0 }]),
  );
  let folders: string[] = [];
  const bridge: PlatformBridge = {
    platform: "web",
    readNote: async (p) => { const n = notes.get(p); if (!n || n.deleted) throw new Error("missing"); return n.text; },
    writeNote: async (p, text) => { notes.set(p, { path: p, text, updated: 1 }); },
    chooseNote: async () => undefined,
    newNotePath: async () => "untitled.md",
    defaultNotePath: async () => "welcome.md",
    loadAppState: async () => ({ version: 1, lastNotePath: "welcome.md", filesRecent: ["welcome.md", "spec.md", "reading.md", "weekly.md"] }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "",
        roots: [{ id: "local", path: "", readOnly: false }],
        entries: [...notes.values()].filter((n) => !n.deleted).map((n) => ({ path: n.path, kind: "note" as const, title: titleOfMarkdown(n.text) ?? "" })),
      }),
      writeFormat: async () => {},
      renameNote: async (from, to) => { const n = notes.get(from)!; notes.delete(from); notes.set(to, { ...n, path: to }); },
      apply: async (ops) => {
        const plan = planFlatOps([...notes.values()], folders, ops, 2);
        for (const p of plan.remove) notes.delete(p);
        for (const n of plan.put) notes.set(n.path, n);
        folders = plan.folders;
      },
    },
  };
  return { bridge, notes };
}

type OpenedVm = { items: { id: string; label: string; title: string; current: boolean }[]; menu: { id: string; items: { id: string; label: string }[] }[] };
type FilesVm = { open: boolean; shortcuts: { id: string; kind: string; parent?: string }[] };

const openedVm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.opened", app.store.state) as OpenedVm;
const recentIds = (app: ReturnType<typeof createApp>) => {
  const vm = app.viewModels.select("vm.files", app.store.state) as FilesVm;
  return vm.shortcuts.filter((s) => s.parent === "root:recent").map((s) => s.id);
};
const settle = () => new Promise((r) => setTimeout(r, 0));

async function started(notesMap?: Record<string, string>) {
  const f = setup(notesMap);
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  await app.commands.run("files.setPinned", { value: true });
  return { ...f, app };
}

describe("Opened files view model and commands (D-410, FIL-20)", () => {
  it("tracks opened notes in order, marks the active one, and excludes opened notes from Recent", async () => {
    const { app } = await started();
    expect(openedVm(app).items.map((i) => ({ id: i.id, label: i.label, current: i.current }))).toEqual([
      { id: "welcome.md", label: "Welcome", current: true },
    ]);
    expect(openedVm(app).menu).toEqual([
      { id: "opened", items: [expect.objectContaining({ id: "files.closeAllOpened", label: "Close all" })] },
    ]);
    expect(recentIds(app)).not.toContain("welcome.md");
    expect(recentIds(app)).toEqual(["spec.md", "reading.md", "weekly.md"]);

    await app.commands.run("files.activate", { id: "spec.md" });
    await app.commands.run("files.activate", { id: "reading.md" });

    expect(openedVm(app).items.map((i) => ({ id: i.id, current: i.current }))).toEqual([
      { id: "welcome.md", current: false },
      { id: "spec.md", current: false },
      { id: "reading.md", current: true },
    ]);
    expect(recentIds(app)).toEqual(["weekly.md"]);
  });

  it("activates a tab on single click without reordering tabs", async () => {
    const { app } = await started();
    await app.commands.run("files.activate", { id: "spec.md" });
    await app.commands.run("files.activate", { id: "reading.md" });

    await app.commands.run("files.activateOpened", { id: "spec.md" });
    expect(app.store.state.note.path).toBe("spec.md");
    expect(openedVm(app).items.map((i) => ({ id: i.id, current: i.current }))).toEqual([
      { id: "welcome.md", current: false },
      { id: "spec.md", current: true },
      { id: "reading.md", current: false },
    ]);
  });

  it("closes an inactive tab without changing the active note and returns it to Recent", async () => {
    const { app } = await started();
    await app.commands.run("files.activate", { id: "spec.md" });
    await app.commands.run("files.activate", { id: "reading.md" });

    await app.commands.run("files.closeOpened", { id: "spec.md" });
    expect(app.store.state.note.path).toBe("reading.md");
    expect(openedVm(app).items.map((i) => i.id)).toEqual(["welcome.md", "reading.md"]);
    expect(recentIds(app)).toContain("spec.md");
    expect(recentIds(app)).not.toContain("reading.md");
  });

  it("closes the active tab by switching to a remaining neighbor and saving pending edits first", async () => {
    const { app, notes } = await started();
    await app.commands.run("files.activate", { id: "spec.md" });
    await app.commands.run("files.activate", { id: "reading.md" });
    await app.commands.run("files.activateOpened", { id: "spec.md" });
    await app.commands.run("note.setContent", { value: "# Spec ideas\n\nUnsaved line.\n" });

    await app.commands.run("files.closeOpened", { id: "spec.md" });
    expect(notes.get("spec.md")?.text).toContain("Unsaved line.");
    expect(app.store.state.note.path).toBe("reading.md");
    expect(openedVm(app).items.map((i) => ({ id: i.id, current: i.current }))).toEqual([
      { id: "welcome.md", current: false },
      { id: "reading.md", current: true },
    ]);
    expect(recentIds(app)).toContain("spec.md");
  });

  it("closes all opened tabs without confirmation, hides the section, returns notes to Recent, and allows reopening", async () => {
    const { app, notes } = await started();
    await app.commands.run("files.activate", { id: "spec.md" });
    await app.commands.run("note.setContent", { value: "# Spec ideas\n\nKept safely.\n" });

    await app.commands.run("files.closeAllOpened");
    expect(notes.get("spec.md")?.text).toContain("Kept safely.");
    expect(app.store.state.ui.files.confirm).toBeUndefined();
    expect(openedVm(app).items).toEqual([]);
    expect(openedVm(app).menu).toEqual([]);
    expect(recentIds(app)).toEqual(expect.arrayContaining(["spec.md", "welcome.md", "reading.md", "weekly.md"]));

    // Re-activating the note still in the editor adds it back to Opened files.
    await app.commands.run("files.activate", { id: "spec.md" });
    expect(openedVm(app).items.map((i) => ({ id: i.id, current: i.current }))).toEqual([
      { id: "spec.md", current: true },
    ]);
    expect(recentIds(app)).not.toContain("spec.md");
  });

  it("updates an opened tab when its note is renamed and removes it when deleted", async () => {
    const { app } = await started();
    await app.commands.run("files.activate", { id: "spec.md" });

    // Rename spec.md -> renamed-spec.md
    await app.commands.run("files.select", { id: "spec.md", mode: "replace" });
    await app.commands.run("files.rename");
    await app.commands.run("files.setEditValue", { value: "Renamed spec" });
    await app.commands.run("files.commitEdit");
    await settle();
    expect(openedVm(app).items.map((i) => i.id)).toEqual(["welcome.md", "renamed-spec.md"]);

    // Delete renamed-spec.md
    await app.commands.run("files.select", { id: "renamed-spec.md", mode: "replace" });
    await app.commands.run("files.delete");
    await app.commands.run("files.confirm");
    await settle();
    expect(openedVm(app).items.map((i) => i.id)).toEqual(["welcome.md"]);
  });
});
