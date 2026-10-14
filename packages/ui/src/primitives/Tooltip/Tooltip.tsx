import { useRef, useState, type ReactElement } from "react";
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

/** Landmarks, and the overlays that stand in for them (a dialog), that a tooltip can live in. */
const LANDMARKS = [
  "main", "aside", "nav", "header", "footer", "[role=banner]", "[role=main]", "[role=complementary]", "[role=contentinfo]",
  "[role=navigation]", "[role=search]", "[role=region][aria-label]", "[role=region][aria-labelledby]", "[role=dialog]", "[role=alertdialog]",
].join(",");

/**
 * The outermost landmark around a control: its tooltip renders there instead of at the end of the
 * page, so every piece of content stays inside a landmark (A11Y-01, axe `region`). The outermost one,
 * because inner ones can clip (the toolbar's panel, a dialog's scrolling body).
 */
export function landmarkOf(el: Element | null): HTMLElement | undefined {
  let found: HTMLElement | undefined;
  for (let n = el?.parentElement?.closest<HTMLElement>(LANDMARKS); n; n = n.parentElement?.closest<HTMLElement>(LANDMARKS)) found = n;
  return found;
}

/** Name and shortcut after 500 ms of hovering, or at once on keyboard focus (Foundations → Words). */
export function Tooltip({ label, shortcut, placement = "bottom", children }: TooltipProps) {
  const probe = useRef<HTMLSpanElement | null>(null);
  // Found when it first opens, in the same update, so mounting many controls costs nothing extra.
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);
  return (
    <TooltipTrigger delay={500} closeDelay={0} onOpenChange={(open) => { if (open && !container) setContainer(landmarkOf(probe.current)); }}>
      {children}
      <span ref={probe} hidden />
      {/* A portal provider would need react-aria as a dependency; this prop does the same per tooltip. */}
      <AriaTooltip className={s.tooltip} placement={placement} offset={8} {...(container ? { UNSTABLE_portalContainer: container } : {})}>
        <span>{label}</span>
        {shortcut ? <span className={s.shortcut}>{shortcut}</span> : null}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
