/**
 * QLT-03 and PRF-10: the recovery journal's format (records, replay, compaction, a torn or damaged
 * tail), and the parsed-note snapshot (keys, eviction, frozen values).
 */
import { describe, expect, it } from "vitest";
import { compactJournal, encodeRecord, parseJournal, replay, textHash, type JournalRecord } from "../src/journal.ts";
import { SnapshotCache, deepFreeze } from "../src/snapshot.ts";

const text = (path: string, t: string, at = 1, base?: string): JournalRecord => ({ v: 1, op: "text", path, at, hash: textHash(t), ...(base ? { base } : {}), text: t });
const file = (...rs: JournalRecord[]) => rs.map(encodeRecord).join("");

describe("QLT-03: the recovery journal's format", () => {
  it("is one JSON record per line, and reads back as written", () => {
    const rs: JournalRecord[] = [text("/n/a.md", "Hello\n"), { v: 1, op: "saved", path: "/n/a.md", at: 2, hash: textHash("Hello\n") }, { v: 1, op: "moved", path: "/n/x", to: "/n/y", at: 3 }, { v: 1, op: "gone", path: "/n/b.md", at: 4 }];
    const content = file(...rs);
    expect(content.split("\n")).toHaveLength(5);
    expect(content.endsWith("\n")).toBe(true);
    expect(parseJournal(content)).toEqual({ records: rs, skipped: 0 });
  });
  it("hashes text with FNV-1a, as 8 hex digits", () => {
    expect(textHash("")).toBe("811c9dc5");
    expect(textHash("a")).toMatch(/^[0-9a-f]{8}$/);
    expect(textHash("a")).not.toBe(textHash("b"));
    expect(textHash("naïve 日本")).toBe(textHash("naïve 日本"));
  });
  it("keeps the latest unsaved text per note, with the hash of what was on disk under it", () => {
    const live = replay([text("/a.md", "one", 1, "b0"), text("/a.md", "one two", 2, "b0"), text("/b.md", "B", 3)]);
    expect([...live.keys()]).toEqual(["/a.md", "/b.md"]);
    expect(live.get("/a.md")).toMatchObject({ text: "one two", base: "b0", at: 2 });
  });
  it("a save of the latest text clears it; a save of older text makes that the base and keeps the newer text", () => {
    const older = { v: 1, op: "saved", path: "/a.md", at: 3, hash: textHash("one") } as const;
    const live = replay([text("/a.md", "one two", 2, "b0"), older]);
    expect(live.get("/a.md")).toMatchObject({ text: "one two", base: textHash("one") });
    expect(replay([{ v: 1, op: "saved", path: "/a.md", at: 4, hash: textHash("one two") }], live).size).toBe(0);
  });
  it("a save that supersedes the text (the app's latest, after an undo) clears it, whatever it holds", () => {
    // Typed over, then undone back to what was on disk and saved: the typed text must never come back.
    const rs: JournalRecord[] = [text("/a.md", "one two", 2, textHash("one")), { v: 1, op: "saved", path: "/a.md", at: 3, hash: textHash("one"), clean: true }];
    expect(parseJournal(file(...rs))).toEqual({ records: rs, skipped: 0 });
    expect(replay(rs).size).toBe(0);
    expect(parseJournal(file({ ...rs[1]!, clean: "yes" } as unknown as JournalRecord)).skipped).toBe(1);
  });
  it("renames and deletes carry the entries at or under a path, with either separator", () => {
    const live = replay([
      text("C:\\n\\drafts\\a.md", "A"), text("C:\\n\\drafts-old.md", "D"), text("/n/b.md", "B"),
      { v: 1, op: "moved", path: "C:\\n\\drafts", to: "C:\\n\\archive", at: 5 },
      { v: 1, op: "gone", path: "/n/b.md", at: 6 },
    ]);
    // drafts-old.md isn't inside drafts, though its name starts the same.
    expect([...live.keys()].sort()).toEqual(["C:\\n\\archive\\a.md", "C:\\n\\drafts-old.md"]);
    expect(live.get("C:\\n\\archive\\a.md")).toMatchObject({ path: "C:\\n\\archive\\a.md", text: "A" });
  });
  it("replay is idempotent: the same records, or the compacted journal, give the same entries", () => {
    const rs = [text("/a.md", "1", 1, "x"), text("/b.md", "2", 2), text("/a.md", "12", 3, "x"), { v: 1, op: "saved", path: "/b.md", at: 4, hash: textHash("2") } as const];
    const once = replay(rs);
    expect(replay(rs)).toEqual(once);
    expect(replay(rs, once)).toEqual(once);
    const compacted = compactJournal(once);
    expect(parseJournal(compacted).records).toHaveLength(1);
    expect(replay(parseJournal(compacted).records)).toEqual(once);
    // Appending after a compaction works the same as appending to the whole journal.
    const more = [text("/c.md", "3", 5)];
    expect(replay([...parseJournal(compacted).records, ...more])).toEqual(replay([...rs, ...more]));
  });
  it("skips an unfinished last line, so a crash mid-append keeps every record before it", () => {
    const whole = file(text("/a.md", "safe text"));
    const torn = encodeRecord(text("/a.md", "safe text and more")).slice(0, 30);
    const { records, skipped } = parseJournal(whole + torn);
    expect(skipped).toBe(1);
    expect(replay(records).get("/a.md")?.text).toBe("safe text");
  });
  it("skips damaged lines anywhere: bad JSON, unknown versions or operations, and text that doesn't match its hash", () => {
    const good = text("/a.md", "kept");
    const lying = { ...text("/b.md", "real"), text: "changed on disk" };
    const content = ["{not json", JSON.stringify({ ...good, v: 2 }), JSON.stringify({ v: 1, op: "nuke", path: "/a.md", at: 1 }), JSON.stringify(lying), JSON.stringify({ v: 1, op: "text", path: "", at: 1, hash: "x", text: "" }), JSON.stringify(good), ""].join("\n");
    const { records, skipped } = parseJournal(content);
    expect(skipped).toBe(5);
    expect(records).toEqual([good]);
    expect(parseJournal("").records).toEqual([]);
    expect(parseJournal("\n\n").skipped).toBe(0);
  });
});

describe("PRF-10: the parsed-note snapshot", () => {
  const note = (t: string) => ({ text: t, parts: { title: t.slice(0, 3), links: [t] } });
  const cache = (maxBytes = 1000) => new SnapshotCache<ReturnType<typeof note>>({ maxBytes, sizeOf: (n) => n.text.length });
  it("answers only for the same path, size, and modification time", () => {
    const c = cache();
    c.set({ path: "/a.md", size: 5, mtimeMs: 10 }, note("hello"));
    expect(c.get({ path: "/a.md", size: 5, mtimeMs: 10 })?.text).toBe("hello");
    expect(c.get({ path: "/b.md", size: 5, mtimeMs: 10 })).toBeUndefined();
    expect(c.get({ path: "/a.md", size: 5, mtimeMs: 11 })).toBeUndefined();
    // A changed note is forgotten, not kept beside the new one.
    expect(c.size).toBe(0);
    c.set({ path: "/a.md", size: 5, mtimeMs: 10 }, note("hello"));
    expect(c.get({ path: "/a.md", size: 6, mtimeMs: 10 })).toBeUndefined();
    expect(c.hits).toBe(1);
    expect(c.misses).toBe(3);
  });
  it("hands out a fresh top-level object over deep-frozen parts, so no caller can change the cached note", () => {
    const c = cache();
    const key = { path: "/a.md", size: 5, mtimeMs: 10 };
    c.set(key, note("hello"));
    const one = c.get(key)!;
    const two = c.get(key)!;
    expect(one).not.toBe(two);
    expect(one.parts).toBe(two.parts);
    one.text = "mine";
    expect(c.get(key)!.text).toBe("hello");
    expect(Object.isFrozen(one.parts) && Object.isFrozen(one.parts.links)).toBe(true);
    expect(() => { (one.parts as { title: string }).title = "x"; }).toThrow(TypeError);
    expect(() => { one.parts.links.push("x"); }).toThrow(TypeError);
  });
  it("forgets the least recently used notes once it's over its size, and never keeps one bigger than the whole cache", () => {
    const c = cache(10);
    c.set({ path: "/a", size: 1, mtimeMs: 1 }, note("aaaa"));
    c.set({ path: "/b", size: 1, mtimeMs: 1 }, note("bbbb"));
    c.get({ path: "/a", size: 1, mtimeMs: 1 }); // a is used again: b is now the oldest
    c.set({ path: "/c", size: 1, mtimeMs: 1 }, note("cccc"));
    expect(c.get({ path: "/b", size: 1, mtimeMs: 1 })).toBeUndefined();
    expect(c.get({ path: "/a", size: 1, mtimeMs: 1 })).toBeDefined();
    expect(c.bytes).toBe(8);
    c.set({ path: "/huge", size: 1, mtimeMs: 1 }, note("x".repeat(11)));
    expect(c.get({ path: "/huge", size: 1, mtimeMs: 1 })).toBeUndefined();
    expect(c.size).toBe(2);
  });
  it("follows renames and forgets deleted folders", () => {
    const c = cache();
    c.set({ path: "/n/drafts/a.md", size: 1, mtimeMs: 1 }, note("a"));
    c.set({ path: "/n/drafts.md", size: 1, mtimeMs: 1 }, note("d"));
    c.move("/n/drafts", "/n/archive");
    expect(c.get({ path: "/n/archive/a.md", size: 1, mtimeMs: 1 })?.text).toBe("a");
    expect(c.get({ path: "/n/drafts.md", size: 1, mtimeMs: 1 })?.text).toBe("d");
    c.delete("/n/archive");
    expect(c.size).toBe(1);
    c.clear();
    expect([c.size, c.bytes]).toEqual([0, 0]);
  });
  it("deep-freezes nested values once", () => {
    const v = deepFreeze({ a: [{ b: 1 }] });
    expect(Object.isFrozen(v.a[0])).toBe(true);
  });
});
