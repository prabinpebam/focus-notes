import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import * as s from "./PopoverPanel.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";

export interface PopoverPanelProps {
  /** Names the panel for assistive technology. */
  label: string;
  open?: boolean;
  placement?: "bottom" | "top" | "start" | "end";
  /** The pressable that opens the panel. */
  trigger: ReactNode;
  content: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/** A frosted, anchored panel. Esc and clicking outside close it (Main UI → Behavior). */
export function PopoverPanel({ label, open, placement = "bottom", trigger, content, onOpenChange }: PopoverPanelProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const boundary = useWindowBoundary();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  // When the panel opens, focus moves to its first action (Main UI → Behavior).
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('[tabindex="0"]:not([aria-disabled="true"]), button:not([aria-disabled="true"]):not([tabindex="-1"])');
      first?.focus();
    });
    // Esc closes the panel in one press, even while a tooltip is showing (Main UI → Dismiss).
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !(e.target instanceof Node) || !dialogRef.current?.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      onOpenChangeRef.current?.({ open: false });
    };
    window.addEventListener("keydown", onEscape, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onEscape, true);
    };
  }, [open]);
  return (
    <DialogTrigger {...(open !== undefined ? { isOpen: open } : {})} onOpenChange={(o) => onOpenChange?.({ open: o })}>
      {trigger}
      <Popover className={s.popover} placement={placement} offset={8} shouldFlip {...boundary} data-surface="popover">
        <Dialog aria-label={label} className={s.dialog} ref={dialogRef as RefObject<HTMLElement>}>
          {content}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
