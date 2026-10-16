/** Shapes of view-model data that list props accept. Command items always come from the registry (DSY-12). */
export interface CommandItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  /** Why it's disabled, shown in its tooltip. */
  reason?: string;
  /** A submenu: this item opens these items instead of running a command. */
  items?: CommandItem[];
  /** A wait it started is showing its sign (PRF-08), and what it's doing. */
  busy?: boolean;
  busyLabel?: string;
}

/** A result in a ResultList (Spotlight, the slash menu, Move to, Find in all notes). */
export interface ResultItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  /**
   * A group's heading, not a result: the items after it, up to the next heading, are its group
   * (Spotlight's Top hit, Notes, Commands…; Find in all notes' note, with its path and count as the
   * description). The arrow keys pass over it.
   */
  header?: boolean;
  /** Where the label matched: [start, end) ranges in UTF-16 code units, marked as matches. */
  highlights?: readonly (readonly number[])[];
  /** The same for the description (a full-text snippet). */
  descriptionHighlights?: readonly (readonly number[])[];
  /** A current state or value at the end of the row ("On", "16 px"), read with it. */
  state?: string;
}

/** One block of a note's version in the conflict resolver (VersionPane), and whether the other version differs there. */
export interface VersionBlock {
  id: string;
  text: string;
  changed: boolean;
}

/** A row of the Files tree (FileTree): a root's section label, a folder, or a note. */
export interface TreeItem {
  id: string;
  kind: "section" | "folder" | "note";
  /** 1 for a section, then one more per folder (aria-level). */
  level: number;
  label: string;
  /** Said after the label and shown muted: "read-only", "public". */
  description?: string;
  /** The tooltip: a note's file name. */
  title?: string;
  /** The ID of the row it's in. */
  parent?: string;
  expanded?: boolean;
  hasChildren?: boolean;
  selected?: boolean;
  /** The open note. */
  current?: boolean;
  /** Shown in its new place, waiting for its write (the saving sign). */
  pending?: boolean;
  readOnly?: boolean;
  draggable?: boolean;
  /** Things can be dropped into it. */
  droppable?: boolean;
  /** Shows the inline name field instead of its label. */
  editing?: boolean;
}

/**
 * Key scopes (Keyboard shortcuts → Contexts decide): keys registered for a scope work only inside it.
 * `files` is the Files sheet, `filesTree` its tree, and `filesEdit` the tree's name field, which
 * stops the outer scopes so Delete and F2 edit the text there. `findAll` is the Find in all notes
 * sheet and `findAllField` its search field.
 */
export const KEY_SCOPES = ["none", "findBar", "findField", "replaceField", "pickerField", "formatToolbar", "linkEditor", "files", "filesTree", "filesEdit", "moveField", "firstRun", "repoField", "spotlightField", "findAll", "findAllField"] as const;
export type KeyScope = (typeof KEY_SCOPES)[number];

/** A theme in the theme manager's gallery (ThemeGallery). */
export interface ThemeTile {
  id: string;
  label: string;
  kind: "light" | "dark";
  /** "Light ✓" or "Dark ✓" when it fills that slot. */
  slot?: string;
  /** The contrast badge: AA or AAA. */
  badge: string;
  /** Said after the name: its kind and badge. */
  description?: string;
  /** The built-in theme whose styles its sample uses, when it isn't one (a custom theme's base). */
  sample?: string;
  /** A custom theme's own colors over its sample's (THM-04): color tokens and hex values. */
  colors?: ColorValue[];
  /** The group it's in ("Yours", "Focus Notes"): tiles of a group are next to each other, under its heading. */
  group?: string;
}

/** A color token's value for the root (AppRoot's themeColors): an edited copy of a theme. */
export interface ColorValue {
  id: string;
  value: string;
}

/** One choice in a segmented control or filter. */
export interface Option {
  id: string;
  label: string;
}

/** An editor key binding from the command registry: a chord ("Mod+B") and the command it runs. */
export interface KeyBinding {
  id: string;
  chord: string;
}

export interface MenuSection {
  id: string;
  label?: string;
  items: CommandItem[];
}
