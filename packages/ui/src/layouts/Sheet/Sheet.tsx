import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import { useFadingEdges } from "../../behaviors/fading-edges.ts";
import type { KeyScope } from "../../data.ts";
import { fixedBox } from "../../behaviors/frame.ts";
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
  /** What stays below it: Recently deleted in Files. */
  footer?: ReactNode;
  id?: string;
  children?: ReactNode;
  onClose?: () => void;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");
const px = (el: Element, v: string) => parseFloat(getComputedStyle(el).getPropertyValue(name(v))) || 0;
/** What a sheet never covers: the trigger at rest and the window's own controls. */
const BANDS = "[data-trigger-band]";

/**
 * The sheet's inset from the window's top, side, and bottom (D-111): the token's, the same on all
 * three, unless the sheet would then cover the trigger or the window's controls; then it's as much
 * more as keeps them clear, still the same on all three, so the sheet stays vertically centered.
 * Measured where the sheet would be at the token's inset, so the answer never depends on itself.
 */
export function sheetInset(el: HTMLElement, side: "start" | "end"): number {
  const base = px(el, s.baseVar);
  const clearance = px(el, s.clearanceVar);
  const win = fixedBox(el);
  const width = Math.min(px(el, s.widthVar), win.width - 2 * base);
  const left = side === "start" ? win.left + base : win.left + win.width - base - width;
  let inset = base;
  for (const band of document.querySelectorAll(BANDS)) {
    const r = band.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right > left && r.left < left + width) inset = Math.max(inset, Math.ceil(r.bottom - win.top + clearance));
  }
  return inset;
}

/**
 * A side sheet (IA → Surface types): floats over the canvas without moving the reading column,
 * and closes on Esc or a click on the canvas. It isn't modal: the note stays readable beside it.
 */
export function Sheet({ label, side = "start", width = "files", keyScope = "none", header, footer, id, children, onClose }: SheetProps) {
  const ref = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef);
  useFadingEdges(bodyRef);
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      el.style.setProperty(name(s.insetVar), `${sheetInset(el, side)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    addEventListener("resize", schedule);
    // The trigger and the window's controls can move (the window maximized, a toolbar closing).
    const bands = new ResizeObserver(schedule);
    for (const b of document.querySelectorAll(BANDS)) bands.observe(b);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", schedule);
      bands.disconnect();
    };
  }, [side, width]);
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
        data-surface="sheet"
        data-side={side}
        data-key-scope={keyScope === "none" ? undefined : keyScope}
        onKeyDown={keyDown}
      >
        {header ? <div className={s.header}>{header}</div> : null}
        <div className={s.body} ref={bodyRef}>{children}</div>
        {footer ? <div className={s.footer}>{footer}</div> : null}
      </aside>
    </FloatingContext.Provider>
  );
}
