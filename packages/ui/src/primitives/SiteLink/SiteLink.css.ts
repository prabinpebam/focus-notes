import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteLink;

export const base = style({
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  textUnderlineOffset: t.focusOffset,
  textDecorationThickness: t.underline,
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset } },
});

// The calls to action are at least the size of a control and a touch target (WCAG 2.5.8).
const action = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: t.height,
  minWidth: t.hit,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  fontWeight: t.weight,
  textDecoration: "none",
} as const;

export const variant = styleVariants({
  inline: { textDecorationLine: "underline" },
  nav: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: t.hit,
    color: t.nav,
    textDecoration: "none",
    selectors: {
      "&:hover": { textDecorationLine: "underline" },
      '&[aria-current="page"]': { color: t.navCurrent, textDecorationLine: "underline", textDecorationThickness: t.currentBar },
    },
  },
  brand: { display: "inline-flex", alignItems: "center", minHeight: t.hit, marginInlineEnd: "auto", color: t.nav, fontSize: t.brandSize, fontWeight: t.weight, textDecoration: "none" },
  primary: { ...action, backgroundColor: t.primary.background, borderColor: t.primary.background, color: t.primary.text },
  secondary: {
    ...action,
    backgroundColor: t.secondary.background,
    borderColor: t.secondary.border,
    color: t.secondary.text,
    selectors: { "&:hover": { backgroundColor: t.secondary.hover } },
  },
});
