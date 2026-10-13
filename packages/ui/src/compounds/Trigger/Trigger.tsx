import { TriggerButton } from "../../primitives/TriggerButton/TriggerButton.tsx";

export interface TriggerProps {
  label: string;
  /** Appended to the accessible name when there's a save problem. */
  problemLabel?: string;
  problem?: boolean;
  shortcut?: string;
  expanded?: boolean;
  onPress?: () => void;
}

/** The trigger (IA-CMP-TRIGGER, IA-CMP-SAVESTATE): its dot turns to the danger tone only when saving fails. */
export function Trigger({ label, problemLabel, problem, shortcut, expanded, onPress }: TriggerProps) {
  return (
    <TriggerButton
      label={problem && problemLabel ? `${label}. ${problemLabel}` : label}
      tone={problem ? "danger" : "red"}
      {...(shortcut ? { shortcut } : {})}
      {...(expanded !== undefined ? { expanded } : {})}
      {...(onPress ? { onPress } : {})}
    />
  );
}
