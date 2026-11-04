import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { Icon } from "../Icon/Icon.tsx";
import { Button } from "../Button/Button.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import * as s from "./Toast.css.ts";

export interface ToastProps {
  message: string;
  tone?: "info" | "error" | "success" | "warning" | "progress";
  /** The host keeps this outcome visible until dismissed or resolved. */
  sticky?: boolean;
  actionLabel?: string;
  actionPending?: boolean;
  dismissLabel: string;
  /** Each new value moves focus to the toast's action, or its close button (F6). */
  focusRequest?: number;
  id?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** The timer pauses while the toast is hovered or focused. */
  onPausedChange?: (payload: { paused: boolean }) => void;
  onWrapped?: () => void;
}

/** A short confirmation at the bottom (IA-CMP-TOAST). Errors are alerts; everything else is polite. */
export function Toast({ message, tone = "info", sticky = false, actionLabel, actionPending = false, dismissLabel, focusRequest, id, onAction, onDismiss, onPausedChange, onWrapped }: ToastProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLSpanElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => () => {
    if (ref.current?.contains(document.activeElement) && returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const element = messageRef.current;
    if (!element || !onWrapped) return;
    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()];
      if (lines.some((line) => Math.abs(line.top - (lines[0]?.top ?? line.top)) > 1)) onWrapped();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [message, onWrapped]);
  // Only a request made while it shows moves focus: a toast that appears later never takes it.
  const asked = useRef(focusRequest);
  useEffect(() => {
    if (!focusRequest || focusRequest === asked.current) return;
    asked.current = focusRequest;
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
      data-sticky={sticky || tone === "error" ? "" : undefined}
      className={s.root}
      data-surface="toast"
      onMouseEnter={() => pause(true)}
      onMouseLeave={() => pause(false)}
      onFocus={(event) => {
        if (event.relatedTarget instanceof HTMLElement && !ref.current?.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget;
        pause(true);
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {tone !== "info" ? <span className={s.icon} data-tone={tone} aria-hidden="true">{tone === "progress" ? <Spinner size="s" /> : <Icon name={tone === "error" ? "error" : tone === "warning" ? "warning" : "check"} />}</span> : null}
      <span ref={messageRef} className={s.message} dir="auto">{message}</span>
      {actionLabel ? <Button label={actionLabel} size="s" busy={actionPending} feedback="border" {...(onAction ? { onPress: onAction } : {})} /> : null}
      <IconButton icon="dismiss" label={dismissLabel} tone="muted" {...(onDismiss ? { onPress: onDismiss } : {})} />
    </div>
  );
}
