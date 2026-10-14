/**
 * The keymap beyond the app's own commands (Keyboard shortcuts): editor commands, whose keys the
 * editor's keymap runs while typing, and the native text keys the cheat sheet lists for reference.
 */
import { chordParts, formatChord, spokenChord, KEY_GROUPS, type Binding, type KeyGroup, type KeyLayer, type Platform, type Shortcut } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";

export interface EditorCommandSpec {
  id: string;
  title: string;
  shortcut: Shortcut;
  layer: KeyLayer;
  group: KeyGroup;
}

const ed = (id: string, chord: string | Shortcut, layer: KeyLayer, group: KeyGroup): EditorCommandSpec => ({
  id,
  title: `command.${id}`,
  shortcut: { ...(typeof chord === "string" ? { default: chord } : chord), handledBy: "editor" },
  layer,
  group,
});

/** Table commands: editor commands whose keys work only with the caret in a table. */
const tb = (id: string, chord: string | Shortcut, layer: KeyLayer): EditorCommandSpec => ({
  id,
  title: `command.${id}`,
  shortcut: { ...(typeof chord === "string" ? { default: chord } : chord), handledBy: "table" },
  layer,
  group: "tables",
});

/** Editor commands (KEY-02). Each one is also runnable from menus and, later, Spotlight. */
export const EDITOR_COMMANDS: readonly EditorCommandSpec[] = [
  ed("edit.undo", "Mod+Z", "basic", "editing"),
  ed("edit.docStart", { macos: "Mod+Up", default: "Mod+Home" }, "basic", "editing"),
  ed("edit.docEnd", { macos: "Mod+Down", default: "Mod+End" }, "basic", "editing"),
  ed("edit.redo", { macos: "Mod+Shift+Z", default: "Mod+Y", alternates: { default: ["Mod+Shift+Z"], macos: [] } }, "basic", "editing"),
  ed("format.bold", "Mod+B", "basic", "formatting"),
  ed("format.italic", "Mod+I", "basic", "formatting"),
  ed("format.strike", "Mod+Shift+X", "writer", "formatting"),
  ed("format.code", "Mod+E", "writer", "formatting"),
  ed("format.clear", "Mod+\\", "writer", "formatting"),
  ed("block.paragraph", "Mod+Alt+0", "writer", "blocks"),
  ed("block.heading1", "Mod+Alt+1", "writer", "blocks"),
  ed("block.heading2", "Mod+Alt+2", "writer", "blocks"),
  ed("block.heading3", "Mod+Alt+3", "writer", "blocks"),
  ed("block.bulletList", "Mod+Shift+8", "writer", "blocks"),
  ed("block.orderedList", "Mod+Shift+7", "writer", "blocks"),
  ed("block.taskList", "Mod+Shift+9", "writer", "blocks"),
  ed("block.quote", "Mod+Shift+B", "writer", "blocks"),
  ed("block.codeBlock", "Mod+Alt+C", "writer", "blocks"),
  ed("task.toggle", "Mod+Enter", "writer", "blocks"),
  // Power layer (KEY-03): whole blocks. Windows and Linux also move with Alt+↑/↓, as VS Code does.
  ed("block.moveUp", { default: "Mod+Shift+Up", alternates: { default: ["Alt+Up"], macos: [] } }, "power", "blocks"),
  ed("block.moveDown", { default: "Mod+Shift+Down", alternates: { default: ["Alt+Down"], macos: [] } }, "power", "blocks"),
  ed("block.duplicate", "Mod+D", "power", "blocks"),
  ed("block.delete", "Mod+Shift+K", "power", "blocks"),
  // Tables (Keyboard shortcuts → Tables): they apply in a table and come before the block keys there.
  tb("table.nextCell", "Tab", "basic"),
  tb("table.prevCell", "Shift+Tab", "basic"),
  tb("table.cellBelow", "Enter", "writer"),
  tb("table.cellAbove", "Shift+Enter", "writer"),
  tb("table.addRowBelow", "Mod+Enter", "power"),
  tb("table.addRowAbove", "Mod+Shift+Enter", "power"),
  tb("table.moveRowUp", "Mod+Shift+Up", "power"),
  tb("table.moveRowDown", "Mod+Shift+Down", "power"),
  tb("table.deleteRow", "Mod+Shift+K", "power"),
  tb("table.selectCells", "Escape", "pro"),
  tb("table.contextMenu", { default: "Shift+F10", alternates: { default: ["ContextMenu"] } }, "pro"),
];

/** Standard OS and browser text keys. They aren't commands; the cheat sheet lists them so it's complete. */
export const NATIVE_KEYS: readonly EditorCommandSpec[] = [
  { id: "keys.cutCopyPaste", title: "keys.cutCopyPaste", shortcut: { default: "Mod+X", alternates: { default: ["Mod+C", "Mod+V"] } }, layer: "basic", group: "editing" },
  { id: "keys.pastePlain", title: "keys.pastePlain", shortcut: { default: "Mod+Shift+V", alternates: { macos: ["Mod+Alt+Shift+V"], default: [] } }, layer: "writer", group: "editing" },
  { id: "keys.selectAll", title: "keys.selectAll", shortcut: { default: "Mod+A" }, layer: "basic", group: "editing" },
  { id: "keys.indent", title: "keys.indent", shortcut: { default: "Tab", alternates: { default: ["Shift+Tab"] } }, layer: "basic", group: "blocks" },
  { id: "keys.lineBreak", title: "keys.lineBreak", shortcut: { default: "Shift+Enter" }, layer: "basic", group: "blocks" },
  // The slash menu (EDT-06) opens on a typed `/`, not a chord, so the editor handles it.
  { id: "keys.slashMenu", title: "keys.slashMenu", shortcut: { default: "/" }, layer: "writer", group: "blocks" },
];

/** Rows follow the order of the tables in Keyboard shortcuts; anything unlisted keeps registry order. */
const ROW_ORDER = [
  "note.open", "note.new", "note.save", "toolbar.toggle", "shortcuts.open", "focus.toggle", "appearance.toggle",
  "font.larger", "font.smaller", "font.reset", "window.fullScreen",
];
const rank = (id: string) => {
  const i = ROW_ORDER.indexOf(id);
  return i < 0 ? ROW_ORDER.length : i;
};

export type CheatSheetLayer = "all" | KeyLayer;
export type CheatSheetPlatform = "mac" | "pc";

export interface CheatSheetRow {
  id: string;
  label: string;
  layer: KeyLayer;
  /** Each chord as key caps, for example [["⇧", "⌘", "Z"]]. */
  /** `first` is false for alternates, which the cheat sheet introduces with "or". */
  chords: { id: string; text: string; spoken: string; keys: string[]; first: boolean }[];
}

export interface CheatSheetGroup {
  id: KeyGroup;
  label: string;
  rows: CheatSheetRow[];
}

/** The platform whose keys the cheat sheet shows. */
export const displayPlatform = (choice: CheatSheetPlatform, actual: Platform): Platform =>
  choice === "mac" ? "macos" : actual === "macos" ? "windows" : actual;

/**
 * Builds the cheat sheet (KEY-05): every binding grouped as in Keyboard shortcuts, filtered by layer
 * and by a search that matches names, groups, layers, and keys ("⌘/" or "ctrl /" both work).
 */
export function cheatSheet(
  bindings: readonly Binding[],
  catalog: MessageCatalog,
  { query, layer, platform }: { query: string; layer: CheatSheetLayer; platform: Platform },
): CheatSheetGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups: CheatSheetGroup[] = [];
  for (const group of KEY_GROUPS) {
    const groupLabel = catalog.format(`shortcuts.group.${group}`);
    const rows: CheatSheetRow[] = [];
    for (const b of bindings) {
      if (b.group !== group || (layer !== "all" && b.layer !== layer)) continue;
      const label = catalog.format(b.title);
      const shown = b.chords.map((c) => formatChord(c, platform));
      if (terms.length) {
        const keys = b.chords.flatMap((c) => [c, formatChord(c, "macos"), formatChord(c, "windows"), formatChord(c, "windows").replaceAll("+", " ")]);
        const hay = [label, groupLabel, catalog.format(`shortcuts.layer.${b.layer}`), ...keys].join("\n").toLowerCase();
        if (!terms.every((t) => hay.includes(t))) continue;
      }
      rows.push({ id: b.id, label, layer: b.layer, chords: b.chords.map((c, i) => ({ id: `${b.id}.${i}`, text: shown[i]!, spoken: spokenChord(c, platform), keys: chordParts(c, platform), first: i === 0 })) });
    }
    // Array.prototype.sort is stable, so unlisted rows keep their registry order.
    if (rows.length) groups.push({ id: group, label: groupLabel, rows: rows.sort((a, b) => rank(a.id) - rank(b.id)) });
  }
  return groups;
}

