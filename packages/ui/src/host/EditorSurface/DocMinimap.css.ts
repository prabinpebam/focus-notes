import { createVar, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { fadingEdges, minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const e = tokens.cmp.editorSurface;
const t = e.minimap;

/** Set from the measured note (D-185): where the rail and card sit, and the bars' pitch. */
export const railTopVar = createVar();
export const railHeightVar = createVar();
export const pitchVar = createVar();
export const cardTopVar = createVar();
export const cardMaxVar = createVar();
/** The pinned card's width: the room beside the text, up to its maximum (D-186). */
export const cardWidthVar = createVar();

/** Covers the note's frame so the rail and card place against it; only they take the pointer. */
export const nav = style({ position: "absolute", inset: 0, pointerEvents: "none" });

/** Resolves a length token (a scaled calc) to pixels; never seen. */
export const probe = style({ position: "absolute", left: 0, top: 0, height: 0, visibility: "hidden", pointerEvents: "none" });

const right = `calc(${e.scrollbarSize} + ${t.railInset})`;

export const rail = style({
  position: "absolute",
  right,
  top: railTopVar,
  zIndex: t.layer,
  width: t.railWidth,
  height: railHeightVar,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  margin: 0,
  padding: 0,
  paddingInlineEnd: t.barInset,
  borderStyle: "none",
  borderRadius: t.itemRadius,
  backgroundColor: t.transparent,
  pointerEvents: "auto",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});

export const bar = style({
  flexShrink: 0,
  height: pitchVar,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  selectors: {
    "&::before": { content: '""', display: "block", height: t.barThickness, width: "100%", borderRadius: t.radius, backgroundColor: t.barRest, forcedColorAdjust: "none" },
    // Not by colour alone (1.4.11, 1.4.1): the current bar is also longer than any level's.
    "&[data-current]": { width: t.barCurrentLength },
    "&[data-current]::before": { backgroundColor: t.barCurrent },
  },
});
export const barDepth = styleVariants({
  0: { width: t.bar0 },
  1: { width: t.bar1 },
  2: { width: t.bar2 },
  3: { width: t.bar3 },
});

const enter = keyframes({ from: { opacity: 0, transform: "scale(0.98)" } });

export const card = style({
  position: "absolute",
  right,
  top: cardTopVar,
  zIndex: t.layer,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  minWidth: t.cardMinWidth,
  maxWidth: t.cardMaxWidth,
  maxHeight: cardMaxVar,
  backgroundColor: `color-mix(in srgb, ${t.cardBackground} calc(${t.cardOpacity} * 100%), transparent)`,
  backdropFilter: `blur(${t.cardBlur})`,
  borderStyle: "solid",
  borderWidth: t.cardBorderWidth,
  borderColor: t.cardBorder,
  borderRadius: t.cardRadius,
  boxShadow: t.cardShadow,
  pointerEvents: "auto",
  transformOrigin: "center right",
  animationName: enter,
  animationDuration: t.duration,
  animationTimingFunction: t.easing,
  selectors: {
    ':root[data-transparency="reduced"] &, :root[data-compositing="software"] &': { backdropFilter: "none", backgroundColor: t.cardBackground },
    // Pinned: as wide as the room allows, and there from the first frame, without the opening fade.
    "&[data-pinned]": { width: cardWidthVar, animationName: "none" },
  },
});

/** The pin's corner: above the list, aligned to the card's end. */
export const head = style({ display: "flex", justifyContent: "flex-end", padding: t.cardPadding, paddingBlockEnd: 0, flexShrink: 0 });

/** The list scrolls inside the card's padding, so its edges fade within the rounded card. */
export const list = style({
  listStyle: "none",
  margin: 0,
  padding: t.cardPadding,
  display: "flex",
  flexDirection: "column",
  gap: t.itemGap,
  overflowY: "auto",
  overscrollBehavior: "contain",
  minHeight: 0,
});
minimalScrollbar(list, { scrollbarSize: e.scrollbarSize, scrollbarInset: e.scrollbarInset, scrollbarThumb: e.scrollbarThumb, scrollbarThumbHover: e.scrollbarThumbHover, scrollbarTrack: e.scrollbarTrack });
fadingEdges(list, { scrollFade: t.cardFade });

export const entry = style({ display: "flex", flexDirection: "column", gap: t.itemGap });
/** A heading's subsections: indented by their buttons, so nesting adds no space of its own. */
export const sublist = style({ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: t.itemGap });

export const item = style({
  flexGrow: 1,
  minWidth: 0,
  margin: 0,
  paddingBlock: t.itemPaddingBlock,
  paddingInline: t.itemPaddingInline,
  borderStyle: "none",
  borderRadius: t.itemRadius,
  backgroundColor: t.transparent,
  color: t.itemText,
  fontFamily: t.itemFont,
  fontSize: t.itemSize,
  lineHeight: t.itemLineHeight,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&:hover, &:focus-visible": { backgroundColor: t.itemHover },
    "&:active": { backgroundColor: t.itemPressed },
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
    // Not by colour alone (1.4.1): the current heading is also heavier.
    '&[aria-current="location"]': { color: t.itemCurrent, fontWeight: t.itemCurrentWeight },
    "&[data-untitled]": { color: t.itemUntitled },
  },
});
export const indent = styleVariants({
  0: {},
  1: { marginInlineStart: t.indent },
  2: { marginInlineStart: `calc(2 * ${t.indent})` },
  3: { marginInlineStart: `calc(3 * ${t.indent})` },
  4: { marginInlineStart: `calc(4 * ${t.indent})` },
  5: { marginInlineStart: `calc(5 * ${t.indent})` },
});

/** At most two lines, then an ellipsis; the full text stays the accessible name. */
export const label = style({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  overflowWrap: "anywhere",
});
