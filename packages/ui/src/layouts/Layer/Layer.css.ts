import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

export const base = style({ position: "fixed", display: "flex", pointerEvents: "none" });
export const content = style({ pointerEvents: "auto", display: "flex" });
export const layer = styleVariants({
  contextual: { zIndex: tokens.layer.contextual },
  trigger: { zIndex: tokens.layer.trigger },
  panel: { zIndex: tokens.layer.panel },
  dialog: { zIndex: tokens.layer.dialog },
  toast: { zIndex: tokens.layer.toast },
  tooltip: { zIndex: tokens.layer.tooltip },
});
export const position = styleVariants({
  topBand: { top: 0, left: 0, right: 0, height: tokens.layout.topBand, alignItems: "center", justifyContent: "center" },
  belowTopBand: { top: tokens.layout.topBand, left: tokens.space.s, right: tokens.space.s, alignItems: "flex-start", justifyContent: "center" },
  fill: { inset: 0, alignItems: "stretch", justifyContent: "stretch" },
  center: { inset: 0, alignItems: "center", justifyContent: "center" },
  bottomCenter: { left: 0, right: 0, bottom: tokens.space.xl, alignItems: "flex-end", justifyContent: "center" },
});
