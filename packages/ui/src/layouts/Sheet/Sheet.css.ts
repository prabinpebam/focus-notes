import { createVar, fallbackVar, globalStyle, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.sheet;
// Only the start is given: the sheet ends as it's styled.
const slideStart = keyframes({ from: { opacity: 0, transform: `translateX(calc(-1 * ${t.offset}))` } });
const slideEnd = keyframes({ from: { opacity: 0, transform: `translateX(${t.offset})` } });

/** Registered lengths the placement code reads: the inset, the space kept around the trigger, and the width asked for. */
export const baseVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const clearanceVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const widthVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const minWidthVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const shortVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
/** The width it has: what it asked for, or less to keep the trigger clear (Sheet.tsx). */
export const limitVar = createVar();
/** The inset it has: the token's, or more to keep the trigger and the window's controls clear (Sheet.tsx). */
export const insetVar = createVar();
/** A docked sheet's width (Sheet.tsx); below, the lengths its resizing reads: its default, minimum, maximum, and the note's narrowest area (D-187). */
export const dockWidthVar = createVar();

// Floats with the same inset from the window's top, side, and bottom, so it's vertically centered and
// the window's corners stay clean (DD-FILES-01, D-111). It never covers the trigger or the window's
// controls: it's narrower to end before them, or, where that's too narrow, inset more on all three sides.
export const sheet = style({
  vars: { [baseVar]: t.inset, [clearanceVar]: t.clearance, [insetVar]: t.inset, [shortVar]: t.short },
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
  selectors: {
    // Docked (D-187): flush to the window's edge from its top to its bottom, a hairline on the inner
    // side; opaque and without a shadow, so the note's area beside it reads as the page. Its content
    // starts below the title band, which stays the window's drag region.
    "&[data-docked]": {
      top: 0, bottom: 0, width: dockWidthVar, maxWidth: "none", paddingTop: `calc(${t.dock.top} + ${t.padding})`,
      borderRadius: 0, borderWidth: 0, boxShadow: "none", backdropFilter: "none",
      backgroundColor: t.dock.background, animationName: "none",
    },
    "&[data-docked][data-side=start]": { left: 0, borderInlineEndStyle: "solid", borderInlineEndWidth: t.dock.borderWidth, borderInlineEndColor: t.dock.border },
    "&[data-docked][data-side=end]": { right: 0, borderInlineStartStyle: "solid", borderInlineStartWidth: t.dock.borderWidth, borderInlineStartColor: t.dock.border },
    // Led by where the notes come from (D-188): that band starts at the top edge itself.
    "&[data-docked]:has(> [data-sheet-band])": { paddingTop: 0 },
  },
});

export const dockDefaultVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const dockMinVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const dockMaxVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const dockContentMinVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const dockLengths = style({ vars: { [dockDefaultVar]: t.dock.width, [dockMinVar]: t.dock.min, [dockMaxVar]: t.dock.max, [dockContentMinVar]: t.dock.contentMin } });

/** The resize handle on a docked sheet's inner edge: a thin line on hover, focus, or while dragged. */
export const handle = style({
  position: "absolute",
  top: 0,
  bottom: 0,
  width: t.dock.handleWidth,
  cursor: "col-resize",
  touchAction: "none",
  outline: "none",
  selectors: {
    "[data-side=start] > &": { right: `calc(-1 * ${t.dock.handleWidth} / 2)` },
    "[data-side=end] > &": { left: `calc(-1 * ${t.dock.handleWidth} / 2)` },
    "&::after": { content: '""', position: "absolute", top: 0, bottom: 0, left: `calc(50% - ${t.dock.handleLine} / 2)`, width: t.dock.handleLine, backgroundColor: t.dock.handleIdle },
    "&:hover::after": { backgroundColor: t.dock.handleHover },
    "&:focus-visible::after, &:active::after": { backgroundColor: t.dock.handleActive },
  },
});export const side = styleVariants({
  start: { left: insetVar, animationName: slideStart },
  end: { right: insetVar, animationName: slideEnd },
});
export const width = styleVariants({
  files: { vars: { [widthVar]: t.widthFiles, [minWidthVar]: t.minWidth } },
  theme: { vars: { [widthVar]: t.widthTheme, [minWidthVar]: t.minWidthWide } },
  find: { vars: { [widthVar]: t.widthFind, [minWidthVar]: t.minWidthWide } },
});
// The header and the body. In a sheet shorter than `short` (marked `data-short` by Sheet.tsx) (the smallest window, where it floats
// below the trigger), a fixed header would leave the content no room: this scrolls instead, header
// and all, and the body stops scrolling on its own.
export const main = style({
  display: "flex",
  flexDirection: "column",
  // The header and the body are separate groups (D-111).
  gap: t.groupGap,
  flexGrow: 1,
  minHeight: 0,
  selectors: {
    // Up and down only: a close button bleeding into the padding (D-111) never makes it scroll sideways.
    "[data-short] > &": { overflowY: "auto", overflowX: "hidden", scrollbarGutter: "stable", paddingInlineStart: t.ringRoom, marginInlineStart: `calc(-1 * ${t.ringRoom})`, marginInlineEnd: `calc(-1 * ${t.scrollbarSize})`, paddingBlock: t.bodySlack, marginBlock: `calc(-1 * ${t.bodySlack})` },
  },
});
minimalScrollbar(main, t);
export const header = style({ display: "flex", flexDirection: "column", gap: t.gap, flexShrink: 0 });
// Where the notes come from (D-188): leads the sheet above a hairline that runs edge to edge. Docked,
// it starts at the window's top edge, so its upper part is in the title band, which stays the window's
// drag region (its buttons don't drag).
export const band = style({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  minWidth: 0,
  marginInline: `calc(-1 * ${t.padding})`,
  paddingInline: t.padding,
  paddingBlockEnd: t.gap,
  borderBlockEndStyle: "solid",
  borderBlockEndWidth: t.band.borderWidth,
  borderBlockEndColor: t.band.border,
  selectors: {
    // Docked, it leads from the window's top edge with the sheet's own padding around it, rather than fitted into the title band (the sheet drops its top padding for it).
    "[data-docked] > &": { paddingBlock: t.padding, minHeight: t.dock.top, boxSizing: "border-box" },
    ":root[data-platform=macos] [data-docked][data-side=start] > &": { paddingInlineStart: t.band.macStart },
  },
});
globalStyle(`${band} button`, { WebkitAppRegion: "no-drag" } as Record<string, string>);
// The scrolling part. Its scrollbar's space is reserved in the sheet's padding at the end, so content
// keeps the same inset on both sides whether or not it scrolls (UI-09, D-111).
export const body = style({
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  // Room inside its clip for the focus ring of a control at its edge (a button's ring is outside it),
  // and the letters of what's at its very top or bottom, without moving anything (D-111).
  paddingInlineStart: t.ringRoom,
  marginInlineStart: `calc(-1 * ${t.ringRoom})`,
  marginInlineEnd: `calc(-1 * ${t.scrollbarSize})`,
  paddingBlock: t.bodySlack,
  marginBlock: `calc(-1 * ${t.bodySlack})`,
  outline: "none",
  selectors: {
    "[data-short] > * > &": { flexGrow: 0, flexShrink: 0, minHeight: "auto", overflowY: "visible", scrollbarGutter: "auto", paddingInlineStart: 0, marginInlineStart: 0, marginInlineEnd: 0, paddingBlock: 0, marginBlock: 0 },
  },
});
minimalScrollbar(body, t);
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
