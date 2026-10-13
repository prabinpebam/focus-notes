import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { Icon } from "../Icon/Icon.tsx";
import { Button } from "../Button/Button.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import * as s from "./Toast.css.ts";

export interface ToastProps {
  message: string;
  tone?: "info" | "error";
  actionLabel?: string;
  dismissLabel: string;
  /** Each new value moves focus to the toast's action, or its close button (F6). */
  focusRequest?: number;
  id?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** The timer pauses while the toast is hovered or focused. */
  onPausedChange?: (payload: { paused: boolean }) => void;
}

/** A short confirmation at the bottom (IA-CMP-TOAST). Errors are alerts; everything else is polite. */
export function Toast({ message, tone = "info", actionLabel, dismissLabel, focusRequest, id, onAction, onDismiss, onPausedChange }: ToastProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
  }, [focusRequest]);
  const pause = (paused: boolean) => onPausedChange?.({ paused });
  const onBlur = (e: FocusEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node | null)) pause(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onDismiss?.();
  };
  return (
    <div
      ref={ref}
      id={id}
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      className={s.root}
      onMouseEnter={() => pause(true)}
      onMouseLeave={() => pause(false)}
      onFocus={() => pause(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {tone === "error" ? <span className={s.icon} aria-hidden="true"><Icon name="error" /></span> : null}
      <span className={s.message} dir="auto">{message}</span>
      {actionLabel ? <Button label={actionLabel} size="s" {...(onAction ? { onPress: onAction } : {})} /> : null}
      <IconButton icon="dismiss" label={dismissLabel} tone="muted" {...(onDismiss ? { onPress: onDismiss } : {})} />
    </div>
  );
}
