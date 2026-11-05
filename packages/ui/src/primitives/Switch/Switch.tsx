import { Switch as AriaSwitch } from "react-aria-components";
import { CommitFailure, CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./Switch.css.ts";

export interface SwitchProps {
  /** The setting's name: Link, Passcode, Include notes added later. */
  label: string;
  /** Whether it's on. */
  checked?: boolean;
  /** The word shown beside the track when on: On. */
  onLabel: string;
  /** The word shown beside the track when off: Off. */
  offLabel: string;
  /** One line under the name about what the setting does. */
  description?: string;
  disabled?: boolean;
  /** Required with `disabled`: shown in place of the description, so the reason is always visible. */
  disabledReason?: string;
  /**
   * The compact track's own border shows pending, confirmed or failed; the stored value stays put
   * while pending, and a failure offers Retry below the row.
   */
  commit?: CommitState;
  error?: string;
  retryLabel?: string;
  id?: string;
  onRetry?: () => void;
  onChange?: (payload: { value: boolean }) => void;
}

/**
 * An on/off setting that takes effect as it changes (DSY-15): a track and thumb whose position, fill and
 * On/Off word all say the state, so colour is never the only sign. Native checkbox semantics with
 * role switch; Space toggles it and the whole row is the target.
 */
export function Switch({ label, checked, onLabel, offLabel, description, disabled, disabledReason, commit, error, retryLabel, id, onRetry, onChange }: SwitchProps) {
  const note = disabled && disabledReason ? disabledReason : description;
  return (
    <AriaSwitch
      aria-label={label}
      className={s.root}
      isSelected={Boolean(checked)}
      isDisabled={Boolean(disabled)}
      isReadOnly={commit === "pending"}
      {...(commit ? { "data-commit": commit } : {})}
      {...(commit === "pending" ? { "aria-busy": true } : {})}
      onChange={(value) => onChange?.({ value })}
      {...(id ? { id } : {})}
    >
      <span className={s.trackSlot} aria-hidden="true"><span className={s.track}><span className={s.thumb} />{commit ? <CommitMark variant="border" state={commit} /> : null}</span></span>
      <span className={s.text}>
        <span className={s.name}>
          <span className={s.label}>{label}</span>
          <span className={s.state} aria-hidden="true">{checked ? onLabel : offLabel}</span>
        </span>
        {note ? <span className={s.description}>{note}</span> : null}
        {commit === "failed" && error ? <CommitFailure message={error} retryLabel={retryLabel} onRetry={onRetry} /> : null}
      </span>
    </AriaSwitch>
  );
}
