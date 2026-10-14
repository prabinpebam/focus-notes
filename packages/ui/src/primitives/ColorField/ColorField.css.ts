import { createVar, fallbackVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.colorField;
/** The color typed, painted in the swatch (validated as hex first). */
export const swatchColor = createVar();

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, fontFamily: t.font, fontSize: t.fontSize, minWidth: 0 });
export const label = style({ color: t.label, fontWeight: t.labelWeight });
export const control = style({
  display: "flex",
  alignItems: "center",
  gap: t.rowGap,
  height: t.height,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  boxSizing: "border-box",
  selectors: {
    "&:focus-within": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.borderFocus },
  },
});
export const invalid = style({ borderColor: t.borderInvalid });
export const swatch = style({
  flexShrink: 0,
  width: t.swatchSize,
  height: t.swatchSize,
  borderRadius: t.swatchRadius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.swatchBorder,
  backgroundColor: fallbackVar(swatchColor, t.swatchEmpty),
});
export const input = style({
  flexGrow: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "none",
  color: t.text,
  fontFamily: t.mono,
  fontSize: t.fontSize,
});
export const description = style({ color: t.description, fontSize: t.captionSize });
export const error = style({ color: t.error, fontSize: t.captionSize });
