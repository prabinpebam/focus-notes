import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.saveState;

// The circular wrapper stays visible at rest; the details card carries its words.
export const pill = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: t.gap,
  height: t.height,
  minWidth: t.height,
  justifyContent: "center",
  paddingInline: 0,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.transparent,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  whiteSpace: "nowrap",
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color, border-color, color",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-hovered], &[data-pressed], &[data-focus-visible]": { color: t.textHover, backgroundColor: t.hover, borderColor: t.borderHover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});

// While backing up, the shared border arc (D-356) is the pill's border: its own hairline steps aside, same width.
export const tone = styleVariants({
  savedLocal: {}, pending: {}, synced: {}, offline: {},
  syncing: { borderColor: t.transparent, selectors: { "&[data-hovered], &[data-pressed], &[data-focus-visible]": { borderColor: t.transparent } } },
  error: { color: t.danger, selectors: { "&[data-hovered], &[data-pressed], &[data-focus-visible]": { color: t.danger } } },
});

export const glyph = style({ position: "relative", display: "inline-flex" });

export const dot = style({
  position: "absolute",
  insetInlineEnd: 0,
  insetBlockEnd: 0,
  width: t.dot,
  height: t.dot,
  borderRadius: t.radius,
  backgroundColor: t.dotColor,
});

export const text = style({ fontSize: t.fontSize });