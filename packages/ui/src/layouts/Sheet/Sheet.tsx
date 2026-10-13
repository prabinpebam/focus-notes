import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import type { KeyScope } from "../../data.ts";
import * as s from "./Sheet.css.ts";

export interface SheetProps {
  /** The sheet's name, for its landmark. */
  label: string;
  side?: keyof typeof s.side;
  width?: keyof typeof s.width;
  /** Keys registered for this scope work while focus is inside. */
  keyScope?: KeyScope;
  /** What stays above the scrolling body: the title, actions, a filter. */
  header?: ReactNode;
  id?: string;
  children?: ReactNode;
  onClose?: () => void;
}

/**
 * A side sheet (IA → Surface types): floats over the canvas without moving the reading column,
 * and closes on Esc or a click on the canvas. It isn't modal: the note stays readable beside it.
 */
export function Sheet({ label, side = "start", width = "files", keyScope = "none", header, id, children, onClose }: SheetProps) {
  const ref = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // A click on the note (or the window's background) closes it; menus and dialogs it opened don't.
    const down = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest("[data-editor]") || target === document.body || target === document.documentElement || target.hasAttribute("data-theme")) close.current?.();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);
  const keyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    close.current?.();
  };
  return (
    <FloatingContext.Provider value={true}>
      <aside
        ref={ref}
        id={id}
        aria-label={label}
        className={`${s.sheet} ${s.side[side]} ${s.width[width]}`}
        data-key-scope={keyScope === "none" ? undefined : keyScope}
        onKeyDown={keyDown}
      >
        {header ? <div className={s.header}>{header}</div> : null}
        <div className={s.body}>{children}</div>
      </aside>
    </FloatingContext.Provider>
  );
}
