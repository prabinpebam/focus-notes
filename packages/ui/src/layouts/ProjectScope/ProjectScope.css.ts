import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.projectScope;

export const base = style({ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, color: t.text });
export const grow = style({ flexGrow: 1 });
export const part = styleVariants({
  window: { backgroundColor: t.background, borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, boxShadow: t.shadow, overflow: "hidden", position: "relative" },
  band: { backgroundColor: t.band },
  plain: {},
});
