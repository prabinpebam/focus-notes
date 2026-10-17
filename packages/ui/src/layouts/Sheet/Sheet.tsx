import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import type { KeyScope } from "../../data.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import { placeSheet } from "./place.ts";
import { dockLeft, dockMaxWidth, pinnedRight, pinnedSheet } from "../../behaviors/pinned-sheet.ts";
import { useResizeHandle } from "../../behaviors/resize-handle.ts";
import * as s from "./Sheet.css.ts";

export interface SheetProps {
  /** The sheet's name, for its landmark. */
  label: string;
  side?: keyof typeof s.side;
  width?: keyof typeof s.width;
  /** Keys registered for this scope work while focus is inside. */
  keyScope?: KeyScope;
  /** Pinned open (D-161): a click on the canvas leaves it open. */
  pinned?: boolean;
  /** Docked (D-187): flush to the window's edge below the title band, the note's area beside it, resizable from its inner edge. */
  docked?: boolean;
  /** Its docked width in px, as the person resized it; 0: the token's default. */
  dockWidth?: number;
  /** The resize handle's name ("Resize Files"). */
  resizeLabel?: string;
  /** What stays above the scrolling body: the title, actions, a filter. */
  header?: ReactNode;
  /** What stays below it: Recently deleted in Files. */
  footer?: ReactNode;
  id?: string;
  children?: ReactNode;
  onClose?: () => void;
  /** A resize ended: the width to keep. */
  onResize?: (payload: { width: number }) => void;
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
export function Sheet({ label, side = "start", width = "files", keyScope = "none", pinned = false, docked = false, dockWidth = 0, resizeLabel, header, footer, id, children, onClose, onResize }: SheetProps) {
  const ref = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef);
  const mainRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(mainRef);
  const close = useRef(onClose);
  close.current = onClose;
  const pinnedRef = useRef(pinned || docked);
  pinnedRef.current = pinned || docked;
  // Docked (D-187): its width as kept, or live while its edge is dragged; the token's lengths in px.
  const [live, setLive] = useState<number | null>(null);
  const [lengths, setLengths] = useState({ def: 0, min: 0, max: 0, content: 0 });
  const dockedWidth = live ?? (dockWidth > 0 ? Math.max(lengths.min, Math.min(lengths.max || dockWidth, dockWidth)) : lengths.def);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !docked) return;
    setLengths({ def: px(el, s.dockDefaultVar), min: px(el, s.dockMinVar), max: px(el, s.dockMaxVar), content: px(el, s.dockContentMinVar) });
  }, [docked]);
  useLayoutEffect(() => {
    if (!docked || !dockedWidth) return;
    const el = ref.current;
    el?.style.setProperty(name(s.dockWidthVar), `${dockedWidth}px`);
    // The note's area starts after it, and corner controls keep clear of it (D-187, D-161).
    if (side === "start") {
      dockLeft.set(dockedWidth);
      if (el) pinnedSheet.set(Math.round(fixedBox(el).left + dockedWidth));
    }
  }, [docked, dockedWidth, side]);
  useEffect(() => {
    if (!docked || side !== "start") return;
    return () => {
      dockLeft.set(0);
      pinnedSheet.set(undefined);
    };
  }, [docked, side]);
  const handle = useResizeHandle({
    width: dockedWidth,
    min: lengths.min,
    max: () => dockMaxWidth({ window: ref.current ? fixedBox(ref.current).width : innerWidth, other: side === "start" ? pinnedRight.get() : dockLeft.get(), contentMin: lengths.content, min: lengths.min, max: lengths.max }),
    edge: side === "start" ? "end" : "start",
    onResize: (w) => setLive(w),
    onCommit: (w) => {
      setLive(null);
      onResize?.({ width: w });
    },
    onReset: () => {
      setLive(null);
      onResize?.({ width: lengths.def });
    },
  });
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
      if (docked) {
        // Docked: placed by its styles, the full height below the title band.
        delete el.dataset.short;
        return;
      }
      const p = placed(el, side);
      el.style.setProperty(name(s.insetVar), `${p.inset}px`);
      el.style.setProperty(name(s.limitVar), `${p.width}px`);
      // Where a pinned sheet ends: corner controls keep clear of it (D-161).
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
      if (pinned && !docked && side === "start") pinnedSheet.set(undefined);
    };
  }, [side, width, pinned, docked]);
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
        className={`${s.sheet} ${s.side[side]} ${s.width[width]} ${s.dockLengths}`}
        data-surface="sheet"
        data-side={side}
        data-pinned={pinned ? "" : undefined}
        data-docked={docked ? "" : undefined}
        data-key-scope={keyScope === "none" ? undefined : keyScope}
        onKeyDown={keyDown}
      >
        {/* The header and the body: the body scrolls, or in a short sheet both do (Sheet.css.ts). */}
        <div className={s.main} ref={mainRef}>
          {header ? <div className={s.header} data-sheet-header="">{header}</div> : null}
          <div className={s.body} ref={bodyRef} data-sheet-body="">{children}</div>
        </div>
        {footer ? <div className={s.footer}>{footer}</div> : null}
        {docked && onResize && lengths.max ? <div className={s.handle} aria-label={resizeLabel ?? label} data-dock-handle="" {...handle} /> : null}
      </aside>
    </FloatingContext.Provider>
  );
}
