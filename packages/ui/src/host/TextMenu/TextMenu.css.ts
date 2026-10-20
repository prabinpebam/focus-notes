import { createVar, style } from "@vanilla-extract/css";

// Where the menu opens: the pointer, in the window's fixed box. It draws nothing itself: the menu is
// the shared command menu's (cmp.menuButton.*).
export const xVar = createVar();
export const yVar = createVar();
export const anchor = style({
  position: "fixed",
  left: xVar,
  top: yVar,
  width: 0,
  height: 0,
  pointerEvents: "none",
});