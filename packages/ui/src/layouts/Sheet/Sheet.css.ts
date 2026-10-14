import { createVar, fallbackVar, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { fadingEdges, minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.sheet;
// Only the start is given: the sheet ends as it's styled.
const slideStart = keyframes({ from: { opacity: 0, transform: `translateX(calc(-1 * ${t.offset}))` } });
const slideEnd = keyframes({ from: { opacity: 0, transform: `translateX(${t.offset})` } });

/** Registered lengths the placement code reads: the inset, the space kept around the trigger, and the width asked for. */
export const baseVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const clearanceVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const widthVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const minWidthVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
/** The width it has: what it asked for, or less to keep the trigger clear (Sheet.tsx). */
export const limitVar = createVar();
/** The inset it has: the token's, or more to keep the trigger and the window's controls clear (Sheet.tsx). */
export const insetVar = createVar();

// Floats with the same inset from the window's top, side, and bottom, so it's vertically centered and
// the window's corners stay clean (DD-FILES-01, D-111). It never covers the trigger or the window's
// controls: it's narrower to end before them, or, where that's too narrow, inset more on all three sides.
export const sheet = style({
  vars: { [baseVar]: t.inset, [clearanceVar]: t.clearance, [insetVar]: t.inset },
  position: "fixed",
  top: insetVar,
  bottom: insetVar,
  zIndex: t.layer,
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  padding: t.padding,
  boxSizing: "border-box",
  width: fallbackVar(limitVar, widthVar),
  maxWidth: `calc(100% - 2 * ${insetVar})`,
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
  start: { left: insetVar, animationName: slideStart },
  end: { right: insetVar, animationName: slideEnd },
});
export const width = styleVariants({
  files: { vars: { [widthVar]: t.widthFiles, [minWidthVar]: t.minWidth } },
  theme: { vars: { [widthVar]: t.widthTheme, [minWidthVar]: t.minWidthWide } },
  find: { vars: { [widthVar]: t.widthFind, [minWidthVar]: t.minWidthWide } },
});
export const header = style({ display: "flex", flexDirection: "column", gap: t.gap, flexShrink: 0 });
// The scrolling part. Its scrollbar's space is reserved in the sheet's padding at the end, so content
// keeps the same inset on both sides whether or not it scrolls (UI-09, D-111).
export const body = style({
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  marginInlineEnd: `calc(-1 * ${t.scrollbarSize})`,
  // Room inside its clip for the focus ring and letters of what's at its very top or bottom (a
  // heading trimmed to its capitals), without moving anything (D-111).
  paddingBlock: t.bodySlack,
  marginBlock: `calc(-1 * ${t.bodySlack})`,
  outline: "none",
});
minimalScrollbar(body, t);
fadingEdges(body, t);
export const footer = style({
  display: "flex",
  flexShrink: 0,
  paddingBlockStart: t.gap,
  borderBlockStartStyle: "solid",
  borderBlockStartWidth: t.footerBorderWidth,
  borderBlockStartColor: t.footerBorder,
  // Nothing to show (no Recently deleted without Git): no rule either.
  selectors: { "&:empty": { display: "none" } },
});
