import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, tokenGroups } from "@focus-notes/tokens";

export const base = style({ display: "flex", flexDirection: "row", minWidth: 0 });
export const wrap = style({ flexWrap: "wrap" });
export const grow = style({ flexGrow: 1 });
export const wrapGap = styleVariants(Object.fromEntries(tokenGroups.space.map((role) => [role, { rowGap: tokens.space[role] }])) as Record<(typeof tokenGroups.space)[number], { rowGap: string }>);
export { gap, padding, align, justify } from "../Stack/Stack.css.ts";
