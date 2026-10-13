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
}

export interface MenuSection {
  id: string;
  label?: string;
  items: CommandItem[];
}
