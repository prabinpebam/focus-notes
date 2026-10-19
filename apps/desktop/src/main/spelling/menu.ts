/**
 * The OS's own menu on a right-click in text (D-193): the OS spell checker's suggestions for a
 * misspelled word, "Add to dictionary" (the OS's custom dictionary on Windows and macOS), then the
 * edit actions as Electron roles, so their words and keys are the system's. Chromium shows no menu of
 * its own in Electron, so without this a misspelled word was underlined with no way to act on it.
 * The app's own menus (the title bar band, Files rows, table cells) cancel the page's `contextmenu`,
 * so this never shows over them; a key (Shift+F10, the Menu key) opens the app's block menu instead.
 */
import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";

export type SpellingMenuParams = Pick<ContextMenuParams, "isEditable" | "misspelledWord" | "dictionarySuggestions" | "selectionText" | "menuSourceType" | "editFlags">;

export interface SpellingMenuActions {
  /** Puts the suggestion in place of the misspelled word (`webContents.replaceMisspelling`). */
  replace(suggestion: string): void;
  /** Adds the word to the spell checker's dictionary (`session.addWordToSpellCheckerDictionary`). */
  learn(word: string): void;
}

export const SPELLING_MENU_WORDS = { noSuggestions: "No suggestions", learn: "Add to dictionary" } as const;
/** As many suggestions as the OS menus show. */
export const MAX_SUGGESTIONS = 6;

/** A label shown as written: `&` would otherwise mark a Windows access key. */
const literal = (s: string) => s.replace(/&/g, "&&");

/** The menu for a right-click, or none (the page's own menu answers, or there's nothing to act on). */
export function spellingMenu(p: SpellingMenuParams, act: SpellingMenuActions): MenuItemConstructorOptions[] {
  if (p.menuSourceType === "keyboard") return [];
  const items: MenuItemConstructorOptions[] = [];
  if (p.isEditable && p.misspelledWord) {
    const word = p.misspelledWord;
    const suggestions = p.dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
    for (const s of suggestions) items.push({ label: literal(s), click: () => act.replace(s) });
    if (!suggestions.length) items.push({ label: SPELLING_MENU_WORDS.noSuggestions, enabled: false });
    items.push({ type: "separator" }, { label: SPELLING_MENU_WORDS.learn, click: () => act.learn(word) }, { type: "separator" });
  }
  if (p.isEditable) {
    items.push(
      { role: "cut", enabled: p.editFlags.canCut },
      { role: "copy", enabled: p.editFlags.canCopy },
      { role: "paste", enabled: p.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: p.editFlags.canSelectAll },
    );
  } else if (p.selectionText.trim()) {
    items.push({ role: "copy", enabled: p.editFlags.canCopy });
  }
  return items;
}

/** What a journey reads instead of a native menu on screen: the items' words and roles, in order. */
export function describeMenu(items: readonly MenuItemConstructorOptions[]): string {
  return items.map((i) => (i.type === "separator" ? "-" : i.role ? `role:${i.role}` : `${i.label}${i.enabled === false ? " (off)" : ""}`)).join(" | ");
}
