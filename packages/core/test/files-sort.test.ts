/**
 * FIL-11 (D-175): the Files tree sorted by name or by last change. Folders stay first; by last change
 * notes are newest first and a folder sorts by its newest note. The choice is a command, shown checked
 * in the header's sort menu, and remembered per device.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTree, createApp, titleOfMarkdown, visibleRows, type AppStateFile, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const T0 = Date.UTC(2026, 9, 16, 9);
const H = 3_600_000;

/** Notes with their texts and modification times; a folder's notes are under it. */
const NOTES: Record<string, [string, number]> = {
  [`${PRIV}/apple.md`]: ["# Apple\n", T0 - 5 * H],
  [`${PRIV}/zebra.md`]: ["# Zebra\n", T0 - 1 * H],
  [`${PRIV}/mango.md`]: ["# Mango\n", T0 - 3 * H],
  [`${PRIV}/archive/old.md`]: ["# Old\n", T0 - 48 * H],
  [`${PRIV}/projects/plan.md`]: ["# Plan\n", T0 - 2 * H],
};
const scan = () => ({
  folder: "/w",
  roots: [{ id: "private" as const, path: PRIV, readOnly: false }],
  entries: [
    { path: `${PRIV}/archive`, kind: "folder" as const }, { path: `${PRIV}/projects`, kind: "folder" as const }, { path: `${PRIV}/empty`, kind: "folder" as const },
    ...Object.entries(NOTES).map(([path, [text, changed]]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "", changed })),
  ],
});
const labels = (order: "name" | "changed") => visibleRows(buildTree(scan()), { expanded: new Set(), collapsed: new Set() }, "", order).slice(1).map((r) => r.label);

describe("sorting the tree (FIL-11)", () => {
  it("by name: folders, then notes, alphabetically", () => {
    expect(labels("name")).toEqual(["archive", "empty", "projects", "Apple", "Mango", "Zebra"]);
  });
  it("by last change: folders first by their newest note (an empty one last), then notes newest first", () => {
    expect(labels("changed")).toEqual(["projects", "archive", "empty", "Zebra", "Mango", "Apple"]);
  });
  it("sorts inside open folders too", () => {
    const tree = buildTree({ ...scan(), entries: [...scan().entries, { path: `${PRIV}/projects/later.md`, kind: "note" as const, title: "Later", changed: T0 }] });
    const rows = visibleRows(tree, { expanded: new Set([`${PRIV}/projects`]), collapsed: new Set() }, "", "changed");
    expect(rows.filter((r) => r.parent === `${PRIV}/projects`).map((r) => r.label)).toEqual(["Later", "Plan"]);
  });
});

describe("the sort choice in the app (FIL-11)", () => {
  function app(state: Partial<AppStateFile> = {}) {
    let saved: AppStateFile = { version: 1, firstRun: "done", ...state };
    const bridge: PlatformBridge = {
      platform: "windows", readNote: async (p) => NOTES[p]?.[0] ?? "", writeNote: async () => {}, chooseNote: async () => undefined,
      newNotePath: async () => `${PRIV}/untitled.md`, defaultNotePath: async () => `${PRIV}/apple.md`,
      loadAppState: async () => saved, saveAppState: async (s) => { saved = s; },
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      workspace: { info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }), scan: async () => scan(), writeFormat: async () => {}, renameNote: async () => {}, apply: async () => {} },
    } as PlatformBridge;
    const a = createApp(bridge, messages);
    const vm = () => a.viewModels.select("vm.files", a.store.state) as { items: { label: string }[]; sortLabel: string; sortMenu: { items: { id: string; label: string; checked?: boolean }[] }[] };
    return { a, vm, saved: () => saved };
  }
  it("is a menu with Name and Last changed, the one in use checked; choosing one re-sorts and is remembered", async () => {
    const s = app();
    await s.a.start();
    await expect.poll(() => s.a.store.state.workspace.tree.roots.length).toBe(1);
    await s.a.commands.run("files.open");
    expect(s.vm().sortMenu[0]!.items.map((i) => [i.id, i.label, Boolean(i.checked)])).toEqual([["files.sort.name", "Name", true], ["files.sort.changed", "Last changed", false]]);
    expect(s.vm().sortLabel).toBe("Sort: Name");
    expect(s.vm().items.map((i) => i.label).slice(1, 7)).toEqual(["archive", "empty", "projects", "Apple", "Mango", "Zebra"]);
    await s.a.commands.run("files.sort.changed");
    expect(s.vm().items.map((i) => i.label).slice(1, 7)).toEqual(["projects", "archive", "empty", "Zebra", "Mango", "Apple"]);
    expect(s.vm().sortLabel).toBe("Sort: Last changed");
    expect(s.saved().filesSort).toBe("changed");
    await s.a.commands.run("files.sort.name");
    expect(s.saved().filesSort).toBeUndefined();
  });
  it("comes back at the next launch", async () => {
    const s = app({ filesSort: "changed" });
    await s.a.start();
    await expect.poll(() => s.a.store.state.workspace.tree.roots.length).toBe(1);
    await s.a.commands.run("files.open");
    expect(s.vm().items.map((i) => i.label).slice(1, 4)).toEqual(["projects", "archive", "empty"]);
  });
});
