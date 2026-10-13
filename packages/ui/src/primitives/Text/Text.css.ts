import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.text;

export const base = style({ fontFamily: t.font, lineHeight: t.lineHeight, margin: 0, overflowWrap: "anywhere" });
export const role = styleVariants({
  caption: { fontSize: t.size.caption },
  secondary: { fontSize: t.size.secondary },
  body: { fontSize: t.size.body },
  label: { fontSize: t.size.label, fontWeight: t.weight.strong },
  emphasis: { fontSize: t.size.emphasis },
  title: { fontSize: t.size.title, fontWeight: t.weight.strong },
});
export const tone = styleVariants({
  default: { color: t.color.default },
  muted: { color: t.color.muted },
  accent: { color: t.color.accent },
  danger: { color: t.color.danger },
  warning: { color: t.color.warning },
  success: { color: t.color.success },
});
export const lines = styleVariants({
  none: {},
  one: { display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" },
  two: { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  three: { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" },
});
