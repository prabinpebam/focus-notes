import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.versionPane;

// Side by side while they fit, one above the other in narrow windows (Feedback → Conflict resolver).
export const pane = style({
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  flex: "1 1 0",
  minWidth: `min(100%, ${t.minWidth})`,
  boxSizing: "border-box",
  margin: 0,
  padding: t.padding,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  borderRadius: t.radius,
  backgroundColor: t.background,
  color: t.text,
});
export const heading = style({ margin: 0, fontFamily: t.headingFont, fontSize: t.headingSize, fontWeight: t.headingWeight, color: t.headingColor });
export const blocks = style({ display: "flex", flexDirection: "column", gap: t.gap, margin: 0, padding: 0, listStyle: "none" });
export const block = style({
  margin: 0,
  paddingInline: t.blockPadding,
  fontFamily: t.font,
  fontSize: t.size,
  lineHeight: t.lineHeight,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  borderRadius: t.blockRadius,
  borderInlineStartStyle: "solid",
  borderInlineStartWidth: t.markWidth,
  borderInlineStartColor: "transparent",
});
export const changed = style({ backgroundColor: t.changed, borderInlineStartColor: t.changedMark });
export const empty = style({ margin: 0, fontFamily: t.headingFont, fontSize: t.size, color: t.muted });
export const hidden = style({ position: "absolute", width: t.srOnlySize, height: t.srOnlySize, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" });
