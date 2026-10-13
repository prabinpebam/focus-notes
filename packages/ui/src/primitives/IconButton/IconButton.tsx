import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
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
  disabled?: boolean;
  disabledReason?: string;
  id?: string;
  onPress?: () => void;
}

export function IconButton({ icon, label, shortcut, tone = "default", toggle, pressed, disabled, disabledReason, id, onPress }: IconButtonProps) {
  const className = `${s.base} ${s.tone[tone]}`;
  const common = { id, className, "aria-label": label, "aria-disabled": disabled ? ("true" as const) : undefined };
  const button = toggle ? (
    <ToggleButton {...common} isSelected={Boolean(pressed)} onChange={disabled ? undefined : () => onPress?.()}>
      <Icon name={icon} />
    </ToggleButton>
  ) : (
    <AriaButton {...common} onPress={disabled ? undefined : onPress}>
      <Icon name={icon} />
    </AriaButton>
  );
  return <Tooltip label={disabled && disabledReason ? disabledReason : label} {...(shortcut ? { shortcut } : {})}>{button}</Tooltip>;
}
