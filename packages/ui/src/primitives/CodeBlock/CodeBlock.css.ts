import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.codeBlock;

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, minWidth: 0 });
export const label = style({ fontFamily: t.labelFont, fontSize: t.labelSize, color: t.labelColor, lineHeight: t.lineHeight });
export const box = style({
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.gap, minWidth: 0,
  backgroundColor: t.background, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, borderRadius: t.radius,
});
export const box_ = styleVariants({
  m: { padding: t.padding.m, paddingInlineStart: t.paddingInlineStart.m },
  l: { padding: t.padding.l, paddingInlineStart: t.paddingInlineStart.l },
});
export const code = style({ fontFamily: t.font, color: t.color, lineHeight: t.lineHeight, overflowWrap: "anywhere", minWidth: 0, userSelect: "text" });
export const code_ = styleVariants({ m: { fontSize: t.size.m }, l: { fontSize: t.size.l, fontWeight: t.weight.l } });
