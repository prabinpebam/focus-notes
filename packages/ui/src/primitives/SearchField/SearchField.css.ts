import { globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { hitReach } from "../hit.ts";

const t = tokens.cmp.searchField;

export const root = style({
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  height: t.height,
  // In a row of controls it takes the room left (the find bar), never narrower than a usable field.
  flexGrow: 1,
  minWidth: t.minWidth,
  paddingInline: t.paddingInline,
  borderRadius: t.radius,
  // The border is an inset outline, so the input fills the whole field as its pointer target (spacing SP-6); outlines stay in forced colours.
  outlineStyle: "solid",
  outlineWidth: t.borderWidth,
  outlineOffset: `calc(-1 * ${t.borderWidth})`,
  outlineColor: t.border,
  backgroundColor: t.background,
  color: t.text,
  fontFamily: t.font,
  fontSize: t.fontSize,
  boxSizing: "border-box",
  selectors: {
    "&:focus-within": { outlineColor: t.borderFocus, boxShadow: `0 0 0 ${t.borderWidth} ${t.borderFocus}` },
    "&[data-invalid]": { outlineColor: t.borderInvalid },
  },
});

/** As tall as the 32 px controls beside it in a bar (the find bar), or the 40 px field of a dialog or panel. */
// In a bar it starts from the find field's width and gives or takes the room the row has.
export const size = styleVariants({ m: { height: t.heightCompact, flexBasis: t.basisCompact }, l: {} });

export const icon = style({ display: "inline-flex", color: t.icon, flexShrink: 0 });

/** The mode before the text (Spotlight). */
export const chip = style({
  flexShrink: 0,
  paddingInline: t.chipPaddingInline,
  borderRadius: t.chipRadius,
  backgroundColor: t.chipBackground,
  color: t.chipText,
  fontSize: t.chipFontSize,
  fontWeight: t.chipWeight,
  whiteSpace: "nowrap",
});

export const input = style({
  flexGrow: 1,
  minWidth: 0,
  height: "100%",
  padding: 0,
  borderStyle: "none",
  outline: "none",
  backgroundColor: t.background,
  color: t.text,
  font: "inherit",
  appearance: "none",
});
globalStyle(`${input}::placeholder`, { color: t.placeholder });
globalStyle(`${input}::-webkit-search-cancel-button`, { display: "none" });

export const clear = style({
  position: "relative",
  "::after": hitReach(t.hit, t.clearSize, t.clearSize),
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: t.clearSize,
  height: t.clearSize,
  padding: 0,
  borderStyle: "none",
  borderRadius: t.clearRadius,
  backgroundColor: t.background,
  color: t.icon,
  cursor: "default",
  outline: "none",
  flexShrink: 0,
  selectors: {
    [`${root}[data-empty] &`]: { visibility: "hidden" },
    "&[data-hovered]": { backgroundColor: t.hover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.borderFocus },
  },
});
