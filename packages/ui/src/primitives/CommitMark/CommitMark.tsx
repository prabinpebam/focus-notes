import { ICONS } from "../../icons.ts";
import { Spinner } from "../Spinner/Spinner.tsx";
import { Button } from "../Button/Button.tsx";
import { BorderProgress } from "./BorderProgress.tsx";
import * as s from "./CommitMark.css.ts";

/** The commit track a changed value goes through (ui-states): saved quietly at rest, then pending, then confirmed or failed. */
export type CommitState = "rest" | "pending" | "confirmed" | "failed";

export interface CommitMarkProps {
  state?: CommitState;
  /** Border follows the positioned parent's shape without reserving an icon slot. */
  variant?: "inline" | "border";
  id?: string;
}

/**
 * The trailing slot of a control that saves on its own (F2): a spinner while pending, a green tick in a
 * circle that draws itself in once confirmed, an error icon when it failed. Decorative: the words go
 * to the polite live region ("Project name saved") or the failure line. The border variant uses the
 * positioned parent's own radius: no extra slot, success/error icons or label displacement.
 */
export function CommitMark({ state = "rest", variant = "inline", id }: CommitMarkProps) {
  if (variant === "border") return <BorderProgress state={state} {...(id ? { id } : {})} />;
  const Failed = ICONS.error;
  return (
    <span id={id} className={s.slot} data-commit={state} aria-hidden="true">
      {state === "pending" ? <Spinner size="s" /> : null}
      {state === "confirmed" ? (
        <svg className={s.tick} viewBox="0 0 20 20" focusable="false">
          <circle className={s.circle} cx="10" cy="10" r="9" />
          <path className={s.check} d="M6.2 10.4l2.6 2.6 5-5.4" pathLength={1} />
        </svg>
      ) : null}
      {state === "failed" ? <Failed className={s.failed} /> : null}
    </span>
  );
}

export interface CommitFailureProps {
  message: string;
  retryLabel?: string | undefined;
  revertLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
  onRevert?: (() => void) | undefined;
  id?: string | undefined;
}

/** A failed commit's line: what happened and what's safe, then Retry and Revert. The value stays in the control. */
export function CommitFailure({ message, retryLabel, revertLabel, onRetry, onRevert, id }: CommitFailureProps) {
  return (
    <div className={s.failure} role="alert" {...(id ? { id } : {})}>
      <span className={s.failText} dir="auto">{message}</span>
      {retryLabel ? <Button label={retryLabel} size="s" variant="secondary" {...(onRetry ? { onPress: onRetry } : {})} /> : null}
      {revertLabel ? <Button label={revertLabel} size="s" variant="subtle" {...(onRevert ? { onPress: onRevert } : {})} /> : null}
    </div>
  );
}
