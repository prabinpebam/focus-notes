import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import * as s from "./PopoverPanel.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";

export interface PopoverPanelProps {
  /** Names the panel for assistive technology. */
  label: string;
  open?: boolean;
  placement?: "bottom" | "top" | "top start" | "start" | "end";
  hoverOpen?: boolean;
  padding?: "normal" | "comfortable";
  /** The pressable that opens the panel. */
  trigger: ReactNode;
  content?: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/** A frosted, anchored panel. Esc and clicking outside close it (Main UI → Behavior). */
export function PopoverPanel({ label, open, placement = "bottom", hoverOpen = false, padding = "normal", trigger, content, onOpenChange }: PopoverPanelProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const pointed = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = open ?? previewOpen;
  const change = (value: boolean) => { setPreviewOpen(value); onOpenChangeRef.current?.({ open: value }); };
  const enter = () => { pointed.current = true; clearTimeout(closeTimer.current); change(true); };
  const leave = () => {
    pointed.current = false;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const active = document.activeElement;
      if (!pointed.current && !triggerRef.current?.contains(active) && !dialogRef.current?.contains(active)) change(false);
    }, 200);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!hoverOpen || !shown) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      change(false);
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [hoverOpen, shown]);
  const boundary = useWindowBoundary();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  // When the panel opens, focus moves to its first action (Main UI → Behavior).
  useEffect(() => {
    if (!open || hoverOpen) return;
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
  }, [open, hoverOpen]);
  const children = (
    <>
      {trigger}
      <Popover className={s.popover} data-padding={padding} placement={placement} offset={8} shouldFlip {...boundary} isNonModal={hoverOpen} aria-label={label} data-surface="popover">
        {hoverOpen
          ? <div className={s.dialog} role="dialog" aria-label={label} tabIndex={-1} ref={dialogRef as RefObject<HTMLDivElement>}>{content}</div>
          : <Dialog aria-label={label} className={s.dialog} ref={dialogRef as RefObject<HTMLElement>}>{content}</Dialog>}
      </Popover>
    </>
  );
  const props = { ...(open !== undefined ? { isOpen: open } : {}), onOpenChange: (o: boolean) => onOpenChange?.({ open: o }) };
  return hoverOpen
    ? <DialogTrigger isOpen={shown} onOpenChange={change}>
        <span
          ref={triggerRef}
          className={s.previewTrigger}
          onPointerEnter={(e) => { if (e.pointerType !== "touch") enter(); }}
          onPointerLeave={leave}
          onFocus={() => clearTimeout(closeTimer.current)}
          onBlur={leave}
          onKeyDown={(e) => {
            if (e.key !== "Tab" || e.shiftKey || !shown || (e.target instanceof Node && dialogRef.current?.contains(e.target))) return;
            const first = dialogRef.current?.querySelector<HTMLElement>('button, [tabindex="0"]');
            if (first) { e.preventDefault(); first.focus(); }
          }}
        >{children}</span>
      </DialogTrigger>
    : <DialogTrigger {...props}>{children}</DialogTrigger>;
}
