import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, tokenGroups, breakpoints } from "@focus-notes/tokens";

/** The spacing roles a layout takes (spacing ST-1): a relationship, never a size. */
export type SpaceRole = (typeof tokenGroups.space)[number];
const roles = tokenGroups.space;
const sp = tokens.space as unknown as Record<SpaceRole, string>;
const spaceMap = <P extends string>(prop: P) =>
  styleVariants(Object.fromEntries(roles.map((k) => [k, { [prop]: sp[k] }])) as Record<SpaceRole, Record<P, string>>);

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
  styleVariants(Object.fromEntries(roles.map((k) => [k, { "@media": { [short]: { [prop]: sp[k] } } }])) as Record<SpaceRole, { "@media": Record<string, Record<P, string>> }>);
export const shortGap = shortMap("gap");
export const shortPadding = shortMap("padding");