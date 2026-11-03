import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.fontChoice;

export const base = style({
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: t.gap, width: "100%", height: t.cellHeight, padding: t.padding, boxSizing: "border-box",
  borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, backgroundColor: t.background,
  color: t.text, cursor: "pointer",
  selectors: { "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
});
// The chosen font: a full ring (no one-sided stripes).
export const selected = style({ outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.selectedRing, outlineOffset: t.ringOffset });
export const sample = style({ fontFamily: t.family, fontSize: t.sampleSize, lineHeight: t.sampleLeading });
export const name = style({ fontFamily: t.family, fontSize: t.nameSize, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
// The popover's grid: equal cells, however long a font's name.
export const grid = style({});
