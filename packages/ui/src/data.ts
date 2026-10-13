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
