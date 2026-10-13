import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.triggerButton;

export const ring = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.size,
  height: t.size,
  padding: 0,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.ringBorder,
  backgroundColor: `color-mix(in srgb, ${t.ring} calc(${t.opacity} * 100%), transparent)`,
  backdropFilter: `blur(${t.blur})`,
  WebkitBackdropFilter: `blur(${t.blur})`,
  boxShadow: t.shadow,
  cursor: "default",
  outline: "none",
  zIndex: t.layer,
  transitionProperty: "transform",
  transitionDuration: t.duration,
  // The hit area grows to size.hit (32 px, 44 px with touch) without changing the visual size.
  "::before": {
    content: '""',
    position: "absolute",
    inset: `calc((${t.size} - ${t.hit}) / 2)`,
    borderRadius: t.radius,
  },
  selectors: {
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
});
