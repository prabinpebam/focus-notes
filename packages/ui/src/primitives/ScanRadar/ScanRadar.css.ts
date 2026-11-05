import { createVar, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.scanRadar;

/** Where a blip sits on the radar: its angle, from the place's position in the list. */
export const angle = createVar();

const turn = keyframes({ from: { transform: "rotate(0turn)" }, to: { transform: "rotate(1turn)" } });
const pop = keyframes({ from: { transform: "scale(0)", opacity: 0 }, to: { transform: "scale(1)", opacity: t.full } });
const ping = keyframes({ from: { transform: "scale(1)", opacity: t.settled }, to: { transform: "scale(3)", opacity: 0 } });
const settle = keyframes({ from: { opacity: 0, transform: "scale(0.6)" }, to: { opacity: t.full, transform: "scale(1)" } });

const still = { animationName: "none" } as const;
const reduced = ':root[data-motion="reduced"] &';

export const root = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  fontFamily: t.font,
  color: t.text,
  lineHeight: t.lineHeight,
  flexWrap: "wrap",
});

export const radar = style({
  position: "relative",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  width: t.size,
  height: t.size,
  borderRadius: "50%",
  backgroundColor: t.field,
  borderStyle: "solid",
  borderWidth: t.ringWidth,
  borderColor: t.ring,
  boxSizing: "border-box",
  overflow: "hidden",
  isolation: "isolate",
  transitionProperty: "border-color, background-color",
  transitionDuration: t.settle,
  selectors: {
    // The inner rings: a third and two thirds of the way in.
    "&::before, &::after": {
      content: '""',
      position: "absolute",
      borderRadius: "50%",
      borderStyle: "solid",
      borderWidth: t.ringWidth,
      borderColor: t.ring,
      pointerEvents: "none",
    },
    "&::before": { inset: `calc(${t.size} / 6)` },
    "&::after": { inset: `calc(${t.size} / 3)` },
    '&[data-phase="found"]': { borderColor: t.found },
    '&[data-phase="error"]': { borderColor: t.error, backgroundColor: t.errorMuted },
  },
});

// The sweep: a soft wedge of the accent turning once every motion.sweep, only while it looks.
export const sweep = style({
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  backgroundImage: `conic-gradient(from 0turn, ${t.sweepTail} 0turn, ${t.sweepTail} 0.72turn, color-mix(in srgb, ${t.sweep} calc(${t.sweepStrength} * 100%), transparent) 0.995turn, ${t.sweep} 0.995turn, ${t.sweep} 1turn)`,
  animationName: turn,
  animationDuration: t.sweepDuration,
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
  transitionProperty: "opacity",
  transitionDuration: t.settle,
  selectors: {
    [`${radar}:not([data-phase="scanning"]) &`]: { opacity: 0, animationPlayState: "paused" },
    [reduced]: { ...still, display: "none" },
  },
  "@media": { "(prefers-reduced-motion: reduce)": { ...still, display: "none" } },
});

export const core = style({
  position: "relative",
  width: t.core,
  height: t.core,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  backgroundColor: t.coreBackground,
  borderStyle: "solid",
  borderWidth: t.ringWidth,
  borderColor: t.ring,
  color: t.coreColor,
});

// A blip for each place that answered: on its own bearing, halfway between the core and the edge.
export const blip = style({
  position: "absolute",
  inset: `calc(50% - ${t.blip} / 2)`,
  translate: `calc(sin(${angle}) * (${t.size} + ${t.core}) / 4) calc(-1 * cos(${angle}) * (${t.size} + ${t.core}) / 4)`,
  width: t.blip,
  height: t.blip,
  borderRadius: "50%",
  backgroundColor: t.found,
  transform: "scale(1)",
  animationName: pop,
  animationDuration: t.pop,
  animationTimingFunction: t.easing,
  selectors: {
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      backgroundColor: t.found,
      animationName: ping,
      animationDuration: t.pulse,
      animationTimingFunction: t.easing,
      animationIterationCount: 2,
      opacity: 0,
    },
    [reduced]: still,
    [`${reduced}::after`]: { ...still, display: "none" },
  },
  "@media": { "(prefers-reduced-motion: reduce)": { ...still, selectors: { "&::after": { ...still, display: "none" } } } },
});

export const side = style({ display: "flex", flexDirection: "column", gap: `calc(${t.rowGap} + ${t.rowPadding})`, flex: 1, minWidth: t.size });

export const count = style({ fontSize: t.countSize, fontWeight: t.weight });

export const list = style({ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: t.rowGap });

export const row = style({
  display: "grid",
  gridTemplateColumns: `${t.icon} 1fr auto ${t.icon}`,
  alignItems: "center",
  columnGap: t.rowInline,
  paddingBlock: t.rowPadding,
  paddingInline: t.rowInline,
  borderRadius: t.rowRadius,
  fontSize: t.bodySize,
  transitionProperty: "background-color, opacity",
  transitionDuration: t.settle,
  selectors: {
    '&[data-status="found"]': { backgroundColor: t.rowFound },
    '&[data-status="none"]': { opacity: t.settled },
  },
});

export const rowIcon = style({ display: "flex", alignItems: "center", justifyContent: "center", width: t.icon, height: t.icon });
export const name = style({ display: "flex", flexDirection: "column", minWidth: 0 });
export const detail = style({ fontFamily: t.mono, fontSize: t.captionSize, color: t.muted });
export const result = style({ fontSize: t.captionSize, color: t.muted, whiteSpace: "nowrap" });

export const mark = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.icon,
  height: t.icon,
  selectors: { [reduced]: still },
  "@media": { "(prefers-reduced-motion: reduce)": still },
});
export const markTone = styleVariants({
  checking: { color: t.muted },
  found: { color: t.found, animationName: settle, animationDuration: t.settle, animationTimingFunction: t.easing },
  none: { color: t.none },
  error: { color: t.error, animationName: settle, animationDuration: t.settle, animationTimingFunction: t.easing },
});
