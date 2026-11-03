import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics } from "../control.css.ts";

const t = tokens.cmp.projectPill;

// As tall as the Backed up button beside it; equal padding at both ends, its words centred on the line.
export const base = style({
  ...controlMetrics,
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: t.gap, flexShrink: 0, minWidth: 0, maxWidth: t.maxWidth, height: t.height,
  paddingInline: t.padding, borderRadius: t.radius, backgroundColor: t.background, color: t.text,
  fontFamily: t.font, fontSize: t.fontSize, fontWeight: t.weight, borderStyle: "none", whiteSpace: "nowrap",
});
export const pressable = style({
  cursor: "pointer",
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
  "@media": { "(hover: hover)": { selectors: { "&:hover": { backgroundColor: t.backgroundHover } } } },
});
export const name = style({ minWidth: 0 });
