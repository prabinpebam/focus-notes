import { createVar, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.positioner;

/** Registered lengths, so the placement code can read the tokens' computed pixels. */
export const gapVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const edgeVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const bandVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
/** Where the content sits, written by the placement code. */
export const xVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const yVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

const enter = keyframes({ from: { opacity: 0 } });

export const base = style({
  vars: { [edgeVar]: t.edge, [bandVar]: t.topBand },
  position: "fixed",
  left: xVar,
  top: yVar,
  zIndex: t.layer,
  display: "flex",
  // Never wider than the window less its edges, so it reflows at 320 px (WCAG 1.4.10). Fixed, so
  // the percentage is of the window.
  maxWidth: `calc(100% - 2 * ${edgeVar})`,
  animationName: enter,
  animationDuration: t.duration,
  animationTimingFunction: t.easing,
  selectors: {
    // No anchor (the gallery): in the flow, where it was placed.
    '&[data-placed="static"]': { position: "static" },
    "&[data-offscreen]": { visibility: "hidden" },
  },
});

export const offset = styleVariants(tokens.space, (v) => ({ vars: { [gapVar]: v } }));
