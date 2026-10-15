import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, Popover } from "react-aria-components";
import { windowMetrics } from "@focus-notes/tokens";
import { Icon } from "../Icon/Icon.tsx";
import type { MenuSection } from "../../data.ts";
import * as s from "./WindowControls.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";

export interface WindowControlsProps {
  label: string;
  minimizeLabel: string;
  maximizeLabel: string;
  restoreLabel: string;
  closeLabel: string;
  layoutsLabel: string;
  maximized?: boolean;
  reveal?: boolean;
  layouts: MenuSection[];
  onAction?: (payload: { id: string }) => void;
  /** Esc on a button (with the picker closed): back to writing, as from the rest of the chrome. */
  onDismiss?: () => void;
}

type Open = false | "hover" | "keyboard";

/**
 * The window buttons the app draws on Windows and Linux (D-15): minimize, maximize or restore, and
 * close, hidden at rest like the rest of the chrome. Hovering maximize for a moment, or pressing ↓
 * on it, opens the Snap Layouts picker: each layout is a small screen whose zones place the window.
 */
export function WindowControls({ label, minimizeLabel, maximizeLabel, restoreLabel, closeLabel, layoutsLabel, maximized, reveal, layouts, onAction, onDismiss }: WindowControlsProps) {
  const maxRef = useRef<HTMLButtonElement | null>(null);
  const boundary = useWindowBoundary();
  const flyRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<Open>(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (fn: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, windowMetrics.snapLayoutsDelay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (open === "keyboard") requestAnimationFrame(() => flyRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [open]);

  const act = (id: string) => {
    clearTimeout(timer.current);
    setOpen(false);
    onAction?.({ id });
  };
  const close = (refocus: boolean) => {
    clearTimeout(timer.current);
    setOpen(false);
    if (refocus) maxRef.current?.focus();
  };
  // The picker opens after a moment over maximize, and stays while the pointer is over it or the picker.
  const enter = () => (open ? clearTimeout(timer.current) : later(() => setOpen("hover")));
  const leave = () => (open === "hover" ? later(() => setOpen(false)) : open ? undefined : clearTimeout(timer.current));

  const zoneKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const zones = [...(flyRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = zones.indexOf(document.activeElement as HTMLButtonElement);
    const to = (n: number) => zones[(n + zones.length) % zones.length]?.focus();
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") to(i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to(i - 1);
    else if (e.key === "Home") to(0);
    else if (e.key === "End") to(zones.length - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={s.root}
      data-window-controls=""
      data-trigger-band=""
      data-reveal={reveal || open ? "" : undefined}
      // The trigger toolbar steps back while the picker is open (MorphPanel.css.ts, D-119).
      data-picker-open={open ? "" : undefined}
      onKeyDown={(e) => {
        // The picker handles its own Esc (back to maximize); on a button, Esc leaves the chrome.
        if (e.key !== "Escape" || open || !(e.target instanceof HTMLButtonElement) || flyRef.current?.contains(e.target)) return;
        e.preventDefault();
        onDismiss?.();
      }}
    >
      <Button className={s.button} aria-label={minimizeLabel} onPress={() => act("window.minimize")}>
        <Icon name="minimize" size="s" />
      </Button>
      <Button
        ref={maxRef}
        className={s.button}
        aria-label={maximized ? restoreLabel : maximizeLabel}
        aria-haspopup="dialog"
        aria-expanded={Boolean(open)}
        onPress={() => act(maximized ? "window.restore" : "window.maximize")}
        onHoverStart={enter}
        onHoverEnd={leave}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && layouts.length) setOpen("keyboard");
          // Esc before focus has moved into the picker (it moves on the next frame) closes it too.
          else if (e.key === "Escape" && open) close(true);
          else e.continuePropagation();
        }}
      >
        <Icon name={maximized ? "restore" : "maximize"} size="s" />
      </Button>
      <Button className={`${s.button} ${s.close}`} aria-label={closeLabel} onPress={() => act("window.close")}>
        <Icon name="dismiss" size="s" />
      </Button>
      <Popover triggerRef={maxRef} isOpen={Boolean(open) && layouts.length > 0} onOpenChange={(o) => (o ? undefined : close(open === "keyboard"))} isNonModal placement="bottom end" {...boundary} className={s.popover} data-floating-child="">
        <div
          ref={flyRef}
          role="dialog"
          aria-label={layoutsLabel}
          className={s.flyout}
          data-surface="popover"
          onKeyDown={zoneKeys}
          onPointerEnter={() => clearTimeout(timer.current)}
          onPointerLeave={leave}
          onBlur={(e) => {
            if (open === "keyboard" && !flyRef.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget !== maxRef.current) close(false);
          }}
        >
          {layouts.map((l) => (
            <div key={l.id} role="group" aria-label={l.label ?? l.id} className={`${s.layout} ${s.arrangement[l.id as keyof typeof s.arrangement] ?? s.arrangement.halves}`}>
              {l.items.map((z) => (
                <button key={z.id} type="button" className={s.zone} aria-label={z.label} data-zone={z.id} onClick={() => act(z.id)} />
              ))}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
