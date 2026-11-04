import { createVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics, floatingControlSurface } from "../control.css.ts";

const t = tokens.cmp.menuButton;
export const busyAnchor = style({ position: "relative" });

export const popover = style({
  backgroundColor: `color-mix(in srgb, ${t.background} calc(${t.opacity} * 100%), transparent)`,
  backdropFilter: `blur(${t.blur})`,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  borderRadius: t.radius,
  boxShadow: t.shadow,
  padding: t.padding,
  zIndex: t.layer,
  // The least width of its content, as before the box took in its padding and border.
  minWidth: `calc(${t.minWidth} + 2 * ${t.padding} + 2 * ${t.borderWidth})`,
  outline: "none",
  // Never taller than the window (React Aria sets its maximum height): the menu inside scrolls. That
  // height is the room it measured for the whole box, so the padding and border are inside it (D-111).
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  // It is the scroll container when its content isn't a menu that scrolls itself: never clipped (spacing SP-5).
  overflowX: "hidden",
  overflowY: "auto",
  scrollbarWidth: "none",
  scrollPaddingBlock: t.padding,
});

// Its items have a gap between their highlight shapes (D-111). When the window is too short for it,
// it scrolls with the wheel and the arrow keys, as a system menu does: its fading edges show
// there's more, and no scrollbar takes room from its items (the same inset on every side).
export const menu = style({ outline: "none", display: "flex", flexDirection: "column", gap: t.itemGap, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", fontFamily: t.font, fontSize: t.fontSize, color: t.text });
export const section = style({ display: "flex", flexDirection: "column", gap: t.itemGap });

export const header = style({ paddingInline: t.itemPaddingInline, fontSize: t.captionSize, fontWeight: t.headerWeight, color: t.textMuted });

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  minHeight: t.itemHeight,
  paddingInline: t.itemPaddingInline,
  borderRadius: t.itemRadius,
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-focused]": { backgroundColor: t.hover },
    "&[data-pressed]": { backgroundColor: t.pressed },
    // Inset: drawn inside the item's rounded shape, so no scrolling or clipping container ever cuts it (D-111).
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: `calc(-1 * ${t.focusWidth})` },
    "&[data-disabled]": { opacity: t.disabledOpacity },
  },
  // Forced colors: the focused item in the system's highlight, as a system menu shows it (D-204).
  "@media": { "(forced-colors: active)": { selectors: { "&[data-focused]": { backgroundColor: t.forcedFocused, color: t.forcedFocusedText, forcedColorAdjust: "none" } } } },
});

export const label = style({ flexGrow: 1, display: "flex", flexDirection: "column" });
export const labelRow = style({ display: "flex", alignItems: "center", gap: t.gap });
const unavailable = `${item}[aria-disabled="true"] &`;
export const labelText = style({
  flexGrow: 1,
  selectors: { [unavailable]: { opacity: t.disabledOpacity } },
  "@media": { "(forced-colors: active)": { selectors: { [unavailable]: { color: t.textDisabled } } } },
});
export const check = style({ width: t.captionSize, display: "inline-flex", justifyContent: "center", color: t.text });
// In the interface font, as everywhere else shortcuts show (a <kbd> would be monospace).
// An unavailable item's shortcut dims with its label; in forced colors, a focused one is in the
// highlight's text color, as its label (D-204).
export const shortcut = style({
  color: t.textMuted, fontSize: t.captionSize, fontFamily: t.font,
  selectors: { [unavailable]: { opacity: t.disabledOpacity } },
  "@media": { "(forced-colors: active)": { selectors: { [`${item}[data-focused] &`]: { color: t.forcedFocusedText }, [unavailable]: { color: t.textDisabled } } } },
});
// Its space is its own padding, the line on its content box (spacing SP-9).
export const separator = style({ height: t.separatorWidth, boxSizing: "content-box", paddingBlock: t.separatorSpace, backgroundColor: t.separator, backgroundClip: "content-box" });

// The text variant: the current value and a chevron, as in Turn into (Text formatting → Anatomy).
/** The text variant's fill: on its box, or on a bleeding text button's hit extension. */
const textFill = createVar();
export const text = style({
  vars: { [textFill]: t.textTransparent },
  ...controlMetrics,
  display: "inline-flex",
  alignItems: "center",
  gap: t.textGap,
  minHeight: t.textHeight,
  paddingInline: t.textPaddingInline,
  borderRadius: t.textRadius,
  borderStyle: "none",
  backgroundColor: textFill,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  whiteSpace: "nowrap",
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-hovered], &[aria-expanded=\"true\"]": { vars: { [textFill]: t.hover } },
    "&[data-pressed]": { vars: { [textFill]: t.pressed } },
    // Inset, as a menu item's: the text and select variants line up with a panel's content edge, where
    // a scrolling body would cut a ring drawn outside them (D-111).
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.pillFocusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.pillFocusWidth})` },
  },
});

/**
 * The select variant: the current value and a chevron in a bordered box, as a form's field (the
 * theme manager's Font). Its box lines up with the labels and controls above and below it (D-111).
 */
export const select = style([text, {
  justifyContent: "space-between",
  minWidth: t.minWidth,
  maxWidth: "100%",
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.selectBorder,
  backgroundColor: t.selectBackground,
}]);

/** The text variant at the edge of a panel's content (the Files sheet's New): its text and chevron line up with the edge (D-111). */
export const textBleed = style({
  // Its box is its text's line, in line with the content; its hit area, fill and ring reach past it
  // by an invisible extension, never by pulling the box into its container's padding (spacing SP-2).
  position: "relative",
  isolation: "isolate",
  minHeight: 0,
  paddingInline: 0,
  backgroundColor: "transparent",
  "::before": {
    content: '""', position: "absolute", zIndex: tokens.layer.underlay, borderRadius: t.textRadius, backgroundColor: textFill,
    insetInline: `calc(-1 * ${t.textPaddingInline})`, insetBlock: `calc((${t.fontSize} * ${t.lineHeight} - ${t.textHeight}) / 2)`,
  },
  selectors: {
    "&[data-focus-visible]": { outlineStyle: "none" },
    "&[data-focus-visible]::before": { outlineStyle: "solid", outlineWidth: t.pillFocusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.pillFocusWidth})` },
  },
});

// The pill variant: the trigger is a quiet text pill (UI-12).

export const pill = style({
  ...controlMetrics,
  display: "inline-flex",
  alignItems: "center",
  minHeight: t.pillHeight,
  paddingInline: t.pillPaddingInline,
  borderRadius: t.pillRadius,
  borderStyle: "solid",
  borderWidth: t.pillBorderWidth,
  borderColor: t.pillBorder,
  backgroundColor: t.pillTransparent,
  color: t.pillText,
  fontFamily: t.pillFont,
  fontSize: t.pillFontSize,
  whiteSpace: "nowrap",
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color, border-color, color",
  transitionDuration: t.pillDuration,
  transitionTimingFunction: t.pillEasing,
  selectors: {
    "&[data-hovered], &[data-pressed], &[data-focus-visible], &[aria-expanded=\"true\"]": {
      color: t.pillTextHover, backgroundColor: t.pillHover, borderColor: t.pillBorderHover,
    },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.pillFocusWidth, outlineColor: t.pillFocusRing },
  },
});
export const floating = style(floatingControlSurface);
