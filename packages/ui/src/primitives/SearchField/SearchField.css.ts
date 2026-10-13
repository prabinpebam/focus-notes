import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.searchField;

export const root = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  height: t.height,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  boxSizing: "border-box",
  selectors: {
    "&:focus-within": { borderColor: t.borderFocus, boxShadow: `0 0 0 ${t.borderWidth} ${t.borderFocus}` },
  },
});

export const icon = style({ display: "inline-flex", color: t.icon, flexShrink: 0 });

export const input = style({
  flexGrow: 1,
  minWidth: 0,
  height: "100%",
  padding: 0,
  borderStyle: "none",
  outline: "none",
  backgroundColor: t.background,
  color: t.text,
  font: "inherit",
  appearance: "none",
});
globalStyle(`${input}::placeholder`, { color: t.placeholder });
globalStyle(`${input}::-webkit-search-cancel-button`, { display: "none" });

export const clear = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.clearSize,
  height: t.clearSize,
  padding: 0,
  borderStyle: "none",
  borderRadius: t.clearRadius,
  backgroundColor: t.background,
  color: t.icon,
  cursor: "default",
  outline: "none",
  flexShrink: 0,
  selectors: {
    [`${root}[data-empty] &`]: { visibility: "hidden" },
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.borderFocus },
  },
});
