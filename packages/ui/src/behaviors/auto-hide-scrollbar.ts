import { useEffect, type RefObject } from "react";

/** How long the scrollbar stays visible after the last scroll. */
export const SCROLL_IDLE_MS = 900;
/** Extra reach beyond the scrollbar itself where the pointer reveals it. */
const EDGE_SLACK_PX = 6;

/**
 * The minimal scrollbar (D-73, UI-09): hidden at rest, shown while scrolling and while the pointer
 * is over the scrollbar's edge. Space for it is always reserved (scrollbar-gutter: stable), so
 * nothing moves when it appears. Pass `active` for scrollers that mount later, such as a dialog body.
 */
export function useAutoHideScrollbar(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      el.dataset.scrolling = "";
      clearTimeout(timer);
      timer = setTimeout(() => delete el.dataset.scrolling, SCROLL_IDLE_MS);
    };
    const onMove = (e: PointerEvent) => {
      const bar = el.offsetWidth - el.clientWidth;
      const rect = el.getBoundingClientRect();
      const inside = bar > 0 && e.clientX >= rect.right - bar - EDGE_SLACK_PX && e.clientX <= rect.right;
      if (inside) el.dataset.scrollbarHover = "";
      else delete el.dataset.scrollbarHover;
    };
    const onLeave = () => delete el.dataset.scrollbarHover;
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [ref, active]);
}
