import { ToolbarRow } from "../../layouts/ToolbarRow/ToolbarRow.tsx";
import { IconButton } from "../../primitives/IconButton/IconButton.tsx";
import { MenuButton } from "../../primitives/MenuButton/MenuButton.tsx";
import { Divider } from "../../primitives/Divider/Divider.tsx";
import { Switch } from "../../primitives/Switch/Switch.tsx";
import type { CommandItem, MenuSection } from "../../data.ts";
import type { IconName } from "../../icon-names.ts";

export const MAX_ACTIONS = 6;

export interface ToolbarProps {
  label: string;
  /** Command items from the registry. Only the first six show; the rest move into ⋯ (UI-04). */
  items: CommandItem[];
  more: MenuSection[];
  moreLabel: string;
  onLabel: string;
  offLabel: string;
  onAction?: (payload: { id: string }) => void;
}

/** The minimal toolbar (IA-CMP-TOOLBAR, IA-CMP-OVERFLOW): at most six actions, then ⋯. */
export function Toolbar({ label, items, more, moreLabel, onLabel, offLabel, onAction }: ToolbarProps) {
  const shown = items.slice(0, MAX_ACTIONS);
  const overflow = items.slice(MAX_ACTIONS);
  const sections = overflow.length ? [{ id: "pinned-overflow", items: overflow }, ...more] : more;
  return (
    <ToolbarRow label={label}>
      {shown.map((item) => item.checked !== undefined ? (
        <Switch key={item.id} label={item.label} checked={item.checked} onLabel={onLabel} offLabel={offLabel}
          {...(item.disabled ? { disabled: true, disabledReason: item.reason } : {})}
          {...(item.commit ? { commit: item.commit } : {})}
          onChange={() => onAction?.({ id: item.id })} />
      ) : (
        <IconButton
          key={item.id}
          icon={(item.icon ?? "info") as IconName}
          label={item.label}
          {...(item.shortcut ? { shortcut: item.shortcut } : {})}
          {...(item.disabled ? { disabled: true, ...(item.reason ? { disabledReason: item.reason } : {}) } : {})}
          {...(item.busy ? { busy: true } : {})}
          {...(item.busyLabel ? { busyLabel: item.busyLabel } : {})}
          {...(item.commit ? { commit: item.commit } : {})}
          onPress={() => onAction?.({ id: item.id })}
        />
      ))}
      <Divider orientation="vertical" />
      <MenuButton icon="more" label={moreLabel} sections={sections} {...(onAction ? { onAction } : {})} />
    </ToolbarRow>
  );
}
