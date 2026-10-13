import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.surface;

export const base = style({ display: "flex", flexDirection: "column", minWidth: 0, color: t.text.default });
export const variant = styleVariants({
  canvas: { backgroundColor: t.background.canvas },
  frost: {
    backgroundColor: `color-mix(in srgb, ${t.background.frost} calc(${tokens.frost.opacity} * 100%), transparent)`,
    backdropFilter: `blur(${tokens.frost.blur})`,
    borderStyle: "solid",
    borderWidth: t.borderWidth,
    borderColor: t.border,
  },
  raised: { backgroundColor: t.background.raised, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border },
  sunken: { backgroundColor: t.background.sunken },
  inverted: { backgroundColor: t.background.inverted, color: t.text.inverted },
});
export const shape = styleVariants({
  none: {},
  window: { borderRadius: tokens.radius.window },
  sheet: { borderRadius: tokens.radius.sheet },
  popover: { borderRadius: tokens.radius.popover },
  control: { borderRadius: tokens.radius.control },
  round: { borderRadius: tokens.radius.round },
});
export const elevation = styleVariants({
  "0": { boxShadow: tokens.shadow["0"] }, "1": { boxShadow: tokens.shadow["1"] },
  "2": { boxShadow: tokens.shadow["2"] }, "3": { boxShadow: tokens.shadow["3"] },
});
export { padding } from "../Stack/Stack.css.ts";
