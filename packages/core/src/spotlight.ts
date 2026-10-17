/**
 * Spotlight's logic apart from the app (SPT-02 to SPT-05, FIL-04, KEY-01): its modes and prefixes,
 * the filters it understands, matching short lists it keeps itself, merging the index's answers into
 * one ranked list, the quick actions each result has, and frecency. The app's side is
 * `spotlight-app.ts`; the index is `search/` (D-107).
 */
import type { MatchTier, Range, SearchHit, SearchKind } from "./search/types.ts";
import type { RootId, Visibility } from "./workspace.ts";
import { trimWhere } from "./scan.ts";

/** What Spotlight searches, shown as the chip at the start of the field (Spotlight → Anatomy). */
export type SpotlightMode = "all" | "notes" | "commands" | "headings" | "help";
export const SPOTLIGHT_MODES: readonly SpotlightMode[] = ["all", "notes", "commands", "headings", "help"];

/**
 * Typing a prefix at the start of the field in All switches mode and leaves the rest as the query:
 * `>` commands and settings, `#` headings in this note, `##` headings in every note, `?` help. A
 * second `#` in headings widens it to every note.
 */
export function prefixMode(mode: SpotlightMode, everywhere: boolean, query: string): { mode: SpotlightMode; everywhere: boolean; query: string } | undefined {
  if (mode === "all") {
    if (query.startsWith(">")) return { mode: "commands", everywhere: false, query: query.slice(1).trimStart() };
    if (query.startsWith("##")) return { mode: "headings", everywhere: true, query: query.slice(2).trimStart() };
    if (query.startsWith("#")) return { mode: "headings", everywhere: false, query: query.slice(1).trimStart() };
    if (query.startsWith("?")) return { mode: "help", everywhere: false, query: query.slice(1).trimStart() };
  }
  if (mode === "headings" && !everywhere && query.startsWith("#")) return { mode, everywhere: true, query: query.slice(1).trimStart() };
  return undefined;
}

/** Narrowing typed into the query (Spotlight → Prefixes and filters). */
export interface Filters {
  roots?: RootId[];
  /** A folder, relative to its root. */
  within?: string;
  kinds?: SearchKind[];
  /** Full text only, the words together and in order. */
  phrase?: boolean;
}
const TYPES: Record<string, SearchKind> = { note: "note", notes: "note", folder: "folder", folders: "folder", command: "command", commands: "command", setting: "setting", settings: "setting", heading: "heading", headings: "heading" };

/** Takes `is:public`, `is:private`, `in:folder/`, `type:note`, and a quoted phrase out of a query. */
export function parseFilters(query: string): { text: string; filters: Filters } {
  const filters: Filters = {};
  const words: string[] = [];
  for (const w of query.split(/\s+/).filter(Boolean)) {
    const m = /^(is|in|type):(.*)$/i.exec(w);
    const kind = m?.[1]!.toLowerCase();
    const value = m?.[2] ?? "";
    if (kind === "is" && (value === "public" || value === "private")) (filters.roots ??= []).push(value);
    else if (kind === "in" && value) filters.within = trimWhere(value, (c) => c === "/");
    else if (kind === "type" && TYPES[value.toLowerCase()]) (filters.kinds ??= []).push(TYPES[value.toLowerCase()]!);
    else words.push(w);
  }
  let text = words.join(" ");
  // While it's typed the closing quote may not be there yet.
  const quoted = /^"([^"]*)"?$/.exec(text);
  if (quoted && text.length > 1) {
    text = quoted[1]!.trim();
    filters.phrase = true;
  }
  return { text, filters };
}

// ---- matching short lists Spotlight keeps itself (this note's headings, help, before the index starts) ----

/** Case and accents don't matter, as in the index; each folded character remembers where it came from. */
function fold(s: string): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const f = s[i]!.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) at.push(i);
    text += f;
  }
  at.push(s.length);
  return { text, at };
}
const isWordStart = (s: string, i: number) => i === 0 || /[\s\p{P}]/u.test(s[i - 1]!);

export interface LocalMatch {
  tier: MatchTier;
  score: number;
  highlights: Range[];
}

/**
 * Whether `label` matches `query` and how well: the whole label, its start, the start of a word, or
 * the letters in order (fuzzy). Every word of the query must match. Ranges are in `label`.
 */
export function matchLabel(label: string, query: string): LocalMatch | undefined {
  const q = fold(query.trim()).text;
  if (!q) return { tier: "exact", score: 0, highlights: [] };
  const l = fold(label);
  const ranges: Range[] = [];
  const range = (start: number, end: number): Range => [l.at[start]!, l.at[end]!];
  if (l.text === q) return { tier: "exact", score: 1, highlights: [range(0, l.text.length)] };
  let worst = 0;
  const TIERS: MatchTier[] = ["exact", "prefix", "word", "fuzzy"];
  for (const word of q.split(/\s+/).filter(Boolean)) {
    let tier = -1;
    let found = -1;
    if (l.text.startsWith(word)) [tier, found] = [1, 0];
    else {
      for (let i = l.text.indexOf(word); i >= 0; i = l.text.indexOf(word, i + 1)) {
        if (isWordStart(l.text, i)) {
          [tier, found] = [2, i];
          break;
        }
        if (found < 0) [tier, found] = [3, i];
      }
    }
    if (found >= 0) {
      ranges.push(range(found, found + word.length));
      worst = Math.max(worst, tier);
      continue;
    }
    // The letters in order, as in quick open (FIL-04).
    let i = 0;
    const hits: number[] = [];
    for (const ch of word) {
      i = l.text.indexOf(ch, i);
      if (i < 0) return undefined;
      hits.push(i++);
    }
    for (const h of hits) ranges.push(range(h, h + 1));
    worst = 3;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) merged[merged.length - 1] = [last[0], Math.max(last[1], r[1])];
    else merged.push(r);
  }
  return { tier: TIERS[worst]!, score: 1 / (1 + label.length), highlights: merged };
}

const TIER_ORDER: readonly MatchTier[] = ["exact", "prefix", "word", "fuzzy", "heading", "text"];
/** Matches, best first: tier, then score, then the shorter label. */
export function rankLocal<T extends { label: string }>(items: readonly T[], query: string): (T & LocalMatch)[] {
  const out: (T & LocalMatch)[] = [];
  for (const item of items) {
    const m = matchLabel(item.label, query);
    if (m) out.push({ ...item, ...m });
  }
  if (!query.trim()) return out;
  return out.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.score - a.score || a.label.length - b.label.length);
}

// ---- one ranked list (SPT-02) ----

export type RowKind = "note" | "heading" | "text" | "folder" | "command" | "setting" | "create" | "find" | "help";
/** Result groups, each labeled (Spotlight → Anatomy). */
export type GroupId = "top" | "recent" | "notes" | "headings" | "text" | "folders" | "commands" | "settings" | "suggestions" | "actions" | "help";

export interface SpotlightRow {
  /** Unique in the list: the group and the key. */
  id: string;
  group: GroupId;
  kind: RowKind;
  /** A note's or folder's path, `path#n` for a heading, a command's or setting's id, a prefix. */
  key: string;
  label: string;
  highlights: Range[];
  path?: string;
  rel?: string;
  root?: RootId;
  heading?: { level: number; index: number; note: string };
  snippet?: { text: string; highlights: Range[] };
}

/** At most this many rows of each group. */
export const GROUP_LIMITS: Record<GroupId, number> = {
  top: 1, recent: 5, notes: 8, headings: 6, text: 5, folders: 4, commands: 8, settings: 5, suggestions: 3, actions: 2, help: 20,
};
const GROUP_OF: Record<SearchKind, GroupId> = { note: "notes", heading: "headings", folder: "folders", command: "commands", setting: "settings" };

export const rowId = (group: GroupId, key: string) => `${group}:${key}`;

/** The index keys commands and settings as `command:<id>` and `setting:<id>`; rows use the id itself. */
export const itemKey = (kind: "command" | "setting", id: string) => `${kind}:${id}`;

export function rowOfHit(hit: SearchHit, group: GroupId = GROUP_OF[hit.kind], kind: RowKind = hit.kind): SpotlightRow {
  const key = hit.kind === "command" || hit.kind === "setting" ? hit.key.replace(/^(command|setting):/, "") : hit.key;
  return {
    id: rowId(group, key), group, kind, key, label: hit.label, highlights: hit.highlights,
    ...(hit.path !== undefined ? { path: hit.path } : {}),
    ...(hit.rel !== undefined ? { rel: hit.rel } : {}),
    ...(hit.root ? { root: hit.root } : {}),
    ...(hit.heading ? { heading: hit.heading } : {}),
    ...(hit.snippet ? { snippet: hit.snippet } : {}),
  };
}

export interface MergeOptions {
  /** The single best result first, as its own group (All only). */
  top?: boolean;
  /** Create note and Find in all notes, last, when there's a query (All and Notes). */
  actions?: boolean;
  query: string;
  limits?: Partial<Record<GroupId, number>>;
}

/**
 * Merges the index's title and full-text answers into one list: the top hit, then each kind's group
 * in the order its best result ranked, then text matches in notes not listed already, then the
 * actions that always do something (create, find in all notes).
 */
export function mergeResults(titles: readonly SearchHit[], text: readonly SearchHit[], opts: MergeOptions): SpotlightRow[] {
  const limit = (g: GroupId) => opts.limits?.[g] ?? GROUP_LIMITS[g];
  const out: SpotlightRow[] = [];
  const groups = new Map<GroupId, SpotlightRow[]>();
  const shown = new Set<string>();
  const add = (g: GroupId, row: SpotlightRow) => {
    const list = groups.get(g) ?? [];
    if (!groups.has(g)) groups.set(g, list);
    if (list.length < limit(g)) {
      list.push(row);
      if (row.path) shown.add(row.kind === "note" ? row.path : `${row.kind}:${row.key}`);
    }
  };
  const best = titles[0] ?? text[0];
  if (opts.top && best) {
    add("top", rowOfHit(best, "top", titles[0] ? best.kind : "text"));
    // Its own group still comes in its place, without it.
    if (titles[0]) groups.set(GROUP_OF[best.kind], []);
  }
  for (const h of titles) if (h !== best || !opts.top) add(GROUP_OF[h.kind], rowOfHit(h));
  for (const h of text) {
    if (opts.top && h === best) continue;
    if (h.path && shown.has(h.path)) continue;
    add("text", rowOfHit(h, "text", "text"));
  }
  for (const list of groups.values()) out.push(...list);
  const q = opts.query.trim();
  if (opts.actions && q) {
    out.push({ id: rowId("actions", "create"), group: "actions", kind: "create", key: "create", label: q, highlights: [] });
    out.push({ id: rowId("actions", "find"), group: "actions", kind: "find", key: "find", label: q, highlights: [] });
  }
  return out;
}

// ---- help (`?`) ----

/** The prefixes and filters, each a row that puts itself into the field. */
export const HELP_ENTRIES: readonly { key: string; insert: string; title: string }[] = [
  { key: ">", insert: ">", title: "spotlight.help.commands" },
  { key: "#", insert: "#", title: "spotlight.help.headings" },
  { key: "##", insert: "##", title: "spotlight.help.allHeadings" },
  { key: "?", insert: "?", title: "spotlight.help.help" },
  { key: "is:private", insert: "is:private ", title: "spotlight.help.isPrivate" },
  { key: "is:public", insert: "is:public ", title: "spotlight.help.isPublic" },
  { key: "in:", insert: "in:", title: "spotlight.help.in" },
  { key: "type:", insert: "type:", title: "spotlight.help.type" },
  { key: "\"…\"", insert: "\"", title: "spotlight.help.phrase" },
];

// ---- quick actions (SPT-03) ----

/** A result's action, by its Spotlight name; `run` performs it in the app. */
export type ActionId =
  | "open" | "openWindow" | "copyLink" | "copyPublicLink" | "copyToLocal" | "rename" | "moveTo" | "makePublic" | "makePrivate"
  | "showInFiles" | "delete" | "goTo" | "newNoteHere" | "run" | "copyId" | "reset";

export interface QuickAction {
  id: ActionId;
  /** Message key for its name. */
  title: string;
  /** A registry chord shown with it. */
  shortcut?: string;
  available: boolean;
  /** Message key saying why it isn't available. */
  reason?: string;
}

/** What the actions of a result depend on. */
export interface ActionContext {
  /** In a root this app may change (not the instance's notes in a browser, DST-05, D-90). */
  writable: boolean;
  visibility?: Visibility;
  /** The other root exists and can be written, so Make public / Make private can apply. */
  otherRoot: boolean;
  /** Shells that keep notes in a workspace have Files (both apps, D-94). */
  files: boolean;
  clipboard: boolean;
  /** An instance note in a browser can be copied to this browser's notes (PKG-08). */
  copyToLocal: boolean;
  /** Why a Markdown link from the open note can't point at it, if it can't. */
  linkRefused?: string;
  /** Publishing (and so a public link) isn't built yet: the message key saying so. */
  publicLink?: string;
  /** A command or setting that can be reset to its default. */
  resettable?: boolean;
  /** The shell opens notes in windows of their own (desktop, DSK-06, D-179). */
  newWindow?: boolean;
}

const action = (id: ActionId, available: boolean, reason?: string, shortcut?: string): QuickAction => ({
  id, title: `spotlight.action.${id}`, available, ...(!available && reason ? { reason } : {}), ...(shortcut ? { shortcut } : {}),
});
/** Only the desktop app opens a note in a window of its own (DSK-06, D-179); elsewhere the action says so. */
export const NEW_WINDOW_REASON = "spotlight.reason.newWindow";

/** Everything that applies to a result, available or saying why not (Spotlight → Quick actions). */
export function actionsFor(row: Pick<SpotlightRow, "kind" | "root">, ctx: ActionContext): QuickAction[] {
  const readOnly = ctx.writable ? undefined : "spotlight.reason.readOnly";
  const files = ctx.files ? undefined : "spotlight.reason.noFiles";
  const write = !readOnly && !files;
  switch (row.kind) {
    case "note":
    case "text": {
      const out = [action("open", true), action("openWindow", Boolean(ctx.newWindow), NEW_WINDOW_REASON)];
      out.push(action("copyLink", ctx.clipboard && !ctx.linkRefused, ctx.linkRefused ?? "spotlight.reason.noClipboard"));
      if (ctx.visibility === "public") out.push(action("copyPublicLink", !ctx.publicLink && ctx.clipboard, ctx.publicLink ?? "spotlight.reason.noClipboard"));
      if (ctx.copyToLocal) out.push(action("copyToLocal", true));
      out.push(action("rename", write, readOnly ?? files), action("moveTo", write, readOnly ?? files));
      if (ctx.visibility === "public") out.push(action("makePrivate", write && ctx.otherRoot, readOnly ?? files ?? "spotlight.reason.noOtherRoot"));
      else if (ctx.visibility) out.push(action("makePublic", write && ctx.otherRoot && ctx.visibility === "private", readOnly ?? files ?? (ctx.visibility === "shared" ? "spotlight.reason.shared" : "spotlight.reason.noOtherRoot")));
      out.push(action("showInFiles", !files, files), action("delete", write, readOnly ?? files));
      return out;
    }
    case "heading":
      return [action("goTo", true), action("openWindow", Boolean(ctx.newWindow), NEW_WINDOW_REASON), action("copyLink", ctx.clipboard && !ctx.linkRefused, ctx.linkRefused ?? "spotlight.reason.noClipboard")];
    case "folder":
      return [
        action("showInFiles", !files, files), action("newNoteHere", write, readOnly ?? files),
        action("rename", write, readOnly ?? files), action("moveTo", write, readOnly ?? files), action("delete", write, readOnly ?? files),
      ];
    case "command":
      return [action("run", true), action("copyId", ctx.clipboard, "spotlight.reason.noClipboard")];
    case "setting":
      return [action("run", true), action("reset", Boolean(ctx.resettable), "spotlight.reason.atDefault")];
    default:
      return [];
  }
}

// ---- frecency (Spotlight → Ranking) ----

export const FRECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How recently and how often each note was opened and each command run, decaying with a half-life of
 * a week. Kept in memory on this device only (D-109): never written, never synced.
 */
export class Frecency {
  #uses = new Map<string, { score: number; at: number; n: number }>();
  #n = 0;

  record(key: string, now: number): void {
    const u = this.#uses.get(key);
    this.#uses.set(key, { score: (u ? decay(u.score, now - u.at) : 0) + 1, at: now, n: ++this.#n });
  }

  forget(key: string): void {
    this.#uses.delete(key);
  }

  /** The index's ranking input: 0 for never, growing slowly with use. */
  scores(now: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, u] of this.#uses) out[k] = Math.log2(1 + decay(u.score, now - u.at));
    return out;
  }

  /** Keys used most recently first. */
  recent(filter: (key: string) => boolean = () => true): string[] {
    return [...this.#uses.entries()].filter(([k]) => filter(k)).sort((a, b) => b[1].at - a[1].at || b[1].n - a[1].n).map(([k]) => k);
  }
}
const decay = (score: number, ms: number) => score * 0.5 ** (Math.max(0, ms) / FRECENCY_HALF_LIFE_MS);

// ---- commands Spotlight lists (KEY-01) ----

/** Steps the app's views and keys take rather than actions a person looks for. */
const INTERNAL_PREFIXES = ["firstRun.", "slash.", "move.", "picker.", "unlock.", "import.", "gallery.", "spotlight.choose", "spotlight.set", "findAll.", "share.manage."];
const INTERNAL_IDS = new Set([
  // Events from components and the editor, and the runner itself.
  "app.ready", "command.run", "note.setContent", "find.prefill", "find.setResult", "paste.notice", "format.setState",
  "table.setState", "table.action", "table.changed", "table.copied", "table.moveRow", "table.moveColumn", "table.insertRowAt", "table.insertColumnAt",
  "table.openMenu", "table.closeMenu", "toast.dismiss", "toast.action", "window.drag",
  // Steps inside a dialog, a card, or the link editor, which their own controls run.
  "link.openEditor", "link.apply", "link.cancel", "account.signOutNow", "workspace.removeSync", "workspace.removeConfirm",
  // A Files row's own Copy public link (D-162): Spotlight has the open note's, note.copyPublicLink.
  "files.copyPublicLink",
  // Settings → Workspace's own button (D-124): not listed, so the web's list, where it never applies, stays the same.
  "workspace.openFromGitHub",
  "conflict.choose", "conflict.later", "files.confirm",
  // The Files panel's own selection and rows; Spotlight acts on a result through its quick actions instead.
  "files.select", "files.activate", "files.undo", "files.drop", "files.clearSelection", "files.hideDeleted", "files.toggleDeleted",
  "files.restore", "files.restoreTo", "files.editBlur", "files.setFits", "files.setWidth", "outline.setWidth",
  // The theme manager's own steps: previews from its gallery, a theme chosen there, its colors, closing and reverting it.
  "theme.manager.close", "theme.manager.revert", "theme.preview", "theme.previewEnd", "theme.choose", "theme.color.set", "theme.color.fix",
]);
/** Scopes where a key acts on what's in front of it, not a place a person starts from. */
const ACTION_SCOPES = new Set(["editor", "table"]);

/**
 * Whether Spotlight leaves a command out (KEY-01): setters (`*.setX`), events from components, steps
 * inside a dialog, and keys that belong to a field or panel (Enter in the find field). Every other
 * command is listed, with its shortcut and its state.
 */
export function isInternalCommand(id: string, handledBy?: string): boolean {
  if (/\.set[A-Z]/.test(id) || INTERNAL_IDS.has(id) || INTERNAL_PREFIXES.some((p) => id.startsWith(p))) return true;
  return handledBy !== undefined && !ACTION_SCOPES.has(handledBy);
}
