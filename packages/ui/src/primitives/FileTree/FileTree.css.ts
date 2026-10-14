import { globalStyle, createVar, keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.fileTree;
/** How deep a row is (aria-level minus one), set per row: each level indents by one step. */
export const depth = createVar({ syntax: "<number>", inherits: false, initialValue: "0" });

export const tree = style({
  display: "flex",
  flexDirection: "column",
  gap: t.rowGap,
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  outline: "none",
});
minimalScrollbar(tree, t);

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  flexShrink: 0,
  minHeight: t.rowHeight,
  paddingInlineEnd: t.paddingInline,
  paddingInlineStart: `calc(${t.paddingInline} + ${depth} * ${t.indent})`,
  borderRadius: t.radius,
  fontWeight: t.weight,
  cursor: "default",
  outline: "none",
  boxSizing: "border-box",
  transitionProperty: "background-color",
  transitionDuration: t.duration,
  selectors: {
    "&:hover": { backgroundColor: t.hover },
    // Text on the selection's color: the same as elsewhere, except in forced colors (HighlightText).
    '&[aria-selected="true"]': { backgroundColor: t.selection, color: t.selectionText },
    // The current note: an accent outline and semibold (Files → Row states).
    "&[data-current]": { boxShadow: `inset 0 0 0 ${t.outlineWidth} ${t.accent}`, fontWeight: t.strongWeight },
    "&[data-drop-target]": { boxShadow: `inset 0 0 0 ${t.focusWidth} ${t.accent}` },
    "&:focus-visible": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
});
/** A root's section label: uppercase, small, muted. */
export const section = style({
  textTransform: "uppercase",
  fontSize: t.sectionSize,
  fontWeight: t.strongWeight,
  color: t.textMuted,
});
export const chevron = style({ display: "inline-flex", flexShrink: 0, width: t.iconSize, height: t.iconSize, alignItems: "center", justifyContent: "center", color: t.textMuted });
export const icon = style({ display: "inline-flex", flexShrink: 0, color: t.textMuted });
export const label = style({ flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
export const description = style({ flexShrink: 0, color: t.textMuted, fontSize: t.captionSize, fontWeight: t.weight, textTransform: "none" });
globalStyle(`${row}[aria-selected="true"] :is(${chevron}, ${icon}, ${description})`, { color: t.selectionTextMuted });
/** The saving sign appears only after the wait sign's delay (Waits), so quick writes show nothing. */
const appear = keyframes({ to: { visibility: "visible" } });
export const pending = style({
  display: "inline-flex", flexShrink: 0, visibility: "hidden",
  animationName: appear, animationDuration: t.duration, animationDelay: t.signDelay, animationFillMode: "forwards",
});
export const edit = style({ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0, paddingBlock: t.gap });
export const input = style({
  minHeight: t.inputHeight,
  paddingInline: t.gap,
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  backgroundColor: t.inputBackground,
  borderStyle: "solid",
  borderWidth: t.outlineWidth,
  borderColor: t.inputBorder,
  borderRadius: t.radius,
  outline: "none",
  selectors: {
    "&:focus": { borderColor: t.focusRing, boxShadow: `0 0 0 ${t.outlineWidth} ${t.focusRing}` },
    '&[aria-invalid="true"]': { borderColor: t.danger },
  },
});
/** Read by screen readers, not shown: the comma between a row's name and its description. */
// Inline and without size, so the name reads "About, public" with no space before the comma.
export const srOnly = style({ display: "inline", fontSize: 0 });
export const error = style({ color: t.danger, fontSize: t.captionSize, whiteSpace: "normal" });
