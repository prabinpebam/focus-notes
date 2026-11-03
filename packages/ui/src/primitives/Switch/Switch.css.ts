import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.switch;

export const root = style({
  display: "inline-flex",
  alignItems: "flex-start",
  gap: t.gap,
  minHeight: t.hit,
  maxWidth: "100%",
  fontFamily: t.font,
  cursor: "default",
  outline: "none",
});

export const track = style({
  position: "relative",
  flexShrink: 0,
  marginBlock: `calc((${t.hit} - ${t.trackHeight}) / 2)`,
  width: t.trackWidth,
  height: t.trackHeight,
  borderRadius: t.radius,
  borderStyle: "solid",
  borderWidth: t.borderWidth,
  borderColor: t.border,
  backgroundColor: t.trackOff,
  boxSizing: "border-box",
  transitionProperty: "background-color, border-color",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    [`${root}[data-selected] &`]: { backgroundColor: t.trackOn, borderColor: t.trackOn },
    [`${root}[data-pressed]:not([data-selected]) &`]: { backgroundColor: t.hover },
    [`${root}[data-focus-visible] &`]: { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset },
    [`${root}[data-disabled] &`]: { borderColor: t.disabledText, backgroundColor: t.trackOff },
  },
  "@media": {
    "(hover: hover)": { selectors: { [`${root}[data-hovered]:not([data-selected]) &`]: { backgroundColor: t.hover } } },
  },
});

export const thumb = style({
  position: "absolute",
  top: "50%",
  insetInlineStart: t.inset,
  width: t.thumbSize,
  height: t.thumbSize,
  borderRadius: t.radius,
  backgroundColor: t.thumbOff,
  transform: "translateY(-50%)",
  transitionProperty: "inset-inline-start, background-color",
  transitionDuration: t.duration,
  transitionTimingFunction: t.easing,
  selectors: {
    [`${root}[data-selected] &`]: { insetInlineStart: `calc(100% - ${t.thumbSize} - ${t.inset})`, backgroundColor: t.thumbOn },
    [`${root}[data-disabled] &`]: { backgroundColor: t.disabledText },
  },
});

export const text = style({ display: "flex", flexDirection: "column", minWidth: 0 });
// The name line is as tall as the row and centres its words on the track, so label, state word and track share one middle (DSY-15).
export const name = style({ display: "inline-flex", flexWrap: "wrap", alignItems: "center", columnGap: t.gap, minHeight: t.hit, lineHeight: t.lineHeight });
// Like every form label: body size, semibold (D-111).
export const label = style({ color: t.label, fontSize: t.labelSize, fontWeight: t.labelWeight, selectors: { [`${root}[data-disabled] &`]: { color: t.disabledText } } });
export const state = style({ color: t.state, fontSize: t.stateSize, fontVariantNumeric: "tabular-nums" });
export const description = style({ color: t.state, fontSize: t.stateSize });
