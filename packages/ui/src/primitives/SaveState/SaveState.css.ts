import { keyframes, style, styleVariants } from "@vanilla-extract/css";
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

export const tone = styleVariants({
  savedLocal: {}, pending: {}, syncing: {}, synced: {}, offline: {},
  error: { color: t.danger, selectors: { "&[data-hovered], &[data-pressed], &[data-focus-visible]": { color: t.danger } } },
});

export const glyph = style({ position: "relative", display: "inline-flex" });

const spin = keyframes({ to: { transform: "rotate(1turn)" } });
export const moving = style({
  position: "absolute", inset: 0, borderRadius: t.radius,
  borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.transparent, borderTopColor: t.dotColor,
  pointerEvents: "none", animationName: spin, animationDuration: t.cycle,
  animationTimingFunction: "linear", animationIterationCount: "infinite",
  selectors: { ':root[data-motion="reduced"] &': { animationName: "none" } },
  "@media": { "(prefers-reduced-motion: reduce)": { animationName: "none" } },
});

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