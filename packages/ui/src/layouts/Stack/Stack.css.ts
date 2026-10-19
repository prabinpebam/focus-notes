import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

const sp = tokens.space;
const spaceMap = <P extends string>(prop: P) =>
  styleVariants({
    none: { [prop]: sp.none }, xxs: { [prop]: sp.xxs }, xs: { [prop]: sp.xs }, s: { [prop]: sp.s }, m: { [prop]: sp.m },
    l: { [prop]: sp.l }, xl: { [prop]: sp.xl }, xxl: { [prop]: sp.xxl }, xxxl: { [prop]: sp.xxxl },
  } as Record<"none" | "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl" | "xxxl", Record<P, string>>);

export const base = style({ display: "flex", flexDirection: "column", minWidth: 0 });
export const gap = spaceMap("gap");
export const padding = spaceMap("padding");
export const align = styleVariants({
  start: { alignItems: "flex-start" }, center: { alignItems: "center" }, end: { alignItems: "flex-end" }, stretch: { alignItems: "stretch" },
});
export const justify = styleVariants({
  start: { justifyContent: "flex-start" }, center: { justifyContent: "center" }, end: { justifyContent: "flex-end" }, between: { justifyContent: "space-between" },
});
export const grow = style({ flexGrow: 1, minHeight: 0 });
// The gap or padding in a short window (below breakpoint.short): the full-window setup tightens up (D-131).
const short = `(max-height: ${breakpoints.short - 1}px)`;
const shortMap = <P extends string>(prop: P) =>
  styleVariants(Object.fromEntries((["none", "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl"] as const).map((k) => [k, { "@media": { [short]: { [prop]: sp[k] } } }])) as Record<"none" | "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl" | "xxxl", { "@media": Record<string, Record<P, string>> }>);
export const shortGap = shortMap("gap");
export const shortPadding = shortMap("padding");
