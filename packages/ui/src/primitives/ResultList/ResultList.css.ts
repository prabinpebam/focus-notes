import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.resultList;

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  padding: t.padding,
  maxHeight: t.maxHeight,
  overflowY: "auto",
  scrollbarGutter: "stable",
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  outline: "none",
  selectors: {
    // Reached with Tab, the list itself takes the arrow keys; inset so a scrolling list keeps it visible.
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
});
minimalScrollbar(list, t);

/** Fills its container (Spotlight, Move to), or the slash menu's fixed width. */
export const width = styleVariants({ fill: {}, menu: { width: t.menuWidth, maxWidth: "100%" } });

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: t.itemGap,
  minHeight: t.itemHeight,
  paddingInline: t.itemPaddingInline,
  borderRadius: t.itemRadius,
  cursor: "default",
  selectors: {
    '&[aria-selected="true"]': { backgroundColor: t.active, boxShadow: `inset ${t.barWidth} 0 0 ${t.activeBar}` },
    '&[aria-disabled="true"]': { opacity: t.disabledOpacity },
  },
});
export const icon = style({ display: "inline-flex", color: t.textMuted });
export const text = style({ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 });
export const label = style({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
export const description = style({ color: t.textMuted, fontSize: t.captionSize, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
export const shortcut = style({ flexShrink: 0, color: t.textMuted, fontSize: t.captionSize });
/** A command's or setting's current state, at the end of its row. */
export const state = style({ flexShrink: 0, color: t.state, fontSize: t.captionSize });
/** The characters that matched the query. */
export const match = style({ color: t.match, fontWeight: t.matchWeight });
export const group = style({ display: "flex", flexDirection: "column", gap: t.gap, selectors: { "& + &": { marginBlockStart: t.groupGap } } });
export const groupLabel = style({
  paddingInline: t.groupLabelPaddingInline,
  paddingBlock: t.groupLabelPaddingBlock,
  color: t.groupLabel,
  fontSize: t.captionSize,
  fontWeight: t.groupLabelWeight,
});
