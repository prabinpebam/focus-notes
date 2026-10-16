import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteSection;

export const base = style({ display: "flex", flexDirection: "column", gap: t.gap, scrollMarginBlockStart: t.scrollMargin });
export const tone = styleVariants({
  plain: {},
  band: { backgroundColor: t.band, borderRadius: t.bandRadius, padding: t.bandPadding },
});