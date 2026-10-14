import { createVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.slider;
/** How far along the track the value is, set as it moves. */
export const fillWidth = createVar();

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, fontFamily: t.font, fontSize: t.fontSize, minWidth: 0 });
export const row = style({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.gap });
// Like every form label: body size, semibold (D-111).
export const label = style({ color: t.label, fontWeight: t.weight, fontSize: t.labelSize });
export const output = style({ color: t.value, fontVariantNumeric: "tabular-nums" });

// The track is the thumb's height in the layout, so the row's rhythm is the same as any other
// control's (D-111); its pointer target reaches a hit-size band above and below it.
export const track = style({
  position: "relative",
  height: t.thumbSize,
  touchAction: "none",
  selectors: { "&::before": { content: '""', position: "absolute", insetInline: 0, insetBlock: `calc((${t.thumbSize} - ${t.hit}) / 2)` } },
});
const line = { position: "absolute", insetInlineStart: 0, top: "50%", height: t.trackHeight, transform: "translateY(-50%)", borderRadius: t.radius } as const;
export const rail = style({ ...line, insetInlineEnd: 0, backgroundColor: t.track });
export const fill = style({ ...line, width: fillWidth, backgroundColor: t.fill });
// Centered on the rail: React Aria moves the thumb back by half its own size on both axes, so its
// top is the track's center line, as the rail's is, at any UI scale (D-111).
export const thumb = style({
  top: "50%",
  width: t.thumbSize,
  height: t.thumbSize,
  borderRadius: t.radius,
  backgroundColor: t.thumb,
  borderStyle: "solid",
  borderWidth: t.thumbBorderWidth,
  borderColor: t.thumbBorder,
  boxSizing: "border-box",
  outline: "none",
  selectors: {
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset },
  },
});
