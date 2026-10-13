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

/** A result in a ResultList (Spotlight, the slash menu, Move to). */
export interface ResultItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
}

/** Key scopes (Keyboard shortcuts → Contexts decide): keys registered for a scope work only inside it. */
export const KEY_SCOPES = ["none", "findBar", "findField", "replaceField", "pickerField"] as const;
export type KeyScope = (typeof KEY_SCOPES)[number];

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
