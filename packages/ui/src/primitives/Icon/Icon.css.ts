import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.icon;

export const base = style({ flexShrink: 0, display: "inline-block", verticalAlign: "middle", color: "currentColor" });
export const size = styleVariants({
  s: { width: t.size.s, height: t.size.s },
  m: { width: t.size.m, height: t.size.m },
  l: { width: t.size.l, height: t.size.l },
});
