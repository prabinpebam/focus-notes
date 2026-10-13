import { Button as AriaButton } from "react-aria-components";
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
  busy?: boolean;
  disabled?: boolean;
  /** Required with `disabled`: a disabled button stays focusable and says why (Foundations → States). */
  disabledReason?: string;
  id?: string;
  onPress?: () => void;
}

export function Button({ label, variant = "secondary", size = "m", icon, iconPosition = "start", busy, disabled, disabledReason, id, onPress }: ButtonProps) {
  const inert = disabled || busy;
  const button = (
    <AriaButton
      id={id}
      className={[s.base, s.size[size], s.variant[variant]].join(" ")}
      aria-disabled={inert ? "true" : undefined}
      aria-busy={busy ? "true" : undefined}
      onPress={inert ? undefined : onPress}
    >
      {icon && iconPosition === "start" ? <Icon name={icon} size="s" /> : null}
      {label}
      {icon && iconPosition === "end" ? <Icon name={icon} size="s" /> : null}
    </AriaButton>
  );
  return disabled && disabledReason ? <Tooltip label={disabledReason}>{button}</Tooltip> : button;
}
