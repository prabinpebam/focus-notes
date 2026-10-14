import { useContext } from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { CompanionContext } from "../../behaviors/anchors.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import type { IconName } from "../../icon-names.ts";
import * as s from "./IconButton.css.ts";

export interface IconButtonProps {
  icon: IconName;
  /** The accessible name and tooltip. Required: icons are never the only signal. */
  label: string;
  shortcut?: string;
  tone?: keyof typeof s.tone;
  toggle?: boolean;
  pressed?: boolean;
  /** A toggle that applies to only part of what it acts on: half-pressed (DD-FMT-06). */
  mixed?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** A wait it started is showing (PRF-08): a spinner replaces the icon, and the label says what it's doing. */
  busy?: boolean;
  busyLabel?: string;
  id?: string;
  onPress?: () => void;
}

export function IconButton({ icon, label, shortcut, tone = "default", toggle, pressed, mixed, disabled, disabledReason, busy, busyLabel, id, onPress }: IconButtonProps) {
  const className = `${s.base} ${s.tone[tone]}`;
  const keepNoteFocus = useContext(CompanionContext);
  const name = busyLabel || label;
  const common = { id, className, "aria-label": name, "aria-disabled": disabled ? ("true" as const) : undefined, "aria-busy": busy ? ("true" as const) : undefined, preventFocusOnPress: keepNoteFocus };
  const glyph = busy ? <Spinner size="s" /> : <Icon name={icon} />;
  const button = toggle && mixed ? (
    <AriaButton {...common} aria-pressed="mixed" onPress={disabled || busy ? undefined : onPress}>
      {glyph}
    </AriaButton>
  ) : toggle ? (
    <ToggleButton {...common} isSelected={Boolean(pressed)} onChange={disabled || busy ? undefined : () => onPress?.()}>
      {glyph}
    </ToggleButton>
  ) : (
    <AriaButton {...common} onPress={disabled || busy ? undefined : onPress}>
      {glyph}
    </AriaButton>
  );
  return <Tooltip label={disabled && disabledReason ? disabledReason : name} {...(shortcut ? { shortcut } : {})}>{button}</Tooltip>;
}
