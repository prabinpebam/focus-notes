import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.projectMark;

export const base = style({
  flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
  borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: "transparent",
});
export const size = styleVariants({
  s: { width: t.size.s, height: t.size.s }, m: { width: t.size.m, height: t.size.m }, l: { width: t.size.l, height: t.size.l },
  xl: { width: t.size.xl, height: t.size.xl }, watermark: { width: t.size.watermark, height: t.size.watermark },
});
export const glyphSize = styleVariants({
  s: { width: t.glyph.s, height: t.glyph.s }, m: { width: t.glyph.m, height: t.glyph.m }, l: { width: t.glyph.l, height: t.glyph.l },
  xl: { width: t.glyph.xl, height: t.glyph.xl }, watermark: { width: t.glyph.watermark, height: t.glyph.watermark },
});
export const plate = styleVariants({
  tint: { backgroundColor: t.background, color: t.color },
  neutral: { backgroundColor: t.plate, borderColor: t.plateBorder, color: t.color },
  solid: { backgroundColor: t.color, color: t.onSolid },
});
// The chosen preset: a full ring around it (no one-sided stripes).
export const selected = style({ outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.selectedRing, outlineOffset: t.focusOffset });
export const glyph = style({ display: "block", objectFit: "contain" });
export const initials = style({ fontWeight: t.weight, color: t.color });
// The watermark is a mark, not a plate: faint, never in the way, and gone where it would cost clarity (D-313).
export const watermark = style({
  backgroundColor: "transparent", opacity: t.watermarkOpacity, pointerEvents: "none",
  selectors: { [`:root[data-contrast="more"] &, :root[data-transparency="reduced"] &`]: { display: "none" } },
  "@media": { "(forced-colors: active)": { display: "none" } },
});
// A choice in a picker: a native toggle button, its ring the app's focus ring.
export const choice = style({
  cursor: "pointer", padding: 0, font: "inherit",
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset } },
});
