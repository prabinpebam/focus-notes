import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics, floatingControlSurface } from "../control.css.ts";

const t = tokens.cmp.pillButton;

// A quiet pill: muted caption text with no fill or border until pointed at or focused (UI-12).
// It stays at full opacity so its text keeps AA contrast.

export const pill = style({
  position: "relative",
  ...controlMetrics,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: t.height,
  paddingInline: t.paddingInline,
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
    "&[data-hovered], &[data-pressed], &[data-focus-visible], &[aria-expanded=\"true\"]": {
      color: t.textHover, backgroundColor: t.hover, borderColor: t.borderHover,
    },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});
export const floating = style(floatingControlSurface);
