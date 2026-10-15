import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

const t = tokens.cmp.stepMark;
const spin = keyframes({ to: { transform: "rotate(1turn)" } });
// A short window has the compact setup (D-131): the mark steps down to an item card's tile.
const short = `(max-height: ${breakpoints.short - 1}px)`;

export const base = style({
  position: "relative", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  width: t.size, height: t.size, borderRadius: t.radius,
  "@media": { [short]: { width: t.sizeCompact, height: t.sizeCompact } },
});
export const tone = styleVariants({
  neutral: { backgroundColor: t.neutral.background, color: t.neutral.color },
  accent: { backgroundColor: t.accent.background, color: t.accent.color },
  danger: { backgroundColor: t.danger.background, color: t.danger.color },
  success: { backgroundColor: t.success.background, color: t.success.color },
});
export const icon = style({ width: t.icon, height: t.icon, "@media": { [short]: { width: t.iconCompact, height: t.iconCompact } } });
// The wait: an arc turning just outside the tile, the same sign as the Spinner's.
export const ring = style({
  position: "absolute", inset: `calc(-1 * (${t.ringGap} + ${t.ringWidth}))`, borderRadius: "50%",
  borderStyle: "solid", borderWidth: t.ringWidth, borderColor: t.track, borderTopColor: t.ring, boxSizing: "border-box",
  animationName: spin, animationDuration: t.duration, animationTimingFunction: "linear", animationIterationCount: "infinite",
});
