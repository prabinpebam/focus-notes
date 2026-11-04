import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.divider;

// Its inset is its own padding, the line drawn on its content box: no margin, so its space never
// depends on what's beside it (spacing SP-9).
export const base = style({ flexShrink: 0, borderStyle: "none", margin: 0, boxSizing: "content-box", backgroundColor: t.color, backgroundClip: "content-box" });
export const orientation = styleVariants({
  horizontal: { height: t.width, alignSelf: "stretch", paddingBlock: t.inset },
  vertical: { width: t.width, alignSelf: "stretch", paddingInline: t.inset },
});
