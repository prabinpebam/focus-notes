import { createVar, fallbackVar, globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.windowFrame;

// In the app-built window the app moves the window itself (DD-DSK-02): the band takes the pointer
// instead of being the system's drag region.
globalStyle(":root[data-window-frame] [data-drag-band]", { pointerEvents: "auto", WebkitAppRegion: "no-drag" } as Record<string, string>);

// Where the system menu opens: the pointer, or just under the band's start (Alt+Space).
export const xVar = createVar();
export const yVar = createVar();
export const anchor = style({
  position: "fixed",
  left: fallbackVar(xVar, t.menuInset),
  top: fallbackVar(yVar, t.menuTop),
  width: 0,
  height: 0,
  pointerEvents: "none",
});

// The resize handles: a band `edge` wide just outside the visible window, in the shadow margin, with
// `corner` squares at its corners (window-geometry.ts hitZone describes the same shapes). With no
// margin (snapped) they lie just inside the edges.
export const handles = style({ position: "fixed", pointerEvents: "none", zIndex: t.layer });
export const place = styleVariants({
  native: { display: "none" },
  rounded: { inset: `calc(${t.margin} - ${t.edge})` },
  square: { inset: 0 },
});
export const handle = style({ position: "absolute", pointerEvents: "auto", touchAction: "none" });
export const edge = styleVariants({
  n: { top: 0, left: t.corner, right: t.corner, height: t.edge, cursor: "ns-resize" },
  s: { bottom: 0, left: t.corner, right: t.corner, height: t.edge, cursor: "ns-resize" },
  w: { left: 0, top: t.corner, bottom: t.corner, width: t.edge, cursor: "ew-resize" },
  e: { right: 0, top: t.corner, bottom: t.corner, width: t.edge, cursor: "ew-resize" },
  nw: { top: 0, left: 0, width: t.corner, height: t.corner, cursor: "nwse-resize" },
  se: { bottom: 0, right: 0, width: t.corner, height: t.corner, cursor: "nwse-resize" },
  ne: { top: 0, right: 0, width: t.corner, height: t.corner, cursor: "nesw-resize" },
  sw: { bottom: 0, left: 0, width: t.corner, height: t.corner, cursor: "nesw-resize" },
});
