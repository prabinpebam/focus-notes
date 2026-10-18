import { globalStyle, createVar, keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.fileTree;
/** How deep a row is (aria-level minus one), set per row: each level indents by one step. */
export const depth = createVar({ syntax: "<number>", inherits: false, initialValue: "0" });

// It scrolls with what holds it (the Files sheet's body), which fades its edges (D-111).
export const tree = style({
  display: "flex",
  flexDirection: "column",
  gap: t.rowGap,
  flexShrink: 0,
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  outline: "none",
});

export const row = style({
  position: "relative",
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
    '&[aria-selected="true"]': { backgroundColor: t.selection, color: t.selectionText, forcedColorAdjust: "none" },
    // The open note: a quiet fill and semibold, never an outline or a side bar (D-111). Selected wins.
    '&[data-current]:not([aria-selected="true"])': { backgroundColor: t.current },
    "&[data-current]": { fontWeight: t.strongWeight },
    "&[data-drop-target]": { boxShadow: `inset 0 0 0 ${t.focusWidth} ${t.accent}` },
    // Inset: drawn inside the item's rounded shape, so no scrolling or clipping container ever cuts it (D-111).
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
/**
 * The row's ⋯ (D-162): opens its menu with the pointer; the keyboard has Shift+F10 and the Menu key. Its
 * place is kept, so showing it never moves the label; it shows on hover, focus, selection, and while open.
 */
export const more = style({
  display: "inline-flex", flexShrink: 0, alignItems: "center", justifyContent: "center",
  width: t.moreSize, height: t.moreSize, borderRadius: t.radius, color: t.textMuted, visibility: "hidden",
  selectors: { "&:hover": { backgroundColor: t.moreHover } },
});
globalStyle(`${row}:hover ${more}, ${row}:focus-visible ${more}, ${row}[aria-selected="true"] ${more}, ${row}[data-menu-open] ${more}`, { visibility: "visible" });
globalStyle(`${row}[aria-selected="true"] ${more}`, { color: t.selectionTextMuted });
/** Where a right-click's menu opens: the pointer's place in the row, set as it opens. */
export const anchorX = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const anchorY = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const anchor = style({ position: "absolute", left: anchorX, top: anchorY, width: 0, height: 0, pointerEvents: "none" });
/** Read by screen readers, not shown: the comma between a row's name and its description. */
// Inline and without size, so the name reads "About, public" with no space before the comma.
export const srOnly = style({ display: "inline", fontSize: 0 });
export const error = style({ color: t.danger, fontSize: t.captionSize, whiteSpace: "normal" });

/** A section's own control at its trailing end (a repository's backup, D-191): in the heading's case and size, not upper-cased. */
export const accessory = style({ display: "inline-flex", flexShrink: 0, alignItems: "center", textTransform: "none" });
