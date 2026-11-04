import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.statusRow;

export const base = style({
  display: "flex", alignItems: "flex-start", gap: t.gap, paddingBlock: t.paddingBlock, paddingInline: t.paddingInline, borderRadius: t.radius,
  fontFamily: t.font, fontSize: t.size, lineHeight: t.lineHeight, color: t.text,
});
export const tone = styleVariants({
  danger: { backgroundColor: t.danger.background },
  warning: { backgroundColor: t.warning.background },
  info: { backgroundColor: t.info.background },
  success: { backgroundColor: t.success.background },
});
export const iconTone = styleVariants({
  danger: { color: t.danger.icon },
  warning: { color: t.warning.icon },
  info: { color: t.info.icon },
  success: { color: t.success.icon },
});
// The icon sits on the first line of the sentence: a line is the font's size times its line height.
export const icon = style({ flexShrink: 0, width: t.icon, height: t.icon, marginBlock: `calc((${t.size} * ${t.lineHeight} - ${t.icon}) / 2)` });
export const text = style({ minWidth: 0, overflowWrap: "anywhere" });
export const content = style({ display: "flex", flexDirection: "column", gap: t.actionGap, minWidth: 0, flex: 1 });
export const actions = style({ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: t.actionGap });
export const details = style({ fontSize: t.detailSize, color: t.detail, overflowWrap: "anywhere" });
export const summary = style({
  cursor: "pointer", borderRadius: t.summaryRadius,
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset } },
});
export const detailsBody = style({ display: "block", marginBlockStart: t.actionGap });
