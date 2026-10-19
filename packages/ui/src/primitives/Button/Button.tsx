import { useContext } from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { CompanionContext } from "../../behaviors/anchors.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
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

export function Button({ label, variant = "secondary", size = "m", icon, iconPosition = "start", toggle, pressed, expanded, busy, busyLabel, disabled, disabledReason, autoFocus, bleed, id, onPress }: ButtonProps) {
  const { inert, name, attrs, ref } = useBusy({ busy, busyLabel, label, disabled });
  const keepNoteFocus = useContext(CompanionContext);
  const common = {
    id,
    className: [s.base, s.size[size], s.variant[variant], ...(bleed ? [s.bleed[size]] : [])].join(" "),
    "data-bleed": bleed ? "" : undefined,
    ...attrs,
    ref,
    ...(expanded !== undefined ? { "aria-expanded": expanded } : {}),
    ...(autoFocus ? { autoFocus: true } : {}),
    preventFocusOnPress: keepNoteFocus,
  };
  // Busy, the icon's cell holds a Spinner too, shown after the busy delay; a button without an icon says it in words.
  const glyph = icon ? (busy ? (
    <span className={s.busyGlyph}>
      <span className={s.busyIcon}><Icon name={icon} size="s" /></span>
      <span className={s.busySpinner}><Spinner size="s" /></span>
    </span>
  ) : <Icon name={icon} size="s" />) : null;
  const content = (
    <>
      {iconPosition === "start" ? glyph : null}
      <span className={s.label}>{name}</span>
      {iconPosition === "end" ? glyph : null}
    </>
  );
  const button = toggle ? (
    <ToggleButton {...common} isSelected={Boolean(pressed)} onChange={inert ? undefined : () => onPress?.()}>{content}</ToggleButton>
  ) : (
    <AriaButton {...common} onPress={inert ? undefined : onPress}>{content}</AriaButton>
  );
  return disabled && disabledReason ? <Tooltip label={disabledReason}>{button}</Tooltip> : button;
}
