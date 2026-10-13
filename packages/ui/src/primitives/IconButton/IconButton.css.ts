import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.iconButton;

export const base = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.size,
  height: t.size,
  padding: 0,
  borderStyle: "none",
  borderRadius: t.radius,
  backgroundColor: t.color.transparent,
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: t.duration,
  selectors: {
    '&[data-hovered]:not([aria-disabled="true"])': { backgroundColor: t.color.hover },
    '&[data-pressed]:not([aria-disabled="true"])': { backgroundColor: t.color.pressed },
    "&[data-selected]": { backgroundColor: t.color.selected },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.color.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
    '&[aria-disabled="true"]': { opacity: t.disabledOpacity },
  },
});
export const tone = styleVariants({ default: { color: t.color.icon }, muted: { color: t.color.iconMuted } });
