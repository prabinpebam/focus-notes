import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.textField;

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, fontFamily: t.font });
export const label = style({ color: t.label, fontSize: t.labelSize, fontWeight: t.labelWeight });
export const input = style({
  height: t.height,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  color: t.text,
  font: "inherit",
  fontSize: t.fontSize,
  outline: "none",
  boxSizing: "border-box",
  selectors: {
    "&::placeholder": { color: t.placeholder },
    "&[data-focused]": { borderColor: t.borderFocus, boxShadow: `0 0 0 ${t.borderWidth} ${t.borderFocus}` },
    "&[data-invalid]": { borderColor: t.borderInvalid },
  },
});
export const description = style({ color: t.description, fontSize: t.captionSize });
