import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { openHeight, openWidth } from "./MorphPanel.css.ts";
import * as s from "./MorphPanel.css.ts";

export interface MorphPanelProps {
  /** Names the open panel for assistive technology. */
  label: string;
  open?: boolean;
  /** The pressable shown while closed: the trigger. */
  trigger: ReactNode;
  content: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/** The property name inside a vanilla-extract variable reference, "var(--x)" → "--x". */
const prop = (ref: string) => ref.slice(4, -1);

/** Overlays opened from inside the panel (the ⋯ menu) mark themselves so clicks in them don't close it. */
export const FLOATING_CHILD = "data-floating-child";

/**
 * A trigger that morphs into its panel (UI-10): the trigger's circle grows into the panel's shape,
 * and the content fades in after it. Esc and clicking outside close it, and it reverses.
 */
export function MorphPanel({ label, open = false, trigger, content, onOpenChange }: MorphPanelProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const change = useRef(onOpenChange);
  change.current = onOpenChange;

  // The open size follows the content's natural size, so the shape lands exactly on it.
  useLayoutEffect(() => {
    const el = body.current;
    const host = root.current;
    if (!el || !host) return;
    const measure = () => {
      // The panel's own border sits outside its content box.
      const frame = host.offsetWidth - host.clientWidth;
      host.style.setProperty(prop(openWidth), `${el.offsetWidth + frame}px`);
      host.style.setProperty(prop(openHeight), `${el.offsetHeight + frame}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus moves to the first action once the content can take it (Main UI → Behavior).
    const id = requestAnimationFrame(() => {
      body.current?.querySelector<HTMLElement>('[tabindex="0"]:not([aria-disabled="true"]), button:not([aria-disabled="true"]):not([tabindex="-1"])')?.focus();
    });
    const inside = (n: EventTarget | null) => n instanceof Node && (root.current?.contains(n) || (n instanceof Element && n.closest(`[${FLOATING_CHILD}]`)));
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !(e.target instanceof Node) || !root.current?.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      change.current?.({ open: false });
    };
    const onPointer = (e: PointerEvent) => {
      if (!inside(e.target)) change.current?.({ open: false });
    };
    window.addEventListener("keydown", onEscape, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onEscape, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <div ref={root} className={s.root} data-open={open ? "" : undefined} data-morph-panel="">
      <div className={s.triggerSlot} inert={open}>{trigger}</div>
      <div ref={body} className={s.content} role="dialog" aria-label={label} aria-hidden={open ? undefined : true} inert={!open}>
        {content}
      </div>
    </div>
  );
}
