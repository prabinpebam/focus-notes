import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics } from "../control.css.ts";

const t = tokens.cmp.projectPill;

// As tall as the Backed up button beside it. The visible inset is the same all round (about 6 px): the start padding is smaller by the icon's side bearing, the icon's box is its glyph, and the gap is tight (owner, 3 November 19:08).
export const base = style({
  ...controlMetrics,
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: t.gap, flexShrink: 0, minWidth: 0, maxWidth: t.maxWidth, height: t.height,
  paddingInlineStart: t.paddingStart, paddingInlineEnd: t.paddingEnd, borderRadius: t.radius, backgroundColor: t.background, color: t.text,
  fontFamily: t.font, fontSize: t.fontSize, fontWeight: t.weight, borderStyle: "none", whiteSpace: "nowrap",
});
export const pressable = style({
  cursor: "pointer",
  selectors: { "&:focus-visible": { outlineStyle: "solid", outlineWidth: t.ringWidth, outlineColor: t.focusRing, outlineOffset: t.ringOffset } },
  "@media": { "(hover: hover)": { selectors: { "&:hover": { backgroundColor: t.backgroundHover } } } },
});
export const name = style({ minWidth: 0 });
// No logo: text only, the same inset at both ends.
export const textOnly = style({ paddingInlineStart: t.paddingTextOnly });
// Outside any project: neutral fill, a muted icon (Local notes' drive and folder, owner 3 November 19:22).
export const neutral = style({
  backgroundColor: t.neutralBackground,
  "@media": { "(hover: hover)": { selectors: { "&:hover": { backgroundColor: t.neutralBackgroundHover } } } },
});
export const icon = style({ display: "inline-flex", color: t.neutralIcon, flexShrink: 0 });
// A path ellipsized in the middle: the start (drive, root) gives way, the containing folder stays whole.
export const pathWrap = style({ display: "inline-flex", minWidth: 0 });
export const pathHead = style({ minWidth: 0, flexShrink: 1 });
export const pathTail = style({ flexShrink: 0 });