import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.toast;

export const root = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  maxWidth: t.maxWidth,
  paddingBlock: t.paddingBlock,
  paddingInlineStart: t.paddingInline,
  paddingInlineEnd: t.paddingBlock,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: `color-mix(in srgb, ${t.background} calc(${t.opacity} * 100%), transparent)`,
  backdropFilter: `blur(${t.blur})`,
  boxShadow: t.shadow,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  transitionProperty: "opacity, transform",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: { '&[data-tone="error"]': { borderColor: t.borderError } },
});
export const icon = style({ display: "inline-flex", color: t.errorIcon });
export const message = style({ flexGrow: 1 });
