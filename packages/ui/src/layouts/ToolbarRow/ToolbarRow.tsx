import { useEffect, useRef, type ReactNode } from "react";
import { Toolbar } from "react-aria-components";
import * as s from "./ToolbarRow.css.ts";

export interface ToolbarRowProps {
  label: string;
  children?: ReactNode;
}

/** A row with the toolbar role: one tab stop, arrow keys between items, Home and End (Main UI → Behavior). */
export function ToolbarRow({ label, children }: ToolbarRowProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Home" && e.key !== "End") return;
      const items = [...el.querySelectorAll<HTMLElement>("button, [tabindex]")].filter((x) => x.closest('[role="toolbar"]') === el);
      const target = e.key === "Home" ? items[0] : items.at(-1);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Toolbar aria-label={label} className={s.row} ref={ref}>
      {children}
    </Toolbar>
  );
}
