import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteSceneToggle;

export const root = style({ display: "flex", flexDirection: "column", alignItems: "center", gap: t.gap, width: "100%" });
export const darkInput = style({});
// Light shows until Dark is chosen (D-176); a hidden scene isn't read and, lazy, isn't loaded.
export const light = style({ width: "100%", selectors: { [`${root}:has(${darkInput}:checked) &`]: { display: "none" } } });
export const dark = style({ width: "100%", display: "none", selectors: { [`${root}:has(${darkInput}:checked) &`]: { display: "block" } } });

export const group = style({
  display: "inline-flex",
  margin: 0,
  padding: t.padding,
  gap: t.padding,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  borderRadius: t.radius,
  backgroundColor: t.background,
});
// The group's name for assistive technology only: the two choices say what they are.
export const legend = style({ position: "absolute", width: t.borderWidth, height: t.borderWidth, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" });
// The radio itself is kept in the page for the keyboard and screen readers, and drawn by its label.
export const input = style({ position: "absolute", opacity: 0, width: t.borderWidth, height: t.borderWidth, margin: 0 });
export const option = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: t.height,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  fontFamily: t.font,
  fontSize: t.fontSize,
  fontWeight: t.weight,
  color: t.text,
  cursor: "pointer",
  selectors: {
    [`${input}:checked + &`]: { backgroundColor: t.selected, color: t.selectedText },
    [`${input}:focus-visible + &`]: { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset },
  },
});