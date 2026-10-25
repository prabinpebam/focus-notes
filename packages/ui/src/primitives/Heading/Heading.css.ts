import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

const t = tokens.cmp.heading;

// Its box is trimmed to the letters (cap height to baseline), so the space above a title is the
// padding the surface has, not the padding plus the font's leading (D-111, uniform padding).
export const base = style({ fontFamily: t.font, fontWeight: t.weight, lineHeight: t.lineHeight, color: t.color, margin: 0, ...({ textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as Record<string, string>) });
export const level = styleVariants({ "1": { fontSize: t.size["1"] }, "2": { fontSize: t.size["2"] }, "3": { fontSize: t.size["3"] }, display: { fontSize: t.size.display, lineHeight: t.displayLineHeight, "@media": { [`(max-height: ${breakpoints.short - 1}px)`]: { fontSize: t.size.displayShort } } } });
// Its text a button (D-189): the heading's own type, no button chrome; muted on hover (a heading is never underlined), ringed on focus.
export const press = style({
  appearance: "none",
  border: 0,
  padding: 0,
  margin: 0,
  background: "none",
  font: "inherit",
  color: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: t.press.gap,
  cursor: "pointer",
  borderRadius: t.press.radius,
  outline: "none",
  selectors: {
    "&:hover": { color: t.press.hoverColor },
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.press.focusWidth, outlineOffset: t.press.focusOffset, outlineColor: t.press.focusRing },
  },
});
