/**
 * Unit tests for one-time browser draft export (WEB-01, D-292, D-412):
 * - all non-deleted drafts exported (including collision-safe merge of focus-notes + focus-notes-demo)
 * - nothing deleted before or after export, and failed export preserves every draft and allows retry
 * - empty state (no drafts) triggers onEmpty and never writes a bundle
 */
import { describe, expect, it, vi } from "vitest";
import { parseBundle } from "@focus-notes/core/notes";
import { createWebExportController, type BrowserDraft } from "@focus-notes/core/web-export";
import { LEGACY_DEMO_DATABASE, readBrowserDrafts } from "../src/export-drafts.ts";
import { WEB_DATABASE } from "@focus-notes/core/inventory";

interface FakeStoreRecord {
  path: string;
  text: string;
  updated: number;
  deleted?: boolean;
}

/** Minimal read-only-enforcing fake IDBFactory to prove export never writes or deletes. */
function fakeIndexedDb(dbs: Record<string, FakeStoreRecord[]>) {
  const writes: string[] = [];
  const deletes: string[] = [];
  const factory = {
    async databases() {
      return Object.keys(dbs).map((name) => ({ name, version: 1 }));
    },
    open(name: string) {
      const req = {
        result: undefined as unknown,
        error: null as DOMException | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      };
      queueMicrotask(() => {
        const exists = Object.hasOwn(dbs, name);
        const rows = dbs[name] ?? [];
        const db = {
          objectStoreNames: { contains: (s: string) => exists && s === "notes" },
          close() {},
          transaction(_store: string, mode: IDBTransactionMode) {
            if (mode !== "readonly") writes.push(`${name}:${mode}`);
            return {
              objectStore() {
                return {
                  getAll() {
                    const r = { result: rows.map((x) => ({ ...x })), error: null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
                    queueMicrotask(() => r.onsuccess?.());
                    return r;
                  },
                  delete(key: string) { deletes.push(`${name}:${key}`); },
                  clear() { deletes.push(`${name}:*`); },
                };
              },
            };
          },
        };
        req.result = db;
        if (!exists) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase(name: string) {
      deletes.push(`db:${name}`);
      throw new Error("deleteDatabase must never be called");
    },
  } as unknown as IDBFactory;
  return { factory, writes, deletes };
}

describe("WEB-01, D-292: readBrowserDrafts", () => {
  it("reads all non-deleted drafts from both focus-notes and focus-notes-demo without writing or deleting", async () => {
    const { factory, writes, deletes } = fakeIndexedDb({
      [WEB_DATABASE]: [
        { path: "Welcome.md", text: "# Welcome\nApp draft.", updated: 1000 },
        { path: "notes/ideas.md", text: "# Ideas\nKeep me.", updated: 2000 },
        { path: "trashed.md", text: "# Gone", updated: 3000, deleted: true },
      ],
      [LEGACY_DEMO_DATABASE]: [
        { path: "Welcome.md", text: "# Demo welcome\nEdited demo draft.", updated: 4000 },
        { path: "private/sketch.md", text: "# Sketch", updated: 5000 },
      ],
    });

    const drafts = await readBrowserDrafts(factory);
    expect(drafts).toEqual([
      { path: "Welcome.md", text: "# Welcome\nApp draft.", updated: 1000 },
      { path: "notes/ideas.md", text: "# Ideas\nKeep me.", updated: 2000 },
      { path: "demo/Welcome.md", text: "# Demo welcome\nEdited demo draft.", updated: 4000 },
      { path: "private/sketch.md", text: "# Sketch", updated: 5000 },
    ]);
    expect(writes).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("returns an empty list when no legacy databases exist", async () => {
    const { factory, writes, deletes } = fakeIndexedDb({});
    expect(await readBrowserDrafts(factory)).toEqual([]);
    expect(writes).toEqual([]);
    expect(deletes).toEqual([]);
  });
});

describe("WEB-01, D-292, D-412: createWebExportController", () => {
  const sample: BrowserDraft[] = [
    { path: "Welcome.md", text: "# Welcome\nFirst draft.", updated: 1_700_000_000_000 },
    { path: "Journal/today.md", text: "# Today\nSecond draft.", updated: 1_700_000_010_000 },
  ];

  it("exports all drafts as a valid Focus Notes bundle and transitions ready -> exporting -> done", async () => {
    const saved: { fileName: string; content: string }[] = [];
    const phases: string[] = [];
    const onDownload = vi.fn();
    const ctrl = createWebExportController({
      readDrafts: async () => sample,
      saveBundle: (fileName, content) => { saved.push({ fileName, content }); },
      onDownload,
      now: () => new Date("2026-11-24T12:00:00.000Z"),
    });
    ctrl.subscribe(() => phases.push(ctrl.state.phase));

    await ctrl.start();
    expect(ctrl.state.phase).toBe("ready");
    expect(ctrl.state.count).toBe(2);

    await ctrl.exportDrafts();
    expect(ctrl.state.phase).toBe("done");
    expect(ctrl.state.count).toBe(2);
    expect(phases).toEqual(["ready", "exporting", "done"]);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.fileName).toBe("focus-notes-export-2026-11-24.json");
    const parsed = parseBundle(saved[0]!.content);
    expect(parsed.notes).toEqual([
      { path: "Journal/today.md", text: "# Today\nSecond draft.", updated: new Date(1_700_000_010_000).toISOString() },
      { path: "Welcome.md", text: "# Welcome\nFirst draft.", updated: new Date(1_700_000_000_000).toISOString() },
    ]);

    ctrl.download();
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("keeps all drafts intact on failed export and succeeds on retry", async () => {
    const store = sample.map((d) => ({ ...d }));
    let failNext = true;
    const saved: string[] = [];
    const ctrl = createWebExportController({
      readDrafts: async () => store.map((d) => ({ ...d })),
      saveBundle: (_name, content) => {
        if (failNext) {
          failNext = false;
          throw new Error("disk full");
        }
        saved.push(content);
      },
      onDownload: () => {},
    });

    await ctrl.start();
    expect(ctrl.state.phase).toBe("ready");
    expect(ctrl.state.count).toBe(2);

    await ctrl.exportDrafts();
    expect(ctrl.state.phase).toBe("failed");
    expect(ctrl.state.count).toBe(2);
    expect(store).toEqual(sample);
    expect(saved).toHaveLength(0);

    await ctrl.exportDrafts();
    expect(ctrl.state.phase).toBe("done");
    expect(ctrl.state.count).toBe(2);
    expect(store).toEqual(sample);
    expect(parseBundle(saved[0]!).notes).toEqual([
      { path: "Journal/today.md", text: "# Today\nSecond draft.", updated: new Date(1_700_000_010_000).toISOString() },
      { path: "Welcome.md", text: "# Welcome\nFirst draft.", updated: new Date(1_700_000_000_000).toISOString() },
    ]);
  });

  it("handles the empty state without exporting anything and notifies onEmpty", async () => {
    const saveBundle = vi.fn();
    const onEmpty = vi.fn();
    const ctrl = createWebExportController({
      readDrafts: async () => [],
      saveBundle,
      onDownload: () => {},
      onEmpty,
    });

    await ctrl.start();
    expect(ctrl.state.phase).toBe("empty");
    expect(ctrl.state.count).toBe(0);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(saveBundle).not.toHaveBeenCalled();
  });
});
