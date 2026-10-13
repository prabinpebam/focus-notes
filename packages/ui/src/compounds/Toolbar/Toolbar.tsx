import { ToolbarRow } from "../../layouts/ToolbarRow/ToolbarRow.tsx";
import { IconButton } from "../../primitives/IconButton/IconButton.tsx";
import { MenuButton } from "../../primitives/MenuButton/MenuButton.tsx";
import { Divider } from "../../primitives/Divider/Divider.tsx";
import type { CommandItem, MenuSection } from "../../data.ts";
import type { IconName } from "../../icon-names.ts";

export const MAX_ACTIONS = 6;

export interface ToolbarProps {
  label: string;
  /** Command items from the registry. Only the first six show; the rest move into ⋯ (UI-04). */
  items: CommandItem[];
  more: MenuSection[];
  moreLabel: string;
  onAction?: (payload: { id: string }) => void;
}

/** The minimal toolbar (IA-CMP-TOOLBAR, IA-CMP-OVERFLOW): at most six actions, then ⋯. */
export function Toolbar({ label, items, more, moreLabel, onAction }: ToolbarProps) {
  const shown = items.slice(0, MAX_ACTIONS);
  const overflow = items.slice(MAX_ACTIONS);
  const sections = overflow.length ? [{ id: "pinned-overflow", items: overflow }, ...more] : more;
  return (
    <ToolbarRow label={label}>
      {shown.map((item) => (
        <IconButton
          key={item.id}
          icon={(item.icon ?? "info") as IconName}
          label={item.label}
          {...(item.shortcut ? { shortcut: item.shortcut } : {})}
          {...(item.checked !== undefined ? { toggle: true, pressed: item.checked } : {})}
          {...(item.disabled ? { disabled: true, ...(item.reason ? { disabledReason: item.reason } : {}) } : {})}
          onPress={() => onAction?.({ id: item.id })}
        />
      ))}
      <Divider orientation="vertical" />
      <MenuButton icon="more" label={moreLabel} sections={sections} {...(onAction ? { onAction } : {})} />
    </ToolbarRow>
  );
}
