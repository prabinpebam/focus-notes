import { useRef, type KeyboardEvent, type PointerEvent } from "react";

/** One arrow press moves a docked panel's edge this far; with Shift, four times as far (D-187). */
const STEP = 16;

export interface ResizeHandleOptions {
  /** The panel's width now. */
  width: number;
  min: number;
  /** The widest it may get now (its maximum, less what keeps the note's narrowest area). */
  max: () => number;
  /** Which side of the panel the handle is on: dragging toward the panel narrows it. */
  edge: "end" | "start";
  /** Live, every move: the width to show. */
  onResize: (width: number) => void;
  /** Once, when a drag or a key press ends: the width to keep. */
  onCommit: (width: number) => void;
  /** A double-click: back to the default width. */
  onReset: () => void;
}

/**
 * A docked panel's resize handle (D-187): a vertical separator on its inner edge, dragged with the
 * pointer, or focused and moved with ←, → (Shift for bigger steps), Home and End; a double-click puts
 * the default back. Widths are clamped to [min, max()].
 */
export function useResizeHandle(o: ResizeHandleOptions) {
  const opts = useRef(o);
  opts.current = o;
  const drag = useRef<{ id: number; x: number; from: number; last: number } | null>(null);
  const clamp = (w: number) => Math.round(Math.max(opts.current.min, Math.min(opts.current.max(), w)));
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, from: opts.current.width, last: opts.current.width };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const w = clamp(d.from + (opts.current.edge === "end" ? dx : -dx));
    if (w === d.last) return;
    d.last = w;
    opts.current.onResize(w);
  };
  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.last !== d.from) opts.current.onCommit(d.last);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const { width, edge, min } = opts.current;
    const step = e.shiftKey ? 4 * STEP : STEP;
    const grow = edge === "end" ? "ArrowRight" : "ArrowLeft";
    const shrink = edge === "end" ? "ArrowLeft" : "ArrowRight";
    const next = e.key === grow ? width + step : e.key === shrink ? width - step : e.key === "Home" ? min : e.key === "End" ? opts.current.max() : NaN;
    if (Number.isNaN(next)) return;
    e.preventDefault();
    e.stopPropagation();
    const w = clamp(next);
    if (w === width) return;
    opts.current.onResize(w);
    opts.current.onCommit(w);
  };
  return {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-valuenow": Math.round(o.width),
    "aria-valuemin": Math.round(o.min),
    "aria-valuemax": Math.round(o.max()),
    tabIndex: 0,
    "data-no-drag": "",
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown,
    onDoubleClick: () => opts.current.onReset(),
  };
}
