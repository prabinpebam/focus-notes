import { createVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.morphPanel;

/** The open size, measured from the content (registered so it can be transitioned). */
export const openWidth = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const openHeight = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

// Closed, the panel is the trigger's circle; open, it's the toolbar's frosted shape. Size, radius,
// and surface all transition together, so the circle visibly becomes the toolbar (UI-10).
export const root = style({
  position: "relative",
  width: t.closedSize,
  height: t.closedSize,
  borderRadius: `calc(${t.closedSize} / 2)`,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.transparent,
  backgroundColor: t.transparent,
  boxShadow: t.shadowNone,
  boxSizing: "border-box",
  zIndex: t.layer,
  transitionProperty: "width, height, border-radius, background-color, border-color, box-shadow",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-open]": {
      width: openWidth,
      height: openHeight,
      borderRadius: t.radius,
      borderColor: t.border,
      backgroundColor: `color-mix(in srgb, ${t.background} calc(${t.opacity} * 100%), transparent)`,
      backdropFilter: `blur(${t.blur})`,
      boxShadow: t.shadow,
      // Clipped, never scrolled: focus moving to an action while the shape still grows (a slow machine)
      // would otherwise scroll it, shifting the buttons and closing their tooltip.
      overflow: "clip",
    },
    // One floating thing at a time in the title bar: while the Snap Layouts picker is open (reached
    // by Tab from the toolbar), the open toolbar steps back rather than sit under it (D-119).
    ":root:has([data-picker-open]) &[data-open]": { visibility: "hidden" },
  },
});

// The trigger shrinks and fades into the middle of the panel as it opens.
export const triggerSlot = style({
  position: "absolute",
  // Over the panel's border too, so the trigger keeps its full size.
  inset: `calc(-1 * ${t.borderWidth})`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transitionProperty: "opacity, transform",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: { [`${root}[data-open] > &`]: { opacity: 0, transform: "scale(0)", pointerEvents: "none" } },
});

// The content sits centered at the panel's top at its natural size, so it stays put while the
// shape grows around it, and fades in once the shape settles.
export const content = style({
  position: "absolute",
  top: 0,
  left: "50%",
  width: "max-content",
  padding: t.padding,
  boxSizing: "border-box",
  opacity: 0,
  visibility: "hidden",
  transform: "translateX(-50%) scale(0.9)",
  transformOrigin: "top center",
  outline: "none",
  // Closing: fade first, then hide. Opening: visible at once (so focus can move in), then fade in
  // once the shape has grown.
  transitionProperty: "opacity, transform, visibility",
  transitionDuration: `${t.contentDuration}, ${t.contentDuration}, 0s`,
  transitionDelay: `0s, 0s, ${t.contentDuration}`,
  transitionTimingFunction: t.easing,
  selectors: {
    [`${root}[data-open] > &`]: { opacity: t.visible, visibility: "visible", transform: "translateX(-50%) scale(1)", transitionDelay: `${t.contentDelay}, ${t.contentDelay}, 0s` },
  },
});
