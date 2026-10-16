import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteFigure;

// The window's corners and a soft shadow; a dark window on a dark page glows instead, so it stands out (D-176).
export const root = style({
  display: "block",
  width: "100%",
  maxWidth: t.maxWidth,
  marginInline: "auto",
  borderRadius: t.radius,
  overflow: "hidden",
  boxShadow: t.shadow,
  "@media": { "(prefers-color-scheme: dark)": { selectors: { '&[data-tone="dark"]': { boxShadow: t.glow } } } },
});
export const image = style({ display: "block", width: "100%", height: "auto" });