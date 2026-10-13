import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.shortcut;

export const root = style({ position: "relative", display: "inline-flex", alignItems: "center", gap: t.gap, flexShrink: 0 });

export const cap = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: t.capMinWidth,
  height: t.capHeight,
  paddingInline: t.capPaddingInline,
  borderRadius: t.capRadius,
  borderStyle: "solid",
  borderWidth: t.capBorderWidth,
  borderColor: t.capBorder,
  backgroundColor: t.capBackground,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  fontWeight: t.fontWeight,
  boxSizing: "border-box",
  whiteSpace: "nowrap",
});

/** Read by screen readers, invisible on screen. */
export const spoken = style({
  position: "absolute",
  width: t.srOnlySize,
  height: t.srOnlySize,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
});
