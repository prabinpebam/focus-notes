import { TriggerButton } from "../../primitives/TriggerButton/TriggerButton.tsx";
import { MorphPanel } from "../../primitives/MorphPanel/MorphPanel.tsx";
import { Toolbar } from "../Toolbar/Toolbar.tsx";
import type { CommandItem, MenuSection } from "../../data.ts";

export interface TriggerProps {
  label: string;
  /** Appended to the accessible name when there's a save problem. */
  problemLabel?: string;
  problem?: boolean;
  shortcut?: string;
  open?: boolean;
  toolbarLabel: string;
  items: CommandItem[];
  more: MenuSection[];
  moreLabel: string;
  onOpenChange?: (payload: { open: boolean }) => void;
  onAction?: (payload: { id: string }) => void;
}

/**
 * The trigger (IA-CMP-TRIGGER, IA-CMP-SAVESTATE): opens the toolbar under itself (UI-03). Its dot
 * turns to the danger tone only when saving fails.
 */
export function Trigger({ label, problemLabel, problem, shortcut, open, toolbarLabel, items, more, moreLabel, onOpenChange, onAction }: TriggerProps) {
  return (
    <MorphPanel
      label={toolbarLabel}
      open={Boolean(open)}
      {...(onOpenChange ? { onOpenChange } : {})}
      trigger={
        <TriggerButton
          label={problem && problemLabel ? `${label}. ${problemLabel}` : label}
          tone={problem ? "danger" : "red"}
          {...(shortcut ? { shortcut } : {})}
          expanded={Boolean(open)}
          onPress={() => onOpenChange?.({ open: !open })}
        />
      }
      content={<Toolbar label={toolbarLabel} items={items} more={more} moreLabel={moreLabel} {...(onAction ? { onAction } : {})} />}
    />
  );
}
