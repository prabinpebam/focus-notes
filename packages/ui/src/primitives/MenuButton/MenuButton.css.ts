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
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.borderWidth },
    "&[data-disabled]": { opacity: t.disabledOpacity },
  },
});

export const label = style({ flexGrow: 1 });
export const check = style({ width: t.captionSize, display: "inline-flex", justifyContent: "center", color: t.text });
export const shortcut = style({ color: t.textMuted, fontSize: t.captionSize });
export const separator = style({ height: t.separatorWidth, backgroundColor: t.separator, marginBlock: t.padding });

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
