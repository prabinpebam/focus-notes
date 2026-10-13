import type { ReactElement } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components";
import * as s from "./Tooltip.css.ts";

export interface TooltipProps {
  label: string;
  /** The formatted key chord, for example "⌘O" or "Ctrl+O". */
  shortcut?: string;
  placement?: "top" | "bottom" | "start" | "end";
  /** A React Aria pressable (Button, IconButton, TriggerButton), which tooltips attach to. */
  children: ReactElement;
}

/** Name and shortcut after 500 ms of hovering, or at once on keyboard focus (Foundations → Words). */
export function Tooltip({ label, shortcut, placement = "bottom", children }: TooltipProps) {
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      {children}
      <AriaTooltip className={s.tooltip} placement={placement} offset={8}>
        <span>{label}</span>
        {shortcut ? <span className={s.shortcut}>{shortcut}</span> : null}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
