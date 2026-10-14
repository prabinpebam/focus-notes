import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.windowControls;

// Hidden at rest like the rest of the chrome (DD-DSK-04): shown over the title bar band (the window
// frame marks it), on keyboard focus, while the window isn't active or the toolbar is open, or with the picker open.
export const root = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  paddingInlineEnd: t.inset,
  opacity: 0,
  transitionProperty: "opacity",
  transitionDuration: t.revealDuration,
  selectors: {
    "&[data-reveal], &:hover, &:focus-within, :root[data-window-band] &": { opacity: t.shown },
  },
});

export const button = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.buttonWidth,
  height: t.buttonHeight,
  padding: 0,
  borderStyle: "none",
  borderRadius: t.radius,
  backgroundColor: t.transparent,
  color: t.icon,
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color, color",
  transitionDuration: t.duration,
  selectors: {
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-pressed]": { backgroundColor: t.pressed },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
});
// Close turns red on hover, as on Windows.
export const close = style({
  selectors: {
    "&[data-hovered], &[data-pressed]": { backgroundColor: t.closeHover, color: t.closeHoverIcon },
  },
});

// Never wider than the window less its edges: in a narrow window (320 px, WCAG 1.4.10) the layouts wrap.
export const popover = style({ zIndex: t.layer, outline: "none", maxWidth: `calc(100% - 2 * ${t.inset})` });
export const flyout = style({
  display: "flex",
  flexWrap: "wrap",
  gap: t.flyoutGap,
  marginTop: t.flyoutOffset,
  padding: t.flyoutPadding,
  backgroundColor: t.flyoutBackground,
  borderStyle: "solid",
  borderWidth: t.flyoutBorderWidth,
  borderColor: t.flyoutBorder,
  borderRadius: t.flyoutRadius,
  boxShadow: t.flyoutShadow,
});
// Each layout is a small screen; its zones tile it the way the window would.
export const layout = style({
  display: "grid",
  width: t.layoutWidth,
  height: t.layoutHeight,
  gap: t.layoutGap,
  padding: t.layoutPadding,
  backgroundColor: t.layoutBackground,
  borderRadius: t.layoutRadius,
});
export const arrangement = styleVariants({
  halves: { gridTemplateColumns: "1fr 1fr" },
  thirds: { gridTemplateColumns: "1fr 1fr 1fr" },
  quarters: { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" },
  maximize: { gridTemplateColumns: "1fr" },
});
export const zone = style({
  padding: 0,
  borderStyle: "none",
  borderRadius: t.zoneRadius,
  backgroundColor: t.zone,
  cursor: "default",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: t.duration,
  selectors: {
    "&:hover, &:focus-visible": { backgroundColor: t.zoneHover },
    "&:focus-visible": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
});
