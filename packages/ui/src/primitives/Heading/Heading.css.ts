import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.heading;

export const base = style({ fontFamily: t.font, fontWeight: t.weight, lineHeight: t.lineHeight, color: t.color, margin: 0 });
export const level = styleVariants({ "1": { fontSize: t.size["1"] }, "2": { fontSize: t.size["2"] }, "3": { fontSize: t.size["3"] } });
