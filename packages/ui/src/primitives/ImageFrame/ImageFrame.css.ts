import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

export const broken = style({
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: tokens.space.s, padding: tokens.space.l, minHeight: tokens.size.emptySection,
  color: tokens.color.textMuted, backgroundColor: tokens.color.surfaceSunken,
  fontFamily: tokens.font.ui, fontSize: tokens.font.uiSecondary, textAlign: "center", boxSizing: "border-box",
});

const t = tokens.cmp.imageFrame;

export const frame = style({ display: "flex", flexDirection: "column", alignItems: "center", gap: t.gap, minWidth: 0 });
export const mode = styleVariants({
  column: { width: "100%" },
  // Wide reaches past the column on both sides, centred; it never exceeds what holds it plus the extra.
  wide: { width: `calc(100% + ${t.wideExtra})`, maxWidth: `calc(100% + ${t.wideExtra})`, marginInline: `calc(${t.wideExtra} / -2)` },
  actual: { width: "auto", maxWidth: "100%" },
  thumb: { width: t.thumb },
});
// No border, frame or backdrop: the picture is drawn as it is, transparent pixels included (owner, 3 November).
export const box = style({ position: "relative", display: "inline-flex", maxWidth: "100%", overflow: "hidden", outline: "none" });
// Selected, it takes the editor's selection tint over the picture, as selected text does: never a ring or a frame.
export const selected = style({
  "::after": { content: "\"\"", position: "absolute", inset: 0, backgroundColor: t.selectedTint, pointerEvents: "none" },
});
export const rounded = style({ borderRadius: t.radius, overflow: "hidden" });
export const img = style({ display: "block", maxWidth: "100%", height: "auto", objectFit: "contain" });
export const fit = style({ maxHeight: `min(${t.fitMax}, ${t.fitViewport})` });
export const rotation = styleVariants({
  // A quarter turn is drawn smaller so the whole turned picture stays inside its frame (the saved file is re-encoded).
  "0": {}, "90": { transform: `rotate(90deg) scale(${t.quarterScale})` }, "180": { transform: "rotate(180deg)" }, "270": { transform: `rotate(270deg) scale(${t.quarterScale})` },
});
// The crop frame: the kept area outlined, the rest shaded, a handle at each corner.
export const crop = style({
  position: "absolute", inset: "10%", outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.cropLine,
  boxShadow: `0 0 0 ${t.shadeReach} ${t.cropShade}`,
});
export const cropX = createVar();
export const cropY = createVar();
export const cropWidth = createVar();
export const cropHeight = createVar();
export const cropCustom = style({ inset: "auto", left: cropX, top: cropY, width: cropWidth, height: cropHeight });
export const handle = style({ position: "absolute", width: t.handle, height: t.handle, display: "flex", alignItems: "center", justifyContent: "center",
  "::after": { content: "\"\"", width: "40%", height: "40%", borderRadius: "50%", backgroundColor: t.handleFill, outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.cropLine } });
export const corner = styleVariants({
  tl: { top: `calc(${t.handle} / -2)`, left: `calc(${t.handle} / -2)` },
  tr: { top: `calc(${t.handle} / -2)`, right: `calc(${t.handle} / -2)` },
  bl: { bottom: `calc(${t.handle} / -2)`, left: `calc(${t.handle} / -2)` },
  br: { bottom: `calc(${t.handle} / -2)`, right: `calc(${t.handle} / -2)` },
});
