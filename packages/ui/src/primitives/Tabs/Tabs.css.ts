import { createVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { track, segment as segments } from "../SegmentedControl/SegmentedControl.css.ts";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

export const segmentTrack = track.horizontal;
export const segment = segments.horizontal;

const t = tokens.cmp.tabs;

/** The narrowest vertical tabs fit in, list and panel side by side; narrower, they're laid out across (Tabs.tsx, D-111). */
export const besideVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const navHeightVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const scrollRoot = style({ vars: { [navHeightVar]: t.navMinHeight }, flexGrow: 1, minHeight: 0 });
export const scroller = style({ flexGrow: 1, minHeight: 0, overflowY: "auto", scrollbarGutter: "stable", scrollPadding: t.focusRoom });
minimalScrollbar(scroller, t);
export const navigationScroller = style({
  flexShrink: 0, minHeight: 0, maxHeight: `calc(100% - ${t.panelMinHeight})`,
  overflowY: "auto", scrollbarGutter: "stable", scrollPadding: t.focusRoom,
});
minimalScrollbar(navigationScroller, t);

const rootBase = style({ vars: { [besideVar]: `calc(${t.listWidth} + ${t.panelGap} + ${t.panelMinWidth})` }, display: "flex", gap: t.panelGap, fontFamily: t.font, minWidth: 0, selectors: { "&[data-scroll-panel]": { gap: 0 } } });
export const root = {
  horizontal: style([rootBase, { flexDirection: "column" }]),
  // Vertical: the list on the inline start and the panel beside it. Where there's no room for both,
  // the tabs lay out across, over the panel, as horizontal ones (Tabs.tsx).
  // Its list and panel run the full height of what holds them (a dialog's body), so the list's
  // divider reaches from the top of the body to the bottom (D-123).
  vertical: style([rootBase, { flexDirection: "row", alignItems: "stretch", flexGrow: 1 }]),
};
const listBase = style({ display: "flex", gap: t.gap, borderStyle: "solid", borderWidth: 0, borderColor: t.border });
export const list = {
  // Across: they wrap onto another row rather than ever reach past their container (D-111).
  horizontal: style([listBase, { flexWrap: "wrap" }]),
  vertical: style([listBase, { flexDirection: "column", flexGrow: 0, flexShrink: 0, flexBasis: t.listWidth, borderInlineEndWidth: t.borderWidth, paddingInlineEnd: t.gap }]),
};
/** With a footer, the list and the footer share a column, which takes the list's place and its divider (D-203). */
export const side = {
  horizontal: style({ display: "flex", flexDirection: "column", gap: t.footerGap }),
  vertical: style({ display: "flex", flexDirection: "column", gap: t.footerGap, flexGrow: 0, flexShrink: 0, flexBasis: t.listWidth, borderStyle: "solid", borderWidth: 0, borderColor: t.border, borderInlineEndWidth: t.borderWidth, paddingInlineEnd: t.gap }),
};
export const sideList = {
  horizontal: list.horizontal,
  vertical: style([listBase, { flexDirection: "column" }]),
};
/**
 * Under the tabs, after a hairline, the footer's action at the list's own inset, as wide as its words.
 * The hairline is a separator, not an enclosure: drawn on the footer's top edge, the column's gap above
 * it and the footer's padding below it are the same space (spacing SP-11).
 */
const footerBase = style({
  display: "flex", flexDirection: "column", alignItems: "flex-start", paddingBlockStart: t.footerGap,
  backgroundImage: `linear-gradient(${t.border}, ${t.border})`, backgroundSize: `100% ${t.borderWidth}`, backgroundRepeat: "no-repeat", backgroundPosition: "top",
  "@media": { "(forced-colors: active)": { backgroundImage: "none", paddingBlockStart: t.footerGap, borderBlockStartStyle: "solid", borderBlockStartWidth: t.borderWidth, borderColor: t.border } },
});
export const footer = { horizontal: footerBase, vertical: footerBase };
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
  vertical: style([panelBase, { flexGrow: 1, flexShrink: 1, flexBasis: t.panelMinWidth, minWidth: 0, paddingBlockStart: `calc((${t.height} - 1cap) / 2)`, selectors: { "[data-scroll-panel] > &": { paddingBlockStart: 0 } } }]),
};

export const navigation = {
  horizontal: style({ paddingInlineStart: t.contentInset, paddingInlineEnd: `max(${t.focusRoom}, calc(${t.contentInset} - ${t.scrollbarSize}))`, paddingBlock: t.focusRoom }),
  vertical: style({ boxSizing: "border-box", flexBasis: `calc(${t.listWidth} + ${t.contentInset})`, paddingInlineStart: t.contentInset, paddingInlineEnd: t.panelInset, paddingBlockStart: t.focusRoom, paddingBlockEnd: t.contentInset }),
};
export const content = style({
  minWidth: 0, paddingInlineStart: t.panelInset,
  paddingInlineEnd: `max(${t.focusRoom}, calc(${t.contentInset} - ${t.scrollbarSize}))`,
  paddingBlockStart: t.focusRoom, paddingBlockEnd: t.contentInset,
});
export const contentOrientation = {
  horizontal: style({}),
  vertical: style({ paddingBlockStart: `calc(${t.focusRoom} + (${t.height} - 1cap) / 2)` }),
};
