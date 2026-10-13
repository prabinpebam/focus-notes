import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.liveRegion;

/** Read by screen readers, invisible on screen. */
export const region = style({
  position: "absolute",
  width: t.srOnlySize,
  height: t.srOnlySize,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
});
