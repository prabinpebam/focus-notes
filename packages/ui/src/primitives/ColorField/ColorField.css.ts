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
  // The border is an inset outline, so the input fills the control's height as its pointer target (spacing SP-6).
  outlineStyle: "solid",
  outlineWidth: t.borderWidth,
  outlineOffset: `calc(-1 * ${t.borderWidth})`,
  outlineColor: t.border,
  backgroundColor: t.background,
  boxSizing: "border-box",
  selectors: {
    // The ring thickens inside as well as outside, so focus still shows in forced colours, where shadows are dropped.
    "&:focus-within": { outlineColor: t.borderFocus, outlineWidth: t.focusWidth, outlineOffset: `calc(-1 * ${t.focusWidth})`, boxShadow: `0 0 0 ${t.focusWidth} ${t.borderFocus}` },
    // The commit track (F2): the commit colour while it saves, the error colour when it couldn't.
    [`${root}[data-commit="pending"] &`]: { outlineColor: t.borderCommit, boxShadow: `0 0 0 ${t.borderWidth} ${t.borderCommit}` },
    [`${root}[data-commit="failed"] &`]: { outlineColor: t.borderInvalid },
  },
});
export const invalid = style({ outlineColor: t.borderInvalid });
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
  alignSelf: "stretch",
  minWidth: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "none",
  color: t.text,
  fontFamily: t.mono,
  fontSize: t.fontSize,
});
export const description = style({ color: t.description, fontSize: t.captionSize });
export const error = style({ color: t.error, fontSize: t.captionSize });
