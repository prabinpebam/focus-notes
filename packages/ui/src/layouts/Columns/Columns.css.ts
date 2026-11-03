import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

// Each column at least a narrow sheet wide; narrower, they stack (D-142).
export const base = style({ display: "grid", alignItems: "start", minWidth: 0 });
export const cell = styleVariants({
  sheet: { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${tokens.layout.sheetMin}), 1fr))` },
  // A uniform grid of small equal cells (D-316).
  choice: { gridTemplateColumns: `repeat(3, ${tokens.layout.themeTile})`, alignItems: "stretch" },
});
export { gap } from "../Stack/Stack.css.ts";
