import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.tabs;

export const root = style({ display: "flex", flexDirection: "column", gap: t.panelGap, fontFamily: t.font });
export const list = style({
  display: "flex",
  gap: t.gap,
  borderBottomStyle: "solid",
  borderBottomWidth: t.borderWidth,
  borderBottomColor: t.border,
});
export const tab = style({
  display: "inline-flex",
  alignItems: "center",
  height: t.height,
  paddingInline: t.paddingInline,
  borderTopLeftRadius: t.radius,
  borderTopRightRadius: t.radius,
  color: t.text,
  fontSize: t.fontSize,
  fontWeight: t.fontWeight,
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-selected]": { color: t.selectedText, boxShadow: `inset 0 calc(-1 * ${t.indicatorWidth}) 0 ${t.indicator}` },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});
export const panel = style({ outline: "none", selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing } } });
