import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteGrid;

export const root = style({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${t.min}, 1fr))`,
  gap: t.gap,
  width: "100%",
  maxWidth: t.maxWidth,
  marginInline: "auto",
  padding: 0,
  listStyle: "none",
});
export const item = style({ display: "flex" });