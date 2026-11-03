import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.pickerButton;

export const base = style({
  display: "inline-flex", alignItems: "center", gap: t.gap, height: t.height, paddingInline: t.padding, minWidth: 0, maxWidth: "100%",
  borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, backgroundColor: t.background,
  color: t.text, cursor: "pointer", font: "inherit",
  selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
  "@media": { "(hover: hover)": { selectors: { "&[data-hovered]": { backgroundColor: t.backgroundHover } } } },
});
// The value in the chosen writing font (its scope sets font.content).
export const inFont = style({ fontFamily: t.family });
export const value = style({ fontSize: t.fontSize, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
// A theme's swatch: its canvas, its border and its accent, read inside the theme's own scope.
export const swatch = style({
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: t.swatch, height: t.swatch, flexShrink: 0,
  borderRadius: t.swatchRadius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.swatchBorder, backgroundColor: t.swatchCanvas,
});
export const dot = style({ width: "50%", height: "50%", borderRadius: t.swatchRadius, backgroundColor: t.swatchAccent });
// An option in the popover's grid: fills its cell; the chosen one has a full ring.
export const option = style({ width: "100%", justifyContent: "flex-start" });
export const selected = style({ outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.selectedRing, outlineOffset: t.ringOffset });