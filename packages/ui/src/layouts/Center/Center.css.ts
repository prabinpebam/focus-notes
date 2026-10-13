import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

export const base = style({ display: "flex", flexDirection: "column", width: "100%", marginInline: "auto", boxSizing: "border-box" });
export const maxWidth = styleVariants({
  measure: { maxWidth: tokens.layout.measure },
  wideContent: { maxWidth: tokens.layout.wideContent },
  popover: { maxWidth: tokens.layout.popover },
  dialogS: { maxWidth: tokens.layout.dialogS },
  dialogL: { maxWidth: tokens.layout.dialogL },
});
export const gutter = styleVariants({
  none: {},
  regular: { paddingInline: tokens.layout.gutter, "@media": { [`(max-width: ${breakpoints.medium - 1}px)`]: { paddingInline: tokens.layout.gutterCompact } } },
});
