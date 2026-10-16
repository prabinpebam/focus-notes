import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.sitePage;

export const base = style({ display: "flex", flexDirection: "column", gap: t.edge, scrollMarginBlockStart: t.gap });
export const tone = styleVariants({
  plain: {},
  band: { backgroundColor: t.band, borderRadius: t.sectionRadius, padding: t.gap },
});
