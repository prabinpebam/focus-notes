/**
 * Public and private roots (WP-3.4): who can read a note (SHR-01), moves between the roots as
 * plans (FIL-06, SHR-02), where a new note goes, links that never cross roots, importing a bundle
 * into a workspace (FRE-10), and which settings sync (PRV-03).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildTree, findNode, newNoteFolder, planLinkWrites, planVisibility, rootOf, visibilityOf, walk, type WorkspaceScan,
} from "../src/index.ts";
import { BUNDLE_FORMAT, planImport, safeWorkspacePath } from "../src/notes.ts";
import { SYNCED_KEYS, appStateOfSettings, parseSettings, settingsFileOf, splitAppState } from "../src/settings.ts";

const W = "/W";
const PRIV = `${W}/private/notes`;
const PUB = `${W}/notes`;
const scan = (entries: WorkspaceScan["entries"]): WorkspaceScan => ({
  folder: W,
  roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
  entries,
});
const tree = buildTree(scan([
  { path: `${PRIV}/journal`, kind: "folder" },
  { path: `${PRIV}/journal/day.md`, kind: "note", title: "Day" },
  { path: `${PRIV}/ideas.md`, kind: "note" },
  { path: `${PUB}/about.md`, kind: "note", published: true },
  { path: `${PUB}/journal`, kind: "folder" },
  { path: `${PUB}/journal/day.md`, kind: "note" },
]));

describe("SHR-01: every note is private, shared, or public", () => {
  it("is said by its root; shared is a private note with an audience", () => {
    expect(visibilityOf(tree, `${PRIV}/ideas.md`)).toBe("private");
    expect(visibilityOf(tree, `${PUB}/about.md`)).toBe("public");
    expect(visibilityOf(tree, `${PRIV}/ideas.md`, (p) => p.endsWith("ideas.md"))).toBe("shared");
    // A public note is public whatever grants say; outside the roots there's no answer.
    expect(visibilityOf(tree, `${PUB}/about.md`, () => true)).toBe("public");
    expect(visibilityOf(tree, "/elsewhere/a.md")).toBeUndefined();
  });

  it("new notes go into the Private root unless a folder was chosen or the open note is private", () => {
    expect(newNoteFolder(tree, undefined, `${PUB}/about.md`)).toBe(PRIV);
    expect(newNoteFolder(tree, undefined, undefined)).toBe(PRIV);
    expect(newNoteFolder(tree, undefined, `${PRIV}/journal/day.md`)).toBe(`${PRIV}/journal`);
    // A folder chosen in Files is an explicit choice, even a public one.
    expect(newNoteFolder(tree, `${PUB}/journal`, `${PRIV}/ideas.md`)).toBe(`${PUB}/journal`);
    // Without a writable Private root (a folder before setup, the browser), the old rule stays.
    const local = buildTree({ folder: W, roots: [{ id: "local", path: W, readOnly: false }], entries: [] });
    expect(newNoteFolder(local, undefined, `${W}/a.md`)).toBeUndefined();
    const browser = buildTree({ folder: "", roots: [{ id: "local", path: "", readOnly: false }, { id: "private", path: "private:", readOnly: true }], entries: [] });
    expect(newNoteFolder(browser, undefined, "a.md")).toBeUndefined();
  });
});

describe("FIL-06, SHR-02: moving between the roots", () => {
  it("Make public keeps the folder path in the other root, creating folders, with the same objects", () => {
    const p = planVisibility(tree, [`${PRIV}/ideas.md`], "public");
    if (p.kind !== "moved") throw new Error(p.kind);
    expect(p.moves).toEqual([{ from: `${PRIV}/ideas.md`, to: `${PUB}/ideas.md` }]);
    expect(findNode(p.tree, `${PUB}/ideas.md`)?.node).toBe(findNode(tree, `${PRIV}/ideas.md`)?.node);
    expect(findNode(p.tree, `${PRIV}/ideas.md`)).toBeUndefined();
    // Nothing else changed objects: the public root's other notes are the same.
    expect(findNode(p.tree, `${PUB}/about.md`)?.node).toBe(findNode(tree, `${PUB}/about.md`)?.node);
  });

  it("creates the folder path that's missing, and numbers a clash like any move", () => {
    const t = buildTree(scan([{ path: `${PRIV}/a/b/deep.md`, kind: "note" }, { path: `${PUB}/a`, kind: "folder" }]));
    const p = planVisibility(t, [`${PRIV}/a/b/deep.md`], "public");
    expect(p).toMatchObject({ kind: "moved", moves: [{ to: `${PUB}/a/b/deep.md` }] });
    if (p.kind === "moved") expect(findNode(p.tree, `${PUB}/a/b`)?.node.kind).toBe("folder");
    const clash = planVisibility(tree, [`${PRIV}/journal/day.md`], "public");
    expect(clash).toMatchObject({ kind: "moved", moves: [{ to: `${PUB}/journal/day-2.md` }] });
  });

  it("Make private works the same way back, and skips what's already there", () => {
    const p = planVisibility(tree, [`${PUB}/about.md`, `${PRIV}/ideas.md`], "private");
    expect(p).toMatchObject({ kind: "moved", moves: [{ from: `${PUB}/about.md`, to: `${PRIV}/about.md` }] });
    expect(planVisibility(tree, [`${PRIV}/ideas.md`], "private")).toMatchObject({ kind: "moved", moves: [] });
  });

  it("is refused for read-only roots, missing items, and workspaces without both roots", () => {
    expect(planVisibility(tree, [`${PRIV}/nope.md`], "public")).toEqual({ kind: "refused", reason: "notFound" });
    const browser = buildTree({ folder: "", roots: [{ id: "local", path: "", readOnly: false }, { id: "public", path: "public:", readOnly: true }], entries: [{ path: "a.md", kind: "note" }] });
    expect(planVisibility(browser, ["a.md"], "public")).toEqual({ kind: "refused", reason: "readOnly" });
    const local = buildTree({ folder: W, roots: [{ id: "local", path: W, readOnly: false }], entries: [{ path: `${W}/a.md`, kind: "note" }] });
    expect(planVisibility(local, [`${W}/a.md`], "public")).toEqual({ kind: "refused", reason: "notFound" });
  });

  it("links are never rewritten into the other root: a public note never names a private one", async () => {
    const t = buildTree(scan([
      { path: `${PUB}/index.md`, kind: "note" }, { path: `${PUB}/plan.md`, kind: "note" }, { path: `${PUB}/other.md`, kind: "note" },
      { path: `${PRIV}/mine.md`, kind: "note" }, { path: `${PRIV}/inbox/a.md`, kind: "note" },
    ]));
    const texts: Record<string, string> = {
      [`${PUB}/index.md`]: "See [the plan](plan.md).\n",
      [`${PUB}/plan.md`]: "# Plan\n\n[Other](other.md)\n",
      [`${PRIV}/mine.md`]: "Read [the plan](../../notes/plan.md).\n",
      [`${PRIV}/inbox/a.md`]: "[mine](../mine.md)\n",
    };
    const moves = [{ from: `${PUB}/plan.md`, to: `${PRIV}/plan.md` }];
    const writes = await planLinkWrites(t, moves, async (p) => texts[p] ?? "");
    // The public index keeps its (now broken) link; the moved note keeps its link to the public root;
    // the private note that linked across now links within its own root.
    expect(writes.map((w) => [w.from, w.text])).toEqual([[`${PRIV}/mine.md`, "Read [the plan](plan.md).\n"]]);
    // And within one root, links follow as before.
    const within = await planLinkWrites(t, [{ from: `${PRIV}/mine.md`, to: `${PRIV}/inbox/mine.md` }], async (p) => texts[p] ?? "");
    expect(within.find((w) => w.from === `${PRIV}/inbox/a.md`)?.text).toBe("[mine](mine.md)\n");
  });
});

describe("FRE-10: importing a bundle into a workspace", () => {
  const bundle = (notes: { path: string; text: string }[]) => ({ format: BUNDLE_FORMAT as typeof BUNDLE_FORMAT, exported: "2026-10-14T00:00:00Z", notes: notes.map((n) => ({ ...n, updated: "2026-10-14T00:00:00Z" })) });

  it("names that differ only in case are taken on the desktop, and an unread note is never replaced", () => {
    const existing = new Map<string, string | undefined>([["Ideas.md", undefined], ["same.md", "# Same\n"]]);
    const plan = planImport(bundle([{ path: "ideas.md", text: "x" }, { path: "same.md", text: "# Same\n" }, { path: "new/one.md", text: "1" }]), existing, { foldCase: true });
    expect(plan.map((p) => [p.path, p.renamed])).toEqual([["ideas 2.md", true], ["new/one.md", false]]);
  });

  it("paths are made safe for a workspace: no dot folders, no reserved Windows names, nothing outside", () => {
    expect(safeWorkspacePath("../../.git/config")).toBe("git/config.md");
    expect(safeWorkspacePath("CON.md")).toBe("CON-note.md");
    expect(safeWorkspacePath("a./ b /c.md")).toBe("a/b/c.md");
    expect(safeWorkspacePath("")).toBe("Untitled.md");
  });
});

describe("PRV-03: synced settings and per-device state", () => {
  const ajv = new Ajv2020({ strict: false });
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "schemas", "settings.schema.json"), "utf8"));
  const valid = ajv.compile(schema);

  it("appearance, themes, the content font, and its size sync; the rest stays on the device", () => {
    expect([...SYNCED_KEYS].sort()).toEqual(["appearance", "contentFont", "darkTheme", "fontSize", "lightTheme"]);
    const { device, synced } = splitAppState({ version: 1, lastNotePath: "/W/a.md", appearance: "dark", fontSize: 18, uiScale: 1.25, focusMode: false, lightTheme: "sepia" });
    expect(synced).toEqual({ appearance: "dark", fontSize: 18, lightTheme: "sepia" });
    expect(device).toEqual({ version: 1, lastNotePath: "/W/a.md", uiScale: 1.25, focusMode: false });
  });

  it("the file the app writes is valid against settings.schema.json, and keeps what it doesn't know about", () => {
    const file = settingsFileOf({ appearance: "dark", lightTheme: "sepia", darkTheme: "ink", contentFont: "serif", fontSize: 18 }, { reading: { lineHeight: 1.6 }, toolbar: ["note.new"] });
    expect(file).toEqual({ appearance: { mode: "dark", lightTheme: "sepia", darkTheme: "ink" }, reading: { contentFont: "serif", fontSize: 18, lineHeight: 1.6 }, toolbar: ["note.new"] });
    expect(valid(file)).toBe(true);
    expect(appStateOfSettings(file)).toEqual({ appearance: "dark", lightTheme: "sepia", darkTheme: "ink", contentFont: "serif", fontSize: 18 });
  });

  it("reading drops what isn't valid, and never fails", () => {
    expect(parseSettings("not json")).toBeUndefined();
    expect(parseSettings("[1]")).toBeUndefined();
    const s = parseSettings(JSON.stringify({ appearance: { mode: "neon", darkTheme: "dusk" }, reading: { fontSize: 99 }, extra: 1 }));
    expect(s).toEqual({ appearance: { darkTheme: "dusk" } });
    expect(valid(s)).toBe(true);
    expect(appStateOfSettings(s)).toEqual({ darkTheme: "dusk" });
  });

  it("a tree walk still sees both roots (sanity for the fixtures above)", () => {
    expect([...walk(tree)].filter((e) => rootOf(tree, e.path)?.id === "public").length).toBe(3);
  });
});
