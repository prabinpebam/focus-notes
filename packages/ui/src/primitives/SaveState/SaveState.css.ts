import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.saveState;

// The quiet pill of UI-12: muted, no fill or border until pointed at or focused. The icon carries
// the state; its words are the tooltip, or open beside it for a moment after Save to cloud.
export const pill = style({
  display: "inline-flex",
  alignItems: "center",
  gap: t.gap,
  height: t.height,
  minWidth: t.height,
  justifyContent: "center",
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
    "&[data-hovered], &[data-pressed], &[data-focus-visible]": { color: t.textHover, backgroundColor: t.hover, borderColor: t.borderHover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});

export const tone = styleVariants({
  savedLocal: {}, pending: {}, syncing: {}, synced: {}, offline: {},
  error: { color: t.danger, selectors: { "&[data-hovered], &[data-pressed], &[data-focus-visible]": { color: t.danger } } },
});

export const glyph = style({ position: "relative", display: "inline-flex" });

// The arrow rises gently while backing up; with reduced motion the duration is zero, so it stays still.
const rise = keyframes({ "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: `translateY(calc(-1 * ${t.rise}))` } });
export const moving = style({ animationName: rise, animationDuration: t.cycle, animationTimingFunction: t.easing, animationIterationCount: "infinite" });

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