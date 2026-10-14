import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.menuButton;

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
  minWidth: t.minWidth,
  outline: "none",
});

export const menu = style({ outline: "none", display: "flex", flexDirection: "column", fontFamily: t.font, fontSize: t.fontSize, color: t.text });

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
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth },
    "&[data-disabled]": { opacity: t.disabledOpacity },
  },
});

// The label, and under it why an unavailable item is unavailable (Foundations → States). The reason
// keeps full contrast; only the label dims.
export const label = style({ flexGrow: 1, display: "flex", flexDirection: "column", paddingBlock: t.reasonPaddingBlock });
export const labelRow = style({ display: "flex", alignItems: "center", gap: t.gap });
export const labelText = style({ flexGrow: 1, selectors: { [`${item}[aria-disabled="true"] &`]: { opacity: t.disabledOpacity } } });
export const reason = style({ color: t.textMuted, fontSize: t.captionSize });
export const check = style({ width: t.captionSize, display: "inline-flex", justifyContent: "center", color: t.text });
export const shortcut = style({ color: t.textMuted, fontSize: t.captionSize });
export const separator = style({ height: t.separatorWidth, backgroundColor: t.separator, marginBlock: t.padding });

// The text variant: the current value and a chevron, as in Turn into (Text formatting → Anatomy).
export const text = style({
  display: "inline-flex",
  alignItems: "center",
  gap: t.textGap,
  height: t.textHeight,
  paddingInline: t.textPaddingInline,
  borderRadius: t.textRadius,
  borderStyle: "none",
  backgroundColor: t.textTransparent,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  whiteSpace: "nowrap",
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-hovered], &[aria-expanded=\"true\"]": { backgroundColor: t.hover },
    "&[data-pressed]": { backgroundColor: t.pressed },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.pillFocusWidth, outlineColor: t.focusRing },
  },
});

// The pill variant: the trigger is a quiet text pill (UI-12).

export const pill = style({
  display: "inline-flex",
  alignItems: "center",
  height: t.pillHeight,
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
