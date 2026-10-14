import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.sheet;
// Only the start is given: the sheet ends as it's styled.
const slideStart = keyframes({ from: { opacity: 0, transform: `translateX(calc(-1 * ${t.offset}))` } });
const slideEnd = keyframes({ from: { opacity: 0, transform: `translateX(${t.offset})` } });

// Floats inset from the window's edges, below the top band, so the window's corners stay clean (DD-FILES-01).
export const sheet = style({
  position: "fixed",
  top: t.top,
  bottom: t.inset,
  zIndex: t.layer,
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  padding: t.padding,
  boxSizing: "border-box",
  maxWidth: `calc(100% - ${t.inset} - ${t.inset})`,
  color: t.text,
  backgroundColor: `color-mix(in srgb, ${t.background} calc(${t.opacity} * 100%), transparent)`,
  backdropFilter: `blur(${t.blur})`,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  borderRadius: t.radius,
  boxShadow: t.shadow,
  animationDuration: t.duration,
  animationTimingFunction: t.easing,
  animationFillMode: "both",
  outline: "none",
});
export const side = styleVariants({
  start: { left: t.inset, animationName: slideStart },
  end: { right: t.inset, animationName: slideEnd },
});
export const width = styleVariants({ files: { width: t.widthFiles }, theme: { width: t.widthTheme } });
export const header = style({ display: "flex", flexDirection: "column", gap: t.gap, flexShrink: 0 });
export const body = style({ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, overflowY: "auto" });
export const footer = style({
  display: "flex",
  flexShrink: 0,
  paddingBlockStart: t.gap,
  borderBlockStartStyle: "solid",
  borderBlockStartWidth: t.footerBorderWidth,
  borderBlockStartColor: t.footerBorder,
});
