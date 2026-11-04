import { createVar, fallbackVar, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens, tokenGroups } from "@focus-notes/tokens";

const t = tokens.cmp.positioner;

/** Registered lengths, so the placement code can read the tokens' computed pixels. */
export const gapVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const edgeVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const bandVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
/** Where the content sits, written by the placement code. */
export const xVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const yVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
/** The most room it has, when it's taller than the window allows; what it holds scrolls (D-111). */
export const maxHeightVar = createVar();
export const maxWidthVar = createVar();

const enter = keyframes({ from: { opacity: 0 } });

export const base = style({
  vars: { [edgeVar]: t.edge, [bandVar]: t.topBand },
  position: "fixed",
  left: xVar,
  top: yVar,
  zIndex: t.layer,
  // A column, so what it holds (a panel with a list) shrinks to its limit and the list scrolls.
  display: "flex",
  flexDirection: "column",
  maxHeight: fallbackVar(maxHeightVar, "none"),
  // Never wider than the window less its edges, so it reflows at 320 px (WCAG 1.4.10). Fixed, so
  // the percentage is of the window.
  maxWidth: fallbackVar(maxWidthVar, `calc(100% - 2 * ${edgeVar})`),
  animationName: enter,
  animationDuration: t.duration,
  animationTimingFunction: t.easing,
  selectors: {
    // No anchor (the gallery): in the flow, where it was placed.
    '&[data-placed="static"]': { position: "static" },
    "&[data-offscreen]": { visibility: "hidden" },
    "&[data-selection-popover]": {
      width: tokens.cmp.positioner.promptWidth, left: 0, top: 0,
      transform: `translate3d(${xVar}, ${yVar}, 0)`,
    },
    "&[data-selection-popover][data-edge]": {
      transitionProperty: "transform", transitionDuration: t.duration, transitionTimingFunction: t.easing,
    },
  },
  "@media": { "(prefers-reduced-motion: reduce)": { animationName: "none", transitionDuration: "0s" } },
});

export const offset = styleVariants(Object.fromEntries(tokenGroups.space.map((k) => [k, (tokens.space as unknown as Record<string, string>)[k]])) as Record<(typeof tokenGroups.space)[number], string>, (v) => ({ vars: { [gapVar]: v } }));
export const promptContent = style({
  width: "100%", opacity: t.visible, visibility: "visible",
  maxHeight: "inherit", overflowY: "auto",
  transitionProperty: "opacity, visibility", transitionDuration: t.duration, transitionTimingFunction: t.easing,
  selectors: {
    [`${base}[data-edge] &`]: { position: "absolute", height: 0, overflow: "clip", opacity: 0, visibility: "hidden", pointerEvents: "none" },
  },
  "@media": { "(prefers-reduced-motion: reduce)": { transitionDuration: "0s" } },
});
export const returnAction = style({
  position: "absolute", opacity: 0, visibility: "hidden", pointerEvents: "none",
  transitionProperty: "opacity, visibility", transitionDuration: t.duration, transitionTimingFunction: t.easing,
  selectors: {
    [`${base}[data-edge] &`]: { position: "relative", opacity: t.visible, visibility: "visible", pointerEvents: "auto" },
  },
  "@media": { "(prefers-reduced-motion: reduce)": { transitionDuration: "0s" } },
});
