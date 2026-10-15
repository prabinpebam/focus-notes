import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

const t = tokens.cmp.appMark;

export const base = style({ flexShrink: 0, display: "block" });
export const size = styleVariants({
  m: { width: t.size.m, height: t.size.m },
  // The hero steps down to medium in a short window, so the setup step fits (D-131).
  l: { width: t.size.l, height: t.size.l, "@media": { [`(max-height: ${breakpoints.short - 1}px)`]: { width: t.size.m, height: t.size.m } } },
});
// The geometry is the app icon's (apps/desktop/scripts/icon.mjs); its colors are the brand tokens.
export const tile = style({ fill: t.tile, stroke: t.tileBorder });
export const shadow = style({ fill: t.shadow, fillOpacity: t.shadowOpacity });
export const ring = style({ fill: t.ring, fillOpacity: t.ringOpacity, stroke: t.ringBorder });
export const dot = style({ fill: t.dot });
