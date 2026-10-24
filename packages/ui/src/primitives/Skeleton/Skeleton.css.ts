import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.skeleton;
const pass = keyframes({ from: { transform: "translateX(-100%)" }, to: { transform: "translateX(100%)" } });

// The shimmer is a transform-only overlay: the shape never repaints, and a finite count of passes
// keeps the motion under 5 seconds (D-208). It runs the other way in right-to-left text.
export const base = style({
  position: "relative",
  display: "block",
  flexShrink: 0,
  overflow: "hidden",
  backgroundColor: t.fill,
  selectors: {
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      backgroundImage: `linear-gradient(to right, ${t.edge}, ${t.highlight}, ${t.edge})`,
      transform: "translateX(-100%)",
      animationName: pass,
      animationDuration: t.duration,
      animationTimingFunction: t.easing,
      animationIterationCount: t.passes,
      animationFillMode: "none",
    },
    "&:dir(rtl)::after": { animationDirection: "reverse" },
    ':root[data-motion="reduced"] &::after': { animationName: "none", display: "none" },
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": { selectors: { "&::after": { animationName: "none", display: "none" } } },
    "(forced-colors: active)": { backgroundColor: t.forcedFill, forcedColorAdjust: "none", selectors: { "&::after": { display: "none" } } },
  },
});
export const line = style({ height: t.line, borderRadius: t.lineRadius, maxWidth: "100%" });
export const width = styleVariants({ full: { width: "100%" }, long: { width: t.width.long }, medium: { width: t.width.medium }, short: { width: t.width.short } });
export const tile = style({ width: t.tile, height: t.tile, borderRadius: t.tileRadius });
export const avatar = style({ width: t.avatar, height: t.avatar, borderRadius: t.avatarRadius });