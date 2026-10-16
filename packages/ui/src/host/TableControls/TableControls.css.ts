import { createVar, keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.tableControls;

/** Where each control sits and how big a box is, written by the component from the editor's geometry. */
export const xVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const yVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const wVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const hVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

const fade = keyframes({ from: { opacity: 0 } });

export const root = style({ position: "fixed", top: 0, left: 0, width: 0, height: 0, zIndex: t.layer });

const placed = style({
  position: "fixed",
  left: xVar,
  top: yVar,
  animationName: fade,
  animationDuration: t.duration,
  animationTimingFunction: t.easing,
});

/** A box over part of the table (the column tint, the range outline, the dragged row): never in the way. */
export const area = style([placed, { width: wVar, height: hVar, pointerEvents: "none" }]);
export const tint = style([area, { backgroundColor: t.color.tint }]);
export const lift = style([area, { backgroundColor: t.color.lift, opacity: t.liftOpacity }]);
export const outline = style([area, { outlineStyle: "solid", outlineWidth: t.outlineWidth, outlineColor: t.color.accent, outlineOffset: `calc(-1 * ${t.borderWidth})` }]);

const control = style([placed, {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  margin: 0,
  cursor: "default",
  outline: "none",
  fontFamily: t.font,
  fontSize: t.fontSize,
  transitionProperty: "background-color, color, border-color",
  transitionDuration: t.duration,
  selectors: {
    "&:focus-visible": { outlineStyle: "solid", outlineColor: t.color.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
}]);

const handle = style([control, {
  backgroundColor: t.color.handle,
  color: t.color.icon,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.color.handleBorder,
  borderRadius: t.radius,
  selectors: {
    '&:hover, &[aria-expanded="true"], &[data-dragging]': { backgroundColor: t.color.accent, borderColor: t.color.accent, color: t.color.onAccent },
  },
}]);

/** A 40 × 18 pill centered 8 px above the hovered column. Its hit area is 32 px tall. */
export const columnHandle = style([handle, {
  width: t.handleLong,
  height: t.handleShort,
  transform: `translate(-50%, calc(-100% - ${t.columnGap}))`,
  selectors: { "&::before": { content: '""', position: "absolute", insetInline: 0, top: `calc((${t.handleShort} - ${t.handleHit}) / 2)`, height: t.handleHit } },
}]);
/** An 18 × 32 pill 12 px left of the hovered row. */
export const rowHandle = style([handle, {
  width: t.handleShort,
  height: t.handleHit,
  transform: `translate(calc(-100% - ${t.rowGap}), -50%)`,
  selectors: { "&::before": { content: '""', position: "absolute", insetBlock: 0, left: `calc((${t.handleShort} - ${t.handleHit}) / 2)`, width: t.handleHit } },
}]);
/** Where the handles meet, at the top-left corner. */
export const tableHandle = style([handle, {
  width: t.handleShort,
  height: t.handleShort,
  transform: `translate(calc(-100% - ${t.rowGap}), calc(-100% - ${t.columnGap}))`,
}]);

/** The + insertion point: a 22 px accent circle on the boundary, at the table's left or top edge. */
export const insert = style([control, {
  width: t.insertSize,
  height: t.insertSize,
  borderStyle: "none",
  borderRadius: t.radius,
  backgroundColor: t.color.accent,
  color: t.color.onAccent,
}]);
export const insertRow = style({ transform: `translate(calc(-100% - ${t.rowGap}), -50%)` });
export const insertColumn = style({ transform: `translate(-50%, calc(-100% - ${t.columnGap}))` });
/**
 * The border offered for an insertion (D-182): a narrow band centred on the border that takes the
 * pointer (a click there inserts, as the + does; a click beside it still places the caret), with the
 * 3 px accent line drawn in its middle. Fixed over the note, so showing it shifts nothing.
 */
const strip = style([placed, {
  pointerEvents: "auto",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  selectors: { "&::before": { content: '""', display: "block", backgroundColor: t.color.accent } },
}]);
export const stripRow = style([strip, {
  width: wVar,
  height: t.insertLineHit,
  transform: "translateY(-50%)",
  selectors: { "&::before": { width: "100%", height: t.insertLine } },
}]);
export const stripColumn = style([strip, {
  width: t.insertLineHit,
  height: hVar,
  transform: "translateX(-50%)",
  selectors: { "&::before": { width: t.insertLine, height: "100%" } },
}]);
/** The 3 px accent line across the table at that boundary, and the drop line while dragging. */
export const line = style([area, { backgroundColor: t.color.accent }]);
export const lineRow = style({ height: t.insertLine, transform: "translateY(-50%)" });
export const lineColumn = style({ width: t.insertLine, transform: "translateX(-50%)" });

/** The dashed "+ New row" and "+" bars along the bottom and right edges. */
const bar = style([control, {
  gap: t.barGap,
  backgroundColor: t.color.bar,
  color: t.color.barText,
  borderStyle: "dashed",
  borderWidth: t.borderWidth,
  borderColor: t.color.barBorder,
  borderRadius: t.barRadius,
  selectors: { "&:hover": { backgroundColor: t.color.barHover } },
}]);
export const newRow = style([bar, { width: wVar, height: t.newRowHeight, marginTop: t.barGap }]);
export const newColumn = style([bar, { width: t.newColumnWidth, height: hVar, marginLeft: t.barGap }]);

/** The context menu opens from the active cell; this is where it's anchored. */
export const anchor = style([area, { visibility: "hidden" }]);
