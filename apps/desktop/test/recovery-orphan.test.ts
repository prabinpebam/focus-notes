/**
 * QLT-06's narrow crash window (seed 739339's shape), built directly: a new note with no front-matter
 * `id` is saved (its file replaced, a new file ID) and renamed by its title, and the app dies before the
 * store hears of either. The draft is left keyed to the old path, the old file ID, no note ID, a base
 * no file has, and a `HEAD` Git sees no rename since. Every rung of the ladder misses, so the text must
 * reach Files → Recovered exactly as typed, and Save as a new note must put those bytes on disk.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, titleOfMarkdown, type PlatformBridge, type RecoveryBridge, type WorkspaceOp } from "@focus-notes/core";
import { textHash } from "@focus-notes/core/journal";
import en from "../../../packages/views/messages/en.json" with { type: "json" };
import { DraftStore } from "../src/main/drafts.ts";

let root: string;
let data: string;
let ws: string;
let notes: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fn-orphan-"));
  data = join(root, "data");
  ws = join(root, "ws");
  notes = join(ws, "notes");
  mkdirSync(data);
  mkdirSync(notes, { recursive: true });
  mkdirSync(join(ws, ".git"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const W = 1;
const DRAFT = "draftORPHAN0000001";
const HEAD = "b".repeat(40);
/** Git knows `HEAD`, and its diff since then shows no rename: the new note was never committed. */
const git = async (_cwd: string, args: string[]) => (args[0] === "rev-parse" ? `${HEAD}\n` : args[0] === "diff" ? "" : undefined);
const open = () => DraftStore.open({ dataDir: data, workspace: ws, git });
const header = (s: DraftStore) => JSON.parse(readFileSync(join(s.dir, `${DRAFT}.draft`), "utf8").split("\n")[0]!) as Record<string, unknown>;
const settle = () => new Promise((r) => setTimeout(r, 0));
const done = async (app: ReturnType<typeof createApp>) => { for (let i = 0; i < 8; i++) await settle(); await app.idle(); };

// CRLF and LF mixed, trailing spaces and a tab, characters outside the BMP, no final newline.
const TYPED = "# Storm ☔ 𝄞 note\r\n\r\nFirst line  \t\r\nsecond — “quoted” 🌩️\nlast line, no newline";

/** The desktop shell over the real folder: `create` writes as main does (`utf8`, `wx`, never over a file). */
function shell(store: DraftStore): PlatformBridge {
  const recovery: RecoveryBridge = {
    keep: (d, seq, p, t) => store.keep(W, d, seq, p, t),
    saved: (d, seq) => store.saved(W, d, seq),
    discard: (d) => store.discard(W, d),
    found: () => store.found(W),
    recovered: () => store.recovered(),
    text: (id) => store.text(id),
    remove: (id) => store.remove(id),
    count: () => store.count(),
  };
  const entries = () => readdirSync(notes).filter((n) => n.endsWith(".md")).map((n) => {
    const path = join(notes, n);
    return { path, kind: "note" as const, title: titleOfMarkdown(readFileSync(path, "utf8")) ?? "" };
  });
  return {
    platform: "windows",
    readNote: (p) => readFile(p, "utf8"),
    writeNote: (p, t) => writeFile(p, t, "utf8"),
    chooseNote: async () => undefined, newNotePath: async () => join(notes, "untitled.md"),
    defaultNotePath: async () => join(notes, "storm-note.md"),
    loadAppState: async () => ({ version: 1, lastNotePath: join(notes, "storm-note.md") }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: ws, format: '{"formatVersion":1}' }),
      scan: async () => ({ folder: ws, roots: [{ id: "public", path: notes, readOnly: false }], entries: entries() }),
      writeFormat: async () => {},
      renameNote: async () => {},
      apply: async (ops: WorkspaceOp[]) => {
        for (const op of ops) if (op.op === "create") await writeFile(op.path, op.text, { encoding: "utf8", flag: "wx" });
      },
      deleted: async () => [],
      onChange: () => () => {},
    },
    recovery,
  };
}

describe("QLT-06: the orphan every rung misses", () => {
  it("Files → Recovered offers exactly the typed text, and Save as a new note writes it to disk byte for byte", async () => {
    const u = join(notes, "untitled.md");
    writeFileSync(u, ""); // New note's empty file, no front matter: no note ID
    const s = open();
    await s.keep(W, DRAFT, 1, u, "# S");
    await s.settled();
    const oldIno = String(statSync(u, { bigint: true }).ino);
    // The save replaces the file (a new file ID) and the title renames it; the crash comes before the
    // store hears of either, and after the last text was kept.
    writeFileSync(`${u}.tmp`, "# Storm\n");
    renameSync(`${u}.tmp`, u);
    await s.keep(W, DRAFT, 2, u, TYPED);
    renameSync(u, join(notes, "storm-note.md"));
    await s.settled();

    // The draft's keys, each a miss: old path gone, old file ID, no note ID, a base no file has, Git sees no rename.
    const h = header(s);
    expect(h).toMatchObject({ path: "notes/untitled.md", ino: oldIno, base: textHash(""), head: HEAD });
    expect(h.noteId).toBeUndefined();
    const disk = join(notes, "storm-note.md");
    expect(String((await stat(disk, { bigint: true })).ino)).not.toBe(oldIno);
    expect(readdirSync(notes).sort()).toEqual(["storm-note.md"]);

    const again = open();
    await again.ready();
    const app = createApp(shell(again), en);
    await app.start();
    await done(app);
    expect(app.store.state.ui.toasts.at(-1)).toMatchObject({ message: "Kept 1 draft that couldn't go back in its note." });

    const list = await again.recovered();
    expect(list.map((d) => [d.title, d.where, d.chars])).toEqual([["Storm ☔ 𝄞 note", "notes", TYPED.length]]);
    expect(await again.text(list[0]!.id)).toBe(TYPED);

    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.saveRecovered", { id: list[0]!.id });
    await app.commands.run("move.choose", { id: notes });
    await done(app);
    const made = readdirSync(notes).filter((n) => n !== "storm-note.md");
    expect(made).toHaveLength(1);
    expect(readFileSync(join(notes, made[0]!))).toEqual(Buffer.from(TYPED, "utf8"));
    // The note it was typed over is as the crash left it, and the draft went only once the new note was written.
    expect(readFileSync(disk, "utf8")).toBe("# Storm\n");
    expect(await again.recovered()).toEqual([]);
  });
});
