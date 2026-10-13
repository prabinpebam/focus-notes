import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.button;

export const base = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: t.gap,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  fontFamily: t.font,
  fontSize: t.fontSize,
  fontWeight: t.fontWeight,
  cursor: "default",
  whiteSpace: "nowrap",
  outline: "none",
  transitionProperty: "background-color, box-shadow",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focus.ring, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
    '&[aria-disabled="true"]': { opacity: t.disabledOpacity },
  },
});

export const size = styleVariants({
  s: { height: t.height.s, paddingInline: t.paddingInline.s },
  m: { height: t.height.m, paddingInline: t.paddingInline.m },
});

const variantStyle = (v: { background: { rest: string; hover: string; pressed: string }; text: string; border: string }) => ({
  backgroundColor: v.background.rest,
  color: v.text,
  borderColor: v.border,
  selectors: {
    '&[data-hovered]:not([aria-disabled="true"])': { backgroundColor: v.background.hover },
    '&[data-pressed]:not([aria-disabled="true"])': { backgroundColor: v.background.pressed },
  },
});

export const variant = styleVariants({
  primary: variantStyle(t.primary),
  secondary: variantStyle(t.secondary),
  subtle: variantStyle(t.subtle),
  danger: variantStyle(t.danger),
});
