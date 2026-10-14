import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.segmentedControl;

// Wraps the segments under the label where they don't fit beside it (the theme manager's 380 px sheet).
// Never wider than its container (D-111): in the narrowest, its segments share the room and their
// labels end in an ellipsis rather than reach past a dialog's or a sheet's edge.
export const root = style({ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: t.gap, maxWidth: "100%", minWidth: 0, fontFamily: t.font, fontSize: t.fontSize });

// Like every form label: body size, semibold (D-111).
export const label = style({ color: t.text, whiteSpace: "nowrap", fontSize: t.labelSize, fontWeight: t.labelWeight });

export const track = style({
  display: "inline-flex",
  alignItems: "stretch",
  gap: t.padding,
  height: t.height,
  padding: t.padding,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  boxSizing: "border-box",
  maxWidth: "100%",
  minWidth: 0,
});

export const segment = style({
  display: "inline-flex",
  alignItems: "center",
  paddingInline: t.paddingInline,
  borderRadius: t.segmentRadius,
  color: t.text,
  fontWeight: t.fontWeight,
  cursor: "default",
  outline: "none",
  whiteSpace: "nowrap",
  flex: "1 1 auto",
  justifyContent: "center",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  transitionProperty: "background-color, color",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-selected]": { backgroundColor: t.selected, color: t.selectedText, boxShadow: t.shadow },
// Inset: drawn inside the item's rounded shape, so no scrolling or clipping container ever cuts it (D-111).
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
});
