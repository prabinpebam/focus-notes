import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.tooltip;

export const tooltip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: t.gap,
  backgroundColor: t.background,
  color: t.text,
  borderRadius: t.radius,
  paddingInline: t.paddingInline,
  paddingBlock: t.paddingBlock,
  fontFamily: t.font,
  fontSize: t.fontSize,
  boxShadow: t.shadow,
  zIndex: t.layer,
  pointerEvents: "none",
  transitionProperty: "opacity",
  transitionDuration: t.duration,
  selectors: {
    "&[data-entering]": { opacity: 0 },
  },
});

export const shortcut = style({ opacity: t.shortcutOpacity });
