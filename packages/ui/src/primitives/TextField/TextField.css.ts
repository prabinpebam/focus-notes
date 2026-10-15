import { style, styleVariants } from "@vanilla-extract/css";
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
    // One error treatment (D-135): red, focused or not; focus thickens the red edge instead of adding a blue one.
    "&[data-invalid]": { borderColor: t.borderInvalid },
    "&[data-invalid][data-focused]": { borderColor: t.borderInvalid, boxShadow: `0 0 0 ${t.borderWidth} ${t.borderInvalid}` },
  },
});
/** As tall as the 32 px buttons beside it in a bar (the link editor), or the 40 px field of a dialog or panel (D-111). */
export const size = styleVariants({ m: { height: t.heightCompact }, l: {} });
export const description = style({ color: t.description, fontSize: t.captionSize });
export const error = style({ color: t.error, fontSize: t.fontSize });
/** A label for screen readers only. */
export const hidden = style({ position: "absolute", width: t.srOnlySize, height: t.srOnlySize, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" });
/** Several lines: as tall as about six, growing with what it holds, and only taller by hand (D-143). */
export const area = style({ height: "auto", minHeight: t.areaHeight, paddingBlock: t.paddingBlock, lineHeight: t.lineHeight, resize: "vertical", fieldSizing: "content" } as Parameters<typeof style>[0]);
