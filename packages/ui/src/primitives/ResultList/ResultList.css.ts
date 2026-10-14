import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { fadingEdges, minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.resultList;

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  // Its scrollbar's room is kept at both edges, so its items keep the same inset on both sides,
  // scrolling or not (UI-09, D-111).
  maxHeight: t.maxHeight,
  overflowY: "auto",
  scrollbarGutter: "stable both-edges",
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
fadingEdges(list, t);

/**
 * Fills its container (Spotlight, Move to), or the slash menu's fixed width. The slash menu scrolls
 * as a menu does, with the wheel and the arrow keys and its fading edges, no scrollbar taking room
 * from its items (D-111).
 */
export const width = styleVariants({ fill: {}, menu: { width: t.menuWidth, maxWidth: "100%", scrollbarWidth: "none", scrollbarGutter: "auto" } });
/** As tall as its items up to a popover's height, or as tall as all of them in a side sheet, whose body scrolls it. */
export const height = styleVariants({ content: {}, fill: { maxHeight: "none", flexShrink: 0, overflowY: "visible", scrollbarGutter: "auto" } });

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
/** A command's or setting's current state, or a match's place, at the end of its row. */
export const state = style({ flexShrink: 0, color: t.state, fontSize: t.captionSize });
/**
 * Where the query matched: marked as the find bar marks a match in the note, its text keeping AA
 * contrast on it (D-100), and bold, so a few matched letters still stand out (D-109, D-110).
 */
export const match = style({ backgroundColor: t.match, color: t.matchText, borderRadius: t.matchRadius, fontWeight: t.matchWeight });

/** A group: its heading, then its items (Spotlight's Top hit, Notes…; Find in all notes' note). */
export const group = style({ display: "flex", flexDirection: "column", gap: t.gap, selectors: { "&:not(:first-child)": { marginBlockStart: t.groupGap } } });
export const header = style({
  display: "flex",
  flexDirection: "column",
  paddingInline: t.itemPaddingInline,
  paddingBlock: t.headerPaddingBlock,
  minWidth: 0,
});
export const headerLabel = style({ color: t.header, fontSize: t.captionSize, fontWeight: t.headerWeight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
