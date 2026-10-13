import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.field;

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, fontFamily: t.font });
export const label = style({ color: t.label, fontSize: t.labelSize, fontWeight: t.labelWeight });
export const description = style({ color: t.description, fontSize: t.captionSize });
export const error = style({ color: t.error, fontSize: t.captionSize });
