import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics } from "../control.css.ts";

const t = tokens.cmp.pickerButton;

export const base = style({
  ...controlMetrics,
  position: "relative",
  display: "inline-flex", alignItems: "center", gap: t.gap, height: t.height, paddingInline: t.padding, minWidth: 0, maxWidth: "100%",
  borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, backgroundColor: t.background,
  color: t.text, cursor: "pointer", fontFamily: t.uiFont, fontSize: t.fontSize,
  selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
  "@media": { "(hover: hover)": { selectors: { "&[data-hovered]": { backgroundColor: t.backgroundHover } } } },
});
// The value in the chosen writing font (its scope sets font.content).
export const inFont = style({ fontFamily: t.family });
export const value = style({ minWidth: 0, whiteSpace: "nowrap" });
// A theme's swatch: its canvas, its border and its accent, read inside the theme's own scope.
export const swatch = style({
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: t.swatch, height: t.swatch, flexShrink: 0,
  borderRadius: t.swatchRadius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.swatchBorder, backgroundColor: t.swatchCanvas,
});
export const dot = style({ width: "50%", height: "50%", borderRadius: t.swatchRadius, backgroundColor: t.swatchAccent });
// An option in the popover's grid: fills its cell; the chosen one has a full ring.
export const option = style({ width: "100%", justifyContent: "flex-start" });
export const selected = style({ outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.selectedRing, outlineOffset: t.ringOffset });
// A tile (owner, 3 November 18:48): fixed size whatever the value, its small label on top, the value
// drawn (an "Aa" in the font, or a small rendering of the theme) and named under it.
export const tile = style({
  ...controlMetrics,
  position: "relative",
  display: "grid", gridTemplateRows: "auto 1fr auto", gap: t.gap, width: t.tileWidth, height: t.tileHeight, padding: t.tilePadding,
  borderRadius: t.tileRadius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, backgroundColor: t.background,
  color: t.text, cursor: "pointer", fontFamily: t.uiFont, textAlign: "start", flexShrink: 0,
  selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
  "@media": { "(hover: hover)": { selectors: { "&[data-hovered]": { backgroundColor: t.backgroundHover } } } },
});
export const tileTop = style({ display: "flex", alignItems: "center", justifyContent: "space-between", color: t.tileLabel, fontSize: t.tileLabelSize, minWidth: 0 });
export const tileVisual = style({ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, overflow: "hidden" });
export const sample = style({ fontFamily: t.family, fontSize: t.tileSampleSize, lineHeight: t.tileSampleLeading });
export const tileValue = style({ fontSize: t.tileValueSize, minWidth: 0, whiteSpace: "nowrap", textAlign: "center" });
// The theme drawn small: its canvas, two lines of its text and a dot of its accent.
export const preview = style({
  display: "flex", flexDirection: "column", justifyContent: "center", gap: t.previewLine, width: "100%", height: "100%", padding: t.tilePadding,
  boxSizing: "border-box", borderRadius: t.previewRadius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.swatchBorder, backgroundColor: t.swatchCanvas,
});
export const line = style({ height: t.previewLine, width: "70%", borderRadius: t.previewLine, backgroundColor: t.previewText });
export const lineShort = style({ width: "45%" });
export const accentDot = style({ width: t.swatch, height: t.previewLine, borderRadius: t.previewLine, backgroundColor: t.swatchAccent, marginBlockStart: t.previewLine });