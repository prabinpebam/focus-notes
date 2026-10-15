import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.surface;

// It can be held shorter than its content (a panel the window has no room for): a list in it scrolls.
export const base = style({ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, color: t.text.default });
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

// Scrolling (D-123): the surface clips to its shape, and a body inside it scrolls with the padding.
// The reserved gutter takes the place of the end padding, so content lines up either way (UI-09).
const sb = t;
export const clip = style({ overflow: "hidden" });
export const body = style({ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, overflowY: "auto", scrollbarGutter: "stable", outline: "none" });
minimalScrollbar(body, sb);
const sp = tokens.space;
// What scrolls into view (a focused button) keeps the padding around it, so its focus ring is never cut.
const pad = (v: string) => ({ padding: v, paddingInlineEnd: `max(0px, calc(${v} - ${sb.scrollbarSize}))`, scrollPadding: v });
export const bodyPadding = styleVariants({
  none: {}, xs: pad(sp.xs), s: pad(sp.s), m: pad(sp.m), l: pad(sp.l), xl: pad(sp.xl), xxl: pad(sp.xxl), xxxl: pad(sp.xxxl),
});
