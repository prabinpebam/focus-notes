import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.signalDot;

export const base = style({ display: "inline-block", width: t.size, height: t.size, borderRadius: "50%", flexShrink: 0 });
export const tone = styleVariants({
  red: { backgroundColor: t.color.red },
  warning: { backgroundColor: t.color.warning },
  danger: { backgroundColor: t.color.danger },
});
