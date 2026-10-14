import { useLayoutEffect, useRef, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import { anchors, place, companion, CompanionContext, COMPANION_ATTR, COMPANION_LEAVE_EVENT, inCompanion, type AnchorName } from "../../behaviors/anchors.ts";
import type { Space } from "../Stack/Stack.tsx";
import { fixedBox } from "../../behaviors/frame.ts";
import * as s from "./Positioner.css.ts";

export interface PositionerProps {
  /** What it points at: the selection (or the caret), or a link. */
  anchor?: AnchorName;
  /** The preferred side. Above flips below near the top band; on touch screens it's always below. */
  placement?: "above" | "below";
  /** Centered on the anchor, or lined up with its start (a menu under the caret). */
  align?: "center" | "start";
  /** The space between the anchor and the content. */
  offset?: Space;
  /** The landmark it forms, so its content is reachable by landmark navigation. */
  landmark?: "none" | "region";
  label?: string;
  id?: string;
  children?: ReactNode;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/**
 * Anchors floating content to a range in the note (Components → Positioner): centered on it, never
 * covering it, kept on screen, following it as it scrolls, and hidden while it's out of view.
 */
export function Positioner({ anchor = "selection", placement = "above", align = "center", offset = "s", landmark = "none", label, id, children }: PositionerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const a = anchors.get(anchor);
      if (!a) {
        el.dataset.placed = "static";
        return;
      }
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(cs.getPropertyValue(name(v))) || 0;
      const box = el.getBoundingClientRect();
      const touch = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
      // Inside the drawn window (D-14), the anchor's viewport coordinates move into the window's.
      const o = fixedBox(el);
      const at = { top: a.top - o.top, bottom: a.bottom - o.top, left: a.left - o.left, right: a.right - o.left };
      const p = place(at, box, { width: o.width, height: o.height }, { gap: px(s.gapVar), edge: px(s.edgeVar), topBand: px(s.bandVar) }, touch ? "below" : placement, align);
      el.style.setProperty(name(s.xVar), `${Math.round(p.x)}px`);
      el.style.setProperty(name(s.yVar), `${Math.round(p.y)}px`);
      el.dataset.placed = p.side;
      if (p.offscreen) el.dataset.offscreen = "";
      else delete el.dataset.offscreen;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const off = anchors.subscribe(schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      off();
      resize.disconnect();
      removeEventListener("resize", schedule);
      // Gone from under the pointer: pointerleave never comes, so say it left (a hover card that
      // was kept for the pointer on it lets go).
      if (companion.hovered) {
        companion.hovered = false;
        window.dispatchEvent(new Event(COMPANION_LEAVE_EVENT));
      }
    };
  }, [anchor, placement, align]);

  const leave = () => window.dispatchEvent(new Event(COMPANION_LEAVE_EVENT));
  return (
    <FloatingContext.Provider value={true}>
      <CompanionContext.Provider value={true}>
      <div
        id={id}
        ref={ref}
        className={`${s.base} ${s.offset[offset]}`}
        role={landmark === "region" ? "region" : undefined}
        aria-label={landmark === "region" ? label : undefined}
        {...{ [COMPANION_ATTR]: "" }}
        onPointerEnter={() => { companion.hovered = true; }}
        onPointerLeave={() => {
          companion.hovered = false;
          leave();
        }}
        onBlur={(e) => {
          // Focus left for somewhere that isn't another companion or the note.
          const next = e.relatedTarget as Element | null;
          if (!inCompanion(next) && !next?.closest?.("[data-editor]")) leave();
        }}
      >
        {children}
      </div>
      </CompanionContext.Provider>
    </FloatingContext.Provider>
  );
}
