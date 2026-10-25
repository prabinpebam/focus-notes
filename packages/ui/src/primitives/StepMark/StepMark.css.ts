import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

const t = tokens.cmp.stepMark;
const spin = keyframes({ to: { transform: "rotate(1turn)" } });
// A short window has the compact setup (D-131): the mark steps down to an item card's tile.
const short = `(max-height: ${breakpoints.short - 1}px)`;
/** The ring's room, inside the mark's box, so a turning ring never reaches the text beside it. */
const room = `calc(${t.ringGap} + ${t.ringWidth})`;

export const base = style({
  position: "relative", flexShrink: 0, display: "block",
  width: t.size, height: t.size,
  "@media": { [short]: { width: t.sizeCompact, height: t.sizeCompact } },
});
export const tile = style({ position: "absolute", inset: room, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: t.radius });
export const tone = styleVariants({
  neutral: { backgroundColor: t.neutral.background, color: t.neutral.color },
  accent: { backgroundColor: t.accent.background, color: t.accent.color },
  warning: { backgroundColor: t.warning.background, color: t.warning.color },
  danger: { backgroundColor: t.danger.background, color: t.danger.color },
  success: { backgroundColor: t.success.background, color: t.success.color },
});
export const icon = style({ width: t.icon, height: t.icon, "@media": { [short]: { width: t.iconCompact, height: t.iconCompact } } });
export const compact = style({
  width: t.sizeSmall, height: t.sizeSmall,
  "@media": { [short]: { width: t.sizeSmall, height: t.sizeSmall } },
});
export const compactTile = style({ inset: 0 });
export const compactIcon = style({
  width: t.iconSmall, height: t.iconSmall,
  "@media": { [short]: { width: t.iconSmall, height: t.iconSmall } },
});
// The wait: an arc turning around the tile, the same sign as the Spinner's.
export const ring = style({
  position: "absolute", inset: 0, borderRadius: t.radius,
  borderStyle: "solid", borderWidth: t.ringWidth, borderColor: t.track, borderTopColor: t.ring, boxSizing: "border-box",
  animationName: spin, animationDuration: t.duration, animationTimingFunction: "linear", animationIterationCount: "infinite",
});