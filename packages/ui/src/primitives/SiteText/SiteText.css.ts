import { style, styleVariants } from "@vanilla-extract/css";
import { breakpoints, tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteText;
const compact = `(max-width: ${breakpoints.medium - 1}px)`;

export const base = style({ margin: 0, fontFamily: t.font, color: t.text, textWrap: "balance" });
export const look = styleVariants({
  display: { fontSize: t.size.display, lineHeight: t.lineHeight, fontWeight: t.weightBold, "@media": { [compact]: { fontSize: t.size.displayCompact } } },
  headline: { fontSize: t.size.headline, lineHeight: t.lineHeight, fontWeight: t.weightBold, "@media": { [compact]: { fontSize: t.size.headlineCompact } } },
  lead: { maxWidth: t.measure, fontSize: t.size.lead, lineHeight: t.bodyLineHeight, fontWeight: t.weightRegular, color: t.muted, "@media": { [compact]: { fontSize: t.size.leadCompact } } },
  eyebrow: { fontSize: t.size.eyebrow, lineHeight: t.bodyLineHeight, fontWeight: t.weightSemibold, color: t.accent },
  tile: { fontSize: t.size.tile, lineHeight: t.bodyLineHeight, fontWeight: t.weightSemibold },
  caption: { fontSize: t.size.caption, lineHeight: t.bodyLineHeight, color: t.muted },
});