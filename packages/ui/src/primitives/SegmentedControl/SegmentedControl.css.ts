import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.segmentedControl;

export const root = style({ display: "inline-flex", alignItems: "center", gap: t.gap, fontFamily: t.font, fontSize: t.fontSize });

export const label = style({ color: t.text, whiteSpace: "nowrap" });

export const track = style({
  display: "inline-flex",
  alignItems: "stretch",
  gap: t.padding,
  height: t.height,
  padding: t.padding,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  boxSizing: "border-box",
});

export const segment = style({
  display: "inline-flex",
  alignItems: "center",
  paddingInline: t.paddingInline,
  borderRadius: t.segmentRadius,
  color: t.text,
  fontWeight: t.fontWeight,
  cursor: "default",
  outline: "none",
  whiteSpace: "nowrap",
  transitionProperty: "background-color, color",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-selected]": { backgroundColor: t.selected, color: t.selectedText, boxShadow: t.shadow },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});
