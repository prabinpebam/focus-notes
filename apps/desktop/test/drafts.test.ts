/**
 * QLT-06, QLT-03: crash recovery's draft store (Architecture → Crash recovery). Drafts live only in
 * the app's data folder, are keyed by draft ID (never a path), ordered by sequence, follow renames,
 * and are matched to notes at launch without writing anything to the workspace.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { encodeRecord, textHash } from "@focus-notes/core/journal";
import { DraftStore, frontMatterId, KEEP_MS, parseRenames, workspaceKey, type DraftCrypt, type DraftStoreOptions } from "../src/main/drafts.ts";

let root: string;
let data: string;
let ws: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fn-drafts-"));
  data = join(root, "data");
  ws = join(root, "ws");
  mkdirSync(data);
  mkdirSync(join(ws, "notes"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const W = 1; // a window's webContents ID
const W2 = 2;
const ID = (n: number) => `draft${String(n).padStart(8, "0")}`;
const note = (...parts: string[]) => join(ws, "notes", ...parts);
const put = (p: string, text: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};
const open = (o: Partial<DraftStoreOptions> = {}) => DraftStore.open({ dataDir: data, workspace: ws, ...o });
/** A crash: the store is dropped as it is, and the next launch opens it again. */
const relaunch = async (s: DraftStore, o: Partial<DraftStoreOptions> = {}) => {
  await s.settled();
  const again = open(o);
  await again.ready();
  return again;
};
const draftFiles = (s: DraftStore) => (existsSync(s.dir) ? readdirSync(s.dir) : []);
const header = (s: DraftStore, id: string) => JSON.parse(readFileSync(join(s.dir, `${id}.draft`), "utf8").split("\n")[0]!) as Record<string, unknown>;

/** Every path, size and hash in the workspace: a launch must leave it exactly as it was (R1). */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        out.push(`${relative(dir, p)}${sep}`);
        walk(p);
      } else out.push(`${relative(dir, p)} ${statSync(p).size} ${createHash("sha256").update(readFileSync(p)).digest("hex")}`);
    }
  };
  walk(dir);
  return out.sort();
}

describe("QLT-06: drafts while writing", () => {
  it("keeps one draft file per note in the app's data folder, with its identity in the header, never in the workspace", async () => {
    const a = note("a.md");
    put(a, "---\nid: n-1\n---\n# A\n");
    const before = snapshot(ws);
    const s = open();
    await s.keep(W, ID(1), 1, a, "---\nid: n-1\n---\n# A\n\ntyped");
    expect(s.dir).toBe(join(data, "recovery", workspaceKey(ws)));
    expect(draftFiles(s)).toEqual([`${ID(1)}.draft`]);
    expect(header(s, ID(1))).toMatchObject({ v: 1, draft: ID(1), seq: 1, path: "notes/a.md", noteId: "n-1", base: textHash("---\nid: n-1\n---\n# A\n"), ino: String(statSync(a, { bigint: true }).ino) });
    expect(readFileSync(join(s.dir, `${ID(1)}.draft`), "utf8").split("\n").slice(1).join("\n")).toBe("---\nid: n-1\n---\n# A\n\ntyped");
    expect(snapshot(ws)).toEqual(before);
  });

  it("the workspace key is the first 16 hex of the folder's real path's SHA-256, lowercased on Windows", () => {
    const real = realpathSync.native(ws);
    const p = real.split(sep).join("/");
    expect(workspaceKey(ws, true)).toBe(createHash("sha256").update(p.toLowerCase()).digest("hex").slice(0, 16));
    expect(workspaceKey(ws, false)).toBe(createHash("sha256").update(p).digest("hex").slice(0, 16));
  });

  it("orders by sequence: an older text arriving late is dropped", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    await s.keep(W, ID(1), 3, a, "three");
    await s.keep(W, ID(1), 2, a, "two, late");
    const again = await relaunch(s);
    const f = await again.found(W);
    expect(f.changed.map((d) => d.text)).toEqual([]);
    expect(f.matched.map((d) => d.text)).toEqual(["three"]);
  });

  it("DEF-14: texts that arrive while one is still being written go in as one, the latest", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    const all = [s.keep(W, ID(1), 1, a, "1"), s.keep(W, ID(1), 2, a, "12"), s.keep(W, ID(1), 3, a, "123")];
    await Promise.all(all);
    expect(header(s, ID(1)).seq).toBe(3);
    expect((await (await relaunch(s)).found(W)).matched[0]!.text).toBe("123");
  });

  it("refuses an ID that could be a path, and a note outside the workspace or not Markdown", async () => {
    const s = open();
    await expect(s.keep(W, "../../evil", 1, note("a.md"), "x")).rejects.toThrow();
    await expect(s.keep(W, "short", 1, note("a.md"), "x")).rejects.toThrow();
    await expect(s.keep(W, ID(1), 1, join(root, "outside.md"), "x")).rejects.toThrow();
    await expect(s.keep(W, ID(1), 1, note("a.txt"), "x")).rejects.toThrow();
    await expect(s.keep(W, ID(1), 1, join(ws, ".git", "x.md"), "x")).rejects.toThrow();
    await expect(s.keep(W, ID(1), -1, note("a.md"), "x")).rejects.toThrow();
    await expect(s.text("..\\..\\x")).rejects.toThrow();
    expect(draftFiles(s)).toEqual([]);
  });

  it("a save of the latest text clears the draft; a save of an older one keeps the newer text, over what's on disk now", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    await s.keep(W, ID(1), 1, a, "# A one");
    put(a, "# A one");
    await s.saved(W, ID(1), 1);
    expect(draftFiles(s)).toEqual([]);
    await s.keep(W, ID(2), 1, a, "# A two");
    await s.keep(W, ID(2), 2, a, "# A two more");
    put(a, "# A two");
    await s.saved(W, ID(2), 1);
    expect(header(s, ID(2))).toMatchObject({ seq: 2, base: textHash("# A two") });
    const f = await (await relaunch(s)).found(W);
    expect(f.matched.map((d) => d.text)).toEqual(["# A two more"]);
  });

  it("discard deletes the draft; another window can't touch it", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    await s.keep(W, ID(1), 1, a, "typed");
    await s.discard(W2, ID(1));
    await s.saved(W2, ID(1), 5);
    await s.keep(W2, ID(1), 9, a, "someone else's");
    expect(header(s, ID(1)).seq).toBe(1);
    await s.discard(W, ID(1));
    expect(draftFiles(s)).toEqual([]);
  });

  it("follows the app's renames and folder moves; deletes drop a note's draft", async () => {
    put(note("drafts", "a.md"), "# A");
    put(note("b.md"), "# B");
    const s = open();
    await s.keep(W, ID(1), 1, note("drafts", "a.md"), "A typed");
    await s.keep(W, ID(2), 1, note("b.md"), "B typed");
    renameSync(join(ws, "notes", "drafts"), join(ws, "notes", "archive"));
    await s.moved(note("drafts"), note("archive"));
    // A late text names only the draft: it stays with the note, whatever path the window sent.
    await s.keep(W, ID(1), 2, note("drafts", "a.md"), "A typed more");
    expect(header(s, ID(1)).path).toBe("notes/archive/a.md");
    await s.gone(note("b.md"));
    expect(draftFiles(s)).toEqual([`${ID(1)}.draft`]);
  });

  it("DEF-34: text sent under a note's old name after a rename follows the note, so a restart brings back no copy under the old name", async () => {
    const names = ["untitled.md", "what-is.md", "what-is-good.md"].map((n) => note(n)) as [string, string, string];
    put(names[0], "# Untitled");
    const s = open();
    // Each title renames the file; the window's first text still names the note before them.
    for (let i = 1; i < names.length; i++) {
      renameSync(names[i - 1]!, names[i]!);
      await s.moved(names[i - 1]!, names[i]!);
    }
    await s.keep(W, ID(1), 1, names[0], "# What is good, typed while the first rename was committed");
    await s.keep(W, ID(1), 2, names[1], "# What is good, typed while the second rename was committed");
    expect(header(s, ID(1)).path).toBe("notes/what-is-good.md");
    const before = snapshot(ws);
    const f = await (await relaunch(s)).found(W);
    expect(f.matched.map((d) => [d.path, d.text])).toEqual([[names[2], "# What is good, typed while the second rename was committed"]]);
    expect(readdirSync(join(ws, "notes"))).toEqual(["what-is-good.md"]);
    expect(snapshot(ws)).toEqual(before);
  });

  it("DEF-34: a folder's move takes a new draft's late text along; a new note made under an old name keeps its own", async () => {
    const s = open();
    put(note("archive", "a.md"), "# A");
    await s.moved(note("drafts"), note("archive"));
    await s.keep(W, ID(1), 1, note("drafts", "a.md"), "A, typed during the move");
    expect(header(s, ID(1)).path).toBe("notes/archive/a.md");
    const b = note("b.md");
    await s.moved(b, note("c.md"));
    put(b, "# A new note named b");
    await s.keep(W, ID(2), 1, b, "# A new note named b, typed");
    expect(header(s, ID(2)).path).toBe("notes/b.md");
  });

  it("follows a rename the watcher sees (the same file ID under a new name)", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    await s.keep(W, ID(1), 1, a, "typed");
    renameSync(a, note("renamed.md"));
    await s.seen([a], [note("renamed.md")]);
    expect(header(s, ID(1)).path).toBe("notes/renamed.md");
  });

  it("a batch's rewrite of a note moves the draft's base to the new text", async () => {
    const a = note("a.md");
    put(a, "# A [x](old.md)");
    const s = open();
    await s.keep(W, ID(1), 1, a, "# A [x](new.md) typed");
    put(a, "# A [x](new.md)");
    await s.rewritten(a);
    expect(header(s, ID(1)).base).toBe(textHash("# A [x](new.md)"));
  });

  it("damage in one draft file loses only that draft; a write cut short leaves the draft as it was", async () => {
    put(note("a.md"), "# A");
    put(note("b.md"), "# B");
    const s = open();
    await s.keep(W, ID(1), 1, note("a.md"), "A typed");
    await s.keep(W, ID(2), 1, note("b.md"), "B typed");
    await s.settled();
    writeFileSync(join(s.dir, `${ID(1)}.draft`), "{not json\nA typed");
    writeFileSync(join(s.dir, `${ID(2)}.draft.123.9.tmp`), "half a write");
    const again = await relaunch(s);
    expect((await again.found(W)).matched.map((d) => d.text)).toEqual(["B typed"]);
    expect(draftFiles(again).sort()).toEqual([`${ID(1)}.draft`, `${ID(2)}.draft`]);
  });
});

describe("QLT-06: at launch, match and write nothing", () => {
  it("each rung: saved, matched, changed, moved by note ID, by file ID, by Git, by unique content, and recovered; the workspace is untouched", async () => {
    const files: Record<string, string> = {
      saved: "# Saved", matched: "# Matched", changed: "# Changed", byId: "---\nid: n-7\n---\n# By id", byIno: "# By ino", byGit: "# By git", byHash: "# By hash", lost: "# Lost",
    };
    for (const [k, t] of Object.entries(files)) put(note(`${k}.md`), t);
    mkdirSync(join(ws, ".git"));
    const head = "a".repeat(40);
    const calls: string[][] = [];
    const git = async (_cwd: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "rev-parse") return `${head}\n`;
      if (args[0] === "diff") return "R100\0notes/byGit.md\0notes/git-moved.md\0M\0notes/other.md\0";
      return undefined;
    };
    const s = open({ git });
    let n = 0;
    for (const k of Object.keys(files)) await s.keep(W, ID(++n), 1, note(`${k}.md`), `${files[k]}\n\ntyped`);
    await s.settled();
    // While the app was closed: saved, changed, renamed in three ways, a duplicate made, a note deleted.
    put(note("saved.md"), "# Saved\n\ntyped");
    put(note("changed.md"), "# Changed elsewhere");
    renameSync(note("byId.md"), note("id-moved.md"));
    // An atomic save elsewhere gives the note a new file ID: only its front-matter ID finds it.
    writeFileSync(note("id-moved.md"), readFileSync(note("id-moved.md")));
    renameSync(note("byIno.md"), note("ino-moved.md"));
    // Git found the rename: the file was copied (a new file ID) and the old one removed.
    writeFileSync(note("git-moved.md"), files.byGit!);
    rmSync(note("byGit.md"));
    writeFileSync(note("hash-moved.md"), files.byHash!);
    rmSync(note("byHash.md"));
    rmSync(note("lost.md"));
    const before = snapshot(ws);
    const again = open({ git });
    const f = await again.found(W);
    expect(snapshot(ws)).toEqual(before);
    const by = (list: { path: string }[]) => list.map((d) => relative(ws, d.path).split(sep).join("/")).sort();
    expect(by(f.matched)).toEqual(["notes/git-moved.md", "notes/hash-moved.md", "notes/id-moved.md", "notes/ino-moved.md", "notes/matched.md"]);
    expect(f.changed.map((d) => [relative(ws, d.path).split(sep).join("/"), d.text, d.disk])).toEqual([["notes/changed.md", "# Changed\n\ntyped", "# Changed elsewhere"]]);
    expect(f.recovered).toBe(1);
    expect(f.matched.find((d) => d.path.endsWith("matched.md"))).toMatchObject({ title: "Matched", text: "# Matched\n\ntyped" });
    expect(calls.some((a) => a[0] === "diff" && a.includes(head))).toBe(true);
    // The saved draft went; the recovered one is listed, newest first, until 30 days on.
    const r = await again.recovered();
    expect(r.map((d) => [d.title, d.where, d.chars, d.until - d.at])).toEqual([["Lost", "notes", "# Lost\n\ntyped".length, KEEP_MS]]);
    expect(await again.text(r[0]!.id)).toBe("# Lost\n\ntyped");
    expect(await again.count()).toBe(7);
    expect(again.stats()).toMatchObject({ drafts: 7, matched: 5, changed: 1, recovered: 1 });
    expect(snapshot(ws)).toEqual(before);
    // A recovered draft stays recovered at the next launch, and goes when the person discards it.
    const third = await relaunch(again);
    expect((await third.recovered()).map((d) => d.title)).toEqual(["Lost"]);
    await third.remove(r[0]!.id);
    expect(await third.recovered()).toEqual([]);
    expect(snapshot(ws)).toEqual(before);
  });

  it("is told once: to the first window that asks, which adopts the drafts and counts from 1 again", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    await s.keep(W, ID(1), 40, a, "# A typed");
    const again = await relaunch(s);
    expect((await again.found(W)).matched.map((d) => d.draft)).toEqual([ID(1)]);
    expect(await again.found(W)).toEqual({ matched: [], changed: [], recovered: 0 });
    expect(await again.found(W2)).toEqual({ matched: [], changed: [], recovered: 0 });
    // The adopting window counts from 1: that's kept, and its save clears the draft.
    await again.keep(W, ID(1), 1, a, "# A typed again");
    expect(header(again, ID(1)).seq).toBe(1);
    await again.keep(W2, ID(1), 99, a, "another window's text");
    expect(header(again, ID(1)).seq).toBe(1);
    await again.saved(W, ID(1), 1);
    expect(await again.count()).toBe(0);
  });

  it("a live window's drafts are never found by another; after its renderer is replaced they're told to it again", async () => {
    const a = note("a.md");
    put(a, "# A");
    const s = open();
    await s.ready();
    expect(await s.found(W)).toEqual({ matched: [], changed: [], recovered: 0 });
    await s.keep(W, ID(1), 1, a, "# A typed");
    expect((await s.found(W2)).matched).toEqual([]);
    s.release(W);
    expect((await s.found(W2)).matched).toEqual([]);
    const f = await s.found(W);
    expect(f.matched.map((d) => [d.draft, d.text])).toEqual([[ID(1), "# A typed"]]);
    await s.keep(W, ID(1), 1, a, "# A typed more");
    expect(header(s, ID(1)).seq).toBe(1);
  });

  it("only the open workspace's drafts: another workspace's wait for it", async () => {
    const other = join(root, "other");
    put(join(other, "notes", "x.md"), "# X");
    const s = open({ workspace: other });
    await s.keep(W, ID(1), 1, join(other, "notes", "x.md"), "# X typed");
    await s.settled();
    const here = open();
    expect(await here.found(W)).toEqual({ matched: [], changed: [], recovered: 0 });
    expect(await here.count()).toBe(0);
    expect((await open({ workspace: other }).found(W)).matched.map((d) => d.text)).toEqual(["# X typed"]);
  });
});

describe("QLT-06: retention, size and privacy", () => {
  it("deletes unplaced drafts 30 days after their last text", async () => {
    put(note("a.md"), "# A");
    put(note("b.md"), "# B");
    let now = 1_000_000;
    const s = open({ now: () => now });
    await s.keep(W, ID(1), 1, note("a.md"), "A typed");
    now += 1000;
    await s.keep(W, ID(2), 1, note("b.md"), "B typed");
    await s.settled();
    rmSync(note("a.md"));
    rmSync(note("b.md"));
    const second = await relaunch(s, { now: () => now });
    expect((await second.found(W)).recovered).toBe(2);
    now += KEEP_MS - 500;
    const third = await relaunch(second, { now: () => now });
    expect((await third.recovered()).map((d) => d.id)).toEqual([ID(2)]);
  });

  it("past the size cap, the oldest unplaced drafts go first, never a matched one", async () => {
    let now = 1_000;
    const big = "x".repeat(2000);
    for (const n of ["a", "b", "c", "m"]) put(note(`${n}.md`), `# ${n}`);
    const s = open({ now: () => now });
    for (const [i, n] of ["a", "b", "c", "m"].entries()) {
      now += 1000;
      await s.keep(W, ID(i + 1), 1, note(`${n}.md`), `${n}${big}`);
    }
    await s.settled();
    for (const n of ["a", "b", "c"]) rmSync(note(`${n}.md`));
    // Room for about two drafts: the matched one and the newest recovered stay.
    const again = await relaunch(s, { now: () => now, maxBytes: 4600 });
    const f = await again.found(W);
    expect(f.matched.map((d) => d.draft)).toEqual([ID(4)]);
    expect((await again.recovered()).map((d) => d.id)).toEqual([ID(3)]);
  });

  it("encrypts a private note's draft with the key store, and reads it back", async () => {
    const crypt: DraftCrypt = {
      available: () => true,
      encrypt: (t) => Buffer.from([...Buffer.from(t, "utf8")].map((b) => b ^ 0x5a)),
      decrypt: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString("utf8"),
    };
    const p = join(ws, "private", "notes", "secret.md");
    put(p, "# Secret");
    put(note("open.md"), "# Open");
    const s = open({ crypt });
    await s.keep(W, ID(1), 1, p, "# Secret and private words");
    await s.keep(W, ID(2), 1, note("open.md"), "# Open words");
    await s.settled();
    const raw = readFileSync(join(s.dir, `${ID(1)}.draft`), "utf8");
    expect(raw).not.toContain("private words");
    expect(header(s, ID(1))).toMatchObject({ enc: "os", path: "private/notes/secret.md" });
    expect(header(s, ID(2)).enc).toBeUndefined();
    const f = await (await relaunch(s, { crypt })).found(W);
    expect(f.matched.map((d) => d.text).sort()).toEqual(["# Open words", "# Secret and private words"]);
  });

  it("removing the workspace or signing out deletes its drafts", async () => {
    put(note("a.md"), "# A");
    const s = open();
    await s.keep(W, ID(1), 1, note("a.md"), "typed");
    expect(await s.count()).toBe(1);
    await s.removeAll();
    expect(existsSync(s.dir)).toBe(false);
    expect(await s.count()).toBe(0);
  });
});

describe("QLT-06: leaving the journal behind", () => {
  it("turns the journal's unsaved notes into drafts once, deletes it, and writes nothing to the workspace", async () => {
    put(note("a.md"), "# A");
    put(note("gone-old-name.md"), "# Renamed");
    renameSync(note("gone-old-name.md"), note("renamed.md"));
    const journal = join(data, "recovery-journal.jsonl");
    const rec = (path: string, text: string, base?: string) => encodeRecord({ v: 1, op: "text", path, at: Date.now() - 60_000, hash: textHash(text), ...(base ? { base } : {}), text });
    writeFileSync(journal, [
      rec(note("a.md"), "# A typed", textHash("# A")),
      rec(note("gone-old-name.md"), "# Renamed typed", textHash("# Renamed")),
      rec(join(root, "elsewhere", "x.md"), "# Elsewhere typed"),
    ].join(""));
    const before = snapshot(ws);
    const s = open({ journal });
    const f = await s.found(W);
    expect(existsSync(journal)).toBe(false);
    expect(snapshot(ws)).toEqual(before);
    expect(f.matched.map((d) => [relative(ws, d.path).split(sep).join("/"), d.text]).sort()).toEqual([["notes/a.md", "# A typed"], ["notes/renamed.md", "# Renamed typed"]]);
    // A note outside this workspace waits in Recovered.
    expect((await s.recovered()).map((d) => [d.title, d.where])).toEqual([["Elsewhere typed", ""]]);
  });
});

describe("helpers", () => {
  it("reads a front-matter id, and Git's renames", () => {
    expect(frontMatterId("---\nid: abc-1\ntitle: x\n---\n# T")).toBe("abc-1");
    expect(frontMatterId("---\r\nid: \"q\"\r\n---\r\n")).toBe("q");
    expect(frontMatterId("# No front matter\nid: x")).toBeUndefined();
    expect([...parseRenames("R090\0a.md\0b.md\0D\0c.md\0C100\0d.md\0e.md\0")]).toEqual([["a.md", "b.md"]]);
  });

  it("a damaged draft that's older than 30 days is cleaned up", async () => {
    const s = open();
    await s.ready();
    mkdirSync(s.dir, { recursive: true });
    const f = join(s.dir, `${ID(9)}.draft`);
    writeFileSync(f, "garbage");
    const old = (Date.now() - KEEP_MS - 60_000) / 1000;
    utimesSync(f, old, old);
    await open().ready();
    expect(existsSync(f)).toBe(false);
  });
});
