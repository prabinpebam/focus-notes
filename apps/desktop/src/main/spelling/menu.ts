/**
 * The menu on a right-click in text (D-193, D-204): the OS spell checker's suggestions for a
 * misspelled word, "Add to dictionary" (the OS's custom dictionary on Windows and macOS), then the
 * edit actions. Its items come from one model (`textMenuEntries`, @focus-notes/core/text-menu) on
 * every platform, so the menus stay in parity (EDT-14). On macOS it's the system's own menu, in the
 * system's words and with its roles; on Windows and Linux the app draws the same items in the design
 * system (TextMenu), so the menu follows the theme.
 * The app's own menus (the title bar band, Files rows, table cells) cancel the page's `contextmenu`,
 * so this never shows over them; a key (Shift+F10, the Menu key) opens the app's block menu instead.
 */
import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";
import { MAX_SUGGESTIONS, TEXT_MENU_HISTORY, textMenuEntries, type TextMenuEntry, type TextMenuPlatform } from "@focus-notes/core/text-menu";

export { MAX_SUGGESTIONS };

export type SpellingMenuParams = Pick<ContextMenuParams, "isEditable" | "misspelledWord" | "dictionarySuggestions" | "selectionText" | "menuSourceType" | "editFlags" | "linkURL">;

export interface SpellingMenuActions {
  /** Puts the suggestion in place of the misspelled word (`webContents.replaceMisspelling`). */
  replace(suggestion: string): void;
  /** Adds the word to the spell checker's dictionary (`session.addWordToSpellCheckerDictionary`). */
  learn(word: string): void;
  /** Look Up (`webContents.showDefinitionForSelection`). */
  lookUp(): void;
  /** Undo and Redo: the page runs the editor's own history (`edit.undo`, `edit.redo`). */
  run(command: string): void;
  /** Emoji & Symbols (`app.showEmojiPanel`). */
  emoji(): void;
  copyLink(): void;
  openLink(): void;
}

/** macOS's words for the items the system has no role for, as its own text menus write them. */
export const MAC_MENU_WORDS = {
  noSuggestions: "No Guesses Found",
  checking: "Checking Spelling…",
  learn: "Learn Spelling",
  lookUp: (w: string) => `Look Up “${w}”`,
  undo: "Undo",
  redo: "Redo",
  speech: "Speech",
  emoji: "Emoji & Symbols",
  copyLink: "Copy Link",
  openLink: "Open Link",
} as const;

/** A label shown as written: macOS's menus, like Windows', read a single `&` as an access key mark (Chromium's FixUpWindowsStyleLabel). */
const literal = (s: string) => s.replace(/&/g, "&&");

/** The native menu's item for one of the model's entries. */
function nativeItem(e: TextMenuEntry, act: SpellingMenuActions): MenuItemConstructorOptions {
  const W = MAC_MENU_WORDS;
  switch (e.kind) {
    case "suggestion": return { label: literal(e.word), click: () => act.replace(e.word) };
    case "noSuggestions": return { label: W.noSuggestions, enabled: false };
    case "checking": return { label: W.checking, enabled: false };
    case "learn": return { label: W.learn, click: () => act.learn(e.word) };
    case "lookUp": return { label: literal(W.lookUp(e.word)), click: () => act.lookUp() };
    case "separator": return { type: "separator" };
    case "speech": return { label: W.speech, submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }] };
    case "emoji": return { label: literal(W.emoji), click: () => act.emoji() };
    // Rewrite… is only in the page's drawn menu (Windows and Linux); macOS's model never has it.
    case "rewrite": return { type: "separator" };
    case "copyLink": return { label: W.copyLink, click: () => act.copyLink() };
    case "openLink": return { label: W.openLink, click: () => act.openLink() };
    case "edit": {
      const history = TEXT_MENU_HISTORY[e.role];
      if (history) {
        // The editor's own history, not the browser's: the page runs the command, as ⌘Z does.
        const accelerator = e.role === "undo" ? "CommandOrControl+Z" : "Shift+CommandOrControl+Z";
        return { label: e.role === "undo" ? W.undo : W.redo, accelerator, registerAccelerator: false, enabled: e.enabled, click: () => act.run(history) };
      }
      return { role: e.role === "pasteAsPlainText" ? "pasteAndMatchStyle" : e.role, enabled: e.enabled };
    }
  }
}

/** The native menu for a right-click (macOS), or none (the page's own menu answers, or there's nothing to act on). */
export function spellingMenu(p: SpellingMenuParams, act: SpellingMenuActions, platform: TextMenuPlatform = "macos"): MenuItemConstructorOptions[] {
  return textMenuEntries(p, { platform }).map((e) => nativeItem(e, act));
}

/** What a journey reads instead of a native menu on screen: the items' words and roles, in order. */
export function describeMenu(items: readonly MenuItemConstructorOptions[]): string {
  const one = (i: MenuItemConstructorOptions): string =>
    i.type === "separator" ? "-"
    : i.role ? `role:${i.role}${i.enabled === false ? " (off)" : ""}`
    : Array.isArray(i.submenu) ? `${i.label}[${i.submenu.map(one).join(", ")}]`
    : `${i.label}${i.enabled === false ? " (off)" : ""}`;
  return items.map(one).join(" | ");
}
