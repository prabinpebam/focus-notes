import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.popoverPanel;

export const popover = style({
  backgroundColor: `color-mix(in srgb, ${t.background} calc(${t.opacity} * 100%), transparent)`,
  backdropFilter: `blur(${t.blur})`,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  borderRadius: t.radius,
  boxShadow: t.shadow,
  padding: t.padding,
  zIndex: t.layer,
  // React Aria's maximum height is for the whole box, so the padding and border are inside it (D-111).
  boxSizing: "border-box",
  outline: "none",
  transformOrigin: "top center",
  transitionProperty: "opacity, transform",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-entering]": { opacity: 0, transform: "scale(0.98)" },
    "&[data-exiting]": { opacity: 0, transitionDuration: t.exitDuration },
  },
});

export const dialog = style({ outline: "none" });
