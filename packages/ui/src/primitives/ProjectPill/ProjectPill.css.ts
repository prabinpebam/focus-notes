import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.projectPill;

export const base = style({
  display: "inline-flex", alignItems: "center", gap: t.gap, minWidth: 0, maxWidth: t.maxWidth, height: t.height,
  paddingInline: t.padding, borderRadius: t.radius, backgroundColor: t.background, color: t.text,
  fontSize: t.fontSize, fontWeight: t.weight, borderStyle: "none",
});
export const pressable = style({
  cursor: "pointer", font: "inherit",
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
  "@media": { "(hover: hover)": { selectors: { "&:hover": { backgroundColor: t.backgroundHover } } } },
});
export const name = style({ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
