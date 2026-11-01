import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

/** Native controls share one line box and no browser-provided block padding. */
export const controlMetrics = {
  appearance: "none",
  boxSizing: "border-box",
  margin: 0,
  paddingBlock: 0,
  lineHeight: tokens.font.uiLineHeight,
} as const;

export const controlLabel = style({
  display: "inline-block",
  lineHeight: tokens.font.uiLineHeight,
  textBoxTrim: "trim-both",
  textBoxEdge: "cap alphabetic",
});

/** Highlight paint sits over an opaque surface, never replaces it with an alpha tint. */
export const floatingControlSurface = {
  backgroundColor: tokens.color.surface,
  selectors: {
    "&[data-hovered], &[data-focus-visible], &[aria-expanded=\"true\"]": {
      backgroundColor: tokens.color.surface,
      backgroundImage: `linear-gradient(${tokens.color.hover}, ${tokens.color.hover})`,
    },
    "&[data-pressed], &[data-selected]": {
      backgroundColor: tokens.color.surface,
      backgroundImage: `linear-gradient(${tokens.color.pressed}, ${tokens.color.pressed})`,
    },
  },
};
