import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.appRoot;

globalStyle("*, *::before, *::after", { boxSizing: "border-box" });
globalStyle("html, body", { margin: 0, padding: 0, height: "100%", overflow: "hidden" });
globalStyle("body", { backgroundColor: t.background, color: t.text, fontFamily: t.font, fontSize: t.fontSize, WebkitFontSmoothing: "antialiased" });
globalStyle("#root", { height: "100%" });
globalStyle("::selection", { backgroundColor: t.selection });
// The desktop title bar band: draggable, except for anything interactive placed on it.
globalStyle("[data-drag-band]", { WebkitAppRegion: "drag" } as Record<string, string>);
globalStyle("[data-drag-band] [data-no-drag]", { WebkitAppRegion: "no-drag" } as Record<string, string>);

export const root = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: t.background,
  color: t.text,
});
