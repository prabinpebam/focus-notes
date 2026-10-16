/**
 * The demo's notes (WP-10.6, D-177): seeded from the sample notes once, on the first visit, so a
 * visitor's changes and deletions stay; Reset demo puts every sample note back and forgets the rest.
 * The sample notes show what the demo promises: folders, a table, formatting, links between notes,
 * and a private and a public note.
 */
import { describe, expect, it } from "vitest";
import { DEMO_NOTES, DEMO_PRIVATE, DEMO_PUBLIC } from "../src/demo/notes.ts";
import { DEMO_DATABASE, resetDemo, seedDemo, SEEDED, type DemoStore } from "../src/demo/seed.ts";
import { WEB_DATABASE } from "@focus-notes/core/inventory";

function memory(): DemoStore & { notes: Map<string, { path: string; text: string; updated: number }>; meta: Map<string, unknown> } {
  const notes = new Map<string, { path: string; text: string; updated: number }>();
  const meta = new Map<string, unknown>();
  return {
    notes, meta,
    putNote: async (n) => void notes.set(n.path, n),
    getMeta: async <T>(k: string) => meta.get(k) as T | undefined,
    setMeta: async (k, v) => void meta.set(k, v),
    clear: async () => { notes.clear(); meta.clear(); },
  };
}

describe("the demo's sample notes", () => {
  it("are about ten, in a Private and a Public root, with folders", () => {
    expect(DEMO_NOTES.length).toBeGreaterThanOrEqual(10);
    expect(DEMO_NOTES.every((n) => n.path.startsWith(`${DEMO_PRIVATE}/`) || n.path.startsWith(`${DEMO_PUBLIC}/`))).toBe(true);
    expect(DEMO_NOTES.some((n) => n.path.startsWith(`${DEMO_PUBLIC}/`))).toBe(true);
    expect(DEMO_NOTES.filter((n) => n.path.split("/").length > 2).length).toBeGreaterThanOrEqual(4);
  });
  it("show a table, formatting, tasks, and links between notes, and open on the welcome note", () => {
    const all = DEMO_NOTES.map((n) => n.text).join("\n");
    expect(all).toMatch(/\| --- \|/);
    expect(all).toMatch(/\*\*\w/);
    expect(all).toMatch(/- \[ \] /);
    expect(all).toMatch(/\]\([^)]+\.md\)/);
    expect(DEMO_NOTES[0]!.text).toMatch(/^# Welcome to the demo/);
    // The site's screenshots show the same essay (the curated workspace, D-176).
    expect(DEMO_NOTES.some((n) => n.text.startsWith("# On writing slowly"))).toBe(true);
  });
  it("live in their own database, never the web app's", () => {
    expect(DEMO_DATABASE).not.toBe(WEB_DATABASE);
  });
});

describe("seeding and resetting the demo", () => {
  it("writes every sample note on the first visit, the welcome note newest", async () => {
    const db = memory();
    expect(await seedDemo(db, 1_000_000)).toBe(true);
    expect([...db.notes.keys()].sort()).toEqual(DEMO_NOTES.map((n) => n.path).sort());
    const newest = [...db.notes.values()].sort((a, b) => b.updated - a.updated)[0]!;
    expect(newest.path).toBe(DEMO_NOTES[0]!.path);
    expect(db.meta.get(SEEDED)).toBe(true);
  });
  it("never again: a visitor's edits and deletions stay", async () => {
    const db = memory();
    await seedDemo(db);
    db.notes.set(DEMO_NOTES[0]!.path, { path: DEMO_NOTES[0]!.path, text: "# Mine\n", updated: 1 });
    db.notes.delete(DEMO_NOTES[1]!.path);
    expect(await seedDemo(db)).toBe(false);
    expect(db.notes.get(DEMO_NOTES[0]!.path)!.text).toBe("# Mine\n");
    expect(db.notes.has(DEMO_NOTES[1]!.path)).toBe(false);
  });
  it("Reset demo forgets the visitor's notes and settings and puts the sample notes back", async () => {
    const db = memory();
    await seedDemo(db);
    db.notes.set("Private/Mine.md", { path: "Private/Mine.md", text: "# Mine\n", updated: 1 });
    db.notes.set(DEMO_NOTES[0]!.path, { path: DEMO_NOTES[0]!.path, text: "changed", updated: 1 });
    db.meta.set("appState", { version: 1, appearance: "dark" });
    await resetDemo(db);
    expect(db.notes.has("Private/Mine.md")).toBe(false);
    expect(db.notes.get(DEMO_NOTES[0]!.path)!.text).toBe(DEMO_NOTES[0]!.text);
    expect(db.notes.size).toBe(DEMO_NOTES.length);
    expect(db.meta.has("appState")).toBe(false);
  });
});
