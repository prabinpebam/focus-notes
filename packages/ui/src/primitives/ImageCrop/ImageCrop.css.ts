import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.imageCrop;
export const ratio = createVar();
export const ratioNumber = createVar();
export const x = createVar(), y = createVar(), width = createVar(), height = createVar();
export const wrapper = style({ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 });
export const edit = style({ padding: t.inset, gap: tokens.space.stackGroup });
export const controls = style({ width: "100%", display: "flex", flexDirection: "column", gap: tokens.space.stackPair });
export const toolbar = style({ display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "center", gap: tokens.space.inlineGroup });
export const actions = style({ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: tokens.space.inlineItem });
export const dimensions = style({ display: "flex", alignItems: "end", gap: tokens.space.inlineItem });
export const stage = style({
  position: "relative", width: `min(100%, calc(min(${t.maxHeight}, ${t.viewportHeight}) * ${ratioNumber}))`, aspectRatio: ratio,
  minWidth: 0,
});
export const image = style({ display: "block", width: "100%", height: "100%" });
export const shade = style({ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" });
export const aperture = style({
  position: "absolute", left: x, top: y, width, height,
  boxShadow: `0 0 0 ${t.shadeReach} ${t.shade}`,
  outline: `${t.stroke} solid ${t.line}`, outlineOffset: `calc(-1 * ${t.stroke})`,
});
export const controlFrame = style({ position: "absolute", left: x, top: y, width, height, pointerEvents: "none" });
export const move = style({
  position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent", pointerEvents: "auto", cursor: "move", touchAction: "none",
  ":focus-visible": { outline: `${t.stroke} solid ${t.ring}`, outlineOffset: `calc(-1 * ${t.stroke})` },
});
export const handle = style({
  position: "absolute", width: t.target, height: t.target, padding: 0, border: 0,
  background: "transparent", color: t.line, pointerEvents: "auto", touchAction: "none",
  display: "grid", placeItems: "center",
  ":focus-visible": { outline: `${t.stroke} solid ${t.ring}` },
  "::after": { content: "\"\"", width: t.mark, height: t.mark, border: `${t.stroke} solid currentColor` },
});
export const handles = styleVariants({
  nw: { left: 0, top: 0, transform: "translate(-50%, -50%)", cursor: "nwse-resize" },
  n: { left: "50%", top: 0, transform: "translate(-50%, -50%)", cursor: "ns-resize" },
  ne: { left: "100%", top: 0, transform: "translate(-50%, -50%)", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", transform: "translate(-50%, -50%)", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", transform: "translate(-50%, -50%)", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", transform: "translate(-50%, -50%)", cursor: "ns-resize" },
  sw: { left: 0, top: "100%", transform: "translate(-50%, -50%)", cursor: "nesw-resize" },
  w: { left: 0, top: "50%", transform: "translate(-50%, -50%)", cursor: "ew-resize" },
  move: { left: "50%", top: "50%", transform: "translate(-50%, -50%)", cursor: "move" },
});
