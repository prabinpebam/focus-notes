import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.tabs;

const rootBase = style({ display: "flex", gap: t.panelGap, fontFamily: t.font });
export const root = {
  horizontal: style([rootBase, { flexDirection: "column" }]),
  // Vertical: the list on the inline start and the panel beside it, wrapping below it when narrow (320 px reflow).
  vertical: style([rootBase, { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" }]),
};
const listBase = style({ display: "flex", gap: t.gap, borderStyle: "solid", borderWidth: 0, borderColor: t.border });
export const list = {
  horizontal: style([listBase, { borderBottomWidth: t.borderWidth }]),
  vertical: style([listBase, { flexDirection: "column", flexGrow: 0, flexShrink: 0, flexBasis: t.listWidth, borderInlineEndWidth: t.borderWidth, paddingInlineEnd: t.gap }]),
};
const tabBase = style({
  display: "inline-flex",
  alignItems: "center",
  height: t.height,
  paddingInline: t.paddingInline,
  color: t.text,
  fontSize: t.fontSize,
  fontWeight: t.fontWeight,
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing },
  },
});
export const tab = {
  horizontal: style([tabBase, {
    borderTopLeftRadius: t.radius,
    borderTopRightRadius: t.radius,
    selectors: { "&[data-selected]": { color: t.selectedText, boxShadow: `inset 0 calc(-1 * ${t.indicatorWidth}) 0 ${t.indicator}` } },
  }]),
  vertical: style([tabBase, {
    borderRadius: t.radius,
    selectors: { "&[data-selected]": { color: t.selectedText, boxShadow: `inset ${t.indicatorWidth} 0 0 ${t.indicator}` } },
  }]),
};
const panelBase = style({ outline: "none", selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing } } });
export const panel = {
  horizontal: panelBase,
  vertical: style([panelBase, { flexGrow: 1, flexShrink: 1, flexBasis: t.panelMinWidth, minWidth: 0 }]),
};
