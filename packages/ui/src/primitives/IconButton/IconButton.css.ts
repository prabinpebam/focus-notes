import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.iconButton;
/** Its state fill stays on the button's own box. */
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
  boxSizing: "border-box",
  paddingBlock: 0,
  paddingInline: t.paddingInline,
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
    // Busy keeps the icon and uses its own-border arc, never a dimmed look.
    '&[aria-disabled="true"]:not([data-busy="on"])': { opacity: t.disabledOpacity },
  },
});
export const stretch = style({ height: "auto", minHeight: t.size, alignSelf: "stretch" });
export const tone = styleVariants({ default: { color: t.color.icon }, muted: { color: t.color.iconMuted } });
