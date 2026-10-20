/**
 * The menu on a right-click in text (D-193, D-204): its items, in order, from what the shell knows
 * about the click. One model for every platform, so the menus stay in parity (EDT-14): macOS shows it
 * as the system's own menu, and Windows and Linux show it drawn by the app in the design system, so it
 * follows the theme. The shell stays the authority: it sends the model, and a chosen item comes back
 * as an id it checks against the menu it sent.
 *
 * Left out, as D-204 records: Ignore spelling (Electron has no per-session ignore; adding then removing
 * a word would leave it in the OS dictionary after a crash), and the browser's own items (search the
 * web, print, inspect, translate, writing direction, the Unicode and input method items of old Win32
 * edit controls), which a note doesn't need.
 */

export type TextMenuPlatform = "macos" | "windows" | "linux";
export type TextMenuEdit = "undo" | "redo" | "cut" | "copy" | "paste" | "pasteAsPlainText" | "delete" | "selectAll";
export const TEXT_MENU_EDITS: readonly TextMenuEdit[] = ["undo", "redo", "cut", "copy", "paste", "pasteAsPlainText", "delete", "selectAll"];

export type TextMenuEntry =
  | { kind: "suggestion"; word: string }
  | { kind: "noSuggestions" }
  /** The OS spell checker hasn't answered yet: the edit items show at once, the suggestions follow. */
  | { kind: "checking" }
  | { kind: "learn"; word: string }
  /** macOS: Look Up “word” (the system's dictionary panel). */
  | { kind: "lookUp"; word: string }
  | { kind: "separator" }
  | { kind: "edit"; role: TextMenuEdit; enabled: boolean }
  /** Windows' emoji panel (Win+.), macOS's Emoji & Symbols. Linux has none. */
  | { kind: "emoji" }
  /** macOS: the Speech submenu (Start Speaking, Stop Speaking). */
  | { kind: "speech" }
  | { kind: "copyLink" }
  /** Only a web link (http, https, mailto), opened by the shell's guarded link opening. */
  | { kind: "openLink" };

/** What the shell knows about the click (a subset of Electron's `ContextMenuParams`). */
export interface TextMenuParams {
  isEditable: boolean;
  misspelledWord: string;
  dictionarySuggestions: string[];
  selectionText: string;
  menuSourceType: string;
  linkURL?: string;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canDelete?: boolean; canSelectAll: boolean };
}

/** As many suggestions as the OS menus show. */
export const MAX_SUGGESTIONS = 6;
/** The longest word a menu shows. */
const MAX_WORD = 100;
/** The longest selection macOS offers to look up (its own menu stops offering it for long ones). */
const MAX_LOOK_UP = 40;

const WEB_LINK = /^(https?:\/\/|mailto:)/i;

/**
 * The menu's items for a right-click on `platform`, or none: a key (Shift+F10, the Menu key) opens the
 * app's block menu instead, and outside text with nothing selected and no link there's nothing to act
 * on. `checking`: the OS spell checker is still deciding whether the word is misspelled.
 */
export function textMenuEntries(p: TextMenuParams, opts: { platform: TextMenuPlatform; checking?: boolean }): TextMenuEntry[] {
  if (p.menuSourceType === "keyboard") return [];
  const mac = opts.platform === "macos";
  const f = p.editFlags;
  const selected = p.selectionText.trim();
  const groups: TextMenuEntry[][] = [];
  if (p.isEditable && p.misspelledWord) {
    const suggestions = p.dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
    groups.push(suggestions.length ? suggestions.map((word) => ({ kind: "suggestion" as const, word })) : [{ kind: "noSuggestions" }]);
    groups.push([{ kind: "learn", word: p.misspelledWord }]);
  } else if (p.isEditable && opts.checking) {
    groups.push([{ kind: "checking" }]);
  }
  const lookUp = selected || (p.isEditable ? p.misspelledWord : "");
  if (mac && lookUp && lookUp.length <= MAX_LOOK_UP && !/\s{2,}|[\r\n]/.test(lookUp)) groups.push([{ kind: "lookUp", word: lookUp }]);
  const edit = (role: TextMenuEdit, enabled: boolean | undefined): TextMenuEntry => ({ kind: "edit", role, enabled: enabled === true });
  if (p.isEditable) {
    // Undo and Redo are the editor's own history, which the browser's canUndo and canRedo don't see:
    // the shell offers them, and the page's menu shows whether the history has a step (D-204).
    groups.push([edit("undo", true), edit("redo", true)]);
    groups.push([edit("cut", f.canCut), edit("copy", f.canCopy), edit("paste", f.canPaste), edit("pasteAsPlainText", f.canPaste), edit("delete", f.canDelete)]);
    groups.push([edit("selectAll", f.canSelectAll)]);
  } else if (selected) {
    // Read-only text: only Copy. Select all would select the whole window, which isn't what anyone wants.
    groups.push([edit("copy", f.canCopy)]);
  }
  const link = p.linkURL ?? "";
  if (link) groups.push(WEB_LINK.test(link) ? [{ kind: "copyLink" }, { kind: "openLink" }] : [{ kind: "copyLink" }]);
  if (mac && (p.isEditable || selected)) groups.push([{ kind: "speech" }]);
  if (p.isEditable && opts.platform !== "linux") groups.push([{ kind: "emoji" }]);
  const items: TextMenuEntry[] = [];
  for (const g of groups.filter((g) => g.length)) items.push(...(items.length ? [{ kind: "separator" as const }] : []), ...g);
  return items;
}

/** An item's id in the drawn menu, and in the shell's reply: `s0`…`s5`, `learn`, an edit's role, `emoji`, `copyLink`, …. */
export function textMenuItemId(entries: readonly TextMenuEntry[], index: number): string | undefined {
  const e = entries[index];
  if (!e || e.kind === "separator") return undefined;
  if (e.kind === "suggestion") return `s${entries.slice(0, index).filter((x) => x.kind === "suggestion").length}`;
  if (e.kind === "edit") return e.role;
  return e.kind;
}

/** What a chosen item does, once checked against the menu it came from. */
export type TextMenuAction =
  | { kind: "replace"; word: string }
  | { kind: "learn"; word: string }
  | { kind: "lookUp" }
  | { kind: "edit"; role: TextMenuEdit }
  | { kind: "emoji" }
  | { kind: "copyLink" }
  | { kind: "openLink" };

/**
 * The action for an item chosen in the menu `model`, or undefined: an item the menu didn't offer, an
 * unavailable one, or a reply to an older menu does nothing.
 */
export function textMenuChoice(model: TextMenuModel | undefined, id: unknown, item: unknown): TextMenuAction | undefined {
  if (!model || id !== model.id || typeof item !== "string") return undefined;
  for (let i = 0; i < model.entries.length; i++) {
    if (textMenuItemId(model.entries, i) !== item) continue;
    const e = model.entries[i]!;
    switch (e.kind) {
      case "suggestion": return { kind: "replace", word: e.word };
      case "learn": return { kind: "learn", word: e.word };
      case "edit": return e.enabled ? { kind: "edit", role: e.role } : undefined;
      case "lookUp": case "emoji": case "copyLink": case "openLink": return { kind: e.kind };
      default: return undefined;
    }
  }
  return undefined;
}

/** The commands an Undo or Redo item runs in the page: the editor's own history, not the browser's. */
export const TEXT_MENU_HISTORY: Partial<Record<TextMenuEdit, string>> = { undo: "edit.undo", redo: "edit.redo" };

/** The menu as the shell sends it to the page: where it opens (page pixels) and its items. */
export interface TextMenuModel {
  /** Each new menu has a new id; the same id again fills in the suggestions of the menu showing. */
  id: number;
  x: number;
  y: number;
  entries: TextMenuEntry[];
}

const word = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_WORD && !/[\u0000-\u001f]/.test(v);
const PLAIN = ["noSuggestions", "checking", "separator", "emoji", "copyLink", "openLink"] as const;

/** The model from the shell, checked: anything malformed is dropped whole. macOS-only items never reach the page. */
export function parseTextMenu(raw: unknown): TextMenuModel | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!num(r.id) || !num(r.x) || !num(r.y) || !Array.isArray(r.entries) || r.entries.length > 30) return undefined;
  const entries: TextMenuEntry[] = [];
  let suggestions = 0;
  for (const v of r.entries as unknown[]) {
    if (!v || typeof v !== "object") return undefined;
    const e = v as Record<string, unknown>;
    if (e.kind === "suggestion" && word(e.word) && ++suggestions <= MAX_SUGGESTIONS) entries.push({ kind: "suggestion", word: e.word });
    else if (e.kind === "learn" && word(e.word)) entries.push({ kind: "learn", word: e.word });
    else if (PLAIN.includes(e.kind as (typeof PLAIN)[number])) entries.push({ kind: e.kind as (typeof PLAIN)[number] });
    else if (e.kind === "edit" && TEXT_MENU_EDITS.includes(e.role as TextMenuEdit) && typeof e.enabled === "boolean") entries.push({ kind: "edit", role: e.role as TextMenuEdit, enabled: e.enabled });
    else return undefined;
  }
  return { id: r.id as number, x: Math.round(r.x as number), y: Math.round(r.y as number), entries };
}
