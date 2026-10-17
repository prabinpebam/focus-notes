import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.text;

export const base = style({ fontFamily: t.font, lineHeight: t.lineHeight, margin: 0, overflowWrap: "anywhere" });
// Leading a row of buttons (the link card): inset like their labels, inside their padding and border (D-111).
export const inset = styleVariants({
  none: {},
  control: { paddingInline: `calc(${t.controlInset} + ${t.controlBorder})` },
});
export const role = styleVariants({
  caption: { fontSize: t.size.caption },
  secondary: { fontSize: t.size.secondary },
  body: { fontSize: t.size.body },
  label: { fontSize: t.size.label, fontWeight: t.weight.strong },
  emphasis: { fontSize: t.size.emphasis },
  title: { fontSize: t.size.title, fontWeight: t.weight.strong },
  // A full-window onboarding step's body (D-126).
  lead: { fontSize: t.size.lead },
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
// Pressable (D-189): no button chrome, so it reads as the text it is; underlined on hover, ringed on focus.
export const link = style({
  appearance: "none",
  border: 0,
  padding: 0,
  background: "none",
  textAlign: "start",
  cursor: "pointer",
  maxWidth: "100%",
  borderRadius: t.link.radius,
  outline: "none",
  selectors: {
    "&:hover": { textDecorationLine: "underline" },
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.link.focusWidth, outlineOffset: t.link.focusOffset, outlineColor: t.link.focusRing },
  },
});
