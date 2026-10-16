import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteSection;

export const base = style({ display: "flex", flexDirection: "column", gap: t.gap, scrollMarginBlockStart: t.scrollMargin });
// The showcases: centred, with room around them, the screenshot last and widest (D-174).
const showcase = { alignItems: "center", textAlign: "center", gap: t.heroGap, paddingBlock: t.showcaseBlock } as const;
export const tone = styleVariants({
  plain: {},
  band: { backgroundColor: t.band, borderRadius: t.bandRadius, padding: t.bandPadding },
  hero: showcase,
  feature: showcase,
  tile: { flexGrow: 1, gap: t.tileGap, alignItems: "flex-start", textAlign: "start", backgroundColor: t.tile, borderRadius: t.tileRadius, padding: t.tilePadding },
});