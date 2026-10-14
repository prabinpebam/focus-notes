import { useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TooltipContext, TooltipTrigger, TooltipTriggerStateContext } from "react-aria-components";
import { useTooltip, useUNSAFE_PortalContext } from "react-aria";
import { fixedBox } from "../../behaviors/frame.ts";
import { placeTooltip, type TooltipSide } from "./place.ts";
import * as s from "./Tooltip.css.ts";

export interface TooltipProps {
  label: string;
  /** The formatted key chord, for example "⌘O" or "Ctrl+O". */
  shortcut?: string;
  placement?: TooltipSide;
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

/**
 * Whether a control is there to be named: a tooltip never names one that's gone (it would float on
 * its own, in a corner). Fading in (the toolbar opening, its focus already inside) counts as there.
 */
function showing(el: HTMLElement | null): el is HTMLElement {
  if (!el?.isConnected || el.closest("[inert]")) return false;
  if (!el.checkVisibility({ visibilityProperty: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** The space between the control and its tooltip, and the least distance from the window's edges (tokens, read once shown). */
const read = (el: Element, v: string) => parseFloat(getComputedStyle(el).getPropertyValue(v.replace(/^var\(/, "").replace(/\)$/, ""))) || 0;

/**
 * The tooltip itself: anchored to its control and kept inside the window as drawn (D-14, D-111). It
 * follows the control while it's open (a toolbar still growing moves it), and closes when the
 * control is hidden, so it's never left behind in a corner.
 */
function Bubble({ placement, children }: { placement: TooltipSide; children: ReactNode }) {
  const state = useContext(TooltipTriggerStateContext);
  const { triggerRef, ...props } = (useContext(TooltipContext) ?? {}) as HTMLAttributes<HTMLElement> & { triggerRef?: RefObject<HTMLElement | null> };
  const ref = useRef<HTMLDivElement | null>(null);
  const portal = useUNSAFE_PortalContext();
  const [container, setContainer] = useState<Element | null>(null);
  const [placed, setPlaced] = useState(false);
  const open = Boolean(state?.isOpen);
  const { tooltipProps } = useTooltip(props, state!);

  // Opening: only for a control that shows, and inside its landmark.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef?.current ?? null;
    if (!showing(trigger)) {
      state?.close(true);
      return;
    }
    setContainer(landmarkOf(trigger) ?? portal.getContainer?.() ?? document.body);
    return () => {
      setContainer(null);
      setPlaced(false);
    };
  }, [open]);

  // Open: next to the control, every frame (cheap: one tooltip at a time), until it closes.
  useLayoutEffect(() => {
    const el = ref.current;
    const trigger = triggerRef?.current ?? null;
    if (!open || !el || !container) return;
    let frame = 0;
    const follow = () => {
      if (!showing(trigger)) {
        state?.close(true);
        return;
      }
      const win = fixedBox(trigger);
      const now = el.getBoundingClientRect();
      // In a panel above what it points at (the formatting toolbar over the selection), above it,
      // so it never covers that text; below one, below.
      const placed = trigger.closest("[data-placed]")?.getAttribute("data-placed");
      const side = placed === "above" ? "top" : placed === "below" ? "bottom" : placement;
      const at = placeTooltip(trigger.getBoundingClientRect(), now, { left: win.left, top: win.top, right: win.left + win.width, bottom: win.top + win.height }, { gap: read(el, s.gapVar), edge: read(el, s.edgeVar) }, side);
      // In viewport coordinates, whatever its containing block is: moved by what's left to go.
      if (Math.abs(at.x - now.left) > 0.25) el.style.left = `${(parseFloat(el.style.left) || 0) + at.x - now.left}px`;
      if (Math.abs(at.y - now.top) > 0.25) el.style.top = `${(parseFloat(el.style.top) || 0) + at.y - now.top}px`;
      el.dataset.placement = at.side;
      frame = requestAnimationFrame(follow);
    };
    follow();
    // Shown once it's in place, then fades in.
    const reveal = requestAnimationFrame(() => setPlaced(true));
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(reveal);
    };
  }, [open, container]);

  if (!open || !container) return null;
  return createPortal(
    <div {...tooltipProps} ref={ref} className={s.tooltip} data-entering={placed ? undefined : ""}>
      {children}
    </div>,
    container,
  );
}

/** Name and shortcut after 500 ms of hovering, or at once on keyboard focus (Foundations → Words). */
export function Tooltip({ label, shortcut, placement = "bottom", children }: TooltipProps) {
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      {children}
      <Bubble placement={placement}>
        <span>{label}</span>
        {shortcut ? <span className={s.shortcut}>{shortcut}</span> : null}
      </Bubble>
    </TooltipTrigger>
  );
}
