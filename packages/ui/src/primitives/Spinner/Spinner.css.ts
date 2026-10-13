import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.spinner;
const spin = keyframes({ to: { transform: "rotate(1turn)" } });

export const base = style({
  display: "inline-block",
  flexShrink: 0,
  borderRadius: "50%",
  borderStyle: "solid",
  borderWidth: t.width,
  borderColor: t.track,
  borderTopColor: t.color,
  boxSizing: "border-box",
  animationName: spin,
  animationDuration: t.duration,
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
});
export const size = styleVariants({ s: { width: t.size.s, height: t.size.s }, m: { width: t.size.m, height: t.size.m } });
