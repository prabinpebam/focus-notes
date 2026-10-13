import { style } from "@vanilla-extract/css";

export const base = style({ display: "flex", flexDirection: "row", minWidth: 0 });
export const wrap = style({ flexWrap: "wrap" });
export const grow = style({ flexGrow: 1 });
export { gap, padding, align, justify } from "../Stack/Stack.css.ts";
