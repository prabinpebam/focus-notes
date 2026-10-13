import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.divider;

export const base = style({ flexShrink: 0, borderStyle: "none", margin: 0, backgroundColor: t.color });
export const orientation = styleVariants({
  horizontal: { height: t.width, alignSelf: "stretch", marginBlock: t.inset },
  vertical: { width: t.width, alignSelf: "stretch", marginInline: t.inset },
});
