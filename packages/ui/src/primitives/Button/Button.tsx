import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
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
  busy?: boolean;
  disabled?: boolean;
  /** Required with `disabled`: a disabled button stays focusable and says why (Foundations → States). */
  disabledReason?: string;
  id?: string;
  onPress?: () => void;
}

export function Button({ label, variant = "secondary", size = "m", icon, iconPosition = "start", toggle, pressed, busy, disabled, disabledReason, id, onPress }: ButtonProps) {
  const inert = disabled || busy;
  const common = {
    id,
    className: [s.base, s.size[size], s.variant[variant]].join(" "),
    "aria-disabled": inert ? ("true" as const) : undefined,
    "aria-busy": busy ? ("true" as const) : undefined,
  };
  const content = (
    <>
      {icon && iconPosition === "start" ? <Icon name={icon} size="s" /> : null}
      {label}
      {icon && iconPosition === "end" ? <Icon name={icon} size="s" /> : null}
    </>
  );
  const button = toggle ? (
    <ToggleButton {...common} isSelected={Boolean(pressed)} onChange={inert ? undefined : () => onPress?.()}>{content}</ToggleButton>
  ) : (
    <AriaButton {...common} onPress={inert ? undefined : onPress}>{content}</AriaButton>
  );
  return disabled && disabledReason ? <Tooltip label={disabledReason}>{button}</Tooltip> : button;
}
