import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import { anchors, fit, place, companion, CompanionContext, COMPANION_ATTR, COMPANION_LEAVE_EVENT, inCompanion, type AnchorName } from "../../behaviors/anchors.ts";
import type { Space } from "../Stack/Stack.tsx";
import { fixedBox } from "../../behaviors/frame.ts";
import * as s from "./Positioner.css.ts";
import { placeSelection } from "../../behaviors/selection-placement.ts";
import { Button } from "../../primitives/Button/Button.tsx";
import { promptRoom } from "../../primitives/TextField/TextField.css.ts";

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
  /** Names the single edge-pinned return action in each direction. */
  returnAboveLabel?: string;
  returnBelowLabel?: string;
  /** Escape inside this non-modal task dismisses it; document clicks are handled by the editor. */
  onDismiss?: () => void;
  children?: ReactNode;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/**
 * Anchors floating content to a range in the note (Components → Positioner): centered on it, never
 * covering it, kept on screen, following it as it scrolls, and hidden while it's out of view.
 */
export function Positioner({ anchor = "selection", placement = "above", align = "center", offset = "s", landmark = "none", label, id, children, onDismiss, returnAboveLabel, returnBelowLabel }: PositionerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState<"top" | "bottom" | undefined>();
  const retainedFocus = useRef<HTMLElement | null>(null);
  const returning = useRef(false);
  const returnPosition = useRef({ fragment: 0, side: "below" as "above" | "below", edge: 0, gap: 0, viewportTop: 0, viewportBottom: 0 });
  useLayoutEffect(() => {
    if (edge) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && contentRef.current?.contains(active)) {
        retainedFocus.current = active;
        edgeRef.current?.querySelector("button")?.focus({ preventScroll: true });
      }
    } else if (returning.current || edgeRef.current?.contains(document.activeElement)) {
      (retainedFocus.current ?? contentRef.current?.querySelector("textarea"))?.focus({ preventScroll: true });
      returning.current = false;
    }
  }, [edge]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0, scheduledAt: number | undefined;
    let rewriteSize = { width: 0, height: 0 };
    let rewritePlacement: { x: number; side: string; fragment: number } | undefined;
    let rewriteFrame = fixedBox(el);
    let rewriteMetrics = { gap: 0, edge: 0, topBand: 0 };
    let buttonHeight = 0;
    const readSize = () => {
      if (anchor !== "rewrite" || !contentRef.current) return;
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(cs.getPropertyValue(name(v))) || 0;
      rewriteMetrics = { gap: px(s.gapVar), edge: px(s.edgeVar), topBand: px(s.bandVar) };
      rewriteFrame = fixedBox(el);
      buttonHeight = edgeRef.current?.getBoundingClientRect().height ?? 0;
      const viewport = anchors.get(anchor)?.viewport;
      if (viewport) {
        const top = Math.max(viewport.top, rewriteFrame.top + rewriteMetrics.topBand);
        const bottom = Math.min(viewport.bottom, rewriteFrame.top + rewriteFrame.height);
        const room = Math.max(0, bottom - top - 2 * (rewriteMetrics.edge + rewriteMetrics.gap));
        el.style.setProperty(name(s.maxHeightVar), `${room}px`);
        el.style.setProperty(name(s.maxWidthVar), `${Math.max(0, viewport.right - viewport.left - 2 * rewriteMetrics.edge)}px`);
      }
      // Edge content is clipped to zero height; measure it uncollapsed within this layout turn.
      const pinned = el.dataset.edge;
      delete el.dataset.edge;
      const box = contentRef.current.getBoundingClientRect();
      rewriteSize = { width: box.width, height: box.height };
      const area = contentRef.current.querySelector("textarea");
      if (area && viewport) {
        const chrome = contentRef.current.scrollHeight - area.getBoundingClientRect().height;
        const room = box.height - chrome;
        el.style.setProperty(name(promptRoom), `${Math.max(0, room)}px`);
        const sized = contentRef.current.getBoundingClientRect();
        rewriteSize = { width: sized.width, height: sized.height };
      }
      if (pinned) el.dataset.edge = pinned;
    };
    const measure = () => {
      const started = scheduledAt ?? performance.now();
      scheduledAt = undefined;
      frame = 0;
      const a = anchors.get(anchor);
      if (!a) {
        el.dataset.placed = "static";
        return;
      }
      if (anchor === "rewrite" && a.fragments && a.viewport) {
        const o = rewriteFrame;
        const metrics = rewriteMetrics;
        const relative = (r: { left: number; right: number; top: number; bottom: number }) => ({
          left: r.left - o.left, right: r.right - o.left, top: r.top - o.top, bottom: r.bottom - o.top,
        });
        const viewport = relative(a.viewport);
        viewport.top = Math.max(viewport.top, metrics.topBand);
        viewport.bottom = Math.min(viewport.bottom, o.height);
        const fragments = a.fragments.map(relative);
        const p = placeSelection(fragments, viewport, rewriteSize, metrics);
        if (!rewritePlacement) {
          const visible = fragments.findLastIndex((r) => r.bottom > viewport.top && r.top < viewport.bottom);
          rewritePlacement = { x: p.x, side: p.side, fragment: Math.max(0, visible) };
        }
        const target = fragments[rewritePlacement.fragment] ?? fragments.at(-1);
        if (!target) return;
        returnPosition.current = {
          fragment: rewritePlacement.fragment, side: rewritePlacement.side === "above" ? "above" : "below",
          edge: metrics.edge, gap: metrics.gap,
          viewportTop: viewport.top + o.top, viewportBottom: viewport.bottom + o.top,
        };
        const y = rewritePlacement.side === "above" ? target.top - metrics.gap - rewriteSize.height : target.bottom + metrics.gap;
        const pinned = y < viewport.top + metrics.edge ? "top"
          : y + rewriteSize.height > viewport.bottom - metrics.edge ? "bottom" : undefined;
        const top = pinned === "top" ? viewport.top + metrics.edge
          : pinned === "bottom" ? viewport.bottom - metrics.edge - buttonHeight : y;
        const x = Math.max(viewport.left + metrics.edge, Math.min(rewritePlacement.x, viewport.right - metrics.edge - p.width));
        el.style.setProperty(name(s.xVar), `${x}px`);
        el.style.setProperty(name(s.yVar), `${top}px`);
        el.style.setProperty(name(s.maxWidthVar), `${p.width}px`);
        el.dataset.placed = rewritePlacement.side;
        if (pinned) el.dataset.edge = pinned;
        else delete el.dataset.edge;
        setEdge((old) => old === pinned ? old : pinned);
        performance.measure("fn:rewrite.anchor", { start: started, duration: performance.now() - started });
        return;
      }
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(cs.getPropertyValue(name(v))) || 0;
      // Its natural size, before any limit from an earlier place.
      el.style.removeProperty(name(s.maxHeightVar));
      el.style.removeProperty(name(s.maxWidthVar));
      const box = el.getBoundingClientRect();
      const touch = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
      // Inside the drawn window (D-14), the anchor's viewport coordinates move into the window's.
      const o = fixedBox(el);
      const at = { top: a.top - o.top, bottom: a.bottom - o.top, left: a.left - o.left, right: a.right - o.left };
      const view = { width: o.width, height: o.height };
      const metrics = { gap: px(s.gapVar), edge: px(s.edgeVar), topBand: px(s.bandVar) };
      const p = place(at, box, view, metrics, touch ? "below" : placement, align);
      // Too tall for the window there: the side with more room, held to it (D-111).
      const f = fit(at, p, box.height, view, metrics);
      el.style.setProperty(name(s.xVar), `${Math.round(p.x)}px`);
      el.style.setProperty(name(s.yVar), `${Math.round(f.y)}px`);
      if (f.maxHeight !== undefined) el.style.setProperty(name(s.maxHeightVar), `${Math.floor(f.maxHeight)}px`);
      el.dataset.placed = f.side;
      if (p.offscreen) el.dataset.offscreen = "";
      else delete el.dataset.offscreen;
    };
    const schedule = () => {
      if (!frame) {
        scheduledAt = performance.now();
        frame = requestAnimationFrame(measure);
      }
    };
    // Opening on a moving note: the auto-scroll ends first, so it opens where the anchor stays (DEF-21).
    const closed = anchors.opening();
    readSize();
    measure();
    const off = anchors.subscribe(schedule);
    // The note scrolled in a frame's callback (D-156's reading zone): placed again in that frame (DEF-25).
    const offMoved = anchors.onMoved(() => {
      cancelAnimationFrame(frame);
      measure();
    });
    const resize = new ResizeObserver(() => { readSize(); schedule(); });
    resize.observe(anchor === "rewrite" && contentRef.current ? contentRef.current : el);
    const onResize = () => { readSize(); schedule(); };
    addEventListener("resize", onResize);
    // Any scroller moving (the note's, frame by frame while it animates): placed again in that frame,
    // against the anchor read live, like floating-ui's autoUpdate (DEF-21). Not its own list scrolling.
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && el.contains(e.target))) schedule();
    };
    addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      closed();
      cancelAnimationFrame(frame);
      off();
      offMoved();
      resize.disconnect();
      removeEventListener("resize", onResize);
      removeEventListener("scroll", onScroll, { capture: true });
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
        data-selection-popover={anchor === "rewrite" ? "" : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onDismiss && !e.defaultPrevented) {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }
        }}
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
        {anchor === "rewrite" ? <>
          <div ref={contentRef} className={s.promptContent} inert={Boolean(edge)} aria-hidden={edge ? true : undefined}>{children}</div>
          <div ref={edgeRef} className={s.returnAction} inert={!edge} aria-hidden={!edge}>
            <Button label={(edge === "top" ? returnAboveLabel : returnBelowLabel) ?? label ?? ""}
              icon={edge === "top" ? "arrowUp" : "arrowDown"}
              onPress={() => {
                returning.current = true;
                anchors.get("rewrite")?.reveal?.(returnPosition.current);
                anchors.moved();
              }} />
          </div>
        </> : children}
      </div>
      </CompanionContext.Provider>
    </FloatingContext.Provider>
  );
}
