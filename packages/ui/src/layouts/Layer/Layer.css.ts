import { createVar, fallbackVar, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

export const base = style({ position: "fixed", display: "flex", pointerEvents: "none" });
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
  // The whole window below the title bar band (the full-window setup, D-126): the band stays the
  // window's, so it still drags and shows the window controls; what it holds fills the rest.
  window: { top: tokens.layout.titleBar, left: 0, right: 0, bottom: 0, alignItems: "stretch" },
  // A dialog in the middle of the window (the first run's card): it keeps the dialog inset from every
  // edge and is held to the room inside it, where what it holds scrolls (D-111, D-123).
  center: { inset: 0, alignItems: "center", justifyContent: "center", padding: tokens.layout.gutterCompact, boxSizing: "border-box" },
  bottomCenter: { left: 0, right: 0, bottom: tokens.space.xl, alignItems: "flex-end", justifyContent: "center" },
  bottomStart: { left: tokens.space.l, bottom: tokens.space.l, alignItems: "flex-end", justifyContent: "flex-start" },
});
export const cornerLeft = createVar();
export const cornerGap = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const avoidPinned = style({
  vars: { [cornerGap]: tokens.space.l },
  left: fallbackVar(cornerLeft, tokens.space.l),
  selectors: { "&[data-pinned-overflow]": { top: tokens.space.l, bottom: "auto" } },
});
// Never wider than its layer: what it holds shrinks or wraps inside the window (D-111). In the
// middle, never taller either.
export const content = style({
  pointerEvents: "auto", display: "flex", minWidth: 0, maxWidth: "100%",
  selectors: { [`${position.center} > &`]: { maxHeight: "100%" }, [`${position.window} > &`]: { flexGrow: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)" } },
});
