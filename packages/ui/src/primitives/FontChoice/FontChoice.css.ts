import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.fontChoice;

export const base = style({
  display: "inline-flex", flexDirection: "column", alignItems: "center", gap: t.gap, minWidth: t.minWidth, padding: t.padding,
  borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, backgroundColor: t.background,
  color: t.text, cursor: "pointer",
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
});
// The chosen font: a full ring (no one-sided stripes).
export const selected = style({ outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.selectedRing, outlineOffset: t.ringOffset });
export const sample = style({ fontFamily: t.family, fontSize: t.sampleSize, lineHeight: t.sampleLeading });
export const name = style({ fontFamily: t.family, fontSize: t.nameSize });
