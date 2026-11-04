import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics, floatingControlSurface } from "../control.css.ts";

const t = tokens.cmp.button;

export const borderAnchor = style({ position: "relative" });
export const base = style({
  ...controlMetrics,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  // Never squeezed in a row: the field beside it gives up the room (or the row wraps). Never wider
  // than its container either: a label too long for it ends in an ellipsis (D-111).
  flexShrink: 0,
  maxWidth: "100%",
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
    // Busy is inert but not disabled: its sign is the Spinner and its words, never a dimmed look (D-199).
    '&[aria-disabled="true"]:not([data-busy="on"])': { opacity: t.disabledOpacity },
    "&[data-selected]": { backgroundImage: `linear-gradient(${t.toggle.selected}, ${t.toggle.selected})` },
  },
});

export const size = styleVariants({
  s: { minHeight: t.height.s, paddingInline: t.paddingInline.s },
  m: { minHeight: t.height.m, paddingInline: t.paddingInline.m },
  // An onboarding step's main action (Get started, D-126).
  l: { minHeight: t.height.l, paddingInline: t.paddingInline.l, fontSize: t.fontSizeL },
});
/** An icon at one end: that end's padding is smaller by the icon's side bearing, so the visible inset is the same at both ends (owner, 3 November 19:08). */
export const iconStart = styleVariants({
  s: { paddingInlineStart: `calc(${t.paddingInline.s} - ${t.iconBearing})` },
  m: { paddingInlineStart: `calc(${t.paddingInline.m} - ${t.iconBearing})` },
  l: { paddingInlineStart: `calc(${t.paddingInline.l} - ${t.iconBearing})` },
});
export const iconEnd = styleVariants({
  s: { paddingInlineEnd: `calc(${t.paddingInline.s} - ${t.iconBearing})` },
  m: { paddingInlineEnd: `calc(${t.paddingInline.m} - ${t.iconBearing})` },
  l: { paddingInlineEnd: `calc(${t.paddingInline.l} - ${t.iconBearing})` },
});
/** A subtle button at the start of the content: its label lines up with the edge, its hit area reaching into the padding (D-111, D-123). */
export const bleed = styleVariants({
  s: { marginInlineStart: `calc(-1 * ${t.paddingInline.s})` },
  m: { marginInlineStart: `calc(-1 * ${t.paddingInline.m})` },
  l: { marginInlineStart: `calc(-1 * ${t.paddingInline.l})` },
});

const variantStyle = (v: { background: { rest: string; hover: string; pressed: string }; text: string; border: string }) => ({
  backgroundColor: v.background.rest,
  color: v.text,
  borderColor: v.border,
  selectors: {
    '&[data-hovered]:not([aria-disabled="true"])': { backgroundImage: `linear-gradient(${v.background.hover}, ${v.background.hover})` },
    '&[data-pressed]:not([aria-disabled="true"])': { backgroundImage: `linear-gradient(${v.background.pressed}, ${v.background.pressed})` },
  },
});

export const variant = styleVariants({
  primary: variantStyle(t.primary),
  secondary: variantStyle(t.secondary),
  subtle: variantStyle(t.subtle),
  danger: variantStyle(t.danger),
});

export const label = style({ minWidth: 0 });
export const floating = style(floatingControlSurface);

// The busy sign (Waits, D-199): the icon and a Spinner share one cell, so the control keeps its size.
// The Spinner shows, and the icon hides, only after the busy delay (wait.signDelay), so quick work
// shows nothing extra. No timer: the delay is the style's, the busy state the task tracker's.
const hidden = keyframes({ from: { visibility: "hidden" }, to: { visibility: "hidden" } });
const shown = keyframes({ from: { visibility: "visible" }, to: { visibility: "visible" } });
export const busyGlyph = style({ display: "inline-grid", gridTemplateAreas: '"glyph"', alignItems: "center", justifyItems: "center" });
export const busyIcon = style({ gridArea: "glyph", display: "inline-flex", animationName: hidden, animationDuration: t.duration, animationDelay: t.busy.signDelay, animationFillMode: "forwards" });
export const busySpinner = style({ gridArea: "glyph", display: "inline-flex", visibility: "hidden", animationName: shown, animationDuration: t.duration, animationDelay: t.busy.signDelay, animationFillMode: "forwards" });
