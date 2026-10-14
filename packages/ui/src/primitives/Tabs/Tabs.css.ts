import { createVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.tabs;

/** The narrowest vertical tabs fit in, list and panel side by side; narrower, they're laid out across (Tabs.tsx, D-111). */
export const besideVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

const rootBase = style({ vars: { [besideVar]: `calc(${t.listWidth} + ${t.panelGap} + ${t.panelMinWidth})` }, display: "flex", gap: t.panelGap, fontFamily: t.font, minWidth: 0 });
export const root = {
  horizontal: style([rootBase, { flexDirection: "column" }]),
  // Vertical: the list on the inline start and the panel beside it. Where there's no room for both,
  // the tabs lay out across, over the panel, as horizontal ones (Tabs.tsx).
  vertical: style([rootBase, { flexDirection: "row", alignItems: "flex-start" }]),
};
const listBase = style({ display: "flex", gap: t.gap, borderStyle: "solid", borderWidth: 0, borderColor: t.border });
export const list = {
  // Across: they wrap onto another row rather than ever reach past their container (D-111).
  horizontal: style([listBase, { flexWrap: "wrap" }]),
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
    // Inset: drawn inside the item's rounded shape, so no scrolling or clipping container ever cuts it (D-111).
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
});
export const tab = {
  horizontal: style([tabBase, {
    borderRadius: t.radius,
    // Selected by its background alone, never an underline or a side bar (D-111).
    selectors: { "&[data-selected]": { color: t.selectedText, backgroundColor: t.selected, forcedColorAdjust: "none" } },
  }]),
  vertical: style([tabBase, {
    borderRadius: t.radius,
    selectors: { "&[data-selected]": { color: t.selectedText, backgroundColor: t.selected, forcedColorAdjust: "none" } },
  }]),
};
// The panel fills its scrolling container: its ring is inset so the container never cuts it (D-111).
const panelBase = style({ outline: "none", selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` } } });
export const panel = {
  horizontal: panelBase,
  // Its first line (a heading trimmed to its capitals) centered on the first tab's label (D-111).
  vertical: style([panelBase, { flexGrow: 1, flexShrink: 1, flexBasis: t.panelMinWidth, minWidth: 0, paddingBlockStart: `calc((${t.height} - 1cap) / 2)` }]),
};
