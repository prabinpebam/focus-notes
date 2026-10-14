import { createVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.slider;
/** How far along the track the value is, set as it moves. */
export const fillWidth = createVar();

export const root = style({ display: "flex", flexDirection: "column", gap: t.gap, fontFamily: t.font, fontSize: t.fontSize, minWidth: 0 });
export const row = style({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.gap });
export const label = style({ color: t.label, fontWeight: t.weight });
export const output = style({ color: t.value, fontVariantNumeric: "tabular-nums" });

// The track is the pointer target (a hit-size band); the rail and fill are drawn in its middle.
export const track = style({ position: "relative", height: t.hit, touchAction: "none" });
const line = { position: "absolute", insetInlineStart: 0, top: "50%", height: t.trackHeight, transform: "translateY(-50%)", borderRadius: t.radius } as const;
export const rail = style({ ...line, insetInlineEnd: 0, backgroundColor: t.track });
export const fill = style({ ...line, width: fillWidth, backgroundColor: t.fill });
export const thumb = style({
  top: "50%",
  width: t.thumbSize,
  height: t.thumbSize,
  marginTop: `calc(-0.5 * ${t.thumbSize})`,
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
