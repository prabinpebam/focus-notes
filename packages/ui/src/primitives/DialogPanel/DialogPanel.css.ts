import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.dialogPanel;

export const overlay = style({
  position: "fixed",
  inset: 0,
  zIndex: t.layer,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: t.inset,
  backgroundColor: t.scrim,
  transitionProperty: "opacity",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-entering]": { opacity: 0 },
    "&[data-exiting]": { opacity: 0, transitionDuration: t.exitDuration },
  },
});

export const modal = style({
  display: "flex",
  width: "100%",
  maxHeight: t.maxHeight,
  outline: "none",
  transitionProperty: "transform",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: { "&[data-entering]": { transform: "scale(0.98)" } },
});

export const size = {
  s: style({ maxWidth: t.width.s }),
  m: style({ maxWidth: t.width.m }),
  l: style({ maxWidth: t.width.l }),
  xl: style({ maxWidth: t.width.xl }),
};

/** Centered, or near the top like Spotlight, where results grow downward without the field moving. */
export const placement = {
  center: style({}),
  top: style({ alignItems: "flex-start", paddingBlockStart: t.top }),
};

export const dialog = style({
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  width: "100%",
  minHeight: 0,
  paddingBlock: t.padding,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  boxShadow: t.shadow,
  color: t.text,
  fontFamily: t.font,
  outline: "none",
  boxSizing: "border-box",
});

export const region = style({ paddingInline: t.padding, flexShrink: 0 });

export const body = style({
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingInlineStart: t.padding,
  // The reserved gutter takes the place of the end padding, so text lines up either way (UI-09).
  paddingInlineEnd: `calc(${t.padding} - ${t.scrollbarSize})`,
  scrollbarGutter: "stable",
  outline: "none",
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` } },
});
minimalScrollbar(body, t);

/** The raised surface, or the theme's frosted one (Foundations → Surfaces). */
export const material = {
  raised: style({}),
  frosted: style({
    backgroundColor: `color-mix(in srgb, ${t.frostBackground} calc(${t.frostOpacity} * 100%), transparent)`,
    backdropFilter: `blur(${t.frostBlur})`,
  }),
};
