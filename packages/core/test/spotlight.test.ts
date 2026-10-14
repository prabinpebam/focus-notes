/**
 * Spotlight's logic (WP-4.2): modes and prefixes (SPT-05), filters, matching short lists, merging
 * the index's answers into one ranked list (SPT-02), quick actions (SPT-03), frecency, and which
 * commands it lists (KEY-01).
 */
import { describe, expect, it } from "vitest";
import {
  actionsFor, Frecency, FRECENCY_HALF_LIFE_MS, isInternalCommand, matchLabel, mergeResults, parseFilters, prefixMode, rankLocal,
  type ActionContext,
} from "../src/spotlight.ts";
import type { SearchHit } from "../src/search/types.ts";

const hit = (kind: SearchHit["kind"], key: string, label: string, more: Partial<SearchHit> = {}): SearchHit =>
  ({ kind, key, label, highlights: [], tier: "word", score: 1, ...(kind === "note" ? { path: key, rel: key } : {}), ...more });

describe("SPT-05: modes and prefixes", () => {
  it("> is commands, # this note's headings, ## every note's headings, ? help, typed at the start in All", () => {
    expect(prefixMode("all", false, ">dark")).toEqual({ mode: "commands", everywhere: false, query: "dark" });
    expect(prefixMode("all", false, "#scope")).toEqual({ mode: "headings", everywhere: false, query: "scope" });
    expect(prefixMode("all", false, "## scope")).toEqual({ mode: "headings", everywhere: true, query: "scope" });
    expect(prefixMode("all", false, "?")).toEqual({ mode: "help", everywhere: false, query: "" });
    // A second # in this note's headings widens them to every note.
    expect(prefixMode("headings", false, "#")).toEqual({ mode: "headings", everywhere: true, query: "" });
    // Elsewhere, and not at the start, they're just text.
    expect(prefixMode("all", false, "a > b")).toBeUndefined();
    expect(prefixMode("commands", false, ">x")).toBeUndefined();
    expect(prefixMode("notes", false, "#x")).toBeUndefined();
  });

  it("filters narrow the search: is:, in:, type:, and a quoted phrase (P1)", () => {
    expect(parseFilters("is:private budget")).toEqual({ text: "budget", filters: { roots: ["private"] } });
    expect(parseFilters("in:essays/ focus")).toEqual({ text: "focus", filters: { within: "essays" } });
    expect(parseFilters("type:folder arch")).toEqual({ text: "arch", filters: { kinds: ["folder"] } });
    expect(parseFilters("\"one line at a time\"")).toEqual({ text: "one line at a time", filters: { phrase: true } });
    // While typing, the closing quote isn't there yet.
    expect(parseFilters("\"one line")).toEqual({ text: "one line", filters: { phrase: true } });
    expect(parseFilters("is:nothing x")).toEqual({ text: "is:nothing x", filters: {} });
  });
});

describe("matching short lists (this note's headings, help, and before the index starts)", () => {
  it("ranks the whole label, its start, a word's start, then the letters in order", () => {
    expect(matchLabel("Scope", "scope")?.tier).toBe("exact");
    expect(matchLabel("Scope and goals", "sco")?.tier).toBe("prefix");
    expect(matchLabel("The scope", "sco")?.tier).toBe("word");
    expect(matchLabel("Telescope", "sco")?.tier).toBe("fuzzy");
    expect(matchLabel("Open settings", "opst")).toMatchObject({ tier: "fuzzy", highlights: [[0, 2], [5, 6], [7, 8]] });
    expect(matchLabel("Scope", "xyz")).toBeUndefined();
  });

  it("ignores case and accents, and every word must match", () => {
    expect(matchLabel("Café notes", "cafe")).toMatchObject({ tier: "prefix", highlights: [[0, 4]] });
    expect(matchLabel("Deep work", "work deep")).toMatchObject({ tier: "word", highlights: [[0, 4], [5, 9]] });
    expect(matchLabel("Deep work", "deep play")).toBeUndefined();
    const ranked = rankLocal([{ label: "Telescope" }, { label: "Scope" }, { label: "The scope" }], "scope").map((x) => x.label);
    expect(ranked).toEqual(["Scope", "The scope", "Telescope"]);
  });
});

describe("SPT-02: one ranked list across kinds", () => {
  const titles = [
    hit("command", "focus.toggle", "Focus mode"),
    hit("note", "/n/essays/on-focus.md", "On focus"),
    hit("folder", "/n/focus", "focus", { path: "/n/focus", rel: "focus" }),
    hit("note", "/n/journal/focus-sessions.md", "Focus sessions"),
    hit("heading", "/n/a.md#1", "Focus and flow", { path: "/n/a.md", heading: { level: 2, index: 1, note: "A" } }),
  ];
  const text = [
    hit("note", "/n/ideas.md", "Ideas", { tier: "text", snippet: { text: "…keep focus…", highlights: [[6, 11]] } }),
    hit("note", "/n/essays/on-focus.md", "On focus", { tier: "text" }),
  ];

  it("shows the top hit first, then each kind in the order its best result ranked, then text matches, then actions", () => {
    const rows = mergeResults(titles, text, { query: "foc", top: true, actions: true });
    expect(rows.map((r) => `${r.group}:${r.kind}:${r.label}`)).toEqual([
      "top:command:Focus mode",
      "notes:note:On focus", "notes:note:Focus sessions",
      "folders:folder:focus",
      "headings:heading:Focus and flow",
      // A note already listed by its title isn't listed again for its text.
      "text:text:Ideas",
      "actions:create:foc", "actions:find:foc",
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.find((r) => r.kind === "text")?.snippet?.highlights).toEqual([[6, 11]]);
  });

  it("keeps each group short, and offers create and find even when nothing matches (SPT-04)", () => {
    const many = Array.from({ length: 20 }, (_, i) => hit("note", `/n/${i}.md`, `Note ${i}`));
    expect(mergeResults(many, [], { query: "note", top: false }).length).toBe(8);
    expect(mergeResults([], [], { query: "zzz", top: true, actions: true }).map((r) => r.kind)).toEqual(["create", "find"]);
    expect(mergeResults([], [], { query: "  ", top: true, actions: true })).toEqual([]);
  });

  it("is a plain list in quick open and commands, with no top hit", () => {
    const rows = mergeResults(titles.filter((h) => h.kind === "note"), [], { query: "foc" });
    expect(rows.map((r) => r.group)).toEqual(["notes", "notes"]);
  });
});

describe("SPT-03: quick actions for the selected result", () => {
  const desktop: ActionContext = { writable: true, visibility: "private", otherRoot: true, files: true, clipboard: true, copyToLocal: false, publicLink: "spotlight.reason.publicLink" };
  const ids = (ctx: ActionContext, kind: Parameters<typeof actionsFor>[0]["kind"] = "note") => actionsFor({ kind }, ctx).map((a) => `${a.id}${a.available ? "" : "!"}`);

  it("a private note: open, a new window (not yet), copy link, rename, move, make public, show in Files, delete", () => {
    expect(ids(desktop)).toEqual(["open", "openWindow!", "copyLink", "rename", "moveTo", "makePublic", "showInFiles", "delete"]);
    expect(actionsFor({ kind: "note" }, desktop).find((a) => a.id === "openWindow")).toMatchObject({ reason: "spotlight.reason.newWindow" });
  });

  it("a public note: make private, and a public link that waits for publishing", () => {
    expect(ids({ ...desktop, visibility: "public" })).toEqual(["open", "openWindow!", "copyLink", "copyPublicLink!", "rename", "moveTo", "makePrivate", "showInFiles", "delete"]);
  });

  it("an instance's note in a browser is read-only: only open, links, and Copy to my notes", () => {
    const web: ActionContext = { ...desktop, writable: false, visibility: "public", otherRoot: false, copyToLocal: true };
    const list = actionsFor({ kind: "note" }, web);
    expect(list.filter((a) => a.available).map((a) => a.id)).toEqual(["open", "copyLink", "copyToLocal", "showInFiles"]);
    expect(list.find((a) => a.id === "delete")).toMatchObject({ available: false, reason: "spotlight.reason.readOnly" });
  });

  it("headings, folders, commands, and settings have their own", () => {
    expect(ids(desktop, "heading")).toEqual(["goTo", "openWindow!", "copyLink"]);
    expect(ids(desktop, "folder")).toEqual(["showInFiles", "newNoteHere", "rename", "moveTo", "delete"]);
    expect(ids(desktop, "command")).toEqual(["run", "copyId"]);
    expect(ids({ ...desktop, resettable: false }, "setting")).toEqual(["run", "reset!"]);
    expect(ids({ ...desktop, resettable: true }, "setting")).toEqual(["run", "reset"]);
    expect(ids(desktop, "create")).toEqual([]);
  });
});

describe("frecency: recent and frequent, halving every week, in memory only", () => {
  it("ranks what was used most and most recently, and decays", () => {
    const f = new Frecency();
    f.record("a", 0);
    f.record("b", 1000);
    f.record("b", 2000);
    expect(f.recent()).toEqual(["b", "a"]);
    const s = f.scores(2000);
    expect(s.b!).toBeGreaterThan(s.a!);
    // A week later each is worth half as much.
    expect(f.scores(FRECENCY_HALF_LIFE_MS).a!).toBeCloseTo(Math.log2(1.5), 5);
    f.forget("b");
    expect(f.recent()).toEqual(["a"]);
  });
});

describe("KEY-01: which commands Spotlight lists", () => {
  it("leaves out setters, components' events, dialog steps, and keys of a field; lists actions", () => {
    for (const id of ["find.setQuery", "app.ready", "toast.dismiss", "firstRun.next", "move.choose", "files.select", "spotlight.setQuery"]) expect(isInternalCommand(id)).toBe(true);
    expect(isInternalCommand("find.nextInField", "findField")).toBe(true);
    expect(isInternalCommand("files.delete", "filesTree")).toBe(true);
    // Steps inside Find in all notes' sheet and the theme manager, which their own controls run (D-110, D-108).
    for (const id of ["findAll.choose", "findAll.close", "theme.manager.close", "theme.manager.revert", "theme.preview", "theme.previewEnd", "theme.choose", "theme.color.set", "theme.color.fix"]) expect(isInternalCommand(id), id).toBe(true);
    for (const id of ["find.allNotes", "theme.manager.open", "reading.reset"]) expect(isInternalCommand(id), id).toBe(false);
    // Editor and table keys act on what's in front of them, from anywhere: they're listed.
    expect(isInternalCommand("format.bold", "editor")).toBe(false);
    expect(isInternalCommand("table.addRowBelow", "table")).toBe(false);
    for (const id of ["focus.toggle", "note.new", "files.makePublic", "window.snap.left", "theme.dark.dusk"]) expect(isInternalCommand(id)).toBe(false);
  });
});
