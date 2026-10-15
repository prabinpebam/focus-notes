import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

// Each column at least a narrow sheet wide; narrower, they stack (D-142).
export const base = style({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${tokens.layout.sheetMin}), 1fr))`, alignItems: "start", minWidth: 0 });
export { gap } from "../Stack/Stack.css.ts";
