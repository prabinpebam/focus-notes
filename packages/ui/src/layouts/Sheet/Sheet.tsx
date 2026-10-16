import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import type { KeyScope } from "../../data.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import { placeSheet } from "./place.ts";
import { pinnedSheet } from "../../behaviors/pinned-sheet.ts";
import * as s from "./Sheet.css.ts";

export interface SheetProps {
  /** The sheet's name, for its landmark. */
  label: string;
  side?: keyof typeof s.side;
  width?: keyof typeof s.width;
  /** Keys registered for this scope work while focus is inside. */
  keyScope?: KeyScope;
  /** Pinned open (D-161): a click on the canvas leaves it open, and a start sheet keeps the note's text clear of it. */
  pinned?: boolean;
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

/** Where the sheet floats in the window as drawn, clear of the trigger and the window's controls (place.ts). */
function placed(el: HTMLElement, side: "start" | "end") {
  const win = fixedBox(el);
  const bands = [...document.querySelectorAll(BANDS)].map((b) => b.getBoundingClientRect()).filter((r) => r.width >= 1 && r.height >= 1);
  return placeSheet({ left: win.left, top: win.top, right: win.left + win.width, bottom: win.top + win.height }, bands, side, { base: px(el, s.baseVar), clearance: px(el, s.clearanceVar), width: px(el, s.widthVar), minWidth: px(el, s.minWidthVar) });
}

/**
 * A side sheet (IA → Surface types): floats over the canvas without moving the reading column,
 * and closes on Esc or a click on the canvas. It isn't modal: the note stays readable beside it.
 */
export function Sheet({ label, side = "start", width = "files", keyScope = "none", pinned = false, header, footer, id, children, onClose }: SheetProps) {
  const ref = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef);
  const mainRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(mainRef);
  const close = useRef(onClose);
  close.current = onClose;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  useEffect(() => {
    // A click on the note (or the window's background) closes it; menus and dialogs it opened don't.
    const down = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || ref.current?.contains(target) || pinnedRef.current) return;
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
      const p = placed(el, side);
      el.style.setProperty(name(s.insetVar), `${p.inset}px`);
      el.style.setProperty(name(s.limitVar), `${p.width}px`);
      // Where a pinned sheet ends: the note keeps its text clear of it (D-161).
      if (pinned && side === "start") pinnedSheet.set(Math.round(fixedBox(el).left + p.inset + p.width));
      // Too short for a fixed header: it scrolls with the content (Sheet.css.ts).
      if (fixedBox(el).height - 2 * p.inset < px(el, s.shortVar)) el.dataset.short = "";
      else delete el.dataset.short;
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
      if (pinned && side === "start") pinnedSheet.set(undefined);
    };
  }, [side, width, pinned]);
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
        data-pinned={pinned ? "" : undefined}
        data-key-scope={keyScope === "none" ? undefined : keyScope}
        onKeyDown={keyDown}
      >
        {/* The header and the body: the body scrolls, or in a short sheet both do (Sheet.css.ts). */}
        <div className={s.main} ref={mainRef}>
          {header ? <div className={s.header} data-sheet-header="">{header}</div> : null}
          <div className={s.body} ref={bodyRef} data-sheet-body="">{children}</div>
        </div>
        {footer ? <div className={s.footer}>{footer}</div> : null}
      </aside>
    </FloatingContext.Provider>
  );
}
