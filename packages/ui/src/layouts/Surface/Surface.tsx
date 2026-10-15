import { useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { FloatingContext, LayerContext } from "../Layer/floating.ts";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import type { Space } from "../Stack/Stack.tsx";
import type { KeyScope } from "../../data.ts";
import * as s from "./Surface.css.ts";

export interface SurfaceProps {
  variant?: keyof typeof s.variant;
  shape?: keyof typeof s.shape;
  elevation?: keyof typeof s.elevation;
  padding?: Space;
  /** The padding in a short window (below breakpoint.short): the full-window setup tightens up (D-131). */
  shortPadding?: Space;
  /** What it holds scrolls inside its padding when it's held shorter than its content (the first run's card in a short window, D-123). */
  scroll?: boolean;
  /** Keys registered for this scope work while focus is inside. */
  keyScope?: KeyScope;
  id?: string;
  children?: ReactNode;
}

/** The only way to get a background, border, radius, or shadow (DD-CMP-02). */
export function Surface({ variant = "raised", shape = "none", elevation = "0", padding = "none", shortPadding, scroll = false, keyScope = "none", id, children }: SurfaceProps) {
  const floating = useContext(FloatingContext);
  // A shaped surface directly on the dialog layer is a dialog: it keeps the dialog inset (D-111).
  const dialog = useContext(LayerContext) === "dialog";
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef, scroll);
  // What takes focus is scrolled into view, even when it was focused without scrolling (a step's
  // primary action taking focus as it appears, React Aria's autoFocus).
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!scroll || !body) return;
    const reveal = (e: FocusEvent) => (e.target as HTMLElement | null)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    body.addEventListener("focusin", reveal);
    // And kept in view as the room changes (the window resized or zoomed).
    const keep = () => {
      const active = body.ownerDocument.activeElement;
      if (active instanceof HTMLElement && body.contains(active)) active.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    keep();
    const resized = new ResizeObserver(keep);
    resized.observe(body);
    return () => {
      body.removeEventListener("focusin", reveal);
      resized.disconnect();
    };
  }, [scroll]);
  // Frost is only for things that float over text (Foundations → Surfaces); elsewhere it is solid.
  const v = variant === "frost" && !floating ? "raised" : variant;
  const kind = (v === "frost" || v === "raised") && shape !== "none" ? (dialog ? "dialog" : "panel") : undefined;
  return (
    <div id={id} className={[s.base, s.variant[v], s.shape[shape], s.elevation[elevation], scroll ? s.clip : s.padding[padding], ...(shortPadding && !scroll ? [s.shortPadding[shortPadding]] : [])].join(" ")} data-variant={v} data-surface={kind} data-key-scope={keyScope === "none" ? undefined : keyScope}>
      <LayerContext.Provider value="">
        {/* Its padding is inside the scroller, so focus rings and letters at the edges are never cut. */}
        {scroll ? <div ref={bodyRef} className={`${s.body} ${s.bodyPadding[padding]}${shortPadding ? ` ${s.bodyShortPadding[shortPadding]}` : ""}`}>{children}</div> : children}
      </LayerContext.Provider>
    </div>
  );
}