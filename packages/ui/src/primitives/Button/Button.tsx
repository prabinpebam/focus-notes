import { useContext } from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { CompanionContext } from "../../behaviors/anchors.ts";
import { FloatingContext } from "../../layouts/Layer/floating.ts";
import { controlLabel } from "../control.css.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import { BorderProgress } from "../CommitMark/BorderProgress.tsx";
import type { CommitState } from "../CommitMark/CommitMark.tsx";
import { useBusy } from "../../behaviors/busy.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./Button.css.ts";

export interface ButtonProps {
  label: string;
  variant?: keyof typeof s.variant;
  size?: keyof typeof s.size;
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** A toggle button: `pressed` is its state (aria-pressed). */
  toggle?: boolean;
  pressed?: boolean;
  /** A disclosure button: whether what it shows is open (aria-expanded). */
  expanded?: boolean;
  /** A wait it started (Waits, D-199): inert at once; after the busy delay a Spinner replaces its icon. */
  busy?: boolean;
  /** Compact controls use their own border rather than adding an icon beside the label. */
  feedback?: "inline" | "border";
  /** Optional gallery/commit feedback; recovery belongs outside the button. */
  commit?: CommitState;
  /** Its words while the wait shows ("Signing out…"), and the tracker's done words after it ("Published"). */
  busyLabel?: string;
  disabled?: boolean;
  /** Required with `disabled`: a disabled button stays focusable and says why (Foundations → States). */
  disabledReason?: string;
  /** Takes focus when it appears: a confirmation's choice that changes nothing (APG alert dialog), or a first-run step's primary action. */
  autoFocus?: boolean;
  /** A subtle button at the start of the content (a first-run step's Back): its label lines up with the edge, its hit area reaching into the padding. */
  bleed?: boolean;
  id?: string;
  onPress?: () => void;
}

export function Button({ label, variant = "secondary", size = "m", icon, iconPosition = "start", toggle, pressed, expanded, busy, feedback = "inline", commit, busyLabel, disabled, disabledReason, autoFocus, bleed, id, onPress }: ButtonProps) {
  const borderFeedback = feedback === "border" || commit !== undefined;
  const { inert, name, attrs, ref } = useBusy({ busy: busy || commit === "pending", busyLabel, label, disabled });
  const keepNoteFocus = useContext(CompanionContext);
  const floating = useContext(FloatingContext) && (variant === "secondary" || variant === "subtle");
  const common = {
    id,
    className: [s.base, s.size[size], ...(icon ? [iconPosition === "start" ? s.iconStart[size] : s.iconEnd[size]] : []), s.variant[variant], ...(floating ? [s.floating] : []), ...(bleed ? [s.bleed[size]] : []), ...(borderFeedback ? [s.borderAnchor] : [])].join(" "),
    "data-floating-control": floating ? "" : undefined,
    "data-bleed": bleed ? "" : undefined,
    ...attrs,
    ref,
    ...(expanded !== undefined ? { "aria-expanded": expanded } : {}),
    ...(autoFocus ? { autoFocus: true } : {}),
    preventFocusOnPress: keepNoteFocus,
  };
  // Busy, the icon's cell holds a Spinner too, shown after the busy delay; a button without an icon says it in words.
  const glyph = icon ? (busy && !borderFeedback ? (
    <span className={s.busyGlyph}>
      <span className={s.busyIcon}><Icon name={icon} size="s" /></span>
      <span className={s.busySpinner}><Spinner size="s" /></span>
    </span>
  ) : <Icon name={icon} size="s" />) : null;
  const content = (
    <>
      {iconPosition === "start" ? glyph : null}
      <span className={`${s.label} ${controlLabel}`}>{name}</span>
      {iconPosition === "end" ? glyph : null}
      {borderFeedback ? <BorderProgress state={commit ?? (busy ? "pending" : "rest")} /> : null}
    </>
  );
  const button = toggle ? (
    <ToggleButton {...common} isSelected={Boolean(pressed)} onChange={inert ? undefined : () => onPress?.()}>{content}</ToggleButton>
  ) : (
    <AriaButton {...common} onPress={inert ? undefined : onPress}>{content}</AriaButton>
  );
  return disabled && disabledReason ? <Tooltip label={disabledReason}>{button}</Tooltip> : button;
}
