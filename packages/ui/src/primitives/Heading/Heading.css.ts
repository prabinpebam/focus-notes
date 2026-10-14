import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.heading;

// Its box is trimmed to the letters (cap height to baseline), so the space above a title is the
// padding the surface has, not the padding plus the font's leading (D-111, uniform padding).
export const base = style({ fontFamily: t.font, fontWeight: t.weight, lineHeight: t.lineHeight, color: t.color, margin: 0, ...({ textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as Record<string, string>) });
export const level = styleVariants({ "1": { fontSize: t.size["1"] }, "2": { fontSize: t.size["2"] }, "3": { fontSize: t.size["3"] } });
