import { useEffect, type RefObject } from "react";

/**
 * Fading scroll edges (Foundations → Visual quality, D-111): a scrolling area fades its content out
 * over `layout.scrollFade` at the top and the bottom, only on a side with more to scroll to. This
 * keeps `data-fade-top` and `data-fade-bottom` on the scroller current; `fadingEdges` (in
 * scrollbar-styles.ts) draws them. Pass `active` for scrollers that mount later, such as a dialog body.
 */
export function useFadingEdges(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let frame = 0;
    const set = (name: "fadeTop" | "fadeBottom", on: boolean) => {
      if (on === (name in el.dataset)) return;
      if (on) el.dataset[name] = "";
      else delete el.dataset[name];
    };
    const update = () => {
      frame = 0;
      set("fadeTop", el.scrollTop > 1);
      set("fadeBottom", el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    // The content growing or shrinking (typing, a list filtering) changes what's left to scroll to.
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    const watch = () => {
      for (const child of el.children) resize.observe(child);
      schedule();
    };
    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(el, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", schedule);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref, active]);
}
