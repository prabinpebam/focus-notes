import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.themeGallery;

export const grid = style({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${t.tileMinWidth}), 1fr))`,
  gap: t.gap,
  padding: t.focusWidth,
  fontFamily: t.font,
  fontSize: t.fontSize,
});

export const tile = style({
  display: "flex",
  flexDirection: "column",
  gap: t.padding,
  padding: t.padding,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: 0,
  borderColor: "transparent",
  color: t.text,
  cursor: "default",
  outline: "none",
  // In forced colors the samples stay samples, and only the tile showing gets a background (Highlight
  // there); the rest of the tile's colors are system colors through the tokens' own mode.
  forcedColorAdjust: "none",
  transitionProperty: "background-color, border-color",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&:hover": { backgroundColor: t.hover },
    // The theme showing: its tile's background, never a border or a side bar (D-111).
    '&[aria-selected="true"]': { backgroundColor: t.selected, color: t.selectedText },
    // Inset: drawn inside the item's rounded shape, so no scrolling or clipping container ever cuts it (D-111).
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
});

// The sample: its own theme's canvas, text, accent, and trigger dot (fixed samples, not the theme showing).
export const swatch = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: t.swatchHeight,
  paddingInline: t.swatchPadding,
  borderRadius: t.swatchRadius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.sampleBorder,
  backgroundColor: t.sampleCanvas,
  color: t.sampleText,
});
// "Aa" in the theme's text color and the content font: drawn, not text, so it's never part of a tile's name.
export const glyph = style({ fontFamily: t.glyphFont, fontSize: t.glyphSize, "::before": { content: '"Aa"' } });
export const marks = style({ display: "inline-flex", alignItems: "center", gap: t.padding });
const mark = { display: "inline-block", width: t.dotSize, height: t.dotSize } as const;
export const accent = style({ ...mark, borderRadius: t.swatchRadius, backgroundColor: t.sampleAccent });
export const dot = style({ ...mark, borderRadius: t.dotSize, backgroundColor: t.sampleDot });

export const name = style({ display: "flex", alignItems: "baseline", gap: t.padding, minWidth: 0 });
export const label = style({ fontWeight: t.weight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
export const slot = style({ color: t.muted, fontSize: t.captionSize, whiteSpace: "nowrap" });
// The contrast badge shows on hover or focus (and is always in the tile's name).
export const badge = style({
  marginInlineStart: "auto",
  color: t.muted,
  fontSize: t.captionSize,
  visibility: "hidden",
  selectors: {
    [`${tile}:hover &, ${tile}:focus-visible &`]: { visibility: "visible" },
  },
});
// On the theme showing's background, its caption and badge keep their contrast (D-100, D-111).
globalStyle(`${tile}[aria-selected="true"] :is(${slot}, ${badge})`, { color: t.selectedMuted });
