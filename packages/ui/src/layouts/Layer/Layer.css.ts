import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

export const base = style({ position: "fixed", display: "flex", pointerEvents: "none" });
// Never wider than its layer: what it holds shrinks or wraps inside the window (D-111).
export const content = style({ pointerEvents: "auto", display: "flex", minWidth: 0, maxWidth: "100%" });
// The desktop title bar band (DSK-02): the window's top layout.titleBar (44 px), under the layer's content.
export const band = style({ position: "absolute", top: 0, left: 0, right: 0, height: tokens.layout.titleBar });
export const layer = styleVariants({
  contextual: { zIndex: tokens.layer.contextual },
  trigger: { zIndex: tokens.layer.trigger },
  panel: { zIndex: tokens.layer.panel },
  dialog: { zIndex: tokens.layer.dialog },
  toast: { zIndex: tokens.layer.toast },
  tooltip: { zIndex: tokens.layer.tooltip },
});
export const position = styleVariants({
  // The trigger's band: the trigger sits layout.triggerTop below the top edge (D-78), and what opens from it grows down.
  topBand: { top: 0, left: 0, right: 0, height: tokens.layout.topBand, alignItems: "flex-start", justifyContent: "center", paddingTop: tokens.layout.triggerTop, boxSizing: "border-box" },
  // The top right of the title bar band: the app-drawn window controls on Windows and Linux (D-15).
  topEnd: { top: 0, right: 0, height: tokens.layout.titleBar, alignItems: "center", justifyContent: "flex-end" },
  belowTopBand: { top: tokens.layout.topBand, left: tokens.space.s, right: tokens.space.s, alignItems: "flex-start", justifyContent: "center" },
  fill: { inset: 0, alignItems: "stretch", justifyContent: "stretch" },
  center: { inset: 0, alignItems: "center", justifyContent: "center" },
  bottomCenter: { left: 0, right: 0, bottom: tokens.space.xl, alignItems: "flex-end", justifyContent: "center" },
  bottomStart: { left: tokens.space.l, bottom: tokens.space.l, alignItems: "flex-end", justifyContent: "flex-start" },
});
