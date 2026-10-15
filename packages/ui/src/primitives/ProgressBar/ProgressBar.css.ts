import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.progressBar;

// The platform's progress element, its bar and value drawn with the component's tokens.
export const root = style({
  appearance: "none", display: "block", width: "100%", height: t.height, borderStyle: "none", borderRadius: t.radius, overflow: "hidden", backgroundColor: t.track, color: t.fill,
  selectors: {
    "&::-webkit-progress-bar": { backgroundColor: t.track, borderRadius: t.radius },
    "&::-webkit-progress-value": { backgroundColor: t.fill, borderRadius: t.radius, transitionProperty: "width", transitionDuration: t.duration },
    "&::-moz-progress-bar": { backgroundColor: t.fill, borderRadius: t.radius },
  },
});
