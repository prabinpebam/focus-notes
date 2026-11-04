import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.emptyState;
export const root = style({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: t.gap, padding: t.padding, boxSizing: "border-box", textAlign: "center", fontFamily: t.font, lineHeight: t.lineHeight });
export const size = styleVariants({ component: { minHeight: t.minHeight.component }, section: { minHeight: t.minHeight.section }, view: { minHeight: t.minHeight.view } });
export const tile = style({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: t.iconTile, height: t.iconTile, borderRadius: t.radius, backgroundColor: t.iconBackground, color: t.icon, fontSize: t.iconSize, selectors: { '[data-tone="good"] > &': { backgroundColor: t.goodBackground, color: t.goodIcon } } });
export const title = style({ fontSize: t.titleSize, fontWeight: t.titleWeight, color: t.title, maxWidth: t.maxWidth });
export const detail = style({ fontSize: t.detailSize, color: t.detail, maxWidth: t.maxWidth });
// The action stands further from the words than they do from each other: its own box holds that room (spacing SP-9).
export const action = style({ display: "inline-flex", paddingBlockStart: t.actionGap });
