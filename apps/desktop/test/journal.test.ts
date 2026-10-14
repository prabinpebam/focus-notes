/**
 * QLT-03: the recovery journal on disk, as the desktop's main process keeps it: appended in order,
 * emptied when nothing is unsaved, compacted once it grows, read back after a crash with a torn
 * tail, and restored into each note, or beside it when the note changed since. Restoring is
 * idempotent: a crash during the restore brings nothing back twice.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { textHash } from "@focus-notes/core/journal";
import { RecoveryJournal, recoveredCopyPath, restoreJournal, type RestoreIo } from "../src/main/journal.ts";

let dir: string;
let file: string;
let notes: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fn-journal-"));
  file = join(dir, "recovery-journal.jsonl");
  notes = join(dir, "notes");
  mkdirSync(notes);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const diskHash = async (p: string) => (existsSync(p) ? textHash(readFileSync(p, "utf8")) : undefined);
const open = (opts = {}) => RecoveryJournal.open(file, { baseOf: diskHash, ...opts });
const io: RestoreIo = {
  read: async (p) => (existsSync(p) ? readFileSync(p, "utf8") : undefined),
  write: async (p, t) => writeFileSync(p, t),
};

describe("QLT-03: the journal file", () => {
  it("appends each note's unsaved text, records what was on disk under it, and reads it all back after a crash", async () => {
    const a = join(notes, "a.md");
    writeFileSync(a, "# A\n\nsaved");
    const j = await open();
    await j.text(a, "# A\n\nsaved and typed");
    await j.text(a, "# A\n\nsaved and typed more");
    await j.text(join(notes, "new.md"), "never saved");
    expect(readFileSync(file, "utf8").split("\n").filter(Boolean)).toHaveLength(3);
    // A crash: nothing is closed. The next launch reads it.
    const again = await open();
    expect(again.entries().map((e) => [e.path, e.text, e.base])).toEqual([
      [a, "# A\n\nsaved and typed more", textHash("# A\n\nsaved")],
      [join(notes, "new.md"), "never saved", undefined],
    ]);
  });

  it("a save of the latest text clears it, and once nothing is unsaved the file is emptied", async () => {
    const a = join(notes, "a.md");
    const j = await open();
    await j.text(a, "one");
    await j.text(a, "one two");
    await j.saved(a, "one"); // an older save finishing late keeps the newer text
    expect((await open()).entries()[0]).toMatchObject({ text: "one two", base: textHash("one") });
    await j.saved(a, "one two");
    expect(j.entries()).toEqual([]);
    expect(statSync(file).size).toBe(0);
    // Saves of notes it doesn't hold write nothing.
    await j.saved(join(notes, "other.md"), "x");
    expect(statSync(file).size).toBe(0);
  });

  it("a save sent after the text supersedes it: undone text never comes back, and text sent after the save stays", async () => {
    const a = join(notes, "a.md");
    writeFileSync(a, "one");
    const j = await open();
    // Typed, then undone back to what's on disk before the save ran: the save of "one" is the latest.
    await j.text(a, "one two");
    const upTo = j.mark();
    writeFileSync(a, "one");
    await j.saved(a, "one", upTo);
    expect(j.entries()).toEqual([]);
    expect((await open()).entries()).toEqual([]);
    // Text that reached the journal after the save was sent is newer than it, so it stays.
    const before = j.mark();
    await j.text(a, "one three");
    await j.saved(a, "one", before);
    expect((await open()).entries()).toMatchObject([{ text: "one three", base: textHash("one") }]);
    // And after a rename, under its new name.
    await j.moved(a, join(notes, "b.md"));
    const now = j.mark();
    await j.saved(join(notes, "b.md"), "one four", now);
    expect(j.entries()).toEqual([]);
  });

  it("rewrites itself smaller once it grows past its limit, keeping only what's unsaved", async () => {
    const a = join(notes, "a.md");
    const j = await open({ compactBytes: 2000 });
    for (let i = 0; i < 50; i++) await j.text(a, `typing ${"x".repeat(i * 5)}`);
    await j.text(join(notes, "b.md"), "B");
    expect(statSync(file).size).toBeLessThanOrEqual(2000);
    expect(j.bytes).toBe(statSync(file).size);
    const back = await open();
    expect(back.entries().map((e) => e.text)).toEqual([`typing ${"x".repeat(245)}`, "B"]);
    // No temporary file is left beside it.
    expect(readdirSync(dir).sort()).toEqual(["notes", "recovery-journal.jsonl"]);
  });

  it("a crash in the middle of an append loses only that append", async () => {
    const a = join(notes, "a.md");
    const j = await open();
    await j.text(a, "kept");
    appendFileSync(file, '{"v":1,"op":"text","path":"x","at":1,"hash":"00');
    const logged: string[] = [];
    const back = await open({ log: (l: string) => logged.push(l) });
    expect(back.entries().map((e) => e.text)).toEqual(["kept"]);
    expect(logged).toEqual(["journal: skipped 1 damaged line(s)"]);
    // Appending after a torn tail starts a fresh line: the torn bytes stay unreadable, nothing else is.
    await back.text(a, "kept and more");
    expect((await open()).entries().map((e) => e.text)).toEqual(["kept and more"]);
  });

  it("follows renames and deletes, and forgets everything on Close without saving", async () => {
    const j = await open();
    await j.text(join(notes, "drafts", "a.md"), "A");
    await j.text(join(notes, "b.md"), "B");
    await j.moved(join(notes, "drafts"), join(notes, "archive"));
    await j.gone(join(notes, "b.md"));
    expect((await open()).entries().map((e) => e.path)).toEqual([join(notes, "archive", "a.md")]);
    await j.clear();
    expect(existsSync(file)).toBe(false);
    expect((await open()).entries()).toEqual([]);
  });

  it("a clean quit deletes the file when everything is saved, and keeps it when something isn't", async () => {
    const j = await open();
    await j.text(join(notes, "a.md"), "A");
    await j.close();
    expect(existsSync(file)).toBe(true);
    await j.saved(join(notes, "a.md"), "A");
    await j.close();
    expect(existsSync(file)).toBe(false);
  });
});

describe("QLT-03: restoring after a crash", () => {
  it("puts the text back into a note that's as it was under it, or that's gone, then empties the journal", async () => {
    const a = join(notes, "a.md");
    writeFileSync(a, "# Plans\n\nold");
    const j = await open();
    await j.text(a, "# Plans\n\nold and new");
    await j.text(join(notes, "fresh.md"), "# Fresh\n");
    const back = await open();
    const restored = await restoreJournal(back, io);
    expect(restored).toEqual([{ path: a, title: "Plans" }, { path: join(notes, "fresh.md"), title: "Fresh" }]);
    expect(readFileSync(a, "utf8")).toBe("# Plans\n\nold and new");
    expect(readFileSync(join(notes, "fresh.md"), "utf8")).toBe("# Fresh\n");
    expect(back.entries()).toEqual([]);
    expect(statSync(file).size).toBe(0);
  });

  it("keeps the text beside a note that changed since, so neither version is lost", async () => {
    const a = join(notes, "a.md");
    writeFileSync(a, "# Plans\n\nold");
    const j = await open();
    await j.text(a, "# Plans\n\nmine");
    writeFileSync(a, "# Plans\n\nchanged elsewhere");
    writeFileSync(join(notes, "a (recovered).md"), "taken");
    const restored = await restoreJournal(await open(), io);
    const copy = join(notes, "a (recovered 2).md");
    expect(restored).toEqual([{ path: a, title: "Plans", copy: { path: copy, title: "a (recovered 2)" } }]);
    expect(readFileSync(a, "utf8")).toBe("# Plans\n\nchanged elsewhere");
    expect(readFileSync(copy, "utf8")).toBe("# Plans\n\nmine");
    expect((await open()).entries()).toEqual([]);
  });

  it("is idempotent: a crash after a note was written, before the journal knew, restores nothing twice", async () => {
    const a = join(notes, "a.md");
    writeFileSync(a, "old");
    const j = await open();
    await j.text(a, "new");
    // The first restore wrote the note, then the app died before recording it.
    writeFileSync(a, "new");
    const restored = await restoreJournal(await open(), io);
    expect(restored).toEqual([]);
    expect(readdirSync(notes)).toEqual(["a.md"]);
    expect((await open()).entries()).toEqual([]);
  });

  it("leaves a note it can't write (a read-only workspace) in the journal for next time", async () => {
    const a = join(notes, "a.md");
    const j = await open();
    await j.text(a, "unsaved");
    const back = await open();
    const restored = await restoreJournal(back, { ...io, write: async () => { throw new Error("read-only"); } });
    expect(restored).toEqual([]);
    expect((await open()).entries().map((e) => e.text)).toEqual(["unsaved"]);
  });

  it("names copies beside the note", () => {
    expect(recoveredCopyPath(join(notes, "a.md"), () => false)).toBe(join(notes, "a (recovered).md"));
    const taken = new Set([join(notes, "a (recovered).md"), join(notes, "a (recovered 2).md")]);
    expect(recoveredCopyPath(join(notes, "a.md"), (p) => taken.has(p))).toBe(join(notes, "a (recovered 3).md"));
  });
});
