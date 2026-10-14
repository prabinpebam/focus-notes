import { Button as AriaButton } from "react-aria-components";
import { SignalDot } from "../SignalDot/SignalDot.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import * as s from "./TriggerButton.css.ts";

export interface TriggerButtonProps {
  /** Accessible name, which includes any save problem ("Menu. Couldn't save"). */
  label: string;
  shortcut?: string;
  tone?: "red" | "warning" | "danger";
  expanded?: boolean;
  id?: string;
  onPress?: () => void;
}

/** The trigger: a 10 px red dot inside a 30 px frosted circle (UI-02, D-03). */
export function TriggerButton({ label, shortcut, tone = "red", expanded, id, onPress }: TriggerButtonProps) {
  return (
    <Tooltip label={label} {...(shortcut ? { shortcut } : {})}>
      <AriaButton
        id={id}
        className={s.ring}
        aria-label={label}
        // It opens a non-modal dialog holding the toolbar (MorphPanel), not a menu.
        aria-haspopup="dialog"
        aria-expanded={expanded ?? false}
        data-trigger=""
        // Side sheets keep clear of it (D-111).
        data-trigger-band=""
        onPress={onPress}
      >
        <SignalDot tone={tone} />
      </AriaButton>
    </Tooltip>
  );
}
