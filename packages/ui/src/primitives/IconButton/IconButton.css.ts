import { createVar, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.iconButton;
/** Its state fill: on the box, or on a bleeding button's hit extension. */
const fill = createVar();

export const base = style({
  vars: { [fill]: t.color.transparent },
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  // Never squeezed in a row: the field beside it gives up the room.
  flexShrink: 0,
  width: t.size,
  height: t.size,
  padding: 0,
  borderStyle: "none",
  borderRadius: t.radius,
  backgroundColor: fill,
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: t.duration,
  selectors: {
    '&[data-hovered]:not([aria-disabled="true"])': { vars: { [fill]: t.color.hover } },
    '&[data-pressed]:not([aria-disabled="true"])': { vars: { [fill]: t.color.pressed } },
    "&[data-selected]": { vars: { [fill]: t.color.selected } },
    '&[aria-pressed="mixed"]': { vars: { [fill]: t.color.mixed } },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.color.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
    // Busy is inert but not disabled: its sign is the Spinner and its words, never a dimmed look (D-199).
    '&[aria-disabled="true"]:not([data-busy="on"])': { opacity: t.disabledOpacity },
  },
});
/**
 * Its icon lines up with the content's edge (a dialog's close button, D-111): the box is the icon's
 * size, in line with the content, and its hit area, fill and focus ring reach past it by an invisible
 * extension, so nothing pulls it into its container's padding (spacing SP-2).
 */
const reach = `calc((${t.size} - ${t.iconSize}) / 2)`;
export const bleed = style({
  width: t.iconSize,
  height: t.iconSize,
  isolation: "isolate",
  backgroundColor: t.color.transparent,
  "::before": { content: '""', position: "absolute", zIndex: tokens.layer.underlay, inset: `calc(-1 * ${reach})`, borderRadius: t.radius, backgroundColor: fill },
  selectors: { "&[data-focus-visible]": { outlineOffset: `calc(${t.focusOffset} + ${reach})` } },
});
export const tone = styleVariants({ default: { color: t.color.icon }, muted: { color: t.color.iconMuted } });

// The busy sign (Waits, D-199): the icon and a Spinner share one cell, so the control keeps its size.
// The Spinner shows, and the icon hides, only after the busy delay (wait.signDelay), so quick work
// shows nothing extra. No timer: the delay is the style's, the busy state the task tracker's.
const hidden = keyframes({ from: { visibility: "hidden" }, to: { visibility: "hidden" } });
const shown = keyframes({ from: { visibility: "visible" }, to: { visibility: "visible" } });
export const busyGlyph = style({ display: "inline-grid", gridTemplateAreas: '"glyph"', alignItems: "center", justifyItems: "center" });
export const busyIcon = style({ gridArea: "glyph", display: "inline-flex", animationName: hidden, animationDuration: t.duration, animationDelay: t.busy.signDelay, animationFillMode: "forwards" });
export const busySpinner = style({ gridArea: "glyph", display: "inline-flex", visibility: "hidden", animationName: shown, animationDuration: t.duration, animationDelay: t.busy.signDelay, animationFillMode: "forwards" });
