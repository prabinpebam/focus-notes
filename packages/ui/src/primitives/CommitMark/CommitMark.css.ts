import { keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.commitMark;

const draw = keyframes({ from: { strokeDashoffset: 1 }, to: { strokeDashoffset: 0 } });
const grow = keyframes({ from: { transform: "scale(0.6)", opacity: 0 }, to: { transform: "scale(1)", opacity: 1 } });

/** One fixed box: the spinner, the tick and the error icon take turns in it, so nothing beside it moves. */
export const slot = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: t.size,
  height: t.size,
});
export const tick = style({ width: t.size, height: t.size, overflow: "visible" });
export const circle = style({
  fill: t.tickFill,
  stroke: t.tick,
  strokeWidth: t.stroke,
  transformOrigin: "center",
  animationName: grow,
  animationDuration: t.draw,
  animationTimingFunction: t.easing,
  animationFillMode: "both",
});
// The check draws itself after the circle lands; under reduced motion both durations are zero, so it's simply there.
export const check = style({
  fill: "none",
  stroke: t.tick,
  strokeWidth: t.stroke,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeDasharray: 1,
  animationName: draw,
  animationDuration: t.draw,
  animationDelay: `calc(${t.draw} / 2)`,
  animationTimingFunction: t.easing,
  animationFillMode: "both",
});
export const failed = style({ width: t.size, height: t.size, color: t.failed });

/** Below a field or a switch: what happened, then Retry and Revert, on one line that wraps. */
export const failure = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: t.gap,
  fontFamily: t.font,
  fontSize: t.fontSize,
  lineHeight: t.lineHeight,
});
export const failText = style({ color: t.failText, minWidth: 0, overflowWrap: "anywhere" });
