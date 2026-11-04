import { createVar, keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.toolbarComposer;

/** The dragged button's position over the composer, written on every pointer move without a render. */
export const ghostX = createVar();
export const ghostY = createVar();

const reduced = ':root[data-motion="reduced"] &';
const still = { animationName: "none" } as const;

// Nothing moves: the slot under a held drag waits motion.hold, then lifts (animationend). A timing, kept in reduced motion.
const holdTimer = keyframes({ from: { outlineColor: t.marker }, to: { outlineColor: t.marker } });
const grow = keyframes({ from: { maxWidth: 0, opacity: 0, transform: "scale(0.5)", marginInlineEnd: `calc(-1 * ${t.gap.toolbar})` }, to: { maxWidth: t.ghostSize } });
const collapse = keyframes({ from: { maxWidth: t.ghostSize }, to: { maxWidth: 0, opacity: 0, transform: "scale(0.5)", marginInlineEnd: `calc(-1 * ${t.gap.toolbar})` } });
const dropIn = keyframes({ from: { opacity: 0, transform: `translateY(calc(-1 * ${t.lift})) scale(0.6)` } });
const sinkOut = keyframes({
  from: { opacity: t.lifted, transform: `translateY(${t.lift}) scale(0.85)` },
  to: { opacity: 0, transform: `translateY(calc(2 * ${t.lift})) scale(0.6)` },
});
const markerIn = keyframes({ from: { opacity: 0, transform: "translate(-50%, -50%) scaleY(0.4)" } });

export const root = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: t.gap.stage,
  fontFamily: t.font,
  lineHeight: t.lineHeight,
  userSelect: "none",
  selectors: { "&[data-dragging]": { cursor: "grabbing" } },
});

export const srOnly = style({ position: "absolute", width: t.srOnlySize, height: t.srOnlySize, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" });

export const stage = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: t.gap.group,
  padding: t.stagePadding,
  borderRadius: t.stageRadius,
  backgroundColor: t.stageBackground,
});

export const count = style({ alignSelf: "flex-end", fontSize: t.countSize, color: t.heading, selectors: { "&[data-full]": { color: t.markerFull } } });

export const slot = style({
  position: "relative",
  display: "inline-flex",
  touchAction: "none",
  "::before": {
    content: '""', position: "absolute", inset: 0, pointerEvents: "none",
    borderStyle: "solid", borderWidth: t.slotBorderWidth, borderColor: t.slotBorder,
    borderRadius: t.slotRadius,
  },
  selectors: {
    "[data-dragging] &": { pointerEvents: "none" },
    "&[data-origin]": { opacity: t.origin },
    "&[data-holding]": { animationName: holdTimer, animationDuration: t.hold, animationTimingFunction: "linear" },
    '&[data-entering="insert"]': { overflow: "clip", animationName: grow, animationDuration: t.move, animationTimingFunction: t.easeOut },
    '&[data-entering="replace"]': { animationName: dropIn, animationDuration: t.leave, animationTimingFunction: t.easeOut },
    "&[data-leaving]": { overflow: "clip", pointerEvents: "none", animationName: collapse, animationDuration: t.leave, animationTimingFunction: t.easeIn, animationFillMode: "forwards" },
  },
});

export const displaced = style({
  display: "inline-flex",
  transitionProperty: "transform, opacity",
  transitionDuration: t.move,
  transitionTimingFunction: t.easing,
  selectors: { [`${slot}[data-lifted] > &`]: { opacity: t.lifted, transform: `translateY(${t.lift})` } },
});

// The replaced button, over the slot the new one takes: it carries on down, fades and is gone.
export const outgoing = style({
  position: "absolute",
  inset: 0,
  display: "flex",
  pointerEvents: "none",
  animationName: sinkOut,
  animationDuration: t.leave,
  animationTimingFunction: t.easeIn,
  animationFillMode: "forwards",
});

export const marker = style({
  position: "absolute",
  top: "50%",
  width: t.markerWidth,
  height: t.markerHeight,
  borderRadius: t.markerRadius,
  backgroundColor: t.marker,
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
  animationName: markerIn,
  animationDuration: t.move,
  animationTimingFunction: t.easeOut,
  selectors: {
    '&[data-side="before"]': { left: `calc(-1 * ${t.gap.toolbar} / 2)` },
    '&[data-side="after"]': { left: `calc(100% + ${t.gap.toolbar} / 2)` },
    // Full: the marker turns red and a drop between buttons does nothing.
    "&[data-full]": { backgroundColor: t.markerFull },
    [reduced]: still,
  },
  "@media": { "(prefers-reduced-motion: reduce)": still },
});

export const empty = style({ display: "inline-flex", width: t.ghostSize, height: t.ghostSize, position: "relative" });

export const catalogue = style({
  display: "flex",
  flexDirection: "column",
  gap: t.gap.groups,
  padding: t.cellPadding,
  borderRadius: t.stageRadius,
  transitionProperty: "background-color",
  transitionDuration: t.move,
  // A toolbar button dragged here comes off the toolbar when dropped.
  selectors: { "&[data-leaving]": { backgroundColor: t.leaving } },
});

export const group = style({ display: "flex", flexDirection: "column", gap: t.gap.group });

export const heading = style({ margin: 0, fontSize: t.headingSize, fontWeight: t.headingWeight, color: t.heading });

export const grid = style({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(${t.cellMin}, 1fr))`,
  gap: t.gap.cells,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const cell = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap.cell,
  padding: t.cellPadding,
  borderRadius: t.cellRadius,
  touchAction: "none",
  cursor: "grab",
  selectors: {
    "[data-dragging] &": { pointerEvents: "none" },
    "&[data-origin]": { opacity: t.origin },
  },
});

export const label = style({ fontSize: t.labelSize, color: t.label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });

export const ghost = style({
  position: "absolute",
  top: 0,
  left: 0,
  width: t.ghostSize,
  height: t.ghostSize,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  borderRadius: t.cellRadius,
  borderStyle: "solid",
  borderWidth: t.ghostBorderWidth,
  borderColor: t.ghostBorder,
  backgroundColor: t.ghostBackground,
  boxShadow: t.ghostShadow,
  color: t.ghostColor,
  pointerEvents: "none",
  zIndex: t.ghostLayer,
  transform: `translate(calc(${ghostX} - ${t.ghostSize} / 2), calc(${ghostY} - ${t.ghostSize} / 2))`,
});
