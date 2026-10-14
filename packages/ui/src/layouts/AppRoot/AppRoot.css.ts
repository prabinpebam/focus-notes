import { createVar, globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.appRoot;

globalStyle("*, *::before, *::after", { boxSizing: "border-box" });
globalStyle("html, body", { margin: 0, padding: 0, height: "100%", overflow: "hidden" });
globalStyle("body", { backgroundColor: t.background, color: t.text, fontFamily: t.font, fontSize: t.fontSize, WebkitFontSmoothing: "antialiased" });
globalStyle("#root", { height: "100%" });
globalStyle("::selection", { backgroundColor: t.selection });
// The desktop title bar band (DSK-02): the system's drag region on macOS, except for any layer's
// content that overlaps it (the trigger, the window controls), which is never dragged.
globalStyle("[data-drag-band]", { WebkitAppRegion: "drag" } as Record<string, string>);
globalStyle("[data-no-drag]", { WebkitAppRegion: "no-drag" } as Record<string, string>);

/** How far popovers keep from the window's edges, in pixels for React Aria (in-window.tsx). */
export const popoverEdgeVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

export const root = style({
  vars: { [popoverEdgeVar]: tokens.space.m },
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: t.background,
  color: t.text,
});

// The app-built window (D-14): the page is transparent and the window is drawn inside it, with the
// 20 px corners and the shadow in the margin around it. The window is the containing block for fixed
// layers, so they're placed and clipped inside it; square when maximized, snapped, or full screen.
globalStyle(":root[data-window-frame], :root[data-window-frame] body", { backgroundColor: t.windowOutside });
const drawn = {
  position: "absolute",
  height: "auto",
  overflow: "hidden",
  contain: "layout",
  // Heights given as parts of the window (the reading zone, the note's end) measure the drawn window, not the page.
  containerType: "size",
} as const;
export const frame = styleVariants({
  native: {},
  rounded: { ...drawn, inset: t.windowMargin, borderRadius: t.windowRadius, boxShadow: `${t.windowShadow}, 0 0 0 ${t.windowBorderWidth} ${t.windowBorder}` },
  square: { ...drawn, inset: 0, borderRadius: 0 },
});
