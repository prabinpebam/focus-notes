import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

// D-408: the app-wide icon column and a content column; inside the content, title and its line (pair) < details
// (item) < title to details (group) < actions (the largest, never more than the card's inset).
export const base = style({ display: "flex", alignItems: "flex-start", gap: tokens.space.inlineGroup, minWidth: 0 });
export const icon = style({ display: "flex", flex: "none" });
export const content = style({ display: "flex", flexDirection: "column", gap: tokens.cmp.iconLayout.actionsGap, flex: "1 1 auto", minWidth: 0 });
export const main = style({ display: "flex", flexDirection: "column", gap: tokens.space.stackGroup, minWidth: 0 });
export const header = style({ display: "flex", flexDirection: "column", gap: tokens.space.stackPair, minWidth: 0 });
export const body = style({ display: "flex", flexDirection: "column", gap: tokens.space.stackItem, minWidth: 0 });
export const actions = style({ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: tokens.space.inlineItem });
