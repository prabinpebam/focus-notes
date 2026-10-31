import { createVar, fallbackVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.dialogPanel;

export const overlay = style({
  position: "fixed",
  inset: 0,
  zIndex: t.layer,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: t.inset,
  backgroundColor: t.scrim,
  transitionProperty: "opacity",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    "&[data-entering]": { opacity: 0 },
    "&[data-exiting]": { opacity: 0, transitionDuration: t.exitDuration },
  },
});

/** The tallest the dialog has been since it opened (DialogPanel.tsx): it never shrinks while open. */
export const grownVar = createVar();
/** Where a centred confirmation's top was when it opened (DSK-09, D-148). */
export const anchorVar = createVar();

// The window's title bar band (DSK-02, D-147) over the scrim, held by the modal so the rest of the
// app going inert doesn't take it: a dialog never takes the window's dragging, and a press there
// moves the window and leaves the dialog open. Fixed: the window's top, wherever the dialog is.
export const band = style({ position: "fixed", top: 0, left: 0, right: 0, height: t.band, pointerEvents: "none" });

export const modal = style({
  display: "flex",
  width: "100%",
  // The room the overlay leaves inside its 24 px inset, the window less twice the inset: never edge
  // to edge, and no other cap, so the least height and the never-shrink height always fit (D-111).
  maxHeight: "100%",
  outline: "none",
  transitionProperty: "transform",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: { "&[data-entering]": { transform: "scale(0.98)" } },
});

export const size = {
  s: style({ maxWidth: t.width.s }),
  m: style({ maxWidth: t.width.m }),
  l: style({ maxWidth: t.width.l }),
  xl: style({ maxWidth: t.width.xl }),
};

/**
 * Its height (D-111): at least `minHeight` (400 px), and never less than it has been since it opened,
 * so it doesn't jump as its content changes (a tab, a filter); the extra room stays empty at the
 * bottom of its body. Both are held to the window less its inset (its maximum), so least, most and
 * never-shrink agree at every window size. A confirmation (`content`) fits its content.
 */
export const height = {
  stable: style({ minHeight: `min(max(${t.minHeight}, ${fallbackVar(grownVar, "0px")}), 100%)` }),
  content: style({}),
};

/** Centered, or near the top like Spotlight, where results grow downward without the field moving. */
export const placement = {
  center: style({
    // A confirmation, once open, keeps its top where it opened: its content growing or shrinking
    // never moves what's already shown (DSK-09, D-148). Set from the opened layout (DialogPanel).
    selectors: { "&[data-anchored]": { alignItems: "flex-start", paddingBlockStart: fallbackVar(anchorVar, "0px") } },
  }),
  top: style({ alignItems: "flex-start", paddingBlockStart: t.top }),
};

export const dialog = style({
  display: "flex",
  // Positioned, so it sits above the window's title bar band where it reaches into it.
  position: "relative",
  flexDirection: "column",
  gap: t.gap,
  width: "100%",
  minHeight: 0,
  // No block padding of its own: the part at each edge holds it, so a scrolling body at the top or
  // bottom runs to the dialog's edge and its content scrolls right up to it.
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.background,
  boxShadow: t.shadow,
  color: t.text,
  fontFamily: t.font,
  outline: "none",
  boxSizing: "border-box",
});

export const region = style({
  paddingInline: t.padding,
  flexShrink: 0,
  selectors: { "&:first-child": { paddingBlockStart: t.padding }, "&:last-child": { paddingBlockEnd: t.padding } },
});

// The body's corners at the dialog's edge follow its rounding, so what scrolls (and the scrollbar) stays inside it.
const inner = `calc(${t.radius} - ${t.borderWidth})`;

export const body = style({
  // A column, so what it holds can fill its height (vertical tabs: their divider runs to the bottom, D-123).
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  // Room inside its clip for the focus ring and letters of what's at its very top or bottom (a
  // heading trimmed to its capitals), without moving anything (D-111).
  paddingBlock: t.bodySlack,
  marginBlock: `calc(-1 * ${t.bodySlack})`,
  paddingInlineStart: t.padding,
  // The reserved gutter takes the place of the end padding, so text lines up either way (UI-09).
  paddingInlineEnd: `calc(${t.padding} - ${t.scrollbarSize})`,
  scrollbarGutter: "stable",
  outline: "none",
  selectors: {
    "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: `calc(-1 * ${t.focusWidth})` },
    // At the dialog's top or bottom edge, the dialog's padding is inside the scroller: content keeps
    // that spacing at rest, scrolls right to the edge, and what scrolls into view keeps it too.
    "&:first-child": { paddingBlockStart: t.padding, marginBlockStart: 0, scrollPaddingBlockStart: t.padding, borderStartStartRadius: inner, borderStartEndRadius: inner },
    "&:last-child": { paddingBlockEnd: t.padding, marginBlockEnd: 0, scrollPaddingBlockEnd: t.padding, borderEndStartRadius: inner, borderEndEndRadius: inner },
  },
});
minimalScrollbar(body, t);

/** The raised surface, or the theme's frosted one (Foundations → Surfaces). */
export const material = {
  raised: style({}),
  frosted: style({
    backgroundColor: `color-mix(in srgb, ${t.frostBackground} calc(${t.frostOpacity} * 100%), transparent)`,
    backdropFilter: `blur(${t.frostBlur})`,
  }),
};
