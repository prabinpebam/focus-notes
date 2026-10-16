import { createVar, keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.blockHandle;

/** Where the grip and the boxes sit, written by the component from the editor's geometry. */
export const xVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const yVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const wVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const hVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

const fade = keyframes({ from: { opacity: 0 } });

export const root = style({ position: "fixed", top: 0, left: 0, width: 0, height: 0, zIndex: t.layer });

const placed = style({ position: "fixed", left: xVar, top: yVar });

/** The six-dot grip: 20 × 24 px, 24 px outside the reading column, level with the block's first line. */
export const grip = style([placed, {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.width,
  height: t.height,
  padding: 0,
  margin: 0,
  borderStyle: "none",
  borderRadius: t.radius,
  backgroundColor: t.color.rest,
  color: t.color.icon,
  cursor: "grab",
  outline: "none",
  transform: `translate(calc(-100% - ${t.gap}), -50%)`,
  animationName: fade,
  animationDuration: t.duration,
  animationTimingFunction: t.easing,
  transitionProperty: "background-color, color",
  transitionDuration: t.duration,
  selectors: {
    // A 32 px hit area around the grip.
    "&::before": { content: '""', position: "absolute", inset: `calc((${t.width} - ${t.hit}) / 2)` },
    "&:hover": { backgroundColor: t.color.hover },
    // Pressed answers on pointer-down, in the next frame; open and dragging keep it.
    '&[data-pressed], &[aria-expanded="true"], &[data-dragging]': { backgroundColor: t.color.pressed, color: t.color.onPressed },
    "&:focus-visible": { outlineStyle: "solid", outlineColor: t.color.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
}]);

/** A box over the block: the one the open menu or a drag acts on. Never in the way. */
export const lift = style([placed, { width: wVar, height: hVar, pointerEvents: "none", backgroundColor: t.color.lift, opacity: t.liftOpacity }]);
/** Where the dragged block will land: an accent line between blocks. */
export const drop = style([placed, { width: wVar, height: t.dropLine, pointerEvents: "none", backgroundColor: t.color.drop, transform: "translateY(-50%)" }]);
