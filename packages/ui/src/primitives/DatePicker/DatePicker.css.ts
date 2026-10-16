import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.datePicker;
const ring = { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth } as const;

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, fontFamily: t.font, fontSize: t.fontSize, color: t.text, minWidth: 0 });
export const label = style({ color: t.label, fontSize: t.labelSize, fontWeight: t.labelWeight });
export const description = style({ color: t.description, fontSize: t.captionSize });
// The field: the day's segments, then the calendar button, in one bordered box like a text field.
export const group = style({
  display: "flex", alignItems: "center", gap: t.gap, height: t.height, paddingInlineStart: t.paddingInline, paddingInlineEnd: t.gap,
  borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, borderRadius: t.radius, backgroundColor: t.background, boxSizing: "border-box",
  selectors: {
    "&[data-focus-within]": { borderColor: t.borderFocus, boxShadow: `0 0 0 ${t.borderWidth} ${t.borderFocus}` },
    "&[data-invalid]": { borderColor: t.borderInvalid },
  },
});
export const input = style({ display: "flex", alignItems: "center", flexGrow: 1, minWidth: 0 });
export const segment = style({
  paddingInline: t.borderWidth, borderRadius: t.segmentRadius, outline: "none", fontVariantNumeric: "tabular-nums",
  selectors: {
    "&[data-placeholder]": { color: t.placeholder },
    '&[data-type="literal"]': { color: t.muted },
    "&[data-focused]": { backgroundColor: t.segmentFocus, color: t.text },
  },
});
export const button = style({
  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: t.buttonSize, height: t.buttonSize,
  borderStyle: "none", borderRadius: t.segmentRadius, backgroundColor: t.transparent, color: t.text, cursor: "default", outline: "none", padding: 0,
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-pressed]": { backgroundColor: t.pressed },
    "&[data-focus-visible]": ring,
    "&[data-disabled]": { opacity: t.disabledOpacity },
  },
});
export const popover = style({
  backgroundColor: t.popover, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.popoverBorder, borderRadius: t.popoverRadius,
  boxShadow: t.popoverShadow, padding: t.popoverPadding, zIndex: t.layer, outline: "none", fontFamily: t.font, fontSize: t.fontSize, color: t.text,
  // React Aria's maximum height is for the whole box (D-111).
  boxSizing: "border-box",
});
export const dialog = style({ outline: "none" });
export const calendar = style({ display: "flex", flexDirection: "column", gap: t.gap });
export const header = style({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.gap });
export const heading = style({ margin: 0, fontSize: t.fontSize, fontWeight: t.headingWeight });
export const grid = style({ borderCollapse: "collapse", width: "auto", marginInline: "auto" });
export const weekday = style({ fontSize: t.captionSize, fontWeight: t.weekdayWeight, color: t.muted, width: t.cell, height: t.cell });
export const cell = style({
  display: "flex", alignItems: "center", justifyContent: "center", width: t.cell, height: t.cell, borderRadius: t.cellRadius, outline: "none", cursor: "default",
  fontVariantNumeric: "tabular-nums",
  selectors: {
    "&[data-outside-month]": { display: "none" },
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-pressed]": { backgroundColor: t.pressed },
    "&[data-focus-visible]": ring,
    "&[data-selected]": { backgroundColor: t.selected, color: t.onSelected },
    "&[data-disabled], &[data-unavailable]": { color: t.muted, opacity: t.disabledOpacity },
  },
});
// The calendar's table is laid out by its cells alone: no borders or padding from table styles elsewhere.
globalStyle(`${calendar} ${grid}`, { borderStyle: "none", borderSpacing: 0, borderCollapse: "collapse", width: "auto" });
globalStyle(`${calendar} ${grid} td, ${calendar} ${grid} th`, { borderStyle: "none", padding: 0, verticalAlign: "middle", textAlign: "center", backgroundColor: t.transparent });
