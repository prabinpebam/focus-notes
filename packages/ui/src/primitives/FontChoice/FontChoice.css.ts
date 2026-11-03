import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.fontChoice;

// Built like a theme manager tile, at its size (owner, 3 November 19:05): a sample box as tall as its
// swatch, then the full name, so the Font and Theme popovers show the same tiles.
export const base = style({
  display: "flex", flexDirection: "column", alignItems: "stretch", gap: t.gap, width: "100%", padding: t.padding, boxSizing: "border-box",
  borderRadius: t.radius, borderStyle: "none", backgroundColor: t.background,
  color: t.text, cursor: "pointer", textAlign: "start",
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset },
  },
});
// The chosen font: a full ring (no one-sided stripes).
export const selected = style({ outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.selectedRing, outlineOffset: t.ringOffset });
export const sample = style({
  display: "flex", alignItems: "center", justifyContent: "center", height: t.sampleHeight, borderRadius: t.sampleRadius, backgroundColor: t.sampleBackground,
  fontFamily: t.family, fontSize: t.sampleSize, lineHeight: t.sampleLeading,
});
// The full name, never cut: a long one wraps (owner, 3 November 19:05).
export const name = style({ fontFamily: t.nameFont, fontSize: t.nameSize, fontWeight: t.nameWeight, overflowWrap: "anywhere" });
// The popover's grid: equal cells, however long a font's name.
export const grid = style({});
