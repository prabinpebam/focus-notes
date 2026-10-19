import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.iconButton;

export const base = style({
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
  backgroundColor: t.color.transparent,
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: t.duration,
  selectors: {
    '&[data-hovered]:not([aria-disabled="true"])': { backgroundColor: t.color.hover },
    '&[data-pressed]:not([aria-disabled="true"])': { backgroundColor: t.color.pressed },
    "&[data-selected]": { backgroundColor: t.color.selected },
    '&[aria-pressed="mixed"]': { backgroundColor: t.color.mixed },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.color.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
    // Busy is inert but not disabled: its sign is the Spinner and its words, never a dimmed look (D-199).
    '&[aria-disabled="true"]:not([data-busy="on"])': { opacity: t.disabledOpacity },
  },
});
/** Its hit area reaches past its box, so its icon lines up with the content's edge (a dialog's close button, D-111). */
export const bleed = style({ margin: `calc((${t.iconSize} - ${t.size}) / 2)` });
export const tone = styleVariants({ default: { color: t.color.icon }, muted: { color: t.color.iconMuted } });

// The busy sign (Waits, D-199): the icon and a Spinner share one cell, so the control keeps its size.
// The Spinner shows, and the icon hides, only after the busy delay (wait.signDelay), so quick work
// shows nothing extra. No timer: the delay is the style's, the busy state the task tracker's.
const hidden = keyframes({ from: { visibility: "hidden" }, to: { visibility: "hidden" } });
const shown = keyframes({ from: { visibility: "visible" }, to: { visibility: "visible" } });
export const busyGlyph = style({ display: "inline-grid", gridTemplateAreas: '"glyph"', alignItems: "center", justifyItems: "center" });
export const busyIcon = style({ gridArea: "glyph", display: "inline-flex", animationName: hidden, animationDuration: t.duration, animationDelay: t.busy.signDelay, animationFillMode: "forwards" });
export const busySpinner = style({ gridArea: "glyph", display: "inline-flex", visibility: "hidden", animationName: shown, animationDuration: t.duration, animationDelay: t.busy.signDelay, animationFillMode: "forwards" });
