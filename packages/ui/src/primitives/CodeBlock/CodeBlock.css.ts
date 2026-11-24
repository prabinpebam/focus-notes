import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.codeBlock;

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, minWidth: 0 });
export const label = style({ fontFamily: t.labelFont, fontSize: t.labelSize, color: t.labelColor, lineHeight: t.lineHeight });
export const box = style({
  display: "flex", alignItems: "center", gap: t.copyGap, minWidth: 0,
  backgroundColor: t.background, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, borderRadius: t.radius,
});
export const box_ = styleVariants({
  m: { paddingBlock: t.padding.m, paddingInlineStart: t.paddingInlineStart.m, paddingInlineEnd: t.paddingInlineEnd.m },
  l: { paddingBlock: t.padding.l, paddingInlineStart: t.paddingInlineStart.l, paddingInlineEnd: t.paddingInlineEnd.l },
});
export const copy = style({ display: "flex", flexShrink: 0 });
export const code = style({
  display: "block", flex: "1 1 auto", paddingBlock: t.codePadding,
  fontFamily: t.font, color: t.color, lineHeight: t.lineHeight, overflowWrap: "anywhere",
  whiteSpace: "pre-wrap", minWidth: 0, userSelect: "text",
});
export const code_ = styleVariants({ m: { fontSize: t.size.m }, l: { fontSize: t.size.l, fontWeight: t.weight.l } });
