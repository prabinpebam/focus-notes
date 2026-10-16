import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteThemeShowcase;
/** The most themes per scheme the rules below are written for (contract.ts says the same). */
export const MAX = 8;

export const root = style({ display: "flex", flexDirection: "column", alignItems: "center", gap: t.gap, width: "100%" });
export const figures = style({ width: "100%" });
export const figure = style({ display: "none" });
export const controls = style({ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: t.gap });
export const schemeLight = style({});
export const schemeDark = style({});
export const lightRow = style({});
export const darkRow = style({});
export const input = style({ position: "absolute", opacity: 0, width: t.edge, height: t.edge, margin: 0 });
// The group's name for assistive technology only.
export const hidden = style({ position: "absolute", width: t.edge, height: t.edge, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" });

// Light / Dark: which row of swatches shows, and which screenshot. Then the swatch chosen in that row.
globalStyle(`${root} ${darkRow}`, { display: "none" });
globalStyle(`${root}:has(${schemeDark}:checked) ${lightRow}`, { display: "none" });
globalStyle(`${root}:has(${schemeDark}:checked) ${darkRow}`, { display: "inline-flex" });
for (let i = 0; i < MAX; i++) {
  for (const [scheme, input_] of [["l", schemeLight], ["d", schemeDark]] as const) {
    globalStyle(`${root}:has(${input_}:checked):has(${input}[data-pick="${scheme}${i}"]:checked) ${figure}[data-pick="${scheme}${i}"]`, { display: "block" });
  }
}

export const group = style({
  display: "inline-flex",
  alignItems: "center",
  margin: 0,
  padding: t.padding,
  gap: t.padding,
  borderStyle: "solid",
  borderWidth: t.edge,
  borderColor: t.border,
  borderRadius: t.radius,
  backgroundColor: t.background,
});
export const toggle = style({});
export const swatches = style({ gap: t.swatchGap, paddingInline: t.swatchInset });
export const item = style({ display: "inline-flex" });

export const option = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: t.height,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  fontFamily: t.font,
  fontSize: t.fontSize,
  fontWeight: t.weight,
  color: t.text,
  cursor: "pointer",
  selectors: {
    [`${input}:checked + &`]: { backgroundColor: t.selected, color: t.selectedText },
    [`${input}:focus-visible + &`]: { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset },
  },
});

// A swatch: the theme's own background, with its accent as a dot (its tokens, by data-theme-sample).
export const swatch = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.swatch,
  height: t.swatch,
  borderRadius: t.radius,
  backgroundColor: t.sampleCanvas,
  boxShadow: `inset 0 0 0 ${t.edge} ${t.sampleBorder}`,
  cursor: "pointer",
  selectors: {
    [`${input}:checked + &`]: { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.selected, outlineOffset: t.focusOffset },
    [`${input}:focus-visible + &`]: { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusOffset },
  },
});
export const dot = style({ width: t.dot, height: t.dot, borderRadius: t.radius, backgroundColor: t.sampleAccent });